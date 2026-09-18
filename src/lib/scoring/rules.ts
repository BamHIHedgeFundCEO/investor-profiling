// Composite items: the only places scoring is not a plain option → deltas lookup.

import type {
  CompositeItem,
  Deltas,
  Flag,
  Item,
  OverconfidenceParams,
  Responses,
  SubChoiceItem,
} from './types';
import { cartesian, chosenIndex } from './util';

export interface RuleResult {
  deltas: Deltas;
  value?: number; // facet value, for composites that feed a construct (Q19)
  flags: Flag[];
}

/**
 * Q12 overconfidence interaction — the one deliberate non-additive term.
 *
 * Neither sub-answer alone is a danger signal: a high self-rank with no trading is
 * harmless, and heavy trading by someone who rates themself average is not
 * necessarily overconfidence. Only the combination scores high.
 */
export function scoreOverconfidence(selfRank: number, tradeFreq: number, p: OverconfidenceParams): number {
  if (selfRank > p.rank_high && tradeFreq > p.freq_high) return p.score_both;
  if (selfRank > p.rank_high) return p.score_rank_only;
  if (tradeFreq > p.freq_very_high) return p.score_freq_only;
  return 0;
}

export function subItems(item: CompositeItem, byId: Map<string, Item>): SubChoiceItem[] {
  return item.sub_items.map((id) => {
    const sub = byId.get(id);
    if (!sub || sub.type !== 'sub_choice') throw new Error(`${item.item_id}: sub-item ${id} is not a sub_choice`);
    return sub;
  });
}

// Pure rule evaluation from the chosen option index of each sub-item.
export function evaluateRule(item: CompositeItem, subs: SubChoiceItem[], picks: number[]): RuleResult {
  const opts = subs.map((s, i) => {
    const o = s.options[picks[i]!];
    if (!o) throw new Error(`${s.item_id}: selected_index ${picks[i]} out of range`);
    return o;
  });

  switch (item.rule) {
    case 'reflectionEffect': {
      const key = opts.map((o) => String(o.code)).join('|');
      const outcome = item.outcomes[key];
      if (!outcome) throw new Error(`${item.item_id}: no outcome for "${key}"`);
      return { deltas: { ...outcome.deltas }, flags: outcome.flag ? [outcome.flag] : [] };
    }
    case 'overconfidenceInteraction': {
      const [rank, freq] = opts;
      const p = item.params;
      return {
        deltas: {
          overconfidence: scoreOverconfidence(Number(rank!.code), Number(freq!.code), p),
          // Self-rank also feeds confidence linearly: confidence is the level of
          // self-belief, overconfidence is the gap between belief and behavior.
          confidence: p.confidence_by_rank_option[picks[0]!]!,
        },
        flags: [],
      };
    }
    case 'knowledgeQuiz': {
      const correct = opts.filter((o) => o.correct).length;
      return { deltas: {}, value: item.value_by_correct[correct]!, flags: [] };
    }
  }
}

export function evaluateComposite(item: CompositeItem, byId: Map<string, Item>, responses: Responses): RuleResult {
  const subs = subItems(item, byId);
  return evaluateRule(item, subs, subs.map((s) => chosenIndex(responses, s.item_id)));
}

// Every possible result of a composite; small by construction (≤ 16 combos today).
export function enumerateComposite(item: CompositeItem, byId: Map<string, Item>): RuleResult[] {
  const subs = subItems(item, byId);
  return cartesian(subs.map((s) => s.options.length)).map((picks) => evaluateRule(item, subs, picks));
}
