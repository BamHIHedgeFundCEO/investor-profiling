import type {
  ChoiceItem,
  ChoiceOption,
  CompositeItem,
  Item,
  ItemBank,
  Responses,
  Tier,
  Weights,
} from './types';
import type { OpenAnswer } from '../analyzer/types';

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

export function tierOf(score: number, tiers: Weights['tiers']): Tier {
  if (score >= tiers.high_min) return 'high';
  if (score >= tiers.mid_min) return 'mid';
  return 'low';
}

export function indexItems(bank: ItemBank): Map<string, Item> {
  return new Map(bank.items.map((it) => [it.item_id, it]));
}

export const isComposite = (it: Item): it is CompositeItem => it.type === 'composite';

export const isChoice = (it: Item): it is ChoiceItem =>
  it.type === 'single_choice' || it.type === 'attention_check' || it.type === 'sub_choice';

export function chosenIndex(responses: Responses, itemId: string): number {
  const r = responses[itemId];
  if (!r || !('selected_index' in r)) throw new Error(`missing choice response: ${itemId}`);
  return r.selected_index;
}

export function chosenOption(item: ChoiceItem, responses: Responses): ChoiceOption {
  const idx = chosenIndex(responses, item.item_id);
  const opt = item.options[idx];
  if (!opt) throw new Error(`${item.item_id}: selected_index ${idx} out of range`);
  return opt;
}

export function openAnswer(responses: Responses, itemId: string): OpenAnswer | null {
  const r = responses[itemId];
  return r && 'text' in r ? r : null;
}

// Every combination of option indices across the given sub-items.
export function cartesian(sizes: number[]): number[][] {
  return sizes.reduce<number[][]>(
    (acc, n) => acc.flatMap((combo) => Array.from({ length: n }, (_, i) => [...combo, i])),
    [[]],
  );
}
