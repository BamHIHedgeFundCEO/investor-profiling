// Where the instrument actually puts people — the check that reads the scoring
// engine as a population, not one respondent at a time.
//
//   npm run distribution
//
// It exists because three real defects were invisible from single cases and
// obvious here: an emotion multiplier that discounted respondents the report
// called calm, a bias index that charged anxiety twice, and a competence
// construct so coarse that the top investor type was unreachable (README §21).
//
// The population is SIMULATED, and that is the limit of what this can prove.
// Each respondent is a latent position theta in [0,1] plus per-item noise, which
// makes answers correlate the way real ones do. It is not a claim about real
// users, so nothing here is used to calibrate a threshold — only to find the
// places where a number cannot behave the way its description says it does.

import { itemBank, weights, guardrails } from '../src/lib/scoring/data.js';
import { compose } from '../src/lib/scoring/compose.js';
import { BIAS_DIMS } from '../src/lib/scoring/types.js';
import type { Responses, ScoringLayer, SingleChoiceItem } from '../src/lib/scoring/types.js';

const choices = itemBank.items.filter(
  (i): i is SingleChoiceItem =>
    i.type === 'single_choice' || i.type === 'attention_check' || i.type === 'sub_choice',
);

// Fixed seed: the table has to be the same table tomorrow.
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());

const NOISE = 0.15; // how inconsistently one respondent answers across items

function respondent(theta: number): Responses {
  const o: Responses = {};
  for (const i of choices) {
    const t = Math.min(0.999, Math.max(0, theta + gauss() * NOISE));
    o[i.item_id] = { selected_index: Math.floor(t * i.options.length) };
  }
  o.Q13 = { target: 'btc', text: '', quality: 'invalid' };
  o.Q14 = { target: 'btc', text: '', quality: 'invalid' };
  return o;
}

const N = Number(process.argv[2] ?? 6000);
const rows: ScoringLayer[] = [];
for (let i = 0; i < N; i++) {
  rows.push(compose({ responses: respondent(rnd()), itemBank, weights, guardrails, text: null }));
}

const pctl = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))]!;
const line = (name: string, a: number[]) =>
  console.log(
    `${name.padEnd(16)} p10=${pctl(a, 0.1).toFixed(1)} p50=${pctl(a, 0.5).toFixed(1)}` +
      ` p90=${pctl(a, 0.9).toFixed(1)} p99=${pctl(a, 0.99).toFixed(1)} max=${pctl(a, 1).toFixed(1)}`,
  );

console.log(`模擬 ${N} 份前後一致的作答（noise=${NOISE}，固定亂數種子）\n`);
line('capacity', rows.map((r) => r.capacity));
line('willingness', rows.map((r) => r.willingness));
line('competence', rows.map((r) => r.competence));
line('competence_cap', rows.map((r) => r.competence_cap));
line('baseline_risk', rows.map((r) => r.baseline_risk));
line('effective_risk', rows.map((r) => r.effective_risk));
line('target_vol', rows.map((r) => r.target_vol * 100));

const tally = (key: (r: ScoringLayer) => string) => {
  const t: Record<string, number> = {};
  for (const r of rows) t[key(r)] = (t[key(r)] ?? 0) + 1;
  return t;
};

console.log('\n綁住分數的構念：');
for (const [k, v] of Object.entries(tally((r) => r.binding_constraint)).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(14)} ${((v / N) * 100).toFixed(1)}%`);
}

console.log('\n投資人類型：');
const types = tally((r) => String(r.investor_type));
for (const t of weights.investor_types) {
  console.log(`  ${t.id.padEnd(24)} ${(((types[t.id] ?? 0) / N) * 100).toFixed(1)}%`);
}
console.log(
  '  ＊最高一級本來就該罕見：min() 取三個構念的最小值，情緒只會往下調。\n' +
    '    投資組合由 target_vol 連續決定，不是由這個標籤決定，所以罕見不等於有人拿不到組合。',
);

// Invariants that no number in the table is allowed to break.
const calm = rows.filter((r) => r.emotional_state.state === 'calm');
const calmDiscounted = calm.filter((r) => r.emotion_mult < 1).length;
console.log('\n一致性檢查：');
console.log(`  顯示「情緒平穩」卻被打折：${calmDiscounted} / ${calm.length}  ${calmDiscounted === 0 ? 'OK' : '← 顯示與計算不一致'}`);
console.log(`  anxiety 是否同時進 bias_index：${(BIAS_DIMS as readonly string[]).includes('anxiety') ? '是 ← 與 emotion_mult 重複計算' : '否  OK'}`);
console.log(`  bias_penalty > 0 的比例：${((rows.filter((r) => r.bias_penalty > 0).length / N) * 100).toFixed(1)}%`);
console.log(`  emotion_mult < 1 的比例：${((rows.filter((r) => r.emotion_mult < 1).length / N) * 100).toFixed(1)}%`);
