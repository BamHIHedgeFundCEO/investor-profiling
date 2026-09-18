// Methodology report: agreement between each analyzer and the human annotations.
//
//   npm run agreement              規則式 vs 標註
//   npm run agreement -- --gemini  另外跑 Gemini（需要 GEMINI_API_KEY）
//   npm run agreement -- --consistency  同一段文字跑 5 次，報告各指標標準差
//
// The labels in tests/fixtures.json are written by a person and frozen; this script
// only measures against them. It never writes labels.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeRules } from '../src/lib/analyzer/ruleBased';
import { parseGeminiScores } from '../src/lib/analyzer/gemini';
import { stripPii } from '../src/lib/analyzer/pii';
import { callGemini } from '../api/analyze';
import { weights } from '../src/lib/scoring/data';
import { tierOf } from '../src/lib/scoring/util';
import type { BehaviorScores, OpenAnswer, Target } from '../src/lib/analyzer/types';
import type { Tier } from '../src/lib/scoring/types';

type Label = Tier | 'mechanism' | 'narrative' | 'authority' | 'price_action' | null;

interface Fixture {
  id: string;
  target: Target;
  q13: string;
  q14: string;
  expected: { overconfidence: Label; herding: Label; reasoning_mode: Label; belief_rigidity: Label };
  llm_only: boolean;
  note?: string;
}

const DROP: Record<Target, number> = { btc: 40, ai: 30, gold: 20 };
const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);

// Load .env.local so the script can reach Gemini without the Vercel CLI.
// The file is gitignored and never printed.
for (const file of ['.env.local', '.env']) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}

function loadFixtures(): Fixture[] {
  const labeled = join(root, 'tests/fixtures.json');
  if (!existsSync(labeled)) {
    console.error('找不到 tests/fixtures.json。請先標註 tests/fixtures.template.json 並另存為 fixtures.json。');
    process.exit(1);
  }
  return JSON.parse(readFileSync(labeled, 'utf8')).fixtures as Fixture[];
}

const answer = (text: string, target: Target): OpenAnswer => ({ target, text, quality: 'usable' });

const predicted = (s: BehaviorScores) => ({
  overconfidence: s.overconfidence.tier,
  herding: s.herding.tier,
  reasoning_mode: s.reasoning_mode,
  belief_rigidity: tierOf(s.belief_rigidity, weights.tiers),
});

const DIMS = ['overconfidence', 'herding', 'reasoning_mode', 'belief_rigidity'] as const;

function score(rows: { expected: Fixture['expected']; got: ReturnType<typeof predicted> }[]) {
  return Object.fromEntries(
    DIMS.map((d) => {
      const scored = rows.filter((r) => r.expected[d] !== null);
      const hits = scored.filter((r) => r.expected[d] === r.got[d]).length;
      return [d, { n: scored.length, hits, pct: scored.length ? Math.round((hits / scored.length) * 100) : null }];
    }),
  );
}

async function geminiScores(f: Fixture): Promise<BehaviorScores> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY 未設定');
  const q13 = stripPii(f.q13);
  const q14 = stripPii(f.q14);
  const raw = await callGemini(
    { q13, q14, target: f.target, drop_pct: DROP[f.target] },
    key,
    process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  );
  return parseGeminiScores(raw, `${q13}\n${q14}`);
}

async function main() {
  const fixtures = loadFixtures();
  const unlabeled = fixtures.filter((f) => DIMS.every((d) => f.expected[d] === null));
  if (unlabeled.length) console.warn(`警告：${unlabeled.length} 組尚未標註，未計入。`);

  const ruleRows = fixtures
    .filter((f) => !f.llm_only)
    .map((f) => ({ expected: f.expected, got: predicted(analyzeRules(answer(f.q13, f.target), answer(f.q14, f.target))) }));
  const skipped = fixtures.filter((f) => f.llm_only).length;

  const table: Record<string, Record<string, string>> = {};
  const ruleScore = score(ruleRows);
  for (const d of DIMS) {
    const r = ruleScore[d]!;
    table[d] = { '規則式': r.pct === null ? '—' : `${r.pct}% (${r.hits}/${r.n})` };
  }

  if (args.includes('--gemini')) {
    const rows = [];
    for (const f of fixtures) {
      try {
        rows.push({ expected: f.expected, got: predicted(await geminiScores(f)) });
      } catch (e) {
        console.warn(`${f.id}: Gemini 失敗（${(e as Error).message}），該組不計入`);
      }
    }
    const g = score(rows);
    for (const d of DIMS) table[d]!['Gemini'] = g[d]!.pct === null ? '—' : `${g[d]!.pct}% (${g[d]!.hits}/${g[d]!.n})`;
  }

  console.log(`\n標註案例 ${fixtures.length} 組；規則式跳過 llm_only ${skipped} 組（假設語氣／程度副詞，fallback 不處理）\n`);
  console.table(table);
  console.log('\n樣本數很小（每組 1 題約佔 8%），這張表用來說明方法的相對強弱，不是精確估計。');

  if (args.includes('--consistency')) {
    const f = fixtures[0]!;
    const runs: BehaviorScores[] = [];
    for (let i = 0; i < 5; i++) runs.push(await geminiScores(f));
    const sd = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length).toFixed(1);
    };
    console.log(`\nLLM 重複性（${f.id}，同一段文字跑 5 次的標準差）`);
    console.table({
      overconfidence: { SD: sd(runs.map((r) => r.overconfidence.score)) },
      herding: { SD: sd(runs.map((r) => r.herding.score)) },
      belief_rigidity: { SD: sd(runs.map((r) => r.belief_rigidity)) },
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
