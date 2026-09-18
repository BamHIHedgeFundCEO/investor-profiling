import { describe, expect, it } from 'vitest';
import { compareRows, invariantsHold, runScenario, scenarioById, scenarioResponses, scenarios } from '../src/lib/demo';
import { explain } from '../src/lib/audit/explain';
import { guardrails, itemBank, weights } from '../src/lib/scoring/data';
import type { ChoiceItem } from '../src/lib/scoring/types';

const scorable = itemBank.items.filter(
  (i): i is ChoiceItem => i.type === 'single_choice' || i.type === 'attention_check' || i.type === 'sub_choice',
);

describe('demo fixtures', () => {
  it('has the three scenarios the spec asks for, plus the coverage case', () => {
    expect(scenarios.map((s) => s.id)).toEqual(['calm', 'panic', 'contradiction', 'overconfident']);
  });

  it.each(scenarios.map((s) => [s.id, s] as const))('%s answers every item, in range', (_id, s) => {
    const r = scenarioResponses(s);
    for (const item of scorable) {
      const answer = r[item.item_id];
      expect(answer, `${item.item_id} unanswered`).toBeDefined();
      const idx = (answer as { selected_index: number }).selected_index;
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(item.options.length);
    }
    for (const id of ['Q13', 'Q14']) expect(r[id]).toHaveProperty('text');
  });

  it('panic differs from calm in exactly the items it declares', () => {
    const calm = scenarioById('calm')!;
    const panic = scenarioById('panic')!;
    const differing = Object.keys(calm.responses).filter(
      (k) => JSON.stringify(calm.responses[k]) !== JSON.stringify(panic.responses[k]),
    );
    expect(new Set(differing)).toEqual(new Set(panic.differs_in));
  });
});

describe('dual scenario', () => {
  it('leaves every slow variable untouched — the claim the demo makes', async () => {
    const a = (await runScenario(scenarioById('calm')!)).scoring_layer;
    const b = (await runScenario(scenarioById('panic')!)).scoring_layer;
    const inv = invariantsHold(a, b);
    expect(inv.broken).toEqual([]);
    expect(inv.ok).toBe(true);
    expect(a.capacity).toBe(b.capacity);
    expect(a.willingness).toBe(b.willingness);
    expect(a.baseline_risk).toBe(b.baseline_risk);
  });

  it('moves emotion, effective_risk and the alert', async () => {
    const a = (await runScenario(scenarioById('calm')!)).scoring_layer;
    const b = (await runScenario(scenarioById('panic')!)).scoring_layer;
    expect(b.emotional_state.deviation).toBeGreaterThan(a.emotional_state.deviation);
    expect(b.emotion_mult).toBeLessThan(a.emotion_mult);
    expect(b.effective_risk).toBeLessThan(a.effective_risk);
    expect(a.behavioral_alert).toBe(false);
    expect(b.behavioral_alert).toBe(true);
    // Guardrails are the point of the behavioral layer: panic has to earn some.
    expect(b.guardrails.length).toBeGreaterThan(a.guardrails.length);
  });

  it('marks exactly the four slow variables as invariant rows', async () => {
    const a = (await runScenario(scenarioById('calm')!)).scoring_layer;
    const rows = compareRows(a, a).filter((r) => r.invariant).map((r) => r.key);
    expect(rows).toEqual(['capacity', 'willingness', 'competence_cap', 'baseline_risk']);
  });

  it('is reproducible: the same fixture scores identically every run', async () => {
    const first = (await runScenario(scenarioById('panic')!)).scoring_layer;
    const second = (await runScenario(scenarioById('panic')!)).scoring_layer;
    expect(second).toEqual(first);
  });

  it('never calls the network — demo scoring is rule-based by construction', async () => {
    const p = await runScenario(scenarioById('calm')!);
    expect(p.scoring_layer.text_analysis?.analyzer).toBe('rule_based');
  });
});

// The fourth fixture exists to cover scoring paths the first three never reach.
// If it ever stops covering them it has no reason to exist, so that is the test.
describe('overconfident scenario covers the otherwise-unreached paths', () => {
  it('is the only scenario that takes a bias_penalty', async () => {
    const all = await Promise.all(scenarios.map(async (s) => [s.id, (await runScenario(s)).scoring_layer] as const));
    const charged = all.filter(([, x]) => x.bias_penalty > 0).map(([id]) => id);
    expect(charged).toEqual(['overconfident']);
  });

  it('is the only scenario where competence is the binding constraint', async () => {
    const all = await Promise.all(scenarios.map(async (s) => [s.id, (await runScenario(s)).scoring_layer] as const));
    expect(all.filter(([, x]) => x.binding_constraint === 'competence').map(([id]) => id)).toEqual(['overconfident']);
  });

  it('reaches the high corner of the Q12 interaction', async () => {
    const p = await runScenario(scenarioById('overconfident')!);
    const a = explain(itemBank, p.responses, weights, guardrails, p.scoring_layer);
    const active = a.interaction!.grid.flat().find((c) => c.active)!;
    const top = Math.max(...a.interaction!.grid.flat().map((c) => c.score));
    expect(active.score).toBe(top);
  });
});

describe('contradiction scenario', () => {
  it('shows min(), not an average: high capacity is not rescued by a low willingness', async () => {
    const s = (await runScenario(scenarioById('contradiction')!)).scoring_layer;
    expect(s.capacity - s.willingness).toBeGreaterThan(25);
    expect(s.flags).toContain('capacity_willingness_gap');
    expect(s.binding_constraint).toBe('willingness');
    expect(s.baseline_risk).toBe(s.willingness);
    // An average would have landed near 59; min() keeps the person conservative.
    expect(s.baseline_risk).toBeLessThan((s.capacity + s.willingness) / 2);
  });
});
