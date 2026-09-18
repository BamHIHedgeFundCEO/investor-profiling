import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, { callGemini } from '../api/analyze';
import { clientIp, rateLimit, resetRateLimit } from '../api/_rateLimit';
import { SYSTEM_PROMPT } from '../api/_prompt';
import { stripPii } from '../src/lib/analyzer/pii';
import { GeminiAnalyzer, parseGeminiScores } from '../src/lib/analyzer/gemini';
import { analyzeText } from '../src/lib/analyzer';
import type { OpenAnswer } from '../src/lib/analyzer/types';

const ans = (text: string): OpenAnswer => ({ target: 'btc', text, quality: 'usable' });

function mockRes() {
  const res = {
    code: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(c: number) {
      res.code = c;
      return res;
    },
    json(b: unknown) {
      res.body = b;
    },
    setHeader(k: string, v: string) {
      res.headers[k] = v;
    },
  };
  return res;
}

// Typed stand-ins for fetch so the mock's call arguments keep their types.
type FetchInit = { body: string; headers: Record<string, string> };
type FetchReply = { ok: boolean; status: number; json: () => Promise<unknown> };
const mockFetch = (reply: () => FetchReply) => vi.fn((_url: unknown, _init: FetchInit) => Promise.resolve(reply()));

const geminiReply = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
});

const SCORES = {
  overconfidence: { score: 80, evidence: ['絕對會漲'] },
  herding: { score: 20, evidence: [] },
  reasoning_mode: 'price_action',
  belief_rigidity: 70,
  price_anchoring: 60,
  sentiment: {
    anxiety: { score: 30, evidence: [] },
    loss_aversion: { score: 40, evidence: [] },
    confidence: { score: 70, evidence: ['絕對會漲'] },
  },
};

afterEach(() => {
  resetRateLimit();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('PII stripping', () => {
  it.each([
    ['我年薪 120 萬，不敢賠', '[AMOUNT]'],
    ['我今年 23 歲，剛開始投資', '[AGE]'],
    ['聯絡我 test.user@example.com', '[EMAIL]'],
    ['我的電話 0912-345-678', '[PHONE]'],
    ['身分證 A123456789', '[ID]'],
    ['我投入 50 萬元', '[AMOUNT]'],
  ])('%s → contains %s', (input, token) => expect(stripPii(input)).toContain(token));

  it('keeps company names, tickers and industry terms — they are the content being analyzed', () => {
    const text = '我看好台積電和輝達，2330 的先進製程有護城河，AI 資本支出還在成長。';
    expect(stripPii(text)).toBe(text);
  });

  it('removes the figure but keeps the sentence readable', () => {
    expect(stripPii('我年薪 120 萬，不敢賠')).toBe('我年薪 [AMOUNT]，不敢賠');
  });
});

describe('rate limit', () => {
  it('allows 5 requests per IP per minute, then blocks with a retry hint', () => {
    for (let i = 0; i < 5; i++) expect(rateLimit('1.2.3.4').allowed).toBe(true);
    const blocked = rateLimit('1.2.3.4');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('counts per IP and forgets after the window', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit('a', { now: t0 });
    expect(rateLimit('b', { now: t0 }).allowed).toBe(true);
    expect(rateLimit('a', { now: t0 + 61_000 }).allowed).toBe(true);
  });

  it('reads the first address of x-forwarded-for', () => {
    expect(clientIp({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })).toBe('203.0.113.9');
    expect(clientIp({})).toBe('unknown');
  });
});

describe('/api/analyze', () => {
  const post = (body: unknown, ip = '9.9.9.9') => ({ method: 'POST', headers: { 'x-forwarded-for': ip }, body });

  it('rejects non-POST and malformed bodies', async () => {
    const r1 = mockRes();
    await handler({ method: 'GET', headers: {} }, r1);
    expect(r1.code).toBe(405);

    const r2 = mockRes();
    await handler(post({ q13: 123 }), r2);
    expect(r2.code).toBe(400);

    const r3 = mockRes();
    await handler(post({ q13: 'x'.repeat(2001), q14: 'y' }), r3);
    expect(r3.code).toBe(400);
  });

  it('returns 503 when no API key is configured, never a stack trace', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = mockRes();
    await handler(post({ q13: '我覺得會漲', q14: '不會改變' }), res);
    expect(res.code).toBe(503);
    expect(res.body).toEqual({ error: 'analyzer_unavailable' });
  });

  it('strips PII again on the server before calling the model', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const fetchMock = mockFetch(() => geminiReply(SCORES));
    vi.stubGlobal('fetch', fetchMock);

    const res = mockRes();
    await handler(post({ q13: '我年薪 120 萬，還是想買', q14: '不會改變' }), res);

    expect(res.code).toBe(200);
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body);
    const prompt = sent.contents[0].parts[0].text;
    expect(prompt).toContain('[AMOUNT]');
    expect(prompt).not.toContain('120 萬');
    expect(sent.systemInstruction.parts[0].text).toBe(SYSTEM_PROMPT);
    expect(sent.generationConfig.temperature).toBe(0);
  });

  it('never puts the API key in the URL', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'secret-key');
    const fetchMock = mockFetch(() => geminiReply(SCORES));
    vi.stubGlobal('fetch', fetchMock);
    await handler(post({ q13: '我覺得會漲', q14: '不會改變' }), mockRes());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain('secret-key');
    expect(init.headers['x-goog-api-key']).toBe('secret-key');
  });

  it('rate limits the 6th request from the same IP', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', mockFetch(() => geminiReply(SCORES)));
    for (let i = 0; i < 5; i++) await handler(post({ q13: '會漲', q14: '不變' }, '8.8.8.8'), mockRes());
    const res = mockRes();
    await handler(post({ q13: '會漲', q14: '不變' }, '8.8.8.8'), res);
    expect(res.code).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('turns an upstream failure into 502 without leaking details', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', mockFetch(() => ({ ok: false, status: 429, json: async () => ({}) })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await handler(post({ q13: '會漲', q14: '不變' }), res);
    expect(res.code).toBe(502);
    expect(res.body).toEqual({ error: 'analyzer_failed' });
  });

  it('callGemini rejects an unparsable response', async () => {
    const bad = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [] }) });
    await expect(
      callGemini({ q13: 'a', q14: 'b', target: 'btc', drop_pct: 40 }, 'k', 'm', bad as unknown as typeof fetch),
    ).rejects.toThrow(/empty response/);
  });
});

describe('Gemini client', () => {
  it('drops quotes that do not appear verbatim in the respondent text', () => {
    const s = parseGeminiScores(
      {
        ...SCORES,
        overconfidence: { score: 80, evidence: ['絕對會漲', '這句是模型自己編的'] },
      },
      '比特幣絕對會漲，我全押。',
    );
    expect(s.overconfidence.evidence).toEqual(['絕對會漲']);
  });

  it('clamps scores and falls back to narrative for an unknown reasoning mode', () => {
    const s = parseGeminiScores({ ...SCORES, belief_rigidity: 999, reasoning_mode: 'vibes' }, '');
    expect(s.belief_rigidity).toBe(100);
    expect(s.reasoning_mode).toBe('narrative');
  });

  it('sends stripped text to /api/analyze and returns tiered scores', async () => {
    const fetchMock = mockFetch(() => ({ ok: true, status: 200, json: async () => ({ scores: SCORES }) }));
    const analyzer = new GeminiAnalyzer('/api/analyze', fetchMock as unknown as typeof fetch);
    const out = await analyzer.analyze(ans('我年薪 120 萬，比特幣絕對會漲'), ans('不會改變'));
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(sent.q13).toContain('[AMOUNT]');
    expect(sent.drop_pct).toBe(40);
    expect(out.overconfidence.tier).toBe('high');
  });

  it('a 429 makes the analyzer throw, so the caller degrades to rules', async () => {
    const failing = mockFetch(() => ({ ok: false, status: 429, json: async () => ({}) }));
    const analyzer = new GeminiAnalyzer('/api/analyze', failing as unknown as typeof fetch);
    const good = ans('比特幣沒有現金流，價值來自稀缺性與共識，我只放 5%。');
    await expect(analyzer.analyze(good, good)).rejects.toThrow();
    const out = await analyzeText(good, good, analyzer);
    expect(out?.analyzer).toBe('rule_based');
  });
});
