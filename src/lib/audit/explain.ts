// Audit trail: for every number on the report, which items produced it, how much
// each contributed, at what weight, through which rule.
//
// Explainability of a financial product is a regulatory requirement (MiFID II
// suitability reporting, and the FSC's 金融科技發展路徑 on algorithmic advice), not a
// nice-to-have. This module is what makes "why did I get 58?" answerable.
//
// It re-derives the breakdown from the same pure functions compose() uses and never
// stores derived numbers, so an audit line cannot drift from the score it explains.
// tests/audit.test.ts reconciles every total against the ScoringLayer.

import type {
  ChoiceItem,
  Construct,
  Facet,
  GuardrailConfig,
  Item,
  ItemBank,
  OverconfidenceInteractionItem,
  Responses,
  ScoringLayer,
  Weights,
} from '../scoring/types';
import { BEHAVIOR_DIMS, TEXT_BLENDED_DIMS, type BehaviorDim } from '../scoring/types';
import { rawBehavior, type DeltaContribution } from '../scoring/behavior';
import { facetValues } from '../scoring/facets';
import { deriveTheoreticalRange, normalize } from '../scoring/ranges';
import { evaluateComposite, scoreOverconfidence, subItems } from '../scoring/rules';
import { chosenIndex, chosenOption, indexItems } from '../scoring/util';

export interface FacetRow {
  facet: Facet;
  itemId: string;
  question: string;
  answer: string;
  value: number; // the option's absolute 0–100 value
  weight: number;
  share: number; // weight / Σweights — what the panel shows as "佔比"
  contribution: number; // share × value; the rows sum to the construct score
}

export interface ConstructAudit {
  construct: Construct;
  score: number;
  rows: FacetRow[];
  weightSum: number;
}

export interface BehaviorAudit {
  dim: BehaviorDim;
  contributions: DeltaContribution[];
  raw: number;
  range: { min: number; max: number };
  optionScore: number; // raw normalized to 0–100
  text: { score: number; weight: number; evidence: string[]; disagreement: number } | null;
  score: number; // what the report shows
  tier: string;
}

/** The Q12 interaction, shown as the full grid so the non-additivity is visible. */
export interface InteractionAudit {
  itemId: string;
  rankItem: { itemId: string; question: string; answer: string; code: number };
  freqItem: { itemId: string; question: string; answer: string; code: number };
  branch: string; // which clause of the rule fired
  overconfidence: number;
  confidence: number;
  grid: { rank: number; freq: number; score: number; active: boolean }[][];
  rankLabels: string[];
  freqLabels: string[];
}

export interface Audit {
  constructs: ConstructAudit[];
  competenceCap: { competence: number; floor: number; slope: number; cap: number };
  baseline: { capacity: number; willingness: number; competence_cap: number; binding: Construct; baseline: number; headroom: number };
  behavior: BehaviorAudit[];
  interaction: InteractionAudit | null;
  emotion: { anxiety: number; confidence: number; anxietyExcess: number; euphoriaExcess: number; deviation: number; maxDiscount: number; mult: number };
  penalty: { biasIndex: number; center: number; k: number; penalty: number; max: number };
  effective: { baseline: number; mult: number; penalty: number; effective: number; targetVol: number };
  guardrails: { id: string; title: string; because: string[] }[];
  exemptions: string[];
}

const GROUPS: { construct: Construct; key: 'capacity' | 'willingness' | 'competence' }[] = [
  { construct: 'capacity', key: 'capacity' },
  { construct: 'willingness', key: 'willingness' },
  { construct: 'competence', key: 'competence' },
];

/** Which item supplies a facet, and how the respondent answered it. */
function facetSource(bank: ItemBank, byId: Map<string, Item>, responses: Responses, facet: Facet) {
  for (const item of bank.items) {
    if (item.type === 'single_choice' && item.facet === facet) {
      return { itemId: item.item_id, question: item.text, answer: chosenOption(item as ChoiceItem, responses).label };
    }
    if (item.type === 'composite' && item.rule === 'knowledgeQuiz' && item.facet === facet) {
      const subs = subItems(item, byId);
      const correct = subs.filter((s) => s.options[chosenIndex(responses, s.item_id)]?.correct).length;
      return { itemId: item.item_id, question: item.text, answer: `答對 ${correct} / ${subs.length} 題` };
    }
  }
  throw new Error(`no item provides facet ${facet}`);
}

function constructAudits(
  bank: ItemBank,
  byId: Map<string, Item>,
  responses: Responses,
  weights: Weights,
  scoring: ScoringLayer,
): ConstructAudit[] {
  const facets = facetValues(bank, responses);
  return GROUPS.map(({ construct, key }) => {
    const group = weights[key] as Record<string, number>;
    const weightSum = Object.values(group).reduce((a, b) => a + b, 0);
    const rows = (Object.entries(group) as [Facet, number][]).map(([facet, weight]) => {
      const src = facetSource(bank, byId, responses, facet);
      const value = facets[facet];
      const share = weight / weightSum;
      return { facet, ...src, value, weight, share, contribution: share * value };
    });
    return { construct, score: scoring[construct], rows, weightSum };
  });
}

function interactionAudit(
  item: OverconfidenceInteractionItem,
  byId: Map<string, Item>,
  responses: Responses,
): InteractionAudit {
  const [rankSub, freqSub] = subItems(item, byId);
  const rankPick = chosenIndex(responses, rankSub!.item_id);
  const freqPick = chosenIndex(responses, freqSub!.item_id);
  const rankCode = Number(rankSub!.options[rankPick]!.code);
  const freqCode = Number(freqSub!.options[freqPick]!.code);
  const p = item.params;

  const branch =
    rankCode > p.rank_high && freqCode > p.freq_high ? `自評 > ${p.rank_high} 且 月交易 > ${p.freq_high} → ${p.score_both}`
    : rankCode > p.rank_high ? `只有自評 > ${p.rank_high} → ${p.score_rank_only}`
    : freqCode > p.freq_very_high ? `只有月交易 > ${p.freq_very_high} → ${p.score_freq_only}`
    : '兩者皆未達門檻 → 0';

  const grid = rankSub!.options.map((r, ri) =>
    freqSub!.options.map((f, fi) => ({
      rank: Number(r.code),
      freq: Number(f.code),
      score: scoreOverconfidence(Number(r.code), Number(f.code), p),
      active: ri === rankPick && fi === freqPick,
    })),
  );

  const res = evaluateComposite(item, byId, responses);
  return {
    itemId: item.item_id,
    rankItem: { itemId: rankSub!.item_id, question: rankSub!.text, answer: rankSub!.options[rankPick]!.label, code: rankCode },
    freqItem: { itemId: freqSub!.item_id, question: freqSub!.text, answer: freqSub!.options[freqPick]!.label, code: freqCode },
    branch,
    overconfidence: res.deltas.overconfidence ?? 0,
    confidence: res.deltas.confidence ?? 0,
    grid,
    rankLabels: rankSub!.options.map((o) => o.label),
    freqLabels: freqSub!.options.map((o) => o.label),
  };
}

export function explain(
  bank: ItemBank,
  responses: Responses,
  weights: Weights,
  guardrails: GuardrailConfig,
  scoring: ScoringLayer,
): Audit {
  const byId = indexItems(bank);
  const { raw, contributions } = rawBehavior(bank, responses);
  const ranges = deriveTheoreticalRange(bank);
  const ta = scoring.text_analysis;

  const behavior: BehaviorAudit[] = BEHAVIOR_DIMS.map((dim) => {
    const optionScore = normalize(raw[dim], ranges[dim]);
    const blended = (TEXT_BLENDED_DIMS as readonly BehaviorDim[]).includes(dim);
    const nlp =
      blended && ta && ta.text_weight > 0 ? ta[dim as (typeof TEXT_BLENDED_DIMS)[number]] : null;
    return {
      dim,
      contributions: contributions[dim],
      raw: raw[dim],
      range: ranges[dim],
      optionScore,
      text: nlp
        ? {
            score: nlp.score,
            // The effective weight, not the nominal one: a withheld reading is
            // still shown here, but it moved the score by zero and says so.
            weight: ta!.applied[dim as (typeof TEXT_BLENDED_DIMS)[number]] ? ta!.text_weight : 0,
            evidence: nlp.evidence,
            disagreement: Math.abs(optionScore - nlp.score),
          }
        : null,
      score: scoring.behavior[dim].score,
      tier: scoring.behavior[dim].tier,
    };
  });

  const q12 = bank.items.find(
    (i): i is OverconfidenceInteractionItem => i.type === 'composite' && i.rule === 'overconfidenceInteraction',
  );

  const e = weights.emotion;
  const { anxiety, confidence, deviation } = scoring.emotional_state;

  return {
    constructs: constructAudits(bank, byId, responses, weights, scoring),
    competenceCap: {
      competence: scoring.competence,
      floor: weights.competence_cap.floor,
      slope: weights.competence_cap.slope,
      cap: scoring.competence_cap,
    },
    baseline: {
      capacity: scoring.constraint_gaps.capacity,
      willingness: scoring.constraint_gaps.willingness,
      competence_cap: scoring.constraint_gaps.competence_cap,
      binding: scoring.binding_constraint,
      baseline: scoring.baseline_risk,
      headroom: scoring.constraint_gaps.headroom,
    },
    behavior,
    interaction: q12 ? interactionAudit(q12, byId, responses) : null,
    emotion: {
      anxiety,
      confidence,
      anxietyExcess: Math.max(0, Math.min(1, (anxiety - e.anxiety_cut) / (100 - e.anxiety_cut))),
      euphoriaExcess: Math.max(0, Math.min(1, (confidence - e.euphoria_cut) / (100 - e.euphoria_cut))),
      deviation,
      maxDiscount: e.max_discount,
      mult: scoring.emotion_mult,
    },
    penalty: {
      biasIndex: scoring.bias_index,
      center: weights.bias_penalty.center,
      k: weights.bias_penalty.k,
      penalty: scoring.bias_penalty,
      max: weights.bias_penalty.max,
    },
    effective: {
      baseline: scoring.baseline_risk,
      mult: scoring.emotion_mult,
      penalty: scoring.bias_penalty,
      effective: scoring.effective_risk,
      targetVol: scoring.target_vol,
    },
    guardrails: scoring.guardrail_trace.map((t) => ({
      id: t.guardrail,
      title: guardrails.labels[t.guardrail]?.title ?? t.guardrail,
      because: t.because,
    })),
    exemptions: scoring.exemptions_applied,
  };
}
