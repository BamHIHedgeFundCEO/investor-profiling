// Vercel serverless function. The API key lives only in environment variables and
// never reaches the browser; the client calls this endpoint instead.
//
// The .js extensions below are load-bearing and must not be removed. package.json
// declares "type": "module", and Vercel compiles api/*.ts per file rather than
// bundling them, so these become real Node ESM specifiers at runtime. Node ESM
// does not do extension resolution: an extensionless './_rateLimit' throws
// ERR_MODULE_NOT_FOUND before the handler is ever entered, which surfaces as
// FUNCTION_INVOCATION_FAILED with no application log. TypeScript's "bundler"
// resolution maps the .js specifier back to the .ts source, so both sides agree.

import { createHash } from 'node:crypto';
import { clientIp, rateLimit } from './_rateLimit.js';
import { RESPONSE_SCHEMA, SYSTEM_PROMPT, userPrompt } from './_prompt.js';
import { stripPii } from '../src/lib/analyzer/pii.js';

const MAX_CHARS = 2000;
// Two constraints decided this, neither of them visible from a model list:
//
//   1. gemini-2.5-flash answers 404 for keys issued after its retirement — it is
//      still returned by ListModels, but generateContent says "no longer available
//      to new users". Checking the catalogue is not checking availability.
//   2. The free tier meters requests PER MODEL PER DAY, and gemini-3.6-flash gets
//      20. The 15-case agreement table alone exhausts it, after which every
//      respondent silently falls back to the rule-based analyzer. The lite model
//      carries its own, far larger, daily allowance.
//
// Pinned rather than tracking the gemini-flash-latest alias: the agreement rates
// in README section 16 are only reproducible against a fixed model.
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const TIMEOUT_MS = 12_000;

interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

export interface AnalyzeRequest {
  q13: string;
  q14: string;
  target: string;
  drop_pct: number;
}

function parseBody(body: unknown): AnalyzeRequest | null {
  const b = (typeof body === 'string' ? safeJson(body) : body) as Partial<AnalyzeRequest> | null;
  if (!b || typeof b.q13 !== 'string' || typeof b.q14 !== 'string') return null;
  if (b.q13.length > MAX_CHARS || b.q14.length > MAX_CHARS) return null;
  return {
    q13: b.q13,
    q14: b.q14,
    target: typeof b.target === 'string' ? b.target.slice(0, 20) : 'unknown',
    drop_pct: typeof b.drop_pct === 'number' ? b.drop_pct : 30,
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function callGemini(input: AnalyzeRequest, apiKey: string, model: string, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt(input.q13, input.q14, input.target, input.drop_pct) }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('gemini: empty response');
    const parsed = safeJson(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('gemini: unparsable JSON');
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const limit = rateLimit(clientIp(req.headers));
  if (!limit.allowed) {
    res.setHeader('retry-after', String(limit.retryAfterSec));
    // The client degrades silently to its rule-based analyzer on any failure.
    return res.status(429).json({ error: 'rate_limited', retry_after: limit.retryAfterSec });
  }

  const input = parseBody(req.body);
  if (!input) return res.status(400).json({ error: 'bad_request' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'analyzer_unavailable' });

  // Second pass of PII stripping: the client already strips before sending.
  const safe: AnalyzeRequest = { ...input, q13: stripPii(input.q13), q14: stripPii(input.q14) };

  // The model name is echoed back deliberately. It is not a secret, and without it
  // a GEMINI_MODEL set to something unintended is undiagnosable from outside: the
  // endpoint answers 200 either way, and only the scores differ.
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  // A digest of exactly what the analyzer saw. Not the text — a hash — so it leaks
  // nothing, but it settles the one question a caller cannot otherwise answer:
  // whether the server received the same bytes the client sent. Chinese text that
  // arrives mangled produces a plausible-looking 200 with invented analysis.
  const digest = createHash('sha256').update(`${safe.q13}\n${safe.q14}`).digest('hex').slice(0, 16);

  try {
    const scores = await callGemini(safe, apiKey, model);
    return res.status(200).json({ analyzer: 'gemini', model, digest, scores });
  } catch (e) {
    console.error('[analyze]', (e as Error).message);
    return res.status(502).json({ error: 'analyzer_failed' });
  }
}
