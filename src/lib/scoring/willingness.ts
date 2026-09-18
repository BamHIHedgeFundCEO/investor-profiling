// Stage 3: willingness (pure risk preference) and competence (knowledge + experience).
//
// Competence is kept out of willingness on purpose: in MiFID II terms knowledge and
// experience belong to the appropriateness test, risk preference to suitability.
// Averaging them would let "you don't know" lower "you want". Competence therefore
// acts as a ceiling, not as an averaged term.

import type { Facet, Weights } from './types';
import { weightedMean } from './facets';

export const scoreWillingness = (facets: Record<Facet, number>, weights: Weights): number =>
  weightedMean(facets, weights.willingness);

export const scoreCompetence = (facets: Record<Facet, number>, weights: Weights): number =>
  weightedMean(facets, weights.competence);

// Zero competence caps baseline at the top of Balanced, not at Conservative.
export const competenceCap = (competence: number, weights: Weights): number =>
  weights.competence_cap.floor + weights.competence_cap.slope * competence;
