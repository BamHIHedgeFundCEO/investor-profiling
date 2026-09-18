// Analyzer selection and silent degradation. The analyzer is chosen by env var
// (VITE_ANALYZER), never by editing code; any failure falls back to the rule engine.

import type { BehaviorScores, OpenAnswer, TextAnalyzer } from './types';
import type { TextInput } from '../scoring/types';
import { RuleBasedAnalyzer } from './ruleBased';
import { GeminiAnalyzer } from './gemini';

export const ruleBasedAnalyzer = new RuleBasedAnalyzer();

// Chosen by env var (VITE_ANALYZER=gemini|rule_based), never by editing code.
export function primaryAnalyzer(): TextAnalyzer {
  return import.meta.env?.VITE_ANALYZER === 'gemini' ? new GeminiAnalyzer() : ruleBasedAnalyzer;
}

export async function analyzeText(
  q13: OpenAnswer,
  q14: OpenAnswer,
  primary: TextAnalyzer = primaryAnalyzer(),
): Promise<TextInput | null> {
  // Invalid text is never sent anywhere: its text-layer weight is 0 regardless.
  if (q13.quality === 'invalid' || q14.quality === 'invalid') return null;
  let scores: BehaviorScores;
  let analyzer = primary.name;
  try {
    scores = await primary.analyze(q13, q14);
  } catch {
    // 429 / timeout / offline are expected; degrade silently.
    scores = await ruleBasedAnalyzer.analyze(q13, q14);
    analyzer = ruleBasedAnalyzer.name;
  }
  return { analyzer, scores };
}
