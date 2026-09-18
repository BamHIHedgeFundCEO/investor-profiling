// Sensitivity analysis — the only honest justification for the delta values.
//
//   npm run sensitivity
//
// Every delta in the item bank is an ordinal expert judgement, not an empirical
// estimate. Pretending otherwise would be indefensible. What CAN be defended is
// showing the output barely moves when those numbers are perturbed: the result is
// driven by the relative order of a respondent's answers, not by any exact value.
//
// Three groups are perturbed and reported separately, because they are three
// different kinds of claim and deserve three different thresholds:
//
//   (a) delta 數值              ±20%   pass < 10%   pure expert judgement
//   (b) 選項值與構念權重         ±20%   pass < 20%   defensible but still chosen
//   (c) 結構常數（逐一擾動）      ±20%   pass < 25%   design decisions with reasons
//
// Group (c) is perturbed ONE CONSTANT AT A TIME. Perturbing them together would
// only produce an aggregate number that hides which constant actually matters.
//
// Respondent sampling follows the revision: 10 respondents within ±5 of each
// investor-type band midpoint (2 per type) form the headline flip rate; 2 more sit
// deliberately within ±2 of a band edge and are reported SEPARATELY, because a
// respondent already on a boundary flips under any perturbation and would inflate
// the headline number.

import { compose } from '../src/lib/scoring/compose';
import { guardrails as baseGuardrails, itemBank as baseBank, weights as baseWeights } from '../src/lib/scoring/data';
import { enumerateComposite } from '../src/lib/scoring/rules';
import { ruleBasedAnalyzer } from '../src/lib/analyzer';
import { indexItems } from '../src/lib/scoring/util';
import type { BehaviorDim, ItemBank, Responses, TextInput, Weights } from '../src/lib/scoring/types';
import type { OpenAnswer } from '../src/lib/analyzer/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PCT = 0.2;
const ITERATIONS = 1000;
const ITERATIONS_PER_CONSTANT = 300;

// Deterministic: the report must be reproducible from the repo alone.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const jitter = (rng: () => number) => 1 + (rng() * 2 - 1) * PCT;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ── (a) deltas ────────────────────────────────────────────────────────────────

function perturbDeltas(bank: ItemBank, rng: () => number): ItemBank {
  const out = clone(bank);
  for (const item of out.items) {
    if (item.type === 'single_choice') {
      for (const o of item.options) {
        if (!o.deltas) continue;
        for (const d of Object.keys(o.deltas) as BehaviorDim[]) o.deltas[d] = o.deltas[d]! * jitter(rng);
      }
    } else if (item.type === 'composite') {
      if (item.rule === 'reflectionEffect') {
        for (const outcome of Object.values(item.outcomes)) {
          for (const d of Object.keys(outcome.deltas) as BehaviorDim[]) outcome.deltas[d] = outcome.deltas[d]! * jitter(rng);
        }
      } else if (item.rule === 'overconfidenceInteraction') {
        const p = item.params;
        p.score_both *= jitter(rng);
        p.score_rank_only *= jitter(rng);
        p.score_freq_only *= jitter(rng);
        p.confidence_by_rank_option = p.confidence_by_rank_option.map((v) => v * jitter(rng));
      }
    }
  }
  return redeclareRanges(out);
}

// A perturbed rule no longer matches its declared_range, and a stale declared range
// would silently compress the normalized scores. Re-derive it by enumeration.
function redeclareRanges(bank: ItemBank): ItemBank {
  const byId = indexItems(bank);
  for (const item of bank.items) {
    if (item.type !== 'composite') continue;
    const results = enumerateComposite(item, byId);
    const dims = new Set<BehaviorDim>([
      ...(Object.keys(item.declared_range) as BehaviorDim[]),
      ...results.flatMap((r) => Object.keys(r.deltas) as BehaviorDim[]),
    ]);
    item.declared_range = {};
    for (const d of dims) {
      const vals = results.map((r) => r.deltas[d] ?? 0);
      item.declared_range[d] = [Math.min(...vals), Math.max(...vals)];
    }
  }
  return bank;
}

// ── (b) option values and construct weights ───────────────────────────────────

function perturbValuesAndWeights(bank: ItemBank, weights: Weights, rng: () => number) {
  const b = clone(bank);
  for (const item of b.items) {
    if (item.type === 'single_choice' && item.facet) {
      // Values are an absolute 0–100 scale; a perturbation may not leave it.
      for (const o of item.options) if (o.value !== undefined) o.value = clamp(o.value * jitter(rng), 0, 100);
    } else if (item.type === 'composite' && item.rule === 'knowledgeQuiz') {
      item.value_by_correct = item.value_by_correct.map((v) => clamp(v * jitter(rng), 0, 100));
    }
  }
  const w = clone(weights);
  for (const group of ['capacity', 'willingness', 'competence'] as const) {
    const g = w[group] as Record<string, number>;
    for (const k of Object.keys(g)) g[k] = Math.max(1e-6, g[k]! * jitter(rng));
  }
  // No explicit renormalization needed: weightedMean() divides by the weight sum,
  // precisely so perturbed weights stay on the 0–100 scale.
  return { bank: b, weights: w };
}

// ── (c) structural constants, one at a time ───────────────────────────────────

type ConstantId =
  | 'competence_cap.floor' | 'competence_cap.slope'
  | 'emotion.anxiety_cut' | 'emotion.euphoria_cut' | 'emotion.max_discount'
  | 'bias_penalty.k' | 'bias_penalty.center' | 'bias_penalty.max'
  | 'text_blend.usable' | 'tiers.mid_min' | 'tiers.high_min'
  | 'target_vol.min' | 'target_vol.span'
  | 'investor_types.edges';

const CONSTANTS: ConstantId[] = [
  'competence_cap.floor', 'competence_cap.slope',
  'emotion.anxiety_cut', 'emotion.euphoria_cut', 'emotion.max_discount',
  'bias_penalty.k', 'bias_penalty.center', 'bias_penalty.max',
  'text_blend.usable', 'tiers.mid_min', 'tiers.high_min',
  'target_vol.min', 'target_vol.span',
  'investor_types.edges',
];

function perturbConstant(weights: Weights, id: ConstantId, rng: () => number): Weights {
  const w = clone(weights);
  const scale = (obj: Record<string, number>, key: string) => (obj[key] = obj[key]! * jitter(rng));
  switch (id) {
    case 'competence_cap.floor': scale(w.competence_cap as never, 'floor'); break;
    case 'competence_cap.slope': scale(w.competence_cap as never, 'slope'); break;
    case 'emotion.anxiety_cut': scale(w.emotion as never, 'anxiety_cut'); break;
    case 'emotion.euphoria_cut': scale(w.emotion as never, 'euphoria_cut'); break;
    case 'emotion.max_discount': scale(w.emotion as never, 'max_discount'); break;
    case 'bias_penalty.k': scale(w.bias_penalty as never, 'k'); break;
    case 'bias_penalty.center': scale(w.bias_penalty as never, 'center'); break;
    case 'bias_penalty.max': scale(w.bias_penalty as never, 'max'); break;
    case 'text_blend.usable': w.text_blend.usable = clamp(w.text_blend.usable * jitter(rng), 0, 1); break;
    case 'tiers.mid_min': w.tiers.mid_min = Math.min(w.tiers.mid_min * jitter(rng), w.tiers.high_min - 1); break;
    case 'tiers.high_min': w.tiers.high_min = Math.max(w.tiers.high_min * jitter(rng), w.tiers.mid_min + 1); break;
    case 'target_vol.min': scale(w.target_vol as never, 'min'); break;
    case 'target_vol.span': scale(w.target_vol as never, 'span'); break;
    case 'investor_types.edges': {
      // Interior edges only; the outer bounds must keep covering [0, 100] or the
      // classifier has nowhere to put a respondent.
      const edges = w.investor_types.slice(1).map((t) => t.lo * jitter(rng));
      edges.sort((a, b) => a - b);
      w.investor_types.forEach((t, i) => {
        if (i > 0) t.lo = edges[i - 1]!;
        if (i < w.investor_types.length - 1) t.hi = edges[i]!;
      });
      break;
    }
  }
  return w;
}

// ── Synthetic respondents ─────────────────────────────────────────────────────

interface Respondent {
  id: string;
  responses: Responses;
  text: TextInput;
  baseline: string; // investor_type under the unperturbed configuration
  effective: number;
  targetVol: number;
  guardrails: string; // sorted guardrail ids, joined — the third output a constant can move
}

const choiceItems = baseBank.items.filter(
  (i) => i.type === 'single_choice' || i.type === 'attention_check' || i.type === 'sub_choice',
) as { item_id: string; options: unknown[] }[];

// Text is held FIXED per respondent rather than regenerated: the analyzer is not
// what is under test here, and a moving text score would contaminate the flip rate.
async function fixedTexts(): Promise<TextInput[]> {
  const raw = JSON.parse(readFileSync(join(import.meta.dirname, '../tests/fixtures.json'), 'utf8'));
  const picks = [raw.fixtures[0], raw.fixtures[3], raw.fixtures[6]];
  const out: TextInput[] = [];
  for (const f of picks) {
    const ans = (text: string): OpenAnswer => ({ target: f.target, text, quality: 'usable' });
    out.push({ analyzer: 'rule_based', scores: await ruleBasedAnalyzer.analyze(ans(f.q13), ans(f.q14)) });
  }
  return out;
}

function scoreWith(r: { responses: Responses; text: TextInput }, bank: ItemBank, weights: Weights) {
  return compose({ responses: r.responses, itemBank: bank, weights, guardrails: baseGuardrails, text: r.text });
}

/** Random answer vectors, bucketed by where they land. */
async function buildRespondents(): Promise<{ core: Respondent[]; boundary: Respondent[] }> {
  const rng = mulberry32(20260918);
  const texts = await fixedTexts();
  const bands = baseWeights.investor_types;
  const core: Respondent[] = [];
  const boundary: Respondent[] = [];
  const perType = new Map<string, number>();
  const edges = bands.slice(1).map((b) => b.lo);

  for (let tries = 0; tries < 400_000 && (core.length < 10 || boundary.length < 2); tries++) {
    const responses: Responses = {};
    for (const it of choiceItems) responses[it.item_id] = { selected_index: Math.floor(rng() * it.options.length) };
    const text = texts[tries % texts.length]!;
    let s;
    try {
      s = scoreWith({ responses, text }, baseBank, baseWeights);
    } catch {
      continue;
    }
    const e = s.effective_risk;

    const nearEdge = edges.some((x) => Math.abs(e - x) <= 2);
    if (nearEdge && boundary.length < 2) {
      boundary.push({ id: `B${boundary.length + 1}`, responses, text, baseline: s.investor_type, effective: e, targetVol: s.target_vol, guardrails: [...s.guardrails].sort().join(',') });
      continue;
    }
    const band = bands.find((b) => e >= b.lo && e < b.hi)!;
    const mid = (band.lo + Math.min(band.hi, 100)) / 2;
    if (Math.abs(e - mid) <= 5 && (perType.get(band.id) ?? 0) < 2 && !nearEdge) {
      perType.set(band.id, (perType.get(band.id) ?? 0) + 1);
      core.push({ id: `${band.id}-${perType.get(band.id)}`, responses, text, baseline: s.investor_type, effective: e, targetVol: s.target_vol, guardrails: [...s.guardrails].sort().join(',') });
    }
  }
  return { core, boundary };
}

// ── Running the perturbations ─────────────────────────────────────────────────

interface Result {
  flipPct: number;
  /** mean |Δ effective_risk| in points — guards against reading "did nothing" as "robust" */
  moveEff: number;
  /** mean |Δ target_vol| in percentage points */
  moveVol: number;
  /** share of runs where the guardrail set differs */
  guardPct: number;
}

function run(
  group: Respondent[],
  iterations: number,
  make: (rng: () => number) => { bank: ItemBank; weights: Weights },
  seed: number,
): Result {
  const rng = mulberry32(seed);
  let flips = 0;
  let total = 0;
  let sumEff = 0;
  let sumVol = 0;
  let guardChanged = 0;
  for (let i = 0; i < iterations; i++) {
    const { bank, weights } = make(rng);
    for (const r of group) {
      total++;
      try {
        const s = scoreWith(r, bank, weights);
        if (s.investor_type !== r.baseline) flips++;
        sumEff += Math.abs(s.effective_risk - r.effective);
        sumVol += Math.abs(s.target_vol - r.targetVol) * 100;
        if ([...s.guardrails].sort().join(',') !== r.guardrails) guardChanged++;
      } catch {
        flips++; // a configuration that cannot classify the respondent counts against it
      }
    }
  }
  return total
    ? { flipPct: (flips / total) * 100, moveEff: sumEff / total, moveVol: sumVol / total, guardPct: (guardChanged / total) * 100 }
    : { flipPct: 0, moveEff: 0, moveVol: 0, guardPct: 0 };
}

// A flip rate of 0 means several very different things, and conflating them would
// be dishonest: the score may have moved and the classification held, or the
// constant may only reach target_vol, or only the guardrails, or nothing at all.
// A constant can also flip the classification without moving the score — the band
// edges do exactly that.
const EPS = 1e-9;
function reading(r: Result, pass: number): string {
  if (r.flipPct >= pass) return r.flipPct > 25 ? `需重新設計（> 25%）` : `介於 ${pass}% 與 25% 之間`;
  if (r.flipPct > 0) return `穩健（< ${pass}%）`;
  if (r.moveEff > EPS) return `穩健（分數有動，分類未變）`;
  if (r.moveVol > EPS) return '只影響 target_vol，不影響分類';
  if (r.guardPct > EPS) return '只影響護欄，不影響分類';
  return '對本樣本完全無作用';
}

async function main() {
  const { core, boundary } = await buildRespondents();
  if (core.length < 10) {
    console.warn(`只找到 ${core.length} 組中點受測者（目標 10）。以下數字以實際組數計算。`);
  }

  console.log(`\n敏感度分析　擾動幅度 ±${PCT * 100}%，每組 ${ITERATIONS} 次`);
  console.log(`主翻轉率樣本：${core.length} 組（各級距中點 ±5 分內），邊界樣本 ${boundary.length} 組另計\n`);
  console.log('受測者分佈：');
  for (const r of core) console.log(`  ${r.id.padEnd(28)} effective_risk ${r.effective.toFixed(1)}`);
  for (const r of boundary) console.log(`  ${r.id.padEnd(28)} effective_risk ${r.effective.toFixed(1)}　(邊界樣本)`);

  const a = run(core, ITERATIONS, (rng) => ({ bank: perturbDeltas(baseBank, rng), weights: baseWeights }), 1);
  const b = run(core, ITERATIONS, (rng) => perturbValuesAndWeights(baseBank, baseWeights, rng), 2);

  console.log(`\n(a)(b) 擾動 ±${PCT * 100}%，各 ${ITERATIONS} 次`);
  console.table([
    { 組: '(a) delta 數值', 門檻: '< 10%', 翻轉率: `${a.flipPct.toFixed(1)}%`, 'Δeffective(分)': a.moveEff.toFixed(2), 'Δtarget_vol(%)': a.moveVol.toFixed(2), 護欄變動: `${a.guardPct.toFixed(1)}%`, 判定: reading(a, 10) },
    { 組: '(b) 選項值與權重', 門檻: '< 20%', 翻轉率: `${b.flipPct.toFixed(1)}%`, 'Δeffective(分)': b.moveEff.toFixed(2), 'Δtarget_vol(%)': b.moveVol.toFixed(2), 護欄變動: `${b.guardPct.toFixed(1)}%`, 判定: reading(b, 20) },
  ]);

  console.log(`\n(c) 結構常數　逐一擾動 ±20%，每個常數 ${ITERATIONS_PER_CONSTANT} 次`);
  const rows = CONSTANTS.map((id, i) => {
    const r = run(core, ITERATIONS_PER_CONSTANT, (rng) => ({ bank: baseBank, weights: perturbConstant(baseWeights, id, rng) }), 100 + i);
    return { 常數: id, 翻轉率: `${r.flipPct.toFixed(1)}%`, 'Δeffective(分)': r.moveEff.toFixed(2), 'Δtarget_vol(%)': r.moveVol.toFixed(2), 護欄變動: `${r.guardPct.toFixed(1)}%`, 判定: reading(r, 25) };
  });
  console.table(rows);

  if (boundary.length) {
    const ba = run(boundary, ITERATIONS, (rng) => ({ bank: perturbDeltas(baseBank, rng), weights: baseWeights }), 3);
    const bb = run(boundary, ITERATIONS, (rng) => perturbValuesAndWeights(baseBank, baseWeights, rng), 4);
    console.log('\n邊界樣本（刻意落在級距切點 ±2 分內，單獨報告，不計入主翻轉率）');
    console.log(`    (a) ${ba.flipPct.toFixed(1)}%　(b) ${bb.flipPct.toFixed(1)}%`);
    console.log('    這兩組本來就站在切點上，任何擾動都會讓它們跨界。把它們併入主數字會灌高翻轉率，');
    console.log('    但完全不報告又會隱藏「切點附近的分類本來就不穩定」這個事實。');
  }

  console.log('\n結論寫法：delta 為序數專家判斷，非實證估計。敏感度分析顯示在 ±20% 擾動下，');
  console.log('分類翻轉率如上，顯示結果主要由回答的相對順序決定，而非特定參數值。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
