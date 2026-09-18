// Response-quality flags. None of them changes a score; they are surfaced for review.

import type { Facet, Flag, ItemBank, Responses, Weights } from './types';
import { chosenIndex } from './util';

export function qualityFlags(
  bank: ItemBank,
  responses: Responses,
  weights: Weights,
  facets: Record<Facet, number>,
  meta?: { duration_sec?: number },
): Flag[] {
  const flags: Flag[] = [];

  // Same construct asked in two frames (one-sided loss vs two-sided range).
  const [a, b] = weights.framing_pair;
  const facetOf = (id: string) => {
    const it = bank.items.find((i) => i.item_id === id);
    return it && 'facet' in it && it.facet ? facets[it.facet] : undefined;
  };
  const fa = facetOf(a);
  const fb = facetOf(b);
  if (fa !== undefined && fb !== undefined && Math.abs(fa - fb) >= weights.thresholds.framing_gap) {
    flags.push('framing_sensitivity');
  }

  for (const it of bank.items) {
    if (it.type === 'attention_check' && chosenIndex(responses, it.item_id) !== it.correct_index) {
      flags.push('attention_check_failed');
    }
  }

  // Straight-lining: Stage 2–3 only. Stage 1 options are deliberately ordered
  // low→high, so a consistently well-off respondent would trip it falsely.
  // Open-text and two-option items are skipped rather than breaking the run.
  const q = weights.quality;
  let run = 0;
  let last = -1;
  for (const it of bank.items) {
    if (it.stage !== 2 && it.stage !== 3) continue;
    if (!('options' in it) || it.options.length < q.straight_line_min_options) continue;
    const idx = chosenIndex(responses, it.item_id);
    run = idx === last ? run + 1 : 1;
    last = idx;
    if (run >= q.straight_line_run) {
      flags.push('straight_lining_flag');
      break;
    }
  }

  if (meta?.duration_sec !== undefined && meta.duration_sec < q.min_duration_sec) {
    flags.push('data_quality_flag');
  }
  return flags;
}
