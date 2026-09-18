import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateItemBank } from '../src/lib/scoring/validate';
import type { ItemBank } from '../src/lib/scoring/types';
import { itemBank } from './helpers';

const clone = (): ItemBank => structuredClone(itemBank);
const mutate = (id: string, f: (it: Record<string, unknown>) => void): ItemBank => {
  const b = clone();
  f(b.items.find((i) => i.item_id === id) as unknown as Record<string, unknown>);
  return b;
};

describe('item bank validation', () => {
  it('the shipped item bank is valid', () => expect(() => validateItemBank(itemBank)).not.toThrow());

  it('has 23 scored questions + 1 attention check + 1 MBTI = 25', () => {
    // Q12 and Q19 each have two sub-questions but count as one scored question.
    const scored = [
      'Q00', 'Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07',
      'Q08', 'Q09', 'Q10', 'Q11', 'Q12', 'Q13', 'Q14',
      'Q15', 'Q15b', 'Q16', 'Q17', 'Q18', 'Q19', 'Q20', 'Q21',
    ];
    const ids = new Set(itemBank.items.map((i) => i.item_id));
    expect(scored.filter((id) => ids.has(id))).toHaveLength(23);
    expect(itemBank.items.filter((i) => i.type === 'attention_check')).toHaveLength(1);
    expect(itemBank.items.filter((i) => i.type === 'mbti')).toHaveLength(1);
  });

  it('rejects a composite without declared_range', () => {
    expect(() => validateItemBank(mutate('Q16_17', (it) => delete it.declared_range))).toThrow(/declared_range/);
  });

  it('rejects a declared range the rule cannot produce', () => {
    const b = mutate('Q12', (it) => {
      (it.declared_range as Record<string, number[]>).overconfidence = [0, 40];
    });
    expect(() => validateItemBank(b)).toThrow(/declared overconfidence/);
  });

  it('rejects deltas on a sub_choice', () => {
    const b = mutate('Q16', (it) => {
      (it.options as { deltas?: object }[])[0]!.deltas = { loss_aversion: 5 };
    });
    expect(() => validateItemBank(b)).toThrow(/sub_choice must not carry/);
  });

  it('rejects unknown dimensions and missing facet values', () => {
    const b1 = mutate('Q08', (it) => {
      (it.options as { deltas?: object }[])[0]!.deltas = { panic: 5 };
    });
    expect(() => validateItemBank(b1)).toThrow(/unknown dimension "panic"/);
    const b2 = mutate('Q01', (it) => {
      delete (it.options as { value?: number }[])[0]!.value;
    });
    expect(() => validateItemBank(b2)).toThrow(/needs a value/);
  });

  it('Stage 2 items never carry facet values (fast variables stay out of capacity/willingness)', () => {
    for (const it of itemBank.items.filter((i) => i.stage === 2)) {
      expect(it.type === 'single_choice' ? it.construct : 'behavior').toBe('behavior');
    }
  });
});

describe('layer isolation', () => {
  const dir = join(import.meta.dirname, '../src/lib/scoring');
  it('no scoring module references MBTI, tone or presentation data', () => {
    for (const f of readdirSync(dir)) {
      if (f === 'types.ts') continue; // declares the layers, including the `never` guards
      const code = readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/mbti|presentation_layer|tone_templates/i);
    }
  });
});
