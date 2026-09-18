// Final synthesis. Three non-negotiable rules:
//   1. baseline_risk is the MIN of the constraints, never an average — a
//      contradiction must surface, not be averaged away.
//   2. Emotion can only discount (emotion_mult ≤ 1): excitement does not improve
//      finances, panic does raise the odds of abandoning the plan.
//   3. Behavioral bias only takes a small capped penalty; its main output is guardrails.

import type {
  AlertReason,
  ComposeInput,
  ConstraintGaps,
  Construct,
  EmotionalState,
  Flag,
  InvestorTypeId,
  ItemBank,
  ScoringLayer,
  Signal,
  Tier,
  Weights,
} from './types';
import { BIAS_DIMS } from './types';
import { scoreBehavior, textQuality } from './behavior';
import { scoreCapacity } from './capacity';
import { facetValues } from './facets';
import { competenceCap, scoreCompetence, scoreWillingness } from './willingness';
import { deriveTheoreticalRange, type DimRanges } from './ranges';
import { applyGuardrails } from './guardrails';
import { qualityFlags } from './flags';
import { clamp, mean, tierOf } from './util';

export function baselineRisk(
  c: Record<Construct, number>,
  targetVol: Weights['target_vol'],
): { baseline: number; gaps: ConstraintGaps } {
  // Ties resolve in declaration order (capacity → willingness → competence).
  const order: Construct[] = ['capacity', 'willingness', 'competence'];
  const sorted = [...order].sort((a, b) => c[a] - c[b]);
  const binding = sorted[0]!;
  const headroom = c[sorted[1]!] - c[binding];
  return {
    baseline: c[binding],
    gaps: {
      capacity: c.capacity,
      willingness: c.willingness,
      competence_cap: c.competence,
      binding,
      headroom,
      headroom_vol: (headroom / 100) * targetVol.span,
    },
  };
}

export function emotionalState(anxiety: number, confidence: number, e: Weights['emotion']): EmotionalState {
  const anxietyExcess = clamp((anxiety - e.anxiety_cut) / (100 - e.anxiety_cut), 0, 1);
  const euphoriaExcess = clamp((confidence - e.euphoria_cut) / (100 - e.euphoria_cut), 0, 1);
  // max, not sum: panic and euphoria are alternative states; summing double-penalizes.
  const deviation = 100 * Math.max(anxietyExcess, euphoriaExcess);
  const state =
    deviation > e.highly_deviated_above ? 'highly_deviated'
    : deviation >= e.deviated_min ? 'deviated'
    : 'calm';
  return { anxiety, confidence, deviation, state };
}

// Upper bound 1.0 by construction: emotion never raises risk.
export const emotionMult = (deviation: number, e: Weights['emotion']): number =>
  1 - e.max_discount * (clamp(deviation, 0, 100) / 100);

export const biasPenalty = (biasIndex: number, b: Weights['bias_penalty']): number =>
  clamp(b.k * (biasIndex - b.center), 0, b.max);

export const effectiveRisk = (baseline: number, mult: number, penalty: number): number =>
  clamp(baseline * mult - penalty, 0, 100);

export function investorType(effective: number, types: Weights['investor_types']): InvestorTypeId {
  const t = types.find((x) => effective >= x.lo && effective < x.hi);
  if (!t) throw new Error(`no investor type covers ${effective}`);
  return t.id;
}

// Continuous, not a table lookup: 48 and 52 must not get very different portfolios.
export const targetVol = (effective: number, v: Weights['target_vol']): number =>
  v.min + (effective / 100) * v.span;

const rangeCache = new WeakMap<ItemBank, DimRanges>();
function rangesFor(bank: ItemBank): DimRanges {
  let r = rangeCache.get(bank);
  if (!r) rangeCache.set(bank, (r = deriveTheoreticalRange(bank)));
  return r;
}

export function compose(input: ComposeInput): ScoringLayer {
  const { responses, itemBank, weights, guardrails, text } = input;

  const facets = facetValues(itemBank, responses);
  const capacity = scoreCapacity(facets, weights);
  const willingness = scoreWillingness(facets, weights);
  const competence = scoreCompetence(facets, weights);
  const cap = competenceCap(competence, weights);
  const { baseline, gaps } = baselineRisk({ capacity, willingness, competence: cap }, weights.target_vol);

  const { behavior, optionScores, textWeight, textApplied, flags: behaviorFlags } = scoreBehavior(
    itemBank, responses, rangesFor(itemBank), weights, text,
  );

  const emotional = emotionalState(behavior.anxiety.score, behavior.confidence.score, weights.emotion);
  const mult = emotionMult(emotional.deviation, weights.emotion);
  const biasIndex = mean(BIAS_DIMS.map((d) => behavior[d].score));
  const penalty = biasPenalty(biasIndex, weights.bias_penalty);
  const effective = effectiveRisk(baseline, mult, penalty);

  const flags: Flag[] = [...behaviorFlags, ...qualityFlags(itemBank, responses, weights, facets, input.meta)];
  if (Math.abs(capacity - willingness) > weights.thresholds.capacity_willingness_gap) {
    flags.unshift('capacity_willingness_gap');
  }

  const quality = textQuality(responses);
  const textAnalysis =
    text && textWeight > 0
      ? {
          analyzer: text.analyzer,
          quality: { q13: quality.q13, q14: quality.q14 },
          text_weight: textWeight,
          option_scores: { overconfidence: optionScores.overconfidence, herding: optionScores.herding },
          applied: { overconfidence: textApplied.overconfidence, herding: textApplied.herding },
          overconfidence: text.scores.overconfidence,
          herding: text.scores.herding,
          reasoning_mode: text.scores.reasoning_mode,
          belief_rigidity: {
            score: text.scores.belief_rigidity,
            tier: tierOf(text.scores.belief_rigidity, weights.tiers),
            evidence: [],
          },
          price_anchoring: {
            score: text.scores.price_anchoring,
            tier: tierOf(text.scores.price_anchoring, weights.tiers),
            evidence: [],
          },
          sentiment: text.scores.sentiment,
        }
      : null;

  const signals: Partial<Record<Signal, Tier>> = Object.fromEntries(
    Object.entries(behavior).map(([d, s]) => [d, s.tier]),
  );
  if (textAnalysis) {
    signals.belief_rigidity = textAnalysis.belief_rigidity.tier;
    signals.price_anchoring = textAnalysis.price_anchoring.tier;
  }

  const alertReasons: AlertReason[] = [];
  if (flags.includes('capacity_willingness_gap')) alertReasons.push({ kind: 'capacity_willingness_gap' });
  if (emotional.deviation > weights.emotion.highly_deviated_above) {
    alertReasons.push({ kind: 'high_emotional_deviation' });
  }
  for (const d of BIAS_DIMS) if (behavior[d].tier === 'high') alertReasons.push({ kind: 'high_bias', dim: d });
  for (const d of ['overconfidence', 'herding'] as const) {
    if (flags.includes(`inconsistency_${d}`)) alertReasons.push({ kind: 'inconsistency', dim: d });
  }
  if (flags.includes('framing_sensitivity')) alertReasons.push({ kind: 'framing_sensitivity' });

  const guard = applyGuardrails(signals, guardrails);

  return {
    capacity,
    willingness,
    competence,
    competence_cap: cap,
    baseline_risk: baseline,
    binding_constraint: gaps.binding,
    constraint_gaps: gaps,
    emotional_state: emotional,
    emotion_mult: mult,
    bias_index: biasIndex,
    bias_penalty: penalty,
    effective_risk: effective,
    investor_type: investorType(effective, weights.investor_types),
    target_vol: targetVol(effective, weights.target_vol),
    facets,
    behavior,
    text_analysis: textAnalysis,
    behavioral_alert: alertReasons.length > 0,
    alert_reasons: alertReasons,
    flags: [...new Set(flags)],
    guardrails: guard.ids,
    guardrail_trace: guard.trace,
    exemptions_applied: guard.exemptions,
  };
}
