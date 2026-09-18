// Stage 1: financial capacity. Absolute 0–100, weighted mean of Stage 1 facets only.

import type { Facet, Weights } from './types';
import { weightedMean } from './facets';

export const scoreCapacity = (facets: Record<Facet, number>, weights: Weights): number =>
  weightedMean(facets, weights.capacity);
