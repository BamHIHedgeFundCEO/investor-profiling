// One-off connectivity probe: runs the real callGemini() against the real prompt
// and schema, so a model swap is verified end to end rather than by eyeballing a
// model list. Reads GEMINI_API_KEY from .env.local; never prints it.
//
//   npx vite-node scripts/probe-gemini.ts [model]

import { readFileSync } from 'node:fs';
import { callGemini } from '../api/analyze.js';

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
const model = process.argv[2] || process.env.GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-3.6-flash';
if (!key) throw new Error('no GEMINI_API_KEY in environment or .env.local');

const input = {
  q13: '我覺得比特幣沒有現金流，價格完全靠市場共識支撐，所以我最多只會放總資產的一小部分進去。',
  q14: '如果明天跌四成我不會改變看法，因為我當初的理由本來就跟價格無關。',
  target: 'btc',
  drop_pct: 40,
};

console.log(`model: ${model}`);
const t0 = Date.now();
const scores = await callGemini(input, key, model);
console.log(`ok in ${Date.now() - t0}ms`);
console.log(JSON.stringify(scores, null, 1));
