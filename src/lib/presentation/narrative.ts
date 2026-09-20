// Result-page wording. Every tone fills the same placeholders from the same
// scoring_layer, so tone can change phrasing but never the facts it states.

import templatesJson from '../../data/tone_templates.json';
import { liftPlan, type LiftPlan } from './headroom';
import type { ScoringLayer, Tone, Weights } from '../scoring/types';

export type BindingVariant = 'capacity' | 'willingness' | 'competence_experience' | 'competence_knowledge';
export type ContradictionVariant = 'capacity_higher' | 'willingness_higher';
// `binding` says what holds the score down; `lift` says what would move it, and
// only it is allowed to promise a number. See headroom.ts for why they split.
export type LiftVariant = 'preference' | 'none' | 'action' | 'time';

export interface ToneTemplate {
  summary: string;
  contradiction: Record<ContradictionVariant, string>;
  binding: Record<BindingVariant, string>;
  lift: Record<LiftVariant | 'type_change', string>;
  guardrails: string;
  guardrails_none: string;
}

export interface ToneTemplates {
  version: string;
  labels: Record<Tone, string>;
  tones: Record<Tone, ToneTemplate>;
}

export const toneTemplates = templatesJson as ToneTemplates;

export const EMOTION_ZH = { calm: '平靜', deviated: '偏離', highly_deviated: '高度偏離' } as const;

export const PLACEHOLDER = /\{(\w+)\}/g;

export function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1]!).sort();
}

export const fmtScore = (n: number) => String(Math.round(n));
export const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;

const typeZh = (id: string, weights: Weights) => weights.investor_types.find((t) => t.id === id)!.zh;

export function facts(s: ScoringLayer, weights: Weights, plan: LiftPlan = liftPlan(s, weights)): Record<string, string> {
  // The top lever may be absent (willingness-bound, or nothing movable left). The
  // placeholders still have to resolve, because fill() throws on a missing key —
  // the templates that use them are only selected when a lever exists.
  const lever = plan.levers[0];
  return {
    effective: fmtScore(s.effective_risk),
    baseline: fmtScore(s.baseline_risk),
    type_zh: typeZh(s.investor_type, weights),
    emotion_zh: EMOTION_ZH[s.emotional_state.state],
    target_vol: fmtPct(s.target_vol),
    capacity: fmtScore(s.capacity),
    willingness: fmtScore(s.willingness),
    binding_value: fmtScore(s.baseline_risk),
    headroom: fmtScore(s.constraint_gaps.headroom),
    // What the NAMED lever delivers on its own. Deliberately not plan.reachable:
    // that is the sum over every movable facet, and printing it beside one facet's
    // name promised 68 points from a facet worth 18 — the overpromise this module
    // removes, reintroduced by the module itself. Hence the placeholder is called
    // lever_gain: a name that cannot be filled with a total by accident.
    lever_gain: fmtScore(plan.top_gain),
    lever_label: lever?.label ?? '',
    lever_action: lever?.action ?? '',
    type_lifted: typeZh(plan.type_lifted, weights),
    guardrail_count: String(s.guardrails.length),
  };
}

export function liftVariant(plan: LiftPlan): LiftVariant {
  if (plan.binding === 'willingness') return 'preference'; // a preference is not a defect
  if (!plan.material || plan.levers.length === 0) return 'none';
  return plan.levers[0]!.kind === 'time' ? 'time' : 'action';
}

export function fill(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_, key: string) => {
    const v = values[key];
    if (v === undefined) throw new Error(`template placeholder {${key}} has no value`);
    return v;
  });
}

export function bindingVariant(s: ScoringLayer): BindingVariant {
  if (s.binding_constraint !== 'competence') return s.binding_constraint;
  // Point at whichever half of competence is lower; ties go to experience.
  return s.facets.knowledge < s.facets.experience ? 'competence_knowledge' : 'competence_experience';
}

export interface Narrative {
  summary: string;
  contradiction: string | null;
  binding: string;
  lift: string;
  plan: LiftPlan;
  guardrails: string;
}

export function narrative(s: ScoringLayer, tone: Tone, weights: Weights): Narrative {
  const t = toneTemplates.tones[tone];
  const plan = liftPlan(s, weights);
  const v = facts(s, weights, plan);
  const gap = s.flags.includes('capacity_willingness_gap');
  const variant = liftVariant(plan);
  // The counterfactual type is only stated where a lever was actually named;
  // appending it to "不需要處理" would promise an upgrade the sentence just declined.
  const lift =
    fill(t.lift[variant], v) +
    (plan.type_changes && (variant === 'action' || variant === 'time') ? fill(t.lift.type_change, v) : '');
  return {
    summary: fill(t.summary, v),
    contradiction: gap
      ? fill(t.contradiction[s.capacity > s.willingness ? 'capacity_higher' : 'willingness_higher'], v)
      : null,
    binding: fill(t.binding[bindingVariant(s)], v),
    lift,
    plan,
    guardrails: fill(s.guardrails.length ? t.guardrails : t.guardrails_none, v),
  };
}
