// Text-analysis contract. Implementations: ruleBased.ts (fallback, in-browser) and
// gemini.ts (via /api/analyze). Selected by env var, never by editing code.

import type { DimScore } from '../scoring/types';

export type TextQuality = 'usable' | 'thin' | 'invalid';
export type Target = 'btc' | 'ai' | 'gold';
export type ReasoningMode = 'mechanism' | 'narrative' | 'authority' | 'price_action';
export type AnalyzerName = 'gemini' | 'rule_based';

export interface OpenAnswer {
  target: Target;
  text: string;
  quality: TextQuality;
}

// Emotional reading of the text. Display-only: it is shown next to the option-based
// scores as a cross-check and never enters scoring, because hypothetical phrasing
// ("如果崩盤我會很恐慌") contaminates text-based emotion signals.
export interface SentimentReading {
  anxiety: DimScore;
  loss_aversion: DimScore;
  confidence: DimScore;
}

export interface BehaviorScores {
  overconfidence: DimScore;
  herding: DimScore;
  reasoning_mode: ReasoningMode;
  belief_rigidity: number;
  price_anchoring: number;
  sentiment: SentimentReading;
}

export interface TextAnalyzer {
  readonly name: AnalyzerName;
  // Q14 is judged relative to Q13's stance, so the pair is always analyzed together.
  analyze(q13: OpenAnswer, q14: OpenAnswer): Promise<BehaviorScores>;
}
