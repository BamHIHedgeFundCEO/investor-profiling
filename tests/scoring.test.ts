import { describe, expect, it } from 'vitest';
import {
  baselineRisk,
  biasPenalty,
  effectiveRisk,
  emotionMult,
  emotionalState,
  investorType,
  targetVol,
} from '../src/lib/scoring/compose';
import { deriveTheoreticalRange } from '../src/lib/scoring/ranges';
import { rawBehavior } from '../src/lib/scoring/behavior';
import { enumerateComposite, scoreOverconfidence } from '../src/lib/scoring/rules';
import { indexItems } from '../src/lib/scoring/util';
import { BIAS_DIMS } from '../src/lib/scoring/types';
import type { BehaviorDim, CompositeItem, OverconfidenceInteractionItem } from '../src/lib/scoring/types';
import { itemBank, responses, run, textInput, weights } from './helpers';

const byId = indexItems(itemBank);
const composite = (id: string) => byId.get(id) as CompositeItem;

describe('rule 1: baseline is the minimum of three constraints', () => {
  it('capacity 90 / willingness 30 → 30, not the average 60', () => {
    const { baseline, gaps } = baselineRisk({ capacity: 90, willingness: 30, competence: 100 }, weights.target_vol);
    expect(baseline).toBe(30);
    expect(gaps.binding).toBe('willingness');
  });

  it('capacity 90 / willingness 90 / zero competence → capped at 55', () => {
    const { baseline, gaps } = baselineRisk({ capacity: 90, willingness: 90, competence: 55 }, weights.target_vol);
    expect(baseline).toBe(55);
    expect(gaps.binding).toBe('competence');
    expect(gaps.headroom).toBe(35);
    expect(gaps.headroom_vol).toBeCloseTo(0.35 * 0.13);
  });

  it('end to end: no experience and no knowledge caps a wealthy risk-seeker at 55 (Balanced)', () => {
    const s = run(responses({
      Q00: 0, Q01: 4, Q02: 3, Q03: 3, Q04: 3, Q05: 3, Q06: 2, Q07: 2,
      Q21: 3, Q15: 4, Q15b: 4,
      Q19a: 0, Q19b: 0, Q19c: 0, Q19d: 1, Q20: 0, Q20b: 0,
    }));
    expect(s.competence).toBe(0);
    expect(s.competence_cap).toBe(55);
    expect(s.baseline_risk).toBe(55);
    expect(s.binding_constraint).toBe('competence');
    expect(s.constraint_gaps.headroom).toBe(45);
  });

  it('willingness = 0.45·Q15 + 0.30·Q15b + 0.25·goal', () => {
    const s = run(responses({ Q15: 4, Q15b: 2, Q21: 1 }));
    expect(s.willingness).toBeCloseTo(0.45 * 100 + 0.3 * 50 + 0.25 * 33);
  });

  it('capacity includes age as a small-weight facet', () => {
    const young = run(responses({ Q00: 0 }));
    const old = run(responses({ Q00: 4 }));
    expect(young.capacity - old.capacity).toBeCloseTo(0.08 * (100 - 20));
  });

  it('competence is the quiz, the drawdown and the tenure, weighted separately', () => {
    // 2 of 4 correct; stopped out of a drawdown; 1–3 years in the market.
    const s = run(responses({ Q19a: 1, Q19b: 0, Q19c: 2, Q19d: 1, Q20: 2, Q20b: 2 }));
    expect(s.facets.knowledge).toBe(50);
    expect(s.facets.experience).toBe(50);
    expect(s.facets.tenure).toBe(50);
    expect(s.competence).toBe(50);
  });

  // The wall this split exists to remove: under the old two-item competence, one
  // quiz answer right plus a stop-loss exit capped the respondent at 77.5 — short
  // of Aggressive by 2.5 points, no matter how wealthy or risk-tolerant they were.
  it('a half-competent respondent is no longer pinned just below the top band', () => {
    const half = { Q19a: 1, Q19b: 3, Q19c: 2, Q19d: 3, Q20: 2, Q20b: 3 };
    const s = run(responses({
      Q00: 0, Q01: 4, Q02: 3, Q03: 3, Q04: 3, Q05: 3, Q06: 2, Q07: 2,
      Q21: 3, Q15: 4, Q15b: 4, ...half,
    }));
    expect(s.competence_cap).toBeGreaterThan(80);
  });
});

describe('rule 2: emotion only discounts', () => {
  it('extreme confidence never raises the multiplier above 1', () => {
    const e = emotionalState(0, 95, weights.emotion);
    const m = emotionMult(e.deviation, weights.emotion);
    expect(m).toBeLessThanOrEqual(1);
    expect(m).toBeGreaterThanOrEqual(0.85);
  });

  it('multiplier stays in [0.85, 1] for every deviation', () => {
    for (let d = -50; d <= 150; d += 5) {
      const m = emotionMult(d, weights.emotion);
      expect(m).toBeGreaterThanOrEqual(0.85);
      expect(m).toBeLessThanOrEqual(1);
    }
  });

  it('deviation takes the max of anxiety and euphoria, not the sum', () => {
    const e = emotionalState(100, 100, weights.emotion);
    expect(e.deviation).toBe(100);
  });

  // The report calls these respondents 情緒平穩. A discount they are never told
  // about would make the screen and the arithmetic two different stories.
  it('a state reported as calm is not discounted at all', () => {
    for (let d = 0; d < weights.emotion.deviated_min; d += 1) {
      expect(emotionalState(weights.emotion.anxiety_cut + d * 0.6, 0, weights.emotion).state).toBe('calm');
      expect(emotionMult(d, weights.emotion)).toBe(1);
    }
    // Exactly at the cut the discount is still zero — that is what makes the two
    // pieces meet — and it starts biting immediately above it.
    expect(emotionMult(weights.emotion.deviated_min, weights.emotion)).toBe(1);
    expect(emotionMult(weights.emotion.deviated_min + 1, weights.emotion)).toBeLessThan(1);
  });

  it('the discount is continuous across the cut: 24 and 26 are not far apart', () => {
    const a = emotionMult(weights.emotion.deviated_min - 1, weights.emotion);
    const b = emotionMult(weights.emotion.deviated_min + 1, weights.emotion);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });
});

describe('rule 3: bias penalty is small and capped', () => {
  it('bias_index 100 → penalty 10', () => expect(biasPenalty(100, weights.bias_penalty)).toBe(10));
  it('bias_index ≤ 50 → no penalty', () => {
    expect(biasPenalty(50, weights.bias_penalty)).toBe(0);
    expect(biasPenalty(0, weights.bias_penalty)).toBe(0);
  });
  it('effective risk is clamped at 0', () => expect(effectiveRisk(0, 0.85, 10)).toBe(0));

  // anxiety already drives emotion_mult. Putting it in bias_index too charged the
  // same answer twice — 8.3 points off a baseline of 27 from one dimension.
  it('anxiety is not in the bias index: it is a state, and states go through emotion', () => {
    expect(BIAS_DIMS as readonly string[]).not.toContain('anxiety');
    const s = run(responses({ Q08: 0, Q09: 0 }));
    // bias_index is exactly the mean of the listed dimensions, so anxiety cannot
    // reach it by any other route either.
    const listed = BIAS_DIMS.map((d) => s.behavior[d].score);
    expect(s.bias_index).toBeCloseTo(listed.reduce((a, b) => a + b, 0) / listed.length);
    expect(s.behavior.anxiety.score).toBeGreaterThan(0);
  });
});

describe('investor type and target_vol', () => {
  it('uses half-open bands', () => {
    expect(investorType(0, weights.investor_types)).toBe('Conservative');
    expect(investorType(19.99, weights.investor_types)).toBe('Conservative');
    expect(investorType(20, weights.investor_types)).toBe('Moderately Conservative');
    expect(investorType(59.99, weights.investor_types)).toBe('Balanced');
    expect(investorType(100, weights.investor_types)).toBe('Aggressive');
  });

  it('target_vol is continuous across a band edge', () => {
    expect(targetVol(56.3, weights.target_vol)).toBeCloseTo(0.1232, 4);
    expect(targetVol(52, weights.target_vol) - targetVol(48, weights.target_vol)).toBeCloseTo(0.0052, 6);
    expect(targetVol(0, weights.target_vol)).toBe(0.05);
    expect(targetVol(100, weights.target_vol)).toBeCloseTo(0.18);
  });
});

describe('theoretical ranges are derived from the item bank', () => {
  it('matches the hand-checked table', () => {
    expect(deriveTheoreticalRange(itemBank)).toEqual({
      anxiety: { min: -10, max: 55 },
      loss_aversion: { min: 0, max: 100 },
      overconfidence: { min: 0, max: 55 },
      herding: { min: -15, max: 60 },
      discipline: { min: 0, max: 53 },
      confidence: { min: 0, max: 60 },
      disposition: { min: -20, max: 60 },
    });
  });

  it('enumerated composite ranges equal declared ones', () => {
    expect(deriveTheoreticalRange(itemBank, { composites: 'enumerated' }))
      .toEqual(deriveTheoreticalRange(itemBank));
  });
});

describe('Q12 overconfidence interaction', () => {
  const q12 = composite('Q12') as OverconfidenceInteractionItem;

  it('scores high only when self-rank and trading frequency are both high', () => {
    const p = q12.params;
    expect(scoreOverconfidence(80, 10, p)).toBe(30);
    expect(scoreOverconfidence(95, 1, p)).toBe(12);
    expect(scoreOverconfidence(60, 20, p)).toBe(15);
    expect(scoreOverconfidence(60, 10, p)).toBe(0);
    expect(scoreOverconfidence(25, 1, p)).toBe(0);
  });

  it('all 16 combinations stay inside the declared range and reach both ends', () => {
    const results = enumerateComposite(q12, byId);
    expect(results).toHaveLength(16);
    for (const dim of ['overconfidence', 'confidence'] as const) {
      const vals = results.map((r) => r.deltas[dim] ?? 0);
      expect([Math.min(...vals), Math.max(...vals)]).toEqual(q12.declared_range[dim]);
    }
  });

  it('self-rank feeds confidence linearly, independent of trading frequency', () => {
    for (let rank = 0; rank < 4; rank++) {
      for (let freq = 0; freq < 4; freq++) {
        // Q08 hold and Q09 "有點在意" contribute no confidence
        const { raw } = rawBehavior(itemBank, responses({ Q08: 2, Q09: 1, Q12a: rank, Q12b: freq }));
        expect(raw.confidence).toBe([0, 8, 16, 25][rank]);
      }
    }
  });
});

describe('Q16 × Q17 reflection effect', () => {
  const cases: [number, number, number, boolean][] = [
    [0, 1, 25, false], // A|B classic reflection
    [0, 0, 15, false], // A|A consistent risk aversion
    [1, 1, 0, false], // B|B consistent risk seeking
    [1, 0, 5, true], // B|A reverse reflection → atypical flag
  ];
  it.each(cases)('Q16=%i Q17=%i → loss_aversion +%i', (q16, q17, la, flagged) => {
    // Q08 hold, Q18 "1 萬", Q20 "持有到回檔結束" add no loss_aversion
    const r = responses({ Q08: 2, Q18: 0, Q20: 3, Q16: q16, Q17: q17 });
    expect(rawBehavior(itemBank, r).raw.loss_aversion).toBe(la);
    expect(run(r).flags.includes('atypical_prospect_pattern')).toBe(flagged);
  });
});

describe('emotional-state calibration (anxiety cut 40, euphoria cut 60)', () => {
  // Rows: Q08 option; columns: Q09 option. Hand-computed before the engine ran.
  // Q12a fixed at "<50%" so confidence stays low.
  const anxietyTable: Record<number, (number | null)[]> = {
    0: [100, 53.8, 0, 23.1], // sell all
    1: [61.5, 15.4, 0, null], // sell part (Q09 excited → euphoria path, skip)
    2: [35.9, 0, 0, null], // hold
  };
  for (const [q08, row] of Object.entries(anxietyTable)) {
    row.forEach((dev, q09) => {
      if (dev === null) return;
      it(`Q08=${q08} Q09=${q09} → deviation ${dev}`, () => {
        const s = run(responses({ Q08: Number(q08), Q09: q09, Q12a: 0 }));
        expect(s.emotional_state.deviation).toBeCloseTo(dev, 1);
      });
    });
  }

  it('"睡不太好，常常在看報價" alone is a deviated state, not calm', () => {
    const s = run(responses({ Q08: 2, Q09: 0, Q12a: 0 }));
    expect(s.emotional_state.state).toBe('deviated');
  });

  // [Q08 加碼?, Q09 興奮?, Q12a index] → deviation
  const euphoriaCases: [boolean, boolean, number, number][] = [
    [false, true, 2, 0],
    [false, true, 3, 37.5],
    [true, false, 3, 16.7],
    [true, true, 0, 0],
    [true, true, 1, 29.2],
    [true, true, 2, 62.5],
    [true, true, 3, 100],
  ];
  it.each(euphoriaCases)('加碼=%s 興奮=%s rank=%i → deviation %f', (add, excited, rank, dev) => {
    const s = run(responses({ Q08: add ? 3 : 2, Q09: excited ? 3 : 1, Q12a: rank }));
    const e = emotionalState(0, s.behavior.confidence.score, weights.emotion);
    expect(e.deviation).toBeCloseTo(dev, 1);
  });
});

describe('fast vs slow variables', () => {
  it('changing every Stage 2 answer leaves capacity, willingness, competence and baseline untouched', () => {
    const calm = run(responses({ Q08: 2, Q09: 2, Q10: 2, Q11: 2, Q12a: 0, Q12b: 0 }));
    const panic = run(responses({ Q08: 0, Q09: 0, Q10: 0, Q11: 0, Q12a: 3, Q12b: 3 }));
    for (const k of ['capacity', 'willingness', 'competence', 'competence_cap', 'baseline_risk'] as const) {
      expect(panic[k]).toBe(calm[k]);
    }
    expect(panic.emotion_mult).toBeLessThan(calm.emotion_mult);
    expect(panic.effective_risk).toBeLessThan(calm.effective_risk);
  });

  it('effective risk never exceeds baseline across random respondents', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 500; n++) {
      const picks: Record<string, number> = {};
      for (const it of itemBank.items) {
        if ('options' in it) picks[it.item_id] = Math.floor(rand() * it.options.length);
      }
      const s = run(responses(picks));
      expect(s.effective_risk).toBeLessThanOrEqual(s.baseline_risk + 1e-9);
      expect(s.effective_risk).toBeGreaterThanOrEqual(0);
      for (const d of Object.values(s.behavior)) {
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.score).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('Q20 stop-loss exit', () => {
  it('gives experience 50 plus loss_aversion +15 and discipline +5', () => {
    const s = run(responses({ Q20: 2 }));
    expect(s.facets.experience).toBe(50);
    expect(s.behavior.loss_aversion.evidence.some((e) => e.startsWith('Q20') && e.includes('+15'))).toBe(true);
    expect(s.behavior.discipline.evidence.some((e) => e.startsWith('Q20') && e.includes('+5'))).toBe(true);
  });
});

describe('text layer', () => {
  it('usable text blends 70/30 into overconfidence and herding only', () => {
    const without = run(responses());
    const withText = run(responses(), textInput({ overconfidence: 90, herding: 10 }));
    const oc = without.behavior.overconfidence.score;
    expect(withText.behavior.overconfidence.score).toBeCloseTo(oc * 0.7 + 90 * 0.3);
    expect(withText.behavior.anxiety.score).toBe(without.behavior.anxiety.score);
    expect(withText.text_analysis?.text_weight).toBe(0.3);
    expect(withText.text_analysis?.applied).toEqual({ overconfidence: true, herding: true });
  });

  // Two gates on the text layer. Both exist because a text reading was once able
  // to move a real respondent's score with nothing behind it.
  it('a text score with no evidence does not move anything', () => {
    const without = run(responses());
    const s = run(responses(), textInput({ overconfidence: 90, herding: 10 }, []));
    expect(s.behavior.overconfidence.score).toBe(without.behavior.overconfidence.score);
    expect(s.behavior.herding.score).toBe(without.behavior.herding.score);
    expect(s.text_analysis?.applied).toEqual({ overconfidence: false, herding: false });
    // Still reported, so the report can show it and say it was not counted.
    expect(s.text_analysis?.overconfidence.score).toBe(90);
  });

  it('an inconsistency flag needs a text reading that was actually counted', () => {
    const base = run(responses()).behavior.herding.score;
    const s = run(responses(), textInput({ herding: base + 25 }, []));
    expect(s.flags).not.toContain('inconsistency_herding');
  });

  // overconfidence = stance × (100 − depth): a short answer has no room to state a
  // mechanism, so depth is 0 by construction and brevity reads as overconfidence.
  it('short text is not used for overconfidence, but is still used for herding', () => {
    const short = { body: '大盤長期向上 所以投資股票' };
    const without = run(responses({}, short));
    const s = run(responses({}, short), textInput({ overconfidence: 100, herding: 10 }));
    expect(s.behavior.overconfidence.score).toBe(without.behavior.overconfidence.score);
    expect(s.behavior.herding.score).not.toBe(without.behavior.herding.score);
    expect(s.text_analysis?.applied).toEqual({ overconfidence: false, herding: true });
  });

  it('the floor is the combined length of both answers, and it is data not code', () => {
    const chars = weights.thresholds.depth_floor_chars;
    const body = '字'.repeat(Math.ceil(chars / 2));
    expect(run(responses({}, { body }), textInput({ overconfidence: 100 })).text_analysis?.applied.overconfidence)
      .toBe(true);
    const tooShort = '字'.repeat(Math.floor(chars / 2) - 1);
    expect(run(responses({}, { body: tooShort }), textInput({ overconfidence: 100 })).text_analysis?.applied.overconfidence)
      .toBe(false);
  });

  it('thin text uses weight 0.15', () => {
    const s = run(responses({}, { q14: 'thin' }), textInput());
    expect(s.text_analysis?.text_weight).toBe(0.15);
  });

  it('invalid text is ignored: weight 0, no text_analysis, text_invalid flag', () => {
    const without = run(responses({}, { q13: 'invalid' }));
    const s = run(responses({}, { q13: 'invalid' }), textInput({ overconfidence: 100 }));
    expect(s.text_analysis).toBeNull();
    expect(s.flags).toContain('text_invalid');
    expect(s.behavior.overconfidence.score).toBe(without.behavior.overconfidence.score);
  });

  it('flags inconsistency when option and text scores differ by more than 20', () => {
    const base = run(responses()).behavior.herding.score;
    const s = run(responses(), textInput({ herding: base + 25, overconfidence: run(responses()).behavior.overconfidence.score }));
    expect(s.flags).toContain('inconsistency_herding');
    expect(s.flags).not.toContain('inconsistency_overconfidence');
    expect(s.behavioral_alert).toBe(true);
  });

  it('text sentiment is displayed but never changes a score', () => {
    const without = run(responses());
    const s = run(responses(), textInput({
      overconfidence: without.behavior.overconfidence.score,
      herding: without.behavior.herding.score,
    }));
    expect(s.text_analysis?.sentiment.anxiety.score).toBe(95);
    expect(s.behavior.anxiety).toEqual(without.behavior.anxiety);
    expect(s.behavior.loss_aversion).toEqual(without.behavior.loss_aversion);
    expect(s.behavior.confidence).toEqual(without.behavior.confidence);
    expect(s.emotion_mult).toBe(without.emotion_mult);
    expect(s.effective_risk).toBeCloseTo(without.effective_risk, 9);
  });

  it('belief_rigidity ≥ 65 adds mandatory_thesis_review', () => {
    const s = run(responses(), textInput());
    expect(s.text_analysis?.belief_rigidity.tier).toBe('high');
    expect(s.guardrails).toContain('mandatory_thesis_review');
  });
});

describe('guardrails', () => {
  const professional = { Q08: 2, Q09: 3, Q10: 2, Q12a: 3, Q12b: 3 };

  it('professional-trader pattern removes only the trade cooldown', () => {
    const s = run(responses(professional));
    expect(s.behavior.overconfidence.tier).toBe('high');
    expect(s.behavior.confidence.tier).toBe('high');
    expect(s.behavior.discipline.tier).toBe('high');
    expect(s.guardrails).not.toContain('trade_cooldown_48h');
    expect(s.guardrails).toContain('dca_enforced');
    expect(s.emotion_mult).toBeLessThan(1); // emotional discount still applies
    expect(s.exemptions_applied).toEqual(['professional_trader_pattern']);
    expect(s.guardrail_trace.find((t) => t.guardrail === 'dca_enforced')?.because).toEqual(['overconfidence']);
  });

  it('without high discipline the cooldown stays', () => {
    const s = run(responses({ ...professional, Q10: 0 }));
    expect(s.behavior.overconfidence.tier).toBe('high');
    expect(s.guardrails).toContain('trade_cooldown_48h');
  });

  it('high disposition drives execution-side guardrails only', () => {
    const s = run(responses({ Q11: 0, Q11b: 0 }));
    expect(s.behavior.disposition.tier).toBe('high');
    expect(s.guardrails).toEqual(expect.arrayContaining(['auto_stop_loss_rule', 'hide_unrealized_pnl']));
  });

  // herding and disposition each used to rest on one question, which meant one
  // option of one question locked a guardrail on its own. Two items each now, and
  // the worst answer to one, paired with the least loaded answer to the other, is
  // not enough on its own. Both items have to lean the same way.
  it('no single question can trip a guardrail on its own', () => {
    const lowestOption = (id: string, dim: BehaviorDim) => {
      const item = byId.get(id) as { options: { deltas?: Partial<Record<BehaviorDim, number>> }[] };
      const vals = item.options.map((o) => o.deltas?.[dim] ?? 0);
      return vals.indexOf(Math.min(...vals));
    };
    for (const [only, other, dim] of [
      ['Q10', 'Q10b', 'herding'],
      ['Q10b', 'Q10', 'herding'],
      ['Q11', 'Q11b', 'disposition'],
      ['Q11b', 'Q11', 'disposition'],
    ] as const) {
      const s = run(responses({ [only]: 0, [other]: lowestOption(other, dim) }));
      expect(s.behavior[dim].tier, `${only} alone`).not.toBe('high');
    }
    expect(run(responses({ Q10: 0, Q10b: 0 })).behavior.herding.tier).toBe('high');
    expect(run(responses({ Q11: 0, Q11b: 0 })).behavior.disposition.tier).toBe('high');
  });
});

describe('flags and alert', () => {
  it('capacity/willingness gap > 25 raises flag and alert', () => {
    const s = run(responses({
      Q00: 0, Q01: 4, Q02: 3, Q03: 3, Q04: 3, Q05: 3, Q06: 2, Q07: 2, Q21: 0, Q15: 0, Q15b: 0,
    }));
    expect(s.flags).toContain('capacity_willingness_gap');
    expect(s.behavioral_alert).toBe(true);
    expect(s.alert_reasons).toContainEqual({ kind: 'capacity_willingness_gap' });
  });

  it('Q15 vs Q15b two levels apart → framing_sensitivity', () => {
    expect(run(responses({ Q15: 4, Q15b: 2 })).flags).toContain('framing_sensitivity');
    expect(run(responses({ Q15: 4, Q15b: 3 })).flags).not.toContain('framing_sensitivity');
  });

  it('attention check', () => {
    expect(run(responses({ AC1: 0 })).flags).toContain('attention_check_failed');
    expect(run(responses()).flags).not.toContain('attention_check_failed');
  });

  it('straight-lining is detected in Stage 2–3 only', () => {
    // Built from the bank rather than a hand-kept list, so adding a question
    // cannot quietly stop this test from testing anything.
    const allFirst = Object.fromEntries(
      itemBank.items
        .filter((i) => (i.stage === 2 || i.stage === 3) && 'options' in i && i.options)
        .map((i) => [i.item_id, 0]),
    );
    expect(run(responses(allFirst)).flags).toContain('straight_lining_flag');
    const stage1Same = { Q01: 3, Q02: 3, Q03: 3, Q04: 3, Q05: 3 };
    expect(run(responses(stage1Same)).flags).not.toContain('straight_lining_flag');
  });

  it('completion under 90 seconds → data_quality_flag', () => {
    expect(run(responses(), null, { duration_sec: 60 }).flags).toContain('data_quality_flag');
    expect(run(responses(), null, { duration_sec: 300 }).flags).not.toContain('data_quality_flag');
  });

  it('a missing answer throws instead of scoring silently', () => {
    const r = responses();
    delete r.Q05;
    expect(() => run(r)).toThrow(/Q05/);
  });
});
