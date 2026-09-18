// Load-time validation of the JSON data. Throws with every problem listed at once.

import {
  BEHAVIOR_DIMS,
  type BehaviorDim,
  type GuardrailConfig,
  type ItemBank,
  type Weights,
} from './types';
import { enumerateComposite } from './rules';
import { deriveTheoreticalRange } from './ranges';
import { indexItems } from './util';

const FACET_CONSTRUCTS = new Set(['capacity', 'willingness', 'competence']);
const DIMS = new Set<string>(BEHAVIOR_DIMS);

export function validateItemBank(bank: ItemBank): void {
  const errors: string[] = [];
  const byId = indexItems(bank);
  if (byId.size !== bank.items.length) errors.push('duplicate item_id');

  for (const item of bank.items) {
    const id = item.item_id;

    if (item.type === 'single_choice' || item.type === 'attention_check' || item.type === 'sub_choice') {
      if (item.options.length < 2) errors.push(`${id}: fewer than 2 options`);
      for (const o of item.options) {
        for (const d of Object.keys(o.deltas ?? {})) {
          if (!DIMS.has(d)) errors.push(`${id}: unknown dimension "${d}"`);
        }
      }
    }

    if (item.type === 'single_choice') {
      const facetItem = FACET_CONSTRUCTS.has(item.construct);
      if (facetItem && !item.facet) errors.push(`${id}: ${item.construct} item needs a facet`);
      for (const o of item.options) {
        if (facetItem && (o.value === undefined || o.value < 0 || o.value > 100)) {
          errors.push(`${id}: option "${o.label}" needs a value in [0, 100]`);
        }
        if (!facetItem && o.value !== undefined) errors.push(`${id}: behavior item must not carry value`);
      }
    }

    if (item.type === 'attention_check' && !item.options[item.correct_index]) {
      errors.push(`${id}: correct_index out of range`);
    }

    if (item.type === 'sub_choice') {
      const parent = byId.get(item.parent);
      if (!parent || parent.type !== 'composite' || !parent.sub_items.includes(id)) {
        errors.push(`${id}: parent ${item.parent} does not list it`);
      }
      if (item.options.some((o) => o.value !== undefined || o.deltas)) {
        errors.push(`${id}: sub_choice must not carry value or deltas`);
      }
    }

    if (item.type === 'composite') {
      if (!item.declared_range) {
        errors.push(`${id}: composite requires declared_range`);
        continue;
      }
      if (item.rule === 'knowledgeQuiz' && item.value_by_correct.length !== item.sub_items.length + 1) {
        errors.push(`${id}: value_by_correct needs ${item.sub_items.length + 1} entries`);
      }
      let results;
      try {
        results = enumerateComposite(item, byId);
      } catch (e) {
        errors.push(`${id}: ${(e as Error).message}`);
        continue;
      }
      // Declared range must be exactly what the rule can produce: a wider
      // declaration would silently compress normalized scores.
      const dims = new Set<BehaviorDim>([
        ...(Object.keys(item.declared_range) as BehaviorDim[]),
        ...results.flatMap((r) => Object.keys(r.deltas) as BehaviorDim[]),
      ]);
      for (const d of dims) {
        const vals = results.map((r) => r.deltas[d] ?? 0);
        const actual = [Math.min(...vals), Math.max(...vals)];
        const declared = item.declared_range[d] ?? [0, 0];
        if (actual[0] !== declared[0] || actual[1] !== declared[1]) {
          errors.push(`${id}: declared ${d} [${declared}] but rule produces [${actual}]`);
        }
      }
    }
  }

  if (errors.length === 0) {
    try {
      deriveTheoreticalRange(bank);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (errors.length) throw new Error(`item bank invalid:\n- ${errors.join('\n- ')}`);
}

export function validateConfig(bank: ItemBank, weights: Weights, guardrails: GuardrailConfig): void {
  const errors: string[] = [];
  const facets = new Set(
    bank.items.flatMap((it) => ('facet' in it && it.facet ? [it.facet] : [])),
  );
  for (const group of ['capacity', 'willingness', 'competence'] as const) {
    for (const f of Object.keys(weights[group])) {
      if (!facets.has(f as never)) errors.push(`weights.${group}.${f}: no item provides this facet`);
    }
  }
  const ids = new Set(bank.items.map((i) => i.item_id));
  for (const id of weights.framing_pair) if (!ids.has(id)) errors.push(`framing_pair: unknown item ${id}`);

  const types = weights.investor_types;
  if (types[0]?.lo !== 0 || (types.at(-1)?.hi ?? 0) <= 100) errors.push('investor_types must cover [0, 100]');
  types.slice(1).forEach((t, i) => {
    if (t.lo !== types[i]!.hi) errors.push(`investor_types: gap or overlap at ${t.id}`);
  });

  for (const r of [...guardrails.rules, ...guardrails.exemptions]) {
    if (r.when.length === 0) errors.push(`guardrail ${r.id}: empty condition`);
  }
  for (const r of guardrails.rules) {
    for (const g of r.add) if (!guardrails.labels?.[g]) errors.push(`guardrail ${g}: missing label`);
  }
  if (errors.length) throw new Error(`config invalid:\n- ${errors.join('\n- ')}`);
}
