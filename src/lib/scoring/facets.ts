// Absolute-scale facets (0–100) for the three slow-variable constructs.

import type { Facet, ItemBank, Responses } from './types';
import { chosenOption, indexItems } from './util';
import { evaluateComposite } from './rules';

export function facetValues(bank: ItemBank, responses: Responses): Record<Facet, number> {
  const byId = indexItems(bank);
  const out: Partial<Record<Facet, number>> = {};
  for (const item of bank.items) {
    if (item.type === 'single_choice' && item.facet) {
      out[item.facet] = chosenOption(item, responses).value!;
    } else if (item.type === 'composite' && item.rule === 'knowledgeQuiz') {
      out[item.facet] = evaluateComposite(item, byId, responses).value!;
    }
  }
  return out as Record<Facet, number>;
}

// Weighted mean over the facets named in `weights`. Dividing by the weight sum keeps
// the result on 0–100 even when weights are perturbed and no longer sum to 1.
export function weightedMean<F extends Facet>(
  facets: Record<Facet, number>,
  weights: Record<F, number>,
): number {
  let num = 0;
  let den = 0;
  for (const [f, w] of Object.entries(weights) as [F, number][]) {
    const v = facets[f];
    if (v === undefined) throw new Error(`facet ${f} has no value`);
    num += w * v;
    den += w;
  }
  return num / den;
}
