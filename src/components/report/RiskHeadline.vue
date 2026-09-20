<script setup lang="ts">
import { computed } from 'vue';
import type { ScoringLayer } from '../../lib/scoring/types';
import { weights } from '../../lib/scoring/data';
import { EMOTION_ZH, fmtScore, type Narrative } from '../../lib/presentation/narrative';
import { CONSTRUCT_LABELS, alertReasonLabel } from '../../lib/presentation/labels';

const props = defineProps<{ s: ScoringLayer; text: Narrative }>();

const type = computed(() => weights.investor_types.find((t) => t.id === props.s.investor_type)!);
const adjusted = computed(() => Math.round(props.s.baseline_risk) - Math.round(props.s.effective_risk));
const emotionClass = computed(
  () =>
    ({
      calm: 'text-slate-900',
      deviated: 'text-amber-800',
      highly_deviated: 'text-red-800',
    })[props.s.emotional_state.state],
);
</script>

<template>
  <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div class="flex flex-wrap items-end gap-x-8 gap-y-4">
      <div>
        <p class="text-sm font-medium text-slate-500">有效風險分數</p>
        <p class="mt-1 flex items-baseline gap-2">
          <span class="text-6xl leading-none font-semibold tracking-tight text-slate-900 tabular-nums sm:text-7xl">
            {{ fmtScore(s.effective_risk) }}
          </span>
          <span class="text-slate-400">/ 100</span>
        </p>
      </div>
      <div class="pb-1">
        <p class="text-2xl font-semibold text-teal-800 sm:text-3xl">{{ type.zh }}</p>
        <p class="text-sm text-slate-500">{{ type.id }}</p>
      </div>
    </div>

    <p class="mt-5 text-[15px] leading-relaxed whitespace-pre-line text-slate-700 sm:text-base">{{ text.summary }}</p>

    <!-- The three layers of the dynamic profile; baseline and effective are always shown together. -->
    <dl class="mt-6 grid gap-3 sm:grid-cols-3">
      <div class="rounded-lg bg-slate-50 p-4">
        <dt class="text-xs font-medium tracking-wide text-slate-500 uppercase">Baseline Risk · 長期承受度</dt>
        <dd class="mt-1.5 text-2xl font-semibold tabular-nums">{{ fmtScore(s.baseline_risk) }}</dd>
        <dd class="mt-0.5 text-sm text-slate-600">上限來自{{ CONSTRUCT_LABELS[s.binding_constraint] }}</dd>
        <dd v-if="adjusted > 0" class="mt-0.5 text-sm text-slate-500">調整後 −{{ adjusted }} 分</dd>
      </div>
      <div class="rounded-lg bg-slate-50 p-4">
        <dt class="text-xs font-medium tracking-wide text-slate-500 uppercase">Emotional State · 當下情緒</dt>
        <dd class="mt-1.5 text-2xl font-semibold" :class="emotionClass">{{ EMOTION_ZH[s.emotional_state.state] }}</dd>
        <dd class="mt-0.5 text-sm text-slate-600">情緒折價 ×{{ s.emotion_mult.toFixed(2) }}</dd>
      </div>
      <div class="rounded-lg bg-slate-50 p-4">
        <dt class="text-xs font-medium tracking-wide text-slate-500 uppercase">Behavioral Alert · 行為提醒</dt>
        <dd class="mt-1.5 flex items-center gap-1.5 text-2xl font-semibold" :class="s.behavioral_alert ? 'text-amber-800' : 'text-slate-900'">
          <svg v-if="s.behavioral_alert" viewBox="0 0 20 20" class="size-5 shrink-0" aria-hidden="true" fill="currentColor">
            <path d="M10 2 1 18h18L10 2Zm0 5 .01 5.5M10 14.5v.01" stroke="white" stroke-width="1.8" stroke-linecap="round" />
          </svg>
          {{ s.behavioral_alert ? `觸發 ${s.alert_reasons.length} 項` : '未觸發' }}
        </dd>
        <dd v-if="s.behavioral_alert">
          <ul class="mt-1 space-y-0.5 text-sm text-slate-600">
            <li v-for="(r, i) in s.alert_reasons" :key="i">· {{ alertReasonLabel(r) }}</li>
          </ul>
        </dd>
      </div>
    </dl>
    <!-- text.binding and text.lift belong to LiftPanel, which has room for the
         constraint comparison and the lever list the sentence refers to. -->
  </section>
</template>
