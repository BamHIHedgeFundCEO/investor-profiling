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

export interface BehaviorResult {
  behavior: Record<BehaviorDim, DimScore>;
  optionScores: Record<BehaviorDim, number>;
  textWeight: number;
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

  const optionScores = {} as Record<BehaviorDim, number>;
  const behavior = {} as Record<BehaviorDim, DimScore>;

  for (const d of BEHAVIOR_DIMS) {
    const opt = normalize(raw[d], ranges[d]);
    optionScores[d] = opt;
    let score = opt;
    const ev = [...evidence[d]];

    const blended = (TEXT_BLENDED_DIMS as readonly BehaviorDim[]).includes(d);
    if (blended && text && textWeight > 0) {
      const nlp = text.scores[d as (typeof TEXT_BLENDED_DIMS)[number]];
      score = opt * (1 - textWeight) + nlp.score * textWeight;
      ev.push(...nlp.evidence.map((q) => `文字「${q}」`));
      // Two independent methods disagreeing is itself a finding.
      if (Math.abs(opt - nlp.score) > weights.thresholds.inconsistency_gap) {
        flags.push(`inconsistency_${d}` as Flag);
      }
    }

    behavior[d] = { score, tier: tierOf(score, weights.tiers), evidence: ev };
  }

  if (quality === 'invalid') flags.push('text_invalid');
  return { behavior, optionScores, textWeight, flags };
}
