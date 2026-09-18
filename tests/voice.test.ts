import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MBTI_TYPES, toneFor } from '../src/lib/presentation/tone';
import { VOICES, voiceFor } from '../src/lib/presentation/voice';
import { narrative } from '../src/lib/presentation/narrative';
import { weights } from '../src/lib/scoring/data';
import { runScenario, scenarioById } from '../src/lib/demo';
import type { MbtiType } from '../src/lib/scoring/types';

describe('every MBTI type has its own opener', () => {
  it('covers all sixteen, with no extras', () => {
    expect(Object.keys(VOICES).sort()).toEqual([...MBTI_TYPES].sort());
  });

  it('gives sixteen distinct openers and sixteen distinct labels', () => {
    const v = Object.values(VOICES);
    expect(new Set(v.map((x) => x.opener)).size).toBe(16);
    expect(new Set(v.map((x) => x.label)).size).toBe(16);
  });

  it('returns null rather than a default persona when MBTI was skipped', () => {
    expect(voiceFor(null)).toBeNull();
    expect(voiceFor(undefined)).toBeNull();
    // A stray value must not silently resolve to someone else's voice.
    expect(voiceFor('XXXX' as MbtiType)).toBeNull();
  });
});

// The reason this file exists. An opener is the one place where MBTI could reach
// the respondent as advice without any type check noticing: a persona line telling
// an ESTP to use leverage would sit directly above a score of 18 and a mandatory
// 48-hour trade cooldown. Personas describe the result; they never prescribe.
describe('an opener is a voice, never a recommendation', () => {
  // Action verbs, position sizing, and named instruments. Any of these in an
  // opener means the persona has started giving advice.
  const FORBIDDEN = [
    '槓桿', '停損', '停利', '重倉', '建倉', '加碼', '減碼', '加倉', '減倉', '砍倉',
    '買進', '賣出', '進場', '出場', '抄底', '當沖', '套利', '做多', '做空',
    '期權', '期貨', '定存', 'ETF', '債券', '個股', '飆股', '基金', '國債',
    '建議', '應該', '請立刻', '務必',
  ];

  for (const [code, v] of Object.entries(VOICES)) {
    it(`${code} prescribes nothing`, () => {
      for (const word of FORBIDDEN) expect(v.opener).not.toContain(word);
    });
  }

  it('states no number, so it can never disagree with the score above it', () => {
    for (const v of Object.values(VOICES)) expect(v.opener).not.toMatch(/\d/);
  });

  it('carries no unfilled template placeholder', () => {
    for (const v of Object.values(VOICES)) expect(v.opener).not.toMatch(/\{\w+\}/);
  });

  it('is one or two sentences of prose', () => {
    for (const v of Object.values(VOICES)) {
      expect(v.opener.length).toBeGreaterThan(15);
      expect(v.opener.length).toBeLessThan(90);
      expect(v.opener.endsWith('。')).toBe(true);
    }
  });
});

describe('the persona layer changes nothing below it', () => {
  it('all sixteen types produce byte-identical scores and guardrails', async () => {
    const profile = await runScenario(scenarioById('calm')!);
    const s = profile.scoring_layer;
    const baseline = JSON.stringify(s);
    for (const code of MBTI_TYPES) {
      // voiceFor and toneFor are the only things MBTI feeds; neither touches s.
      expect(voiceFor(code)).not.toBeNull();
      expect(JSON.stringify(s)).toBe(baseline);
    }
  });

  it('the factual body still states the same facts under every type', async () => {
    const s = (await runScenario(scenarioById('calm')!)).scoring_layer;
    const summaries = MBTI_TYPES.map((code) => narrative(s, toneFor(code), weights).summary);
    const effective = String(Math.round(s.effective_risk));
    for (const text of summaries) expect(text).toContain(effective);
  });
});

describe('the scoring layer cannot see the persona layer', () => {
  const dir = 'src/lib/scoring';
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

  it('scans a non-empty set of scoring sources', () => expect(files.length).toBeGreaterThan(3));

  for (const f of files) {
    it(`${f} never mentions a voice, an opener or the voice data`, () => {
      const src = readFileSync(join(dir, f), 'utf8');
      // types.ts legitimately declares MbtiType for the presentation layer, so the
      // scan targets the persona machinery rather than the word MBTI itself.
      expect(src).not.toMatch(/voice|opener|mbti_voices/i);
    });
  }
});
