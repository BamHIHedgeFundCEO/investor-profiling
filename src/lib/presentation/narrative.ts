// Result-page wording. Every tone fills the same placeholders from the same
// scoring_layer, so tone can change phrasing but never the facts it states.

import templatesJson from '../../data/tone_templates.json';
import type { ScoringLayer, Tone, Weights } from '../scoring/types';

export type BindingVariant = 'capacity' | 'willingness' | 'competence_experience' | 'competence_knowledge';
export type ContradictionVariant = 'capacity_higher' | 'willingness_higher';

export interface ToneTemplate {
  summary: string;
  contradiction: Record<ContradictionVariant, string>;
  binding: Record<BindingVariant, string>;
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

export function facts(s: ScoringLayer, weights: Weights): Record<string, string> {
  return {
    effective: fmtScore(s.effective_risk),
    baseline: fmtScore(s.baseline_risk),
    type_zh: weights.investor_types.find((t) => t.id === s.investor_type)!.zh,
    emotion_zh: EMOTION_ZH[s.emotional_state.state],
    target_vol: fmtPct(s.target_vol),
    capacity: fmtScore(s.capacity),
    willingness: fmtScore(s.willingness),
    binding_value: fmtScore(s.baseline_risk),
    headroom: fmtScore(s.constraint_gaps.headroom),
    guardrail_count: String(s.guardrails.length),
  };
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
  guardrails: string;
}

export function narrative(s: ScoringLayer, tone: Tone, weights: Weights): Narrative {
  const t = toneTemplates.tones[tone];
  const v = facts(s, weights);
  const gap = s.flags.includes('capacity_willingness_gap');
  return {
    summary: fill(t.summary, v),
    contradiction: gap
      ? fill(t.contradiction[s.capacity > s.willingness ? 'capacity_higher' : 'willingness_higher'], v)
      : null,
    binding: fill(t.binding[bindingVariant(s)], v),
    guardrails: fill(s.guardrails.length ? t.guardrails : t.guardrails_none, v),
  };
}
