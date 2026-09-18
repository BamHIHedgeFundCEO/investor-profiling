import { describe, expect, it } from 'vitest';
import { explain } from '../src/lib/audit/explain';
import { compose } from '../src/lib/scoring/compose';
import { guardrails, itemBank, weights } from '../src/lib/scoring/data';
import { scoreOverconfidence } from '../src/lib/scoring/rules';
import { runScenario, scenarioById, scenarios } from '../src/lib/demo';
import { BEHAVIOR_DIMS } from '../src/lib/scoring/types';
import { responses as buildResponses } from './helpers';

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 8);

// The audit panel is only worth anything if it reconciles. Every scenario is
// checked against the ScoringLayer it claims to explain.
describe.each(scenarios.map((s) => [s.id, s] as const))('audit reconciles for %s', (_id, scenario) => {
  it('construct rows sum to the construct score', async () => {
    const p = await runScenario(scenario);
    const a = explain(itemBank, p.responses, weights, guardrails, p.scoring_layer);
    for (const c of a.constructs) {
      near(c.rows.reduce((t, r) => t + r.contribution, 0), c.score);
      near(c.rows.reduce((t, r) => t + r.share, 0), 1);
    }
  });

  it('competence_cap, baseline and effective_risk restate the engine exactly', async () => {
    const p = await runScenario(scenario);
    const s = p.scoring_layer;
    const a = explain(itemBank, p.responses, weights, guardrails, s);
    near(a.competenceCap.floor + a.competenceCap.slope * a.competenceCap.competence, s.competence_cap);
    near(Math.min(a.baseline.capacity, a.baseline.willingness, a.baseline.competence_cap), s.baseline_risk);
    near(a.effective.baseline * a.effective.mult - a.effective.penalty, s.effective_risk);
    // Piecewise: no discount at all below the deviation cut, so that a report saying
    // 情緒平穩 and the arithmetic behind it agree.
    const { deviation, deviatedMin, maxDiscount } = a.emotion;
    const expected =
      deviation < deviatedMin ? 1 : 1 - maxDiscount * ((deviation - deviatedMin) / (100 - deviatedMin));
    near(expected, s.emotion_mult);
  });

  it('every behavior dimension ends at the score the report shows', async () => {
    const p = await runScenario(scenario);
    const a = explain(itemBank, p.responses, weights, guardrails, p.scoring_layer);
    expect(a.behavior.map((b) => b.dim)).toEqual([...BEHAVIOR_DIMS]);
    for (const b of a.behavior) {
      near(b.score, p.scoring_layer.behavior[b.dim].score);
      // Raw is the sum of the listed contributions: nothing reaches a score without a line.
      near(b.contributions.reduce((t, c) => t + c.delta, 0), b.raw);
      if (b.text) near(b.optionScore * (1 - b.text.weight) + b.text.score * b.text.weight, b.score);
      else near(b.optionScore, b.score);
    }
  });

  it('quotes only text the respondent actually wrote', async () => {
    const p = await runScenario(scenario);
    const a = explain(itemBank, p.responses, weights, guardrails, p.scoring_layer);
    const source = ['Q13', 'Q14']
      .map((id) => (p.responses[id] as { text?: string }).text ?? '')
      .join('\n');
    for (const b of a.behavior) for (const q of b.text?.evidence ?? []) expect(source).toContain(q);
  });
});

describe('Q12 interaction grid', () => {
  it('the highlighted cell is the respondent’s, and its value is what was scored', async () => {
    const p = await runScenario(scenarioById('calm')!);
    const a = explain(itemBank, p.responses, weights, guardrails, p.scoring_layer);
    const grid = a.interaction!.grid;
    const active = grid.flat().filter((c) => c.active);
    expect(active).toHaveLength(1);
    expect(active[0]!.score).toBe(a.interaction!.overconfidence);
    expect(active[0]!.rank).toBe(a.interaction!.rankItem.code);
    expect(active[0]!.freq).toBe(a.interaction!.freqItem.code);
  });

  it('every cell matches the pure rule — the grid is not a second implementation', async () => {
    const p = await runScenario(scenarioById('contradiction')!);
    const a = explain(itemBank, p.responses, weights, guardrails, p.scoring_layer);
    const params = itemBank.items.find((i) => i.item_id === 'Q12') as { params: Parameters<typeof scoreOverconfidence>[2] };
    for (const row of a.interaction!.grid) {
      for (const cell of row) expect(cell.score).toBe(scoreOverconfidence(cell.rank, cell.freq, params.params));
    }
  });

  it('shows non-additivity: neither half alone reaches the combined score', async () => {
    const p = await runScenario(scenarioById('calm')!);
    const a = explain(itemBank, p.responses, weights, guardrails, p.scoring_layer);
    const flat = a.interaction!.grid.flat();
    const top = Math.max(...flat.map((c) => c.score));
    const corner = a.interaction!.grid.at(-1)!.at(-1)!;
    expect(corner.score).toBe(top);
    expect(a.interaction!.grid[0]![0]!.score).toBeLessThan(top);
    expect(a.interaction!.grid.at(-1)![0]!.score).toBeLessThan(top); // high self-rank, no trading
    expect(a.interaction!.grid[0]!.at(-1)!.score).toBeLessThan(top); // heavy trading, average self-rank
  });
});

describe('audit on a hand-built response set', () => {
  it('names the item behind every facet', () => {
    const responses = buildResponses();
    const scoring = compose({ responses, itemBank, weights, guardrails, text: null });
    const a = explain(itemBank, responses, weights, guardrails, scoring);
    for (const c of a.constructs) {
      for (const r of c.rows) {
        expect(r.itemId).toMatch(/^(Q\d+[a-z]?|AC\d)$/);
        expect(r.answer.length).toBeGreaterThan(0);
        expect(r.question.length).toBeGreaterThan(0);
      }
    }
  });

  it('records a guardrail’s reason, not just its id', () => {
    const responses = buildResponses({ Q08: 0, Q09: 0, Q10: 0, Q18: 4 });
    const scoring = compose({ responses, itemBank, weights, guardrails, text: null });
    const a = explain(itemBank, responses, weights, guardrails, scoring);
    for (const g of a.guardrails) {
      expect(g.title.length).toBeGreaterThan(0);
      expect(g.because.length).toBeGreaterThan(0);
    }
  });
});
