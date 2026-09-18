<script setup lang="ts">
import { computed } from 'vue';
import { use } from 'echarts/core';
import { RadarChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import VChart from 'vue-echarts';
import 'vue-echarts/style.css';
import type { ScoringLayer } from '../../lib/scoring/types';

use([RadarChart, TooltipComponent, CanvasRenderer]);

const props = defineProps<{ s: ScoringLayer }>();

// Every axis reads "higher = can bear more risk"; the behavioral axis is inverted bias.
const axes = computed(() => [
  { label: '投資期限', value: props.s.facets.horizon },
  { label: '流動性', value: props.s.facets.liquidity },
  { label: '收入穩定', value: props.s.facets.income_stability },
  { label: '風險意願', value: props.s.willingness },
  { label: '知識經驗', value: props.s.competence },
  { label: '行為穩定度', value: 100 - props.s.bias_index },
]);

const INK = '#0f766e';

const option = computed(() => ({
  animationDuration: 400,
  tooltip: {
    trigger: 'item',
    confine: true,
    formatter: () =>
      axes.value.map((a) => `${a.label}<span style="float:right;margin-left:16px;font-weight:600">${Math.round(a.value)}</span>`).join('<br/>'),
  },
  radar: {
    indicator: axes.value.map((a) => ({ name: a.label, max: 100, min: 0 })),
    radius: '66%',
    splitNumber: 4,
    axisName: { color: '#475569', fontSize: 12 },
    splitLine: { lineStyle: { color: '#e2e8f0' } },
    splitArea: { show: false },
    axisLine: { lineStyle: { color: '#e2e8f0' } },
  },
  series: [
    {
      type: 'radar',
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { width: 2, color: INK },
      itemStyle: { color: INK, borderColor: '#fff', borderWidth: 2 },
      areaStyle: { color: 'rgba(15, 118, 110, 0.12)' },
      data: [{ name: '你的畫像', value: axes.value.map((a) => Math.round(a.value)) }],
    },
  ],
}));
</script>

<template>
  <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <h2 class="text-lg font-semibold text-slate-900">風險承受輪廓</h2>
    <p class="mt-1 text-sm text-slate-500">六個面向都是「越外圈，越能承擔風險」。</p>
    <div class="mx-auto mt-2 h-72 max-w-md sm:h-80">
      <VChart :option="option" autoresize aria-label="六軸雷達圖：投資期限、流動性、收入穩定、風險意願、知識經驗、行為穩定度" />
    </div>
    <!-- Table view of the same values -->
    <dl class="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
      <div v-for="a in axes" :key="a.label" class="flex justify-between border-b border-slate-100 py-1">
        <dt class="text-slate-600">{{ a.label }}</dt>
        <dd class="font-medium text-slate-900 tabular-nums">{{ Math.round(a.value) }}</dd>
      </div>
    </dl>
  </section>
</template>
