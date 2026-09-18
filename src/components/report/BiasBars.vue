<script setup lang="ts">
import type { BehaviorDim, ScoringLayer, Tier } from '../../lib/scoring/types';
import { weights } from '../../lib/scoring/data';
import { DIM_LABELS, TIER_LABELS } from '../../lib/presentation/labels';

defineProps<{ s: ScoringLayer }>();

interface Row {
  dim: BehaviorDim;
  hint: string;
  protective?: boolean;
}

const GROUPS: { title: string; note: string; rows: Row[] }[] = [
  {
    title: '風險面偏誤',
    note: '計入行為折價（上限 10 分），並觸發對應護欄。',
    rows: [
      { dim: 'anxiety', hint: '市場下跌時的不安程度' },
      { dim: 'loss_aversion', hint: '對虧損的敏感程度高於對獲利' },
      { dim: 'overconfidence', hint: '自信程度與實際行為的落差' },
      { dim: 'herding', hint: '受他人績效或意見影響的程度' },
    ],
  },
  {
    title: '執行面偏誤',
    note: '不影響風險分數，只影響建議的執行機制。',
    rows: [{ dim: 'disposition', hint: '傾向抱住虧損、過早賣出獲利' }],
  },
  {
    title: '保護因子',
    note: '越高越能守住計畫。',
    rows: [{ dim: 'discipline', hint: '面對波動時照原計畫執行', protective: true }],
  },
];

function chipClass(tier: Tier, protective?: boolean) {
  if (tier === 'high' && !protective) return 'bg-amber-100 text-amber-900';
  if (tier === 'high') return 'bg-teal-100 text-teal-900';
  return tier === 'mid' ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-600';
}
</script>

<template>
  <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <h2 class="text-lg font-semibold text-slate-900">行為特徵</h2>
    <p class="mt-1 text-sm text-slate-500">
      以低／中／高三段呈現：這類指標沒有精確到個位數的準確度。展開「依據」可以看到每個判斷來自哪些回答。
    </p>

    <div v-for="g in GROUPS" :key="g.title" class="mt-6">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 class="font-medium text-slate-900">{{ g.title }}</h3>
        <p class="text-xs text-slate-500">{{ g.note }}</p>
      </div>
      <ul class="mt-2 divide-y divide-slate-100">
        <li v-for="r in g.rows" :key="r.dim" class="py-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <span class="font-medium text-slate-800">{{ DIM_LABELS[r.dim] }}</span>
              <span class="ml-2 hidden text-xs text-slate-500 sm:inline">{{ r.hint }}</span>
            </div>
            <span
              class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium"
              :class="chipClass(s.behavior[r.dim].tier, r.protective)"
            >
              <svg
                v-if="s.behavior[r.dim].tier === 'high' && !r.protective"
                viewBox="0 0 20 20"
                class="size-3.5"
                aria-hidden="true"
                fill="currentColor"
              >
                <path d="M10 2 1 18h18L10 2Zm0 5 .01 5.5M10 14.5v.01" stroke="white" stroke-width="2" stroke-linecap="round" />
              </svg>
              {{ TIER_LABELS[s.behavior[r.dim].tier] }}
            </span>
          </div>
          <p class="mt-0.5 text-xs text-slate-500 sm:hidden">{{ r.hint }}</p>

          <!-- Track with the two tier cut points; the fill is deliberately unlabeled. -->
          <div
            class="relative mt-2 h-2 rounded-full bg-slate-100"
            role="img"
            :aria-label="`${DIM_LABELS[r.dim]}：${TIER_LABELS[s.behavior[r.dim].tier]}`"
            :title="`${DIM_LABELS[r.dim]}：${TIER_LABELS[s.behavior[r.dim].tier]}`"
          >
            <div
              class="absolute inset-y-0 left-0 rounded-full"
              :class="r.protective ? 'bg-teal-600' : 'bg-slate-500'"
              :style="{ width: `${Math.max(s.behavior[r.dim].score, 2)}%` }"
            />
            <span class="absolute inset-y-0 w-0.5 bg-white" :style="{ left: `${weights.tiers.mid_min}%` }" />
            <span class="absolute inset-y-0 w-0.5 bg-white" :style="{ left: `${weights.tiers.high_min}%` }" />
          </div>

          <details v-if="s.behavior[r.dim].evidence.length" class="mt-1.5 text-sm">
            <summary class="cursor-pointer text-slate-500 select-none hover:text-slate-700">依據</summary>
            <ul class="mt-1 space-y-0.5 pl-4 text-slate-600">
              <li v-for="(e, i) in s.behavior[r.dim].evidence" :key="i" class="list-disc">{{ e }}</li>
            </ul>
          </details>
        </li>
      </ul>
    </div>
  </section>
</template>
