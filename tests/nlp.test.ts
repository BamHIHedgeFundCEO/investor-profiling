import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approxContentWords, assessQuality } from '../src/lib/analyzer/quality';
import { analyzeRules, normalizeText } from '../src/lib/analyzer/ruleBased';
import { analyzeText } from '../src/lib/analyzer';
import type { OpenAnswer, TextAnalyzer } from '../src/lib/analyzer/types';
import { responses, run } from './helpers';

const ans = (text: string, target: OpenAnswer['target'] = 'btc'): OpenAnswer => ({
  target,
  text,
  quality: assessQuality(text),
});

describe('text quality', () => {
  it.each([
    ['', 'invalid'],
    ['   ', 'invalid'],
    ['asdfasdf', 'invalid'],
    ['哈哈哈哈哈哈哈哈', 'invalid'],
    ['1234', 'invalid'],
    ['會', 'invalid'],
    ['不會改變', 'thin'],
    ['我覺得會漲', 'thin'],
    ['比特幣沒有現金流，價值來自稀缺性與共識，我只放 5% 當高風險部位。', 'usable'],
  ])('%j → %s', (text, q) => expect(assessQuality(text)).toBe(q));

  it('copying the prompt back is invalid', () => {
    const prompt = '以下三個標的，選一個你最有看法的，說說你的想法，以及你會不會投資、為什麼。';
    expect(assessQuality('選一個你最有看法的，說說你的想法，以及你會不會投資', prompt)).toBe('invalid');
  });

  it('approximates content words without a segmenter', () => {
    expect(approxContentWords('我的了是')).toBe(0);
    expect(approxContentWords('比特幣稀缺')).toBe(2);
  });
});

describe('normalization', () => {
  it('converts full-width letters and digits, strips emoji, keeps Chinese punctuation', () => {
    expect(normalizeText('ＡＩ　股 🚀 漲５０％，真的！')).toBe('AI 股 漲50%，真的！');
  });
});

// Spec 11.2 text cases, checked against the rule-based fallback.
describe('rule-based analyzer', () => {
  it('"我不害怕跌": negated fear counts toward low anxiety', () => {
    const s = analyzeRules(ans('我不害怕跌，長期持有就好。'), ans('不會改變。'));
    expect(s.sentiment.anxiety.score).toBeLessThan(50);
    expect(s.sentiment.anxiety.tier).toBe('low');
    const afraid = analyzeRules(ans('我很害怕跌，晚上會一直看。'), ans('會改變。'));
    expect(afraid.sentiment.anxiety.score).toBeGreaterThan(50);
  });

  it('"絕對會漲到 50 萬鎂": price numbers do not count as evidence', () => {
    const s = analyzeRules(ans('絕對會漲到 50 萬鎂，我朋友去年翻三倍。'), ans('不會改變。'));
    expect(s.overconfidence.tier).toBe('high');
    expect(s.price_anchoring).toBeGreaterThan(0);
    expect(s.overconfidence.evidence[0]).toContain('絕對會漲到 50 萬鎂');
  });

  it('numbers next to mechanism terms do count as evidence', () => {
    const bare = analyzeRules(ans('一定會漲，我會投入。'), ans('不會改變。'));
    const argued = analyzeRules(
      ans('一定會漲，因為本益比只有 15 倍，營收成長 30%，我會投入。'),
      ans('不會改變。'),
    );
    expect(argued.overconfidence.score).toBeLessThan(bare.overconfidence.score);
    expect(argued.reasoning_mode).toBe('mechanism');
  });

  it('stance extremity is direction-free', () => {
    const bull = analyzeRules(ans('比特幣絕對會漲，一定是未來。'), ans('不會改變。'));
    const bear = analyzeRules(ans('比特幣絕對是詐騙，一定會歸零。'), ans('不會改變。'));
    expect(bull.overconfidence.score).toBe(bear.overconfidence.score);
  });

  it('strong stance + unchanged after the drop → high belief rigidity', () => {
    const s = analyzeRules(ans('比特幣絕對會漲，一定要買。'), ans('不會改變，我會加碼。'));
    expect(s.belief_rigidity).toBeGreaterThanOrEqual(65);
  });

  it('strong stance + re-examining assumptions → low belief rigidity', () => {
    const s = analyzeRules(ans('比特幣絕對會漲，一定要買。'), ans('會重新檢視我的假設哪裡錯了。'));
    expect(s.belief_rigidity).toBeLessThan(36);
  });

  it('mild stance + unchanged (volatility already expected) → low belief rigidity', () => {
    const s = analyzeRules(ans('可能會漲，也許放一點點看看。'), ans('不會改變，本來就預期會波動。'));
    expect(s.belief_rigidity).toBeLessThan(36);
  });

  it('social attribution raises herding; stated independent judgment offsets it', () => {
    const follow = analyzeRules(ans('朋友都說會漲，群組裡大家都在買，我也跟著買。'), ans('看大家怎麼做。'));
    const independent = analyzeRules(ans('朋友都說會漲，但我覺得不合理，所以不買。'), ans('不會改變。'));
    expect(follow.herding.tier).toBe('high');
    expect(follow.reasoning_mode).toBe('authority');
    expect(independent.herding.score).toBeLessThan(follow.herding.score);
    expect(independent.herding.tier).toBe('low');
  });

  it('every tiered output carries its quoted evidence', () => {
    const s = analyzeRules(ans('比特幣絕對會漲。朋友說的。'), ans('不會改變。'));
    expect(s.overconfidence.evidence).toEqual(['比特幣絕對會漲']);
    expect(s.herding.evidence).toEqual(['朋友說的']);
  });
});

describe('silent degradation', () => {
  const failing: TextAnalyzer = {
    name: 'gemini',
    analyze: () => Promise.reject(new Error('429 Too Many Requests')),
  };
  const good = ans('比特幣沒有現金流，價值來自稀缺性與共識，我只放 5% 當高風險部位。');

  it('a failing primary analyzer falls back to rules without throwing', async () => {
    const out = await analyzeText(good, good, failing);
    expect(out?.analyzer).toBe('rule_based');
    expect(out?.scores.overconfidence.tier).toBeDefined();
  });

  it('invalid text is never sent to any analyzer', async () => {
    let called = false;
    const spy: TextAnalyzer = { name: 'gemini', analyze: async () => ((called = true), analyzeRules(good, good)) };
    expect(await analyzeText(ans(''), good, spy)).toBeNull();
    expect(called).toBe(false);
  });

  it('end to end: rule-based text enters scoring with weight 0.3 and adds text_analysis', async () => {
    const r = responses();
    r.Q13 = good;
    r.Q14 = ans('會重新檢視，如果是監管造成的就減碼，市場恐慌就維持比例。');
    const text = await analyzeText(r.Q13, r.Q14);
    const s = run(r, text);
    expect(s.text_analysis?.analyzer).toBe('rule_based');
    expect(s.text_analysis?.text_weight).toBe(0.3);
    expect(s.flags).not.toContain('text_invalid');
  });
});

describe('annotation fixtures', () => {
  const tpl = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures.template.json'), 'utf8'));

  // 15 is the count the spec asks for (§11.1). The labels stay null in the template:
  // a fixture arrives unlabeled and is annotated by a person, never by this repo.
  it('template has 15 paired cases with empty labels for human annotation', () => {
    expect(tpl.fixtures).toHaveLength(15);
    for (const f of tpl.fixtures) {
      expect(f.q13.length).toBeGreaterThan(0);
      expect(f.q14.length).toBeGreaterThan(0);
      expect(Object.values(f.expected).every((v) => v === null)).toBe(true);
    }
  });

  it('covers the three boundary cases the spec singles out', () => {
    const notes = tpl.fixtures.map((f: { note?: string }) => f.note ?? '').join(' | ');
    for (const kind of ['否定處理', '假設語氣', '社會歸因']) expect(notes).toContain(kind);
  });

  it('every template text is usable, so no case is silently dropped by the quality gate', () => {
    for (const f of tpl.fixtures) {
      expect([assessQuality(f.q13), assessQuality(f.q14)], f.id).not.toContain('invalid');
    }
  });
});
