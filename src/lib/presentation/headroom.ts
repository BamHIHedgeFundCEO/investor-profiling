// What is holding the score down, and what would actually lift it.
//
// baseline_risk = min(capacity, willingness, competence_cap), so the counterfactual
// is exact rather than estimated: lift the lowest constraint and the baseline
// becomes the second-lowest. `headroom` already carries that distance. What this
// module adds is the part the number alone cannot say —
//
//   1. WHICH facet to move. The wording used to name 緊急預備金 and 資產集中度 for
//      every capacity-bound respondent. Capacity has eight facets; someone already
//      at six months of savings was being told to save more. Facets are now ranked
//      by what they can still deliver, which is weight × (100 − current value).
//   2. Whether the named facet CAN deliver the promised headroom. Competence enters
//      the baseline through competence_cap = floor + slope × competence, so a facet
//      of weight w yields at most w × (100 − value) × slope baseline points.
//      Lifting `experience` (weight 0.35, slope 0.45) from zero is worth 15.75
//      points, and the old wording promised the full headroom regardless — a
//      simulated population put that overpromise at 22% of capacity-bound
//      respondents, with a median shortfall of 3.6 points.
//   3. Whether the headroom is worth mentioning at all. About a fifth of
//      respondents have less than three points of it, and "最多可再提高 1 分" is
//      noise dressed as advice.
//
// Everything here is derived from the scoring layer and the JSON; no scoring
// value is recomputed, and nothing in this file may be imported by scoring.

import actionsJson from '../../data/facet_actions.json';
import { investorType } from '../scoring/compose';
import type { Construct, Facet, InvestorTypeId, ScoringLayer, Weights } from '../scoring/types';

export type LiftKind = 'action' | 'time' | 'fixed';

export interface FacetAction {
  label: string;
  kind: LiftKind;
  action: string;
}

export interface FacetActions {
  version: string;
  facets: Record<Facet, FacetAction>;
}

export const facetActions = actionsJson as unknown as FacetActions;

export interface FacetLift extends FacetAction {
  facet: Facet;
  value: number; // current facet score, 0–100
  gain: number; // baseline points this facet can still deliver on its own
}

export interface LiftPlan {
  binding: Construct;
  headroom: number;
  /** False when the headroom is too small to be worth a sentence. */
  material: boolean;
  /** What ALL movable facets together can deliver, capped at the headroom. */
  reachable: number;
  /**
   * What the top lever delivers ON ITS OWN, capped at the headroom. Any sentence
   * that names a single facet must quote this and never `reachable` — quoting the
   * cumulative figure beside one facet's name is the same overpromise this module
   * exists to remove, and it grew back here once already.
   */
  top_gain: number;
  /** True when even lifting every movable facet to 100 falls short of the headroom. */
  capped: boolean;
  /** Ranked by deliverable gain: the smallest set that covers `reachable`. */
  levers: FacetLift[];
  /**
   * The investor type now, and the one reached by moving the TOP LEVER only —
   * the same action the sentence names, so the promised upgrade is the promised
   * action's consequence and not the consequence of fixing everything at once.
   */
  type_now: InvestorTypeId;
  type_lifted: InvestorTypeId;
  type_changes: boolean;
}

const CONSTRUCT_FACETS = {
  capacity: 'capacity',
  willingness: 'willingness',
  competence: 'competence',
} as const;

/**
 * Baseline points a single facet can still deliver if it alone were lifted to 100.
 * weightedMean divides by the weight sum, so the marginal rate is w / Σw; for
 * competence the facet moves the construct, and the construct moves the cap at
 * `slope`, so the two multiply.
 */
export function facetGain(facet: Facet, value: number, binding: Construct, weights: Weights): number {
  const table = weights[CONSTRUCT_FACETS[binding]] as Record<string, number>;
  const w = table[facet];
  if (w === undefined) return 0;
  const sum = Object.values(table).reduce((a, b) => a + b, 0);
  const rate = binding === 'competence' ? weights.competence_cap.slope : 1;
  return (w / sum) * Math.max(0, 100 - value) * rate;
}

export function liftPlan(s: ScoringLayer, weights: Weights, actions: FacetActions = facetActions): LiftPlan {
  const binding = s.binding_constraint;
  const headroom = s.constraint_gaps.headroom;
  const table = weights[CONSTRUCT_FACETS[binding]] as Record<string, number>;

  // Only facets the respondent can actually move are allowed to carry a promise.
  const movable = (Object.keys(table) as Facet[])
    .map((facet) => {
      const meta = actions.facets[facet];
      return { ...meta, facet, value: s.facets[facet], gain: facetGain(facet, s.facets[facet], binding, weights) };
    })
    .filter((f) => f.kind !== 'fixed' && f.gain > 0)
    .sort((a, b) => b.gain - a.gain);

  const total = movable.reduce((a, f) => a + f.gain, 0);
  const reachable = Math.min(headroom, total);

  // The shortest prefix that covers the reachable amount — naming eight facets is
  // not advice, and naming one that cannot deliver is the defect this replaces.
  const levers: FacetLift[] = [];
  let acc = 0;
  for (const f of movable) {
    if (acc >= reachable) break;
    levers.push(f);
    acc += f.gain;
  }

  const top_gain = levers.length ? Math.min(levers[0]!.gain, headroom) : 0;
  const lifted = Math.min(100, s.baseline_risk + top_gain);
  const effectiveLifted = Math.max(0, Math.min(100, lifted * s.emotion_mult - s.bias_penalty));
  const type_lifted = investorType(effectiveLifted, weights.investor_types);

  return {
    binding,
    headroom,
    material: headroom >= weights.thresholds.headroom_material,
    reachable,
    top_gain,
    capped: total < headroom,
    levers,
    type_now: s.investor_type,
    type_lifted,
    type_changes: type_lifted !== s.investor_type,
  };
}
