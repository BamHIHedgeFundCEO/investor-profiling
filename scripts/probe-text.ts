// Explains what the analyzers do to one specific pair of open-text answers, and
// why. Written for the case where a respondent disputes their own result: the
// answer has to be traceable to a rule, not to "the AI said so".
//
//   npx vite-node scripts/probe-text.ts "<Q13>" "<Q14>" [target] [--gemini]
//
// --gemini also asks the live model, because production and the local fallback can
// reach different verdicts on the same sentence and the respondent only ever sees one.

import { readFileSync } from 'node:fs';
import { callGemini } from '../api/analyze.js';
import { parseGeminiScores } from '../src/lib/analyzer/gemini.js';
import { analyzeRules } from '../src/lib/analyzer/ruleBased.js';
import { assessQuality } from '../src/lib/analyzer/quality.js';
import { stripPii } from '../src/lib/analyzer/pii.js';
import { weights } from '../src/lib/scoring/data.js';
import type { OpenAnswer, Target } from '../src/lib/analyzer/types.js';

const argv = process.argv.slice(2);
const askGemini = argv.includes('--gemini');
const [q13 = '', q14 = '', target = 'ai'] = argv.filter((a) => !a.startsWith('--'));
if (!q13) {
  console.error('usage: vite-node scripts/probe-text.ts "<Q13>" "<Q14>" [btc|ai|gold]');
  process.exit(1);
}

const t = target as Target;
const a13: OpenAnswer = { target: t, text: q13, quality: assessQuality(q13, '') };
const a14: OpenAnswer = { target: t, text: q14, quality: assessQuality(q14, '') };

console.log(`Q13（${q13.length} 字，品質 ${a13.quality}）：${q13}`);
console.log(`Q14（${q14.length} 字，品質 ${a14.quality}）：${q14}`);
console.log(`PII 剝離後有無改動：${stripPii(q13) !== q13 || stripPii(q14) !== q14}`);
console.log(`text_blend 權重：${weights.text_blend[a13.quality]}（quality=${a13.quality}）`);
const chars = `${q13}${q14}`.replace(/\s+/g, '').length;
const floor = weights.thresholds.depth_floor_chars;
console.log(`字數：${chars}（過度自信的深度門檻 ${floor}）→ 過度自信${chars >= floor ? '可' : '不可'}採計`);
console.log('');

// Whether a reading is admitted into the score. Printed beside every score below,
// because "what the analyzer said" and "what counted" are not the same thing.
const applied = (d: { evidence: string[] }, dim: string) =>
  d.evidence.length === 0 ? '未採計（無證據）' : dim === 'overconfidence' && chars < floor ? '未採計（文字太短）' : '採計';

const r = analyzeRules(a13, a14);
console.log('規則式：');
for (const [name, d] of [
  ['overconfidence', r.overconfidence],
  ['herding', r.herding],
] as const) {
  console.log(`  ${name}: ${d.score} (${d.tier})  ${applied(d, name)}  evidence=${JSON.stringify(d.evidence)}`);
}
console.log(`  reasoning_mode: ${r.reasoning_mode}`);
console.log(`  belief_rigidity: ${r.belief_rigidity}   price_anchoring: ${r.price_anchoring}`);
console.log(`  sentiment: anxiety=${r.sentiment.anxiety.score} loss_aversion=${r.sentiment.loss_aversion.score} confidence=${r.sentiment.confidence.score}`);

if (askGemini) {
  const env: Record<string, string> = {};
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]!] = m[2]!.replace(/^"|"$/g, '');
  }
  const key = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  if (!key) throw new Error('no GEMINI_API_KEY in environment or .env.local');

  const source = `${q13}\n${q14}`;
  const raw = (await callGemini({ q13, q14, target: t, drop_pct: 30 }, key, model)) as Record<string, unknown>;
  const g = parseGeminiScores(raw, source);
  console.log(`\nGemini（${model}）：`);
  for (const [name, d] of [
    ['overconfidence', g.overconfidence],
    ['herding', g.herding],
  ] as const) {
    const claimed = ((raw[name] as { evidence?: string[] })?.evidence ?? []).map((q) => q.trim());
    const dropped = claimed.filter((q) => !source.includes(q));
    console.log(
      `  ${name}: ${d.score} (${d.tier})  ${applied(d, name)}  evidence=${JSON.stringify(d.evidence)}` +
        (dropped.length ? `  ⚠ 非逐字引用被丟棄：${JSON.stringify(dropped)}` : ''),
    );
  }
  console.log(`  reasoning_mode: ${g.reasoning_mode}`);
  console.log(`  belief_rigidity: ${g.belief_rigidity}   price_anchoring: ${g.price_anchoring}`);
}
