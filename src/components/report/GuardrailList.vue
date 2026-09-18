<script setup lang="ts">
import type { ScoringLayer } from '../../lib/scoring/types';
import { guardrails } from '../../lib/scoring/data';
import { SIGNAL_LABELS } from '../../lib/presentation/labels';

defineProps<{ s: ScoringLayer; intro: string }>();

const exemptionNote = (id: string) => guardrails.exemptions.find((x) => x.id === id)?.note ?? id;
</script>

<template>
  <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <h2 class="text-lg font-semibold text-slate-900">幫你守住計畫的建議</h2>
    <p class="mt-1 text-sm leading-relaxed text-slate-500">
      系統會依你的行為特徵，自動加上對應的執行規則（例如下單冷靜期、自動再平衡）。只有在某項偏誤達到「高」時才會出現。
    </p>
    <p
      class="mt-3 text-[15px] leading-relaxed whitespace-pre-line"
      :class="s.guardrail_trace.length ? 'text-slate-700' : 'rounded-lg bg-slate-50 px-4 py-3 text-slate-700'"
    >
      {{ intro }}
    </p>

    <ol v-if="s.guardrail_trace.length" class="mt-4 grid gap-3 sm:grid-cols-2">
      <li v-for="(t, i) in s.guardrail_trace" :key="t.guardrail" class="rounded-lg border border-slate-200 p-4">
        <p class="font-medium text-slate-900">
          <span class="mr-1.5 text-teal-700 tabular-nums">{{ i + 1 }}.</span>{{ guardrails.labels[t.guardrail].title }}
        </p>
        <p class="mt-1 text-sm leading-relaxed text-slate-600">{{ guardrails.labels[t.guardrail].desc }}</p>
        <p class="mt-2 text-xs text-slate-500">
          因為：{{ t.because.map((b) => `${SIGNAL_LABELS[b]}偏高`).join('、') }}
        </p>
      </li>
    </ol>

    <template v-if="!s.guardrail_trace.length">
      <p class="mt-4 text-sm font-medium text-slate-700">一般性的好習慣</p>
      <ul class="mt-2 grid gap-3 sm:grid-cols-3">
        <li v-for="a in guardrails.general_advice" :key="a.title" class="rounded-lg border border-slate-200 p-4">
          <p class="font-medium text-slate-900">{{ a.title }}</p>
          <p class="mt-1 text-sm leading-relaxed text-slate-600">{{ a.desc }}</p>
        </li>
      </ul>
    </template>

    <p v-for="x in s.exemptions_applied" :key="x" class="mt-3 text-xs leading-relaxed text-slate-500">
      已套用例外：{{ exemptionNote(x) }}
    </p>
  </section>
</template>
