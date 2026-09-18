// MBTI only decides phrasing. These tests prove that every tone states the same facts.

import { describe, expect, it } from 'vitest';
import {
  bindingVariant,
  facts,
  narrative,
  placeholders,
  toneTemplates,
  type ToneTemplate,
} from '../src/lib/presentation/narrative';
import { parseMbti, toneFor } from '../src/lib/presentation/tone';
import type { Tone } from '../src/lib/scoring/types';
import { responses, run, weights } from './helpers';

const TONES = Object.keys(toneTemplates.tones) as Tone[];

// Every leaf template, addressed by path, e.g. "binding.competence_experience".
function leaves(t: ToneTemplate): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t) as [string, string | Record<string, string>][]) {
    if (typeof v === 'string') out[k] = v;
    else for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2;
  }
  return out;
}

describe('tone templates carry identical content slots', () => {
  it('covers all five tones', () => {
    expect(TONES.sort()).toEqual(['analytical', 'diplomatic', 'explorer', 'neutral', 'sentinel']);
  });

  const reference = leaves(toneTemplates.tones.neutral);
  for (const tone of TONES) {
    it(`${tone} has the same blocks and the same placeholders as neutral`, () => {
      const mine = leaves(toneTemplates.tones[tone]);
      expect(Object.keys(mine).sort()).toEqual(Object.keys(reference).sort());
      for (const [path, tpl] of Object.entries(reference)) {
        expect(placeholders(mine[path]!), `${tone}.${path}`).toEqual(placeholders(tpl));
      }
    });
  }
});

describe('rendered narratives state the same facts in every tone', () => {
  const profiles = {
    contradiction: run(responses({ Q00: 0, Q01: 4, Q02: 3, Q03: 3, Q04: 3, Q05: 3, Q06: 2, Q07: 2, Q21: 0, Q15: 0, Q15b: 0 })),
    noExperience: run(responses({ Q00: 0, Q01: 4, Q02: 3, Q03: 3, Q04: 3, Q05: 3, Q06: 2, Q07: 2, Q21: 3, Q15: 4, Q15b: 4, Q19a: 1, Q19b: 1, Q20: 0 })),
    noKnowledge: run(responses({ Q00: 0, Q01: 4, Q02: 3, Q03: 3, Q04: 3, Q05: 3, Q06: 2, Q07: 2, Q21: 3, Q15: 4, Q15b: 4, Q19a: 0, Q19b: 0, Q20: 3 })),
    base: run(responses()),
  };

  it('fixtures exercise the intended branches', () => {
    expect(profiles.contradiction.flags).toContain('capacity_willingness_gap');
    expect(bindingVariant(profiles.noExperience)).toBe('competence_experience');
    expect(bindingVariant(profiles.noKnowledge)).toBe('competence_knowledge');
  });

  for (const [name, s] of Object.entries(profiles)) {
    it(`${name}: every tone includes every fact its template slots require`, () => {
      const v = facts(s, weights);
      const rendered = TONES.map((t) => narrative(s, t, weights));
      for (const n of rendered) {
        expect(JSON.stringify(n)).not.toMatch(/\{\w+\}/);
        expect(n.summary).toContain(v.effective);
        expect(n.summary).toContain(v.type_zh);
        expect(n.summary).toContain(v.baseline);
        expect(n.binding).toContain(v.binding_value);
        expect(n.contradiction === null).toBe(rendered[0]!.contradiction === null);
        if (n.contradiction) {
          expect(n.contradiction).toContain(v.capacity);
          expect(n.contradiction).toContain(v.willingness);
        }
      }
    });
  }

  it('every tone states the same guardrail count', () => {
    const s = run(responses({ Q11: 0, Q10: 0 }));
    expect(s.guardrails.length).toBeGreaterThan(0);
    for (const t of TONES) expect(narrative(s, t, weights).guardrails).toContain(String(s.guardrails.length));
  });
});

describe('MBTI → tone mapping', () => {
  it.each([
    ['INTJ', 'analytical'],
    ['ENTP', 'analytical'],
    ['INFP', 'diplomatic'],
    ['ISTJ', 'sentinel'],
    ['ESFJ', 'sentinel'],
    ['ISTP', 'explorer'],
    ['ESFP', 'explorer'],
  ])('%s → %s', (mbti, tone) => expect(toneFor(parseMbti(mbti))).toBe(tone));

  it('unknown or missing MBTI → neutral; 16personalities suffix ignored', () => {
    expect(toneFor(parseMbti(''))).toBe('neutral');
    expect(toneFor(parseMbti('XXXX'))).toBe('neutral');
    expect(parseMbti('intj-a')).toBe('INTJ');
  });
});
