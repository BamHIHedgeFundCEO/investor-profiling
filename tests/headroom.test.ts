// The lift plan replaces wording that named two hard-coded facets for every
// capacity-bound respondent and promised the whole headroom regardless of what
// the named facet could deliver. These tests hold both defects shut.

import { describe, expect, it } from 'vitest';
import { facetActions, facetGain, liftPlan } from '../src/lib/presentation/headroom';
import { liftVariant, narrative, toneTemplates } from '../src/lib/presentation/narrative';
import type { Facet, Tone } from '../src/lib/scoring/types';
import { itemBank, responses, run, weights } from './helpers';

const TONES = Object.keys(toneTemplates.tones) as Tone[];

// Every facet the bank can produce must have an entry, or a respondent bound by
// it would silently get no advice at all.
describe('facet_actions covers the item bank', () => {
  const inBank = new Set<Facet>();
  for (const item of itemBank.items) {
    if ('facet' in item && item.facet) inBank.add(item.facet);
  }

  it('every scored facet has an action entry', () => {
    for (const f of inBank) expect(facetActions.facets[f], f).toBeDefined();
  });

  it('every action entry names a real facet', () => {
    for (const f of Object.keys(facetActions.facets) as Facet[]) expect(inBank.has(f), f).toBe(true);
  });

  it('every willingness facet is fixed: a preference is not a defect to fix', () => {
    for (const f of Object.keys(weights.willingness) as Facet[]) {
      expect(facetActions.facets[f].kind, f).toBe('fixed');
    }
  });
});

describe('a facet is never promised more than it can deliver', () => {
  // competence reaches the baseline through competence_cap = floor + slope × competence,
  // so its facets are worth slope times their weight. experience (0.35 × 0.45 × 100)
  // tops out at 15.75 baseline points — the old wording promised the full headroom.
  it('competence facets are discounted by the cap slope', () => {
    const full = facetGain('experience', 0, 'competence', weights);
    expect(full).toBeCloseTo(0.35 * 100 * weights.competence_cap.slope, 6);
    expect(full).toBeLessThan(facetGain('experience', 0, 'capacity', weights) || Infinity);
  });

  it('a facet already at 100 can deliver nothing', () => {
    expect(facetGain('liquidity', 100, 'capacity', weights)).toBe(0);
  });

  it('reachable never exceeds the headroom or what the levers can give', () => {
    for (const picks of PROFILES) {
      const plan = liftPlan(run(responses(picks)), weights);
      const lever = plan.levers.reduce((a, f) => a + f.gain, 0);
      expect(plan.reachable).toBeLessThanOrEqual(plan.headroom + 1e-9);
      expect(plan.reachable).toBeLessThanOrEqual(lever + 1e-9);
    }
  });

  // The sentence names ONE facet, so the number in it must be that facet's own
  // contribution. Filling it with `reachable` told a respondent whose top lever
  // was worth 18 points that it was worth 68.
  it('the number beside a single facet is that facet, not the sum of all of them', () => {
    for (const picks of PROFILES) {
      const plan = liftPlan(run(responses(picks)), weights);
      if (!plan.levers.length) {
        expect(plan.top_gain).toBe(0);
        continue;
      }
      expect(plan.top_gain).toBeLessThanOrEqual(plan.levers[0]!.gain + 1e-9);
      expect(plan.top_gain).toBeLessThanOrEqual(plan.headroom + 1e-9);
      if (plan.levers.length > 1) expect(plan.top_gain).toBeLessThan(plan.reachable);
    }
  });

  it('no tone quotes the cumulative figure next to one facet name', () => {
    // The multi-lever case that first exposed it: five movable capacity facets.
    const s = run(responses({ Q01: 0, Q02: 0, Q03: 0, Q05: 0, Q06: 0, Q07: 0, Q21: 3, Q15: 4, Q15b: 4 }));
    const plan = liftPlan(s, weights);
    expect(plan.levers.length).toBeGreaterThan(1);
    expect(plan.binding).toBe('capacity');
    for (const t of TONES) {
      const lift = narrative(s, t, weights).lift;
      expect(lift).toContain(String(Math.round(plan.top_gain)));
      expect(lift).not.toContain(`${Math.round(plan.reachable)} 分`);
    }
  });
});

describe('levers name only what the respondent can move', () => {
  it('a facet already maxed is never named', () => {
    // Emergency fund and concentration at their best options; the old wording told
    // this respondent to raise them anyway.
    const s = run(
      responses({
        Q01: 0, Q02: 3, Q03: 3, Q05: 3, Q06: 2, Q07: 0, // savings and concentration already best
        Q21: 3, Q15: 4, Q15b: 4, // willingness out of the way
        Q19a: 1, Q19b: 1, Q19c: 1, Q19d: 1, Q20: 3, Q20b: 4, // competence out of the way
      }),
    );
    const plan = liftPlan(s, weights);
    expect(plan.binding).toBe('capacity');
    expect(plan.levers.map((l) => l.facet)).not.toContain('liquidity');
    expect(plan.levers.map((l) => l.facet)).not.toContain('concentration');
    // horizon is what is actually low here.
    expect(plan.levers[0]!.facet).toBe('horizon');
    for (const t of TONES) {
      const n = narrative(s, t, weights);
      expect(n.lift).not.toMatch(/預備金|占比|占資產/);
    }
  });

  it('fixed facets never become levers', () => {
    for (const picks of PROFILES) {
      for (const l of liftPlan(run(responses(picks)), weights).levers) {
        expect(l.kind, l.facet).not.toBe('fixed');
      }
    }
  });
});

describe('the lift sentence matches the situation', () => {
  it('willingness-bound: states a preference, promises nothing, names no lever', () => {
    const s = run(responses({ Q21: 0, Q15: 0, Q15b: 0 }));
    expect(s.binding_constraint).toBe('willingness');
    const plan = liftPlan(s, weights);
    expect(liftVariant(plan)).toBe('preference');
    expect(plan.levers).toHaveLength(0);
    for (const t of TONES) {
      const n = narrative(s, t, weights);
      expect(n.lift).not.toMatch(/\d+\s*分/); // no number is offered
      expect(n.lift).not.toMatch(/\{\w+\}/);
    }
  });

  it('immaterial headroom is declined rather than dressed as advice', () => {
    const plan = { ...liftPlan(run(responses()), weights), binding: 'capacity' as const, material: false };
    expect(liftVariant(plan)).toBe('none');
  });

  it('a time-only lever is not given a points promise', () => {
    // Financially able and willing, but no market experience and no tenure.
    const s = run({
      ...responses({ Q01: 4, Q02: 3, Q03: 3, Q05: 3, Q06: 2, Q07: 2, Q21: 3, Q15: 4, Q15b: 4, Q19a: 1, Q19b: 1, Q19c: 1, Q19d: 1, Q20: 0, Q20b: 0 }),
    });
    const plan = liftPlan(s, weights);
    if (plan.binding === 'competence' && plan.levers[0]?.kind === 'time') {
      expect(liftVariant(plan)).toBe('time');
      for (const t of TONES) {
        expect(toneTemplates.tones[t].lift.time).not.toMatch(/\{lever_gain\}/);
      }
    }
  });

  it('the counterfactual type is stated only when a lever was named', () => {
    for (const picks of PROFILES) {
      const s = run(responses(picks));
      const plan = liftPlan(s, weights);
      const n = narrative(s, 'neutral', weights);
      const names = liftVariant(plan) === 'action' || liftVariant(plan) === 'time';
      if (!names || !plan.type_changes) {
        const zh = weights.investor_types.find((t) => t.id === plan.type_lifted)!.zh;
        if (!plan.type_changes) expect(zh).toBe(weights.investor_types.find((t) => t.id === s.investor_type)!.zh);
        else expect(n.lift).not.toContain(zh);
      }
      expect(n.lift).not.toMatch(/\{\w+\}/);
    }
  });
});

describe('the counterfactual is exact, not estimated', () => {
  it('lifting the binding constraint lands on the second-lowest constraint', () => {
    for (const picks of PROFILES) {
      const s = run(responses(picks));
      const g = s.constraint_gaps;
      const sorted = [g.capacity, g.willingness, g.competence_cap].sort((a, b) => a - b);
      expect(s.baseline_risk + g.headroom).toBeCloseTo(sorted[1]!, 6);
    }
  });
});

// A spread of respondents: each row is an override of the mid-range base.
const PROFILES: Record<string, number>[] = [
  {},
  { Q01: 0, Q02: 0, Q03: 0, Q05: 0, Q06: 0, Q07: 0 }, // capacity floor
  { Q01: 4, Q02: 3, Q03: 3, Q05: 3, Q06: 2, Q07: 2 }, // capacity ceiling
  { Q21: 0, Q15: 0, Q15b: 0 }, // willingness floor
  { Q21: 3, Q15: 4, Q15b: 4 }, // willingness ceiling
  { Q19a: 0, Q19b: 0, Q19c: 0, Q19d: 0, Q20: 0, Q20b: 0 }, // competence floor
  { Q19a: 1, Q19b: 1, Q19c: 1, Q19d: 1, Q20: 3, Q20b: 4 }, // competence ceiling
  { Q01: 4, Q02: 3, Q03: 3, Q21: 3, Q15: 4, Q15b: 4, Q20: 0, Q20b: 0 }, // competence-bound
  { Q02: 3, Q03: 3, Q01: 0, Q07: 0 }, // savings maxed, horizon short
  { Q00: 4, Q04: 0, Q05: 0 },
];
