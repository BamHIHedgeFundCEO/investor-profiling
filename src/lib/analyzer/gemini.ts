// Calls /api/analyze (the API key stays on the server). Any failure throws, and
// the caller degrades silently to the rule-based analyzer.

import { weights } from '../scoring/data';
import { clamp, tierOf } from '../scoring/util';
import type { DimScore } from '../scoring/types';
import { stripPii } from './pii';
import type { BehaviorScores, OpenAnswer, ReasoningMode, TextAnalyzer } from './types';

const REASONING_MODES: ReasoningMode[] = ['mechanism', 'narrative', 'authority', 'price_action'];
const DROP_BY_TARGET: Record<OpenAnswer['target'], number> = { btc: 40, ai: 30, gold: 20 };
const TIMEOUT_MS = 15_000;

interface RawDim {
  score?: unknown;
  evidence?: unknown;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 100) : 0);

// Quotes must appear verbatim in what the respondent actually wrote; anything else
// is a paraphrase or a hallucination and is dropped.
function quotes(raw: unknown, source: string): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    .map((q) => q.trim())
    .filter((q) => source.includes(q))
    .slice(0, 3);
}

function dim(raw: unknown, source: string): DimScore {
  const r = (raw ?? {}) as RawDim;
  const score = num(r.score);
  return { score, tier: tierOf(score, weights.tiers), evidence: quotes(r.evidence, source) };
}

export function parseGeminiScores(raw: unknown, source: string): BehaviorScores {
  const r = (raw ?? {}) as Record<string, unknown>;
  const mode = r.reasoning_mode;
  const sentiment = (r.sentiment ?? {}) as Record<string, unknown>;
  return {
    overconfidence: dim(r.overconfidence, source),
    herding: dim(r.herding, source),
    reasoning_mode: REASONING_MODES.includes(mode as ReasoningMode) ? (mode as ReasoningMode) : 'narrative',
    belief_rigidity: num(r.belief_rigidity),
    price_anchoring: num(r.price_anchoring),
    sentiment: {
      anxiety: dim(sentiment.anxiety, source),
      loss_aversion: dim(sentiment.loss_aversion, source),
      confidence: dim(sentiment.confidence, source),
    },
  };
}

export class GeminiAnalyzer implements TextAnalyzer {
  readonly name = 'gemini' as const;
  constructor(
    private endpoint = '/api/analyze',
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  async analyze(q13: OpenAnswer, q14: OpenAnswer): Promise<BehaviorScores> {
    // Strip before sending: financial figures and identifiers never leave the browser.
    const safe13 = stripPii(q13.text);
    const safe14 = stripPii(q14.text);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ q13: safe13, q14: safe14, target: q13.target, drop_pct: DROP_BY_TARGET[q13.target] }),
      });
      if (!res.ok) throw new Error(`analyze ${res.status}`); // 429 is routine on the free tier
      const data = (await res.json()) as { scores?: unknown };
      return parseGeminiScores(data.scores, `${safe13}\n${safe14}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
