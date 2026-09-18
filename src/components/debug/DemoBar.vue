<script setup lang="ts">
// Demo-mode banner. Visible only while a pre-recorded scenario is loaded, so a real
// respondent never sees it and a demo is never mistaken for someone's own result.
import { scenarios } from '../../lib/demo';
import { useSurveyStore } from '../../stores/survey';

const survey = useSurveyStore();
</script>

<template>
  <div v-if="survey.demoId" class="border-b border-amber-300 bg-amber-50">
    <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm sm:px-6">
      <span class="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">展示模式</span>
      <span class="text-amber-900">
        預錄資料，離線計算（規則式分析器），結果每次完全相同。
      </span>
      <div class="ml-auto flex flex-wrap items-center gap-1.5">
        <button
          v-for="s in scenarios"
          :key="s.id"
          type="button"
          class="rounded px-2 py-1 text-xs"
          :class="survey.demoId === s.id ? 'bg-amber-700 text-white' : 'text-amber-900 hover:bg-amber-100'"
          @click="survey.loadDemo(s.id)"
        >
          {{ s.name }}
        </button>
        <button type="button" class="rounded px-2 py-1 text-xs text-amber-900 underline hover:bg-amber-100" @click="survey.exitDemo()">
          離開展示
        </button>
      </div>
    </div>
  </div>
</template>
