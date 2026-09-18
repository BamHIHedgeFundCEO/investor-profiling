// Demo mode. Pre-recorded complete responses so a live demonstration never depends
// on Wi-Fi, on a free-tier quota, or on anyone typing fast enough.
//
// Two deliberate constraints:
//   1. Demo runs the RULE-BASED analyzer explicitly, not primaryAnalyzer(). The
//      dual-scenario table has to be byte-identical every time it is shown, and an
//      LLM is not reproducible even at temperature 0.
//   2. The fixtures store only what a respondent actually chose (option indices and
//      the raw text). Everything else — text quality, scores, the comparison table —
//      is derived here, so a fixture can never disagree with the engine.

import fixtures from '../data/demo_fixtures.json';
import { compose } from './scoring/compose';
import { guardrails, itemBank, weights } from './scoring/data';
import { assessQuality } from './analyzer/quality';
import { ruleBasedAnalyzer } from './analyzer';
import { toneFor } from './presentation/tone';
import type { Item, MbtiType, OpenTextItem, ProfileRecord, Responses, ScoringLayer } from './scoring/types';
import type { Target } from './analyzer/types';

interface FixtureText {
  target: Target;
  text: string;
}
type FixtureAnswer = number | FixtureText;

export interface DemoScenario {
  id: string;
  name: string;
  desc: string;
  pair: string;
  same_as?: string;
  differs_in?: string[];
  mbti: string;
  responses: Record<string, FixtureAnswer>;
}

interface DemoFile {
  version: string;
  item_bank_version: string;
  note: string;
  scenarios: DemoScenario[];
}

const file = fixtures as unknown as DemoFile;
export const demoNote = file.note;
export const scenarios: DemoScenario[] = file.scenarios;
export const scenarioById = (id: string): DemoScenario | undefined => scenarios.find((s) => s.id === id);

const byId = new Map<string, Item>(itemBank.items.map((i) => [i.item_id, i]));

/** Fixture → the same Responses shape the store produces. Quality is re-derived, never stored. */
export function scenarioResponses(s: DemoScenario): Responses {
  const out: Responses = {};
  for (const [itemId, answer] of Object.entries(s.responses)) {
    if (typeof answer === 'number') {
      out[itemId] = { selected_index: answer };
    } else {
      const item = byId.get(itemId) as OpenTextItem | undefined;
      out[itemId] = {
        target: answer.target,
        text: answer.text,
        quality: assessQuality(answer.text, item?.text ?? ''),
      };
    }
  }
  return out;
}

/** Runs the real pipeline on a fixture. Offline and deterministic. */
export async function runScenario(s: DemoScenario): Promise<ProfileRecord> {
  const responses = scenarioResponses(s);
  const q13 = responses.Q13!;
  const q14 = responses.Q14!;
  const usable = 'quality' in q13 && 'quality' in q14 && q13.quality !== 'invalid' && q14.quality !== 'invalid';
  const scores = usable && 'text' in q13 && 'text' in q14 ? await ruleBasedAnalyzer.analyze(q13, q14) : null;

  const scoring = compose({
    responses,
    itemBank,
    weights,
    guardrails,
    text: scores ? { analyzer: ruleBasedAnalyzer.name, scores } : null,
  });

  const mbti = (s.mbti || null) as MbtiType | null;
  return {
    schema_version: '1.3',
    item_bank_version: itemBank.version,
    timestamp: new Date().toISOString(),
    responses,
    scoring_layer: scoring,
    presentation_layer: { mbti, tone: toneFor(mbti) },
    social_layer: null,
  };
}

// ── The dual-scenario comparison ──────────────────────────────────────────────

export interface CompareRow {
  key: string;
  label: string;
  a: number;
  b: number;
  /** true when this row is expected to be identical — the claim the demo is making. */
  invariant: boolean;
  digits: number;
}

// baseline_risk and its three inputs are the invariants: Stage 1 and Stage 3 are
// untouched between the two scenarios, so any movement there would be a bug.
const ROWS: { key: keyof ScoringLayer | 'alert'; label: string; invariant: boolean; digits: number }[] = [
  { key: 'capacity', label: 'capacity（財務能力）', invariant: true, digits: 1 },
  { key: 'willingness', label: 'willingness（風險偏好）', invariant: true, digits: 1 },
  { key: 'competence_cap', label: 'competence_cap（能力上限）', invariant: true, digits: 1 },
  { key: 'baseline_risk', label: 'baseline_risk（慢變數基準）', invariant: true, digits: 1 },
  { key: 'bias_index', label: 'bias_index（偏誤指數）', invariant: false, digits: 1 },
  { key: 'bias_penalty', label: 'bias_penalty（偏誤扣分）', invariant: false, digits: 1 },
  { key: 'emotion_mult', label: 'emotion_mult（情緒係數）', invariant: false, digits: 3 },
  { key: 'effective_risk', label: 'effective_risk（實際風險分數）', invariant: false, digits: 1 },
  { key: 'target_vol', label: 'target_vol（目標波動度）', invariant: false, digits: 3 },
  { key: 'alert', label: 'Behavioral Alert', invariant: false, digits: 0 },
];

const cellValue = (s: ScoringLayer, key: string): number =>
  key === 'alert' ? (s.behavioral_alert ? 1 : 0)
  : key === 'emotional_deviation' ? s.emotional_state.deviation
  : (s[key as keyof ScoringLayer] as number);

export function compareRows(a: ScoringLayer, b: ScoringLayer): CompareRow[] {
  const rows = ROWS.map((r) => ({ ...r, key: String(r.key), a: cellValue(a, String(r.key)), b: cellValue(b, String(r.key)) }));
  // emotional_deviation is the driver of everything below baseline; show it first
  // among the moving rows.
  const at = rows.findIndex((r) => r.key === 'bias_index');
  rows.splice(at, 0, {
    key: 'emotional_deviation',
    label: 'emotional_deviation（情緒偏離）',
    invariant: false,
    digits: 1,
    a: a.emotional_state.deviation,
    b: b.emotional_state.deviation,
  });
  return rows;
}

/** The claim the demo makes, checked rather than asserted in prose. */
export function invariantsHold(a: ScoringLayer, b: ScoringLayer): { ok: boolean; broken: string[] } {
  const broken = compareRows(a, b).filter((r) => r.invariant && r.a !== r.b).map((r) => r.key);
  return { ok: broken.length === 0, broken };
}
