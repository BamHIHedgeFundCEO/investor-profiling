// Prints the dual-scenario comparison table and checks its claim.
//
//   npm run demo
//
// Every number in README §雙情境 comes from this script's output. None is typed by
// hand, so the README cannot drift from the engine.

import { compareRows, invariantsHold, runScenario, scenarioById, scenarios } from '../src/lib/demo';
import { explain } from '../src/lib/audit/explain';
import { guardrails, itemBank, weights } from '../src/lib/scoring/data';

const fmt = (x: number, digits: number) => (digits === 0 ? (x ? '觸發' : '無') : x.toFixed(digits));
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].reduce((w, c) => w + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)));

async function main() {
  const calm = scenarioById('calm');
  const panic = scenarioById('panic');
  if (!calm || !panic) throw new Error('demo_fixtures.json: calm/panic scenario missing');

  const a = (await runScenario(calm)).scoring_layer;
  const b = (await runScenario(panic)).scoring_layer;

  console.log(`\n雙情境對照（${calm.name} → ${panic.name}）`);
  console.log(`只有 ${panic.differs_in?.join('、')} 不同，Stage 1 與 Stage 3 逐題相同。\n`);
  console.log(pad('', 30) + pad(calm.name, 12) + panic.name);
  for (const r of compareRows(a, b)) {
    const mark = r.invariant ? '  ←不變' : r.a === r.b ? '' : '  ←變動';
    console.log(pad(r.label, 30) + pad(fmt(r.a, r.digits), 12) + pad(fmt(r.b, r.digits), 10) + mark);
  }

  const inv = invariantsHold(a, b);
  console.log(
    inv.ok
      ? '\n✓ 慢變數不變：capacity / willingness / competence_cap / baseline_risk 四項完全相同。'
      : `\n✗ 慢變數竟然改變了：${inv.broken.join(', ')} —— 這是 bug，不是 demo。`,
  );
  console.log(`  護欄：${calm.name} ${a.guardrails.length} 條 → ${panic.name} ${b.guardrails.length} 條`);

  for (const s of scenarios) {
    const p = await runScenario(s);
    const sc = p.scoring_layer;
    console.log(
      `\n[${s.id}] ${s.name}：capacity ${sc.capacity.toFixed(1)} / willingness ${sc.willingness.toFixed(1)} / ` +
        `competence_cap ${sc.competence_cap.toFixed(1)} → baseline ${sc.baseline_risk.toFixed(1)}（受限於 ${sc.binding_constraint}）` +
        `，effective ${sc.effective_risk.toFixed(1)}，${sc.investor_type}，target_vol ${(sc.target_vol * 100).toFixed(1)}%`,
    );
    console.log(`  flags: ${sc.flags.join(', ') || '（無）'}`);
    console.log(`  護欄: ${sc.guardrails.join(', ') || '（無）'}`);
    const audit = explain(itemBank, p.responses, weights, guardrails, sc);
    if (audit.interaction) console.log(`  Q12 走的分支: ${audit.interaction.branch}`);
  }

  if (!inv.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
