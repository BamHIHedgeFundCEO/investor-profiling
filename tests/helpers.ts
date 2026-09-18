import { itemBank, weights, guardrails } from '../src/lib/scoring/data';
import { compose } from '../src/lib/scoring/compose';
import type { Responses, TextInput } from '../src/lib/scoring/types';
import type { BehaviorScores, TextQuality } from '../src/lib/analyzer/types';

// A mid-range respondent; tests override only the answers they care about.
export const BASE_PICKS: Record<string, number> = {
  Q00: 1, Q01: 2, Q02: 2, Q03: 2, Q04: 2, Q05: 2, Q06: 1, Q07: 1,
  Q08: 2, Q09: 1, Q10: 2, AC1: 2, Q11: 1, Q12a: 1, Q12b: 1,
  Q21: 1, Q15: 2, Q16: 0, Q17: 0, Q18: 2, Q15b: 2, Q19a: 1, Q19b: 1, Q20: 2,
};

// Long enough to clear thresholds.depth_floor_chars, so tests that are about the
// blend exercise the blend. Tests about the floor pass their own short text.
export const LONG_TEXT = '（測試文字）這是一段長度足夠的測試回答，長到可以判斷答題者有沒有講出理由。';

export function responses(
  picks: Record<string, number> = {},
  text: { q13?: TextQuality; q14?: TextQuality; body?: string } = {},
): Responses {
  const r: Responses = {};
  for (const [id, i] of Object.entries({ ...BASE_PICKS, ...picks })) r[id] = { selected_index: i };
  const body = text.body ?? LONG_TEXT;
  r.Q13 = { target: 'btc', text: body, quality: text.q13 ?? 'usable' };
  r.Q14 = { target: 'btc', text: body, quality: text.q14 ?? 'usable' };
  return r;
}

export function textInput(
  overrides: Partial<Record<'overconfidence' | 'herding', number>> = {},
  // Pass [] to model an analyzer that reports a score it cannot quote the
  // respondent for — including an LLM whose fabricated quotes were dropped.
  evidence: string[] = ['測試引用'],
): TextInput {
  const dim = (score: number, ev: string[] = evidence) => ({ score, tier: 'mid' as const, evidence: ev });
  const scores: BehaviorScores = {
    overconfidence: dim(overrides.overconfidence ?? 50),
    herding: dim(overrides.herding ?? 50),
    reasoning_mode: 'mechanism',
    belief_rigidity: 70,
    price_anchoring: 20,
    sentiment: { anxiety: dim(95), loss_aversion: dim(95), confidence: dim(5) },
  };
  return { analyzer: 'rule_based', scores };
}

export const run = (r: Responses, text: TextInput | null = null, meta?: { duration_sec?: number }) =>
  compose({ responses: r, itemBank, weights, guardrails, text, meta });

export { itemBank, weights, guardrails };
