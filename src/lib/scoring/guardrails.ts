// Guardrail prescriptions: the main product output of the behavioral layer.
// Rules, exemptions and labels live in data/guardrails.json.

import type {
  GuardrailCondition,
  GuardrailConfig,
  GuardrailId,
  GuardrailTrace,
  Signal,
  Tier,
} from './types';

type Signals = Partial<Record<Signal, Tier>>;

const holds = (signals: Signals, conds: GuardrailCondition[]) =>
  conds.every((c) => signals[c.signal] === c.tier);

export interface GuardrailResult {
  ids: GuardrailId[];
  trace: GuardrailTrace[];
  exemptions: string[];
}

export function applyGuardrails(signals: Signals, cfg: GuardrailConfig): GuardrailResult {
  const because = new Map<GuardrailId, Set<Signal>>();
  for (const r of cfg.rules) {
    if (!holds(signals, r.when)) continue;
    for (const g of r.add) {
      const set = because.get(g) ?? new Set<Signal>();
      r.when.forEach((c) => set.add(c.signal));
      because.set(g, set);
    }
  }
  const exemptions: string[] = [];
  for (const x of cfg.exemptions) {
    if (!holds(signals, x.when)) continue;
    exemptions.push(x.id);
    x.remove.forEach((g) => because.delete(g));
  }
  const trace = [...because].map(([guardrail, s]) => ({ guardrail, because: [...s] }));
  return { ids: trace.map((t) => t.guardrail), trace, exemptions };
}
