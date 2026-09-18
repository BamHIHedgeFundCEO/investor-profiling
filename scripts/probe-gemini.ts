// One-off connectivity probe: runs the real callGemini() against the real prompt
// and schema, so a model swap is verified end to end rather than by eyeballing a
// model list. Reads GEMINI_API_KEY from .env.local; never prints it.
//
//   npx vite-node scripts/probe-gemini.ts [model] [runs]
//
// Repeating the same input is the point: temperature 0 is not a determinism
// guarantee, and the interesting failure is a score that moves between runs while
// the text does not.

import { readFileSync } from 'node:fs';
import { callGemini } from '../api/analyze.js';
import { parseGeminiScores } from '../src/lib/analyzer/gemini.js';

function envLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!.replace(/^"|"$/g, '');
  }
  return out;
}

const env = envLocal();
const key = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
const model = process.argv[2] || process.env.GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const runs = Number(process.argv[3] ?? 1);
if (!key) throw new Error('no GEMINI_API_KEY in environment or .env.local');

const input = {
  q13: '我覺得比特幣沒有現金流，價格完全靠市場共識支撐，所以我最多只會放總資產的百分之五進去。',
  q14: '如果明天跌四成我不會改變看法，因為我當初的理由本來就跟價格無關。',
  target: 'btc',
  drop_pct: 40,
};
const source = `${input.q13}\n${input.q14}`;

console.log(`model: ${model}  runs: ${runs}`);
for (let i = 1; i <= runs; i++) {
  const t0 = Date.now();
  const raw = (await callGemini(input, key, model)) as Record<string, unknown>;
  const parsed = parseGeminiScores(raw, source);

  // What the model claimed, beside what survives the verbatim check.
  const claimed = [
    ...(((raw.overconfidence as { evidence?: string[] })?.evidence) ?? []),
    ...(((raw.herding as { evidence?: string[] })?.evidence) ?? []),
  ];
  const fabricated = claimed.filter((q) => !source.includes(q.trim()));

  console.log(
    `#${i} ${Date.now() - t0}ms  mode=${parsed.reasoning_mode}` +
      `  overconf=${parsed.overconfidence.score}  herd=${parsed.herding.score}` +
      `  rigidity=${parsed.belief_rigidity}` +
      (fabricated.length ? `  ⚠ 非逐字引用 ${fabricated.length} 句：${JSON.stringify(fabricated)}` : ''),
  );
}
