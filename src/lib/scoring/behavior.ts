// Stage 2 (+ Stage 3 behavioral items): delta accumulation, normalization to 0–100,
// then the 70/30 option/text blend for overconfidence and herding.

import {
  BEHAVIOR_DIMS,
  TEXT_BLENDED_DIMS,
  type BehaviorDim,
  type DimScore,
  type Flag,
  type ItemBank,
  type Responses,
  type TextInput,
  type Weights,
} from './types';
import type { TextQuality } from '../analyzer/types';
import type { DimRanges } from './ranges';
import { normalize } from './ranges';
import { evaluateComposite } from './rules';
import { chosenOption, indexItems, tierOf } from './util';

// One item's contribution to one dimension. The audit panel reads these; the
// human-readable evidence strings are derived from them, so the two can never
// tell different stories.
export interface DeltaContribution {
  itemId: string;
  label: string; // chosen option, or the rule name for a composite
  delta: number;
  viaRule?: string;
}

export interface RawBehavior {
  raw: Record<BehaviorDim, number>;
  contributions: Record<BehaviorDim, DeltaContribution[]>;
  evidence: Record<BehaviorDim, string[]>;
  flags: Flag[];
}

const describe = (c: DeltaContribution): string =>
  `${c.itemId}「${c.label}」（${c.delta > 0 ? '+' : ''}${c.delta}）`;

export function rawBehavior(bank: ItemBank, responses: Responses): RawBehavior {
  const byId = indexItems(bank);
  const raw = Object.fromEntries(BEHAVIOR_DIMS.map((d) => [d, 0])) as Record<BehaviorDim, number>;
  const contributions = Object.fromEntries(
    BEHAVIOR_DIMS.map((d) => [d, [] as DeltaContribution[]]),
  ) as Record<BehaviorDim, DeltaContribution[]>;
  const flags: Flag[] = [];

  const add = (deltas: Partial<Record<BehaviorDim, number>>, itemId: string, label: string, viaRule?: string) => {
    for (const [d, v] of Object.entries(deltas) as [BehaviorDim, number][]) {
      raw[d] += v;
      if (v !== 0) contributions[d].push({ itemId, label, delta: v, viaRule });
    }
  };

  for (const item of bank.items) {
    if (item.type === 'single_choice') {
      const opt = chosenOption(item, responses);
      if (opt.deltas) add(opt.deltas, item.item_id, opt.label);
    } else if (item.type === 'composite') {
      const res = evaluateComposite(item, byId, responses);
      add(res.deltas, item.item_id, item.rule, item.rule);
      flags.push(...res.flags);
    }
  }

  const evidence = Object.fromEntries(
    BEHAVIOR_DIMS.map((d) => [d, contributions[d].map(describe)]),
  ) as Record<BehaviorDim, string[]>;
  return { raw, contributions, evidence, flags };
}

// Text weight follows the worse of the two answers: Q14 is only meaningful
// relative to Q13, so a pair is as usable as its weakest half.
export function textQuality(responses: Responses): { q13: TextQuality; q14: TextQuality; overall: TextQuality } {
  const q = (id: string): TextQuality => {
    const r = responses[id];
    return r && 'quality' in r ? r.quality : 'invalid';
  };
  const q13 = q('Q13');
  const q14 = q('Q14');
  const rank = { invalid: 0, thin: 1, usable: 2 } as const;
  return { q13, q14, overall: rank[q13] <= rank[q14] ? q13 : q14 };
}

// Combined length of the two open answers. Read for the depth floor below, so a
// verdict that depends on how much the respondent wrote is decided by how much
// they actually wrote, not by the analyzer's confidence about it.
export function textLength(responses: Responses): number {
  return ['Q13', 'Q14'].reduce((n, id) => {
    const r = responses[id];
    return n + (r && 'text' in r ? r.text.trim().replace(/\s+/g, '').length : 0);
  }, 0);
}

// Two gates stand between the text layer and a respondent's score:
//
//   1. No evidence, no adjustment. A reading the analyzer cannot quote the
//      respondent for does not move the number. This also disarms a model that
//      invents quotations — fabricated ones are dropped upstream by the verbatim
//      check, which empties the evidence list and so withdraws the score with it.
//   2. Overconfidence needs enough text for its depth term to carry information.
//      It is scored as stance × (100 − depth); in a short answer depth is 0 by
//      construction, which silently turns brevity into overconfidence.
//
// A withheld dimension is not scored 0 or 50 — it falls back to the choice
// questions, which cover every behavioural dimension on their own.
function textApplies(
  d: BehaviorDim,
  nlp: DimScore,
  chars: number,
  weights: Weights,
): boolean {
  if (nlp.evidence.length === 0) return false;
  return d !== 'overconfidence' || chars >= weights.thresholds.depth_floor_chars;
}

export interface BehaviorResult {
  behavior: Record<BehaviorDim, DimScore>;
  optionScores: Record<BehaviorDim, number>;
  textWeight: number;
  // Which blended dimensions the text actually moved. The report says so out
  // loud; a reading shown on screen but withheld from the score would be worse
  // than not showing it at all.
  textApplied: Record<(typeof TEXT_BLENDED_DIMS)[number], boolean>;
  flags: Flag[];
}

export function scoreBehavior(
  bank: ItemBank,
  responses: Responses,
  ranges: DimRanges,
  weights: Weights,
  text: TextInput | null,
): BehaviorResult {
  const { raw, evidence, flags } = rawBehavior(bank, responses);
  const quality = textQuality(responses).overall;
  const textWeight = text ? weights.text_blend[quality] : 0;

  const chars = textLength(responses);
  const optionScores = {} as Record<BehaviorDim, number>;
  const behavior = {} as Record<BehaviorDim, DimScore>;
  const textApplied = Object.fromEntries(
    TEXT_BLENDED_DIMS.map((d) => [d, false]),
  ) as Record<(typeof TEXT_BLENDED_DIMS)[number], boolean>;

  for (const d of BEHAVIOR_DIMS) {
    const opt = normalize(raw[d], ranges[d]);
    optionScores[d] = opt;
    let score = opt;
    const ev = [...evidence[d]];

    const blended = (TEXT_BLENDED_DIMS as readonly BehaviorDim[]).includes(d);
    if (blended && text && textWeight > 0) {
      const key = d as (typeof TEXT_BLENDED_DIMS)[number];
      const nlp = text.scores[key];
      if (textApplies(d, nlp, chars, weights)) {
        textApplied[key] = true;
        score = opt * (1 - textWeight) + nlp.score * textWeight;
        ev.push(...nlp.evidence.map((q) => `文字「${q}」`));
        // Two independent methods disagreeing is itself a finding — but only
        // once the text reading has earned the right to be one of them.
        if (Math.abs(opt - nlp.score) > weights.thresholds.inconsistency_gap) {
          flags.push(`inconsistency_${d}` as Flag);
        }
      }
    }

    behavior[d] = { score, tier: tierOf(score, weights.tiers), evidence: ev };
  }

  if (quality === 'invalid') flags.push('text_invalid');
  return { behavior, optionScores, textWeight, textApplied, flags };
}
