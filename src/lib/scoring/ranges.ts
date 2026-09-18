// Theoretical range of each behavior dimension, derived from the item bank so that
// editing a delta can never leave a hand-maintained range out of sync.

import { BEHAVIOR_DIMS, type BehaviorDim, type ItemBank, type Range } from './types';
import { enumerateComposite } from './rules';
import { clamp, indexItems } from './util';

export type DimRanges = Record<BehaviorDim, { min: number; max: number }>;

export interface RangeOptions {
  // 'declared' (default): composites contribute their declared_range.
  // 'enumerated': composites are enumerated instead — used when parameters are
  // perturbed and declared ranges no longer hold.
  composites?: 'declared' | 'enumerated';
}

/**
 * Each answered item contributes exactly one option, and items are independent,
 * so a dimension's range is the sum over items of each item's own [min, max].
 * An option that does not mention a dimension contributes 0 to it.
 */
export function deriveTheoreticalRange(bank: ItemBank, opts: RangeOptions = {}): DimRanges {
  const byId = indexItems(bank);
  const out = Object.fromEntries(BEHAVIOR_DIMS.map((d) => [d, { min: 0, max: 0 }])) as DimRanges;

  for (const item of bank.items) {
    let perDim: (d: BehaviorDim) => Range;

    if (item.type === 'single_choice') {
      perDim = (d) => {
        const vals = item.options.map((o) => o.deltas?.[d] ?? 0);
        return [Math.min(...vals), Math.max(...vals)];
      };
    } else if (item.type === 'composite') {
      if (!item.declared_range) throw new Error(`${item.item_id}: composite without declared_range`);
      if (opts.composites === 'enumerated') {
        const results = enumerateComposite(item, byId);
        perDim = (d) => {
          const vals = results.map((r) => r.deltas[d] ?? 0);
          return [Math.min(...vals), Math.max(...vals)];
        };
      } else {
        perDim = (d) => item.declared_range[d] ?? [0, 0];
      }
    } else {
      continue; // sub_choice is scored via its parent; open_text, mbti, attention_check carry no deltas
    }

    for (const d of BEHAVIOR_DIMS) {
      const [lo, hi] = perDim(d);
      out[d].min += lo;
      out[d].max += hi;
    }
  }

  for (const d of BEHAVIOR_DIMS) {
    if (out[d].max <= out[d].min) throw new Error(`dimension ${d} has a degenerate range`);
  }
  return out;
}

export function normalize(raw: number, range: { min: number; max: number }): number {
  return clamp(((raw - range.min) / (range.max - range.min)) * 100, 0, 100);
}
