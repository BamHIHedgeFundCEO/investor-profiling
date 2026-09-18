<script setup lang="ts">
// Q12 is the one deliberately non-additive term in the whole engine, so it gets the
// one visualization that makes non-additivity visible: the full 4×4 outcome grid.
// Reading across a row shows that trading frequency alone does almost nothing, and
// down a column that a high self-rank alone does little either — only the corner
// scores high. A bar chart of "Q12 contributed +30" could not show that.
import type { InteractionAudit } from '../../lib/audit/explain';

defineProps<{ a: InteractionAudit }>();

const cellClass = (score: number, active: boolean) =>
  [
    active ? 'ring-2 ring-teal-600 font-semibold text-teal-900' : 'text-slate-600',
    score >= 30 ? 'bg-amber-100' : score >= 12 ? 'bg-amber-50' : 'bg-slate-50',
  ].join(' ');
</script>

<template>
  <div class="space-y-3">
    <dl class="grid gap-2 text-sm sm:grid-cols-2">
      <div class="rounded-md bg-slate-50 px-3 py-2">
        <dt class="text-xs text-slate-500">{{ a.rankItem.itemId }}　自評排名</dt>
        <dd class="mt-0.5 text-slate-800">{{ a.rankItem.answer }}<span class="ml-1 text-xs text-slate-400">（代碼 {{ a.rankItem.code }}）</span></dd>
      </div>
      <div class="rounded-md bg-slate-50 px-3 py-2">
        <dt class="text-xs text-slate-500">{{ a.freqItem.itemId }}　交易頻率</dt>
        <dd class="mt-0.5 text-slate-800">{{ a.freqItem.answer }}<span class="ml-1 text-xs text-slate-400">（代碼 {{ a.freqItem.code }}）</span></dd>
      </div>
    </dl>

    <p class="text-sm text-slate-600">
      走到的分支：<span class="font-medium text-slate-900">{{ a.branch }}</span>
    </p>

    <!-- The caption stays outside the scroll container so it wraps at phone width
         instead of being clipped with the table. -->
    <p class="text-xs leading-relaxed text-slate-500">
      表格內是 overconfidence 的加分。橫列＝自評排名，直行＝每月交易次數，框起來的是你的格子。
    </p>
    <div class="overflow-x-auto">
      <table class="min-w-[26rem] border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th class="px-2 py-1 text-left font-normal text-slate-400">自評＼交易</th>
            <th v-for="(f, i) in a.freqLabels" :key="i" class="px-2 py-1 font-normal text-slate-500">{{ f }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in a.grid" :key="ri">
            <th class="px-2 py-1 text-left font-normal whitespace-nowrap text-slate-500">{{ a.rankLabels[ri] }}</th>
            <td v-for="(cell, ci) in row" :key="ci" class="rounded px-2 py-1.5 text-center" :class="cellClass(cell.score, cell.active)">
              +{{ cell.score }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="text-sm text-slate-600">
      結果：overconfidence <span class="font-medium">+{{ a.overconfidence }}</span>、confidence
      <span class="font-medium">+{{ a.confidence }}</span>。
      自評排名另外「線性」加到 confidence——自信是自我評價的高低，過度自信是自我評價與實際行為之間的落差，兩者不是同一件事。
    </p>
  </div>
</template>
