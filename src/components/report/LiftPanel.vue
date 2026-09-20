<script setup lang="ts">
// What is holding the score down and what would move it. The sentence names one
// lever and quotes only what that lever delivers; the list below it shows the
// rest, each with its own figure, so nothing sums to a promise no single change
// can keep. See lib/presentation/headroom.ts.
import { computed } from 'vue';
import type { ScoringLayer } from '../../lib/scoring/types';
import type { Narrative } from '../../lib/presentation/narrative';
import { CONSTRUCT_LABELS } from '../../lib/presentation/labels';

const props = defineProps<{ s: ScoringLayer; text: Narrative }>();

const plan = computed(() => props.text.plan);
const others = computed(() => plan.value.levers.slice(1));
// Only meaningful where a lever was named: preference and immaterial headroom
// both end the discussion, and a bar chart under them would contradict the words.
const showLevers = computed(() => plan.value.levers.length > 0 && plan.value.material);
const widest = computed(() => Math.max(...plan.value.levers.map((l) => l.gain), 1));
const pct = (g: number) => `${Math.max(6, Math.round((g / widest.value) * 100))}%`;
const KIND_NOTE = { action: '現在就能做', time: '只能靠時間', fixed: '' } as const;
</script>

<template>
  <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <h2 class="text-lg font-semibold text-slate-900">是什麼卡住你</h2>

    <p class="mt-3 text-[15px] leading-relaxed whitespace-pre-line text-slate-700 sm:text-base">
      {{ text.binding }}
    </p>

    <!-- The three constraints side by side: min() is the whole story, so showing
         only the lowest one hides why it is the lowest. -->
    <dl class="mt-4 grid gap-2 sm:grid-cols-3">
      <div
        v-for="c in (['capacity', 'willingness', 'competence'] as const)"
        :key="c"
        class="rounded-lg px-3.5 py-2.5"
        :class="plan.binding === c ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-slate-50'"
      >
        <dt class="text-xs text-slate-500">{{ CONSTRUCT_LABELS[c] }}</dt>
        <dd class="mt-0.5 flex items-baseline gap-1.5">
          <span class="text-xl font-semibold tabular-nums text-slate-900">
            {{ Math.round(c === 'competence' ? s.competence_cap : s[c]) }}
          </span>
          <span v-if="plan.binding === c" class="text-xs font-medium text-amber-800">← 由它決定</span>
        </dd>
      </div>
    </dl>

    <p class="mt-4 rounded-lg border border-slate-200 px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-slate-700">
      {{ text.lift }}
    </p>

    <template v-if="showLevers && others.length">
      <h3 class="mt-5 text-sm font-medium text-slate-700">其他可以動的項目</h3>
      <p class="mt-1 text-xs text-slate-500">
        每一項標的是它<strong>單獨</strong>能讓上限提高的分數，不是把它們加起來的總和。
      </p>
      <ul class="mt-2.5 space-y-2">
        <li v-for="l in others" :key="l.facet" class="text-sm">
          <div class="flex flex-wrap items-baseline justify-between gap-x-3">
            <span class="font-medium text-slate-800">
              {{ l.label }}
              <span class="ml-1 text-xs font-normal text-slate-500">{{ KIND_NOTE[l.kind] }}</span>
            </span>
            <span class="tabular-nums text-slate-600">+{{ l.gain.toFixed(1) }} 分</span>
          </div>
          <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full bg-teal-600/70" :style="{ width: pct(l.gain) }" />
          </div>
          <p class="mt-1 text-slate-600">{{ l.action }}</p>
        </li>
      </ul>
    </template>

    <p v-if="plan.capped && showLevers" class="mt-4 text-xs leading-relaxed text-slate-500">
      把上面每一項都補到滿，上限最多提高 {{ Math.round(plan.reachable) }} 分——仍然到不了第二個限制（還差
      {{ Math.round(plan.headroom - plan.reachable) }} 分）。剩下的距離來自年齡、收入型態這類不該為了投資而改變的項目。
    </p>
  </section>
</template>
