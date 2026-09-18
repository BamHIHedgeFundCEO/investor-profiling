<script setup lang="ts">
import { useSurveyStore } from '../../stores/survey';
import { scenarios } from '../../lib/demo';

const survey = useSurveyStore();
</script>

<template>
  <div class="py-2 sm:py-6">
    <p class="text-sm font-medium tracking-wide text-teal-700">Digital Investor Profiling</p>
    <h1 class="mt-2 text-3xl leading-tight font-semibold text-slate-900 sm:text-4xl">了解你的投資風險輪廓</h1>
    <p class="mt-4 max-w-prose text-[17px] leading-relaxed text-slate-600">
      這份問卷從財務條件、面對市場的反應、風險偏好三個面向，產生一份會隨情緒狀態變化的風險畫像，並附上幫助你守住計畫的建議。
    </p>

    <ul class="mt-8 grid gap-3 sm:grid-cols-3">
      <li class="rounded-lg border border-slate-200 bg-white p-4">
        <p class="font-medium text-slate-900">約 8 分鐘</p>
        <p class="mt-1 text-sm text-slate-500">共三個部分，加上一題選填的 MBTI</p>
      </li>
      <li class="rounded-lg border border-slate-200 bg-white p-4">
        <p class="font-medium text-slate-900">沒有標準答案</p>
        <p class="mt-1 text-sm text-slate-500">請選最接近你真實反應的選項</p>
      </li>
      <li class="rounded-lg border border-slate-200 bg-white p-4">
        <p class="font-medium text-slate-900">財務資料不上傳</p>
        <p class="mt-1 text-sm text-slate-500">收入與資產相關答案只在你的瀏覽器中計算</p>
      </li>
    </ul>

    <div class="mt-8 flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="rounded-md bg-teal-700 px-6 py-3 font-medium text-white hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none"
        @click="survey.start()"
      >
        {{ survey.hasProgress ? '繼續上次作答' : '開始填寫' }}
      </button>
      <button
        v-if="survey.hasProgress"
        type="button"
        class="rounded-md px-4 py-3 text-slate-600 hover:bg-slate-200/60"
        @click="survey.reset()"
      >
        清除並重新開始
      </button>
    </div>
    <p class="mt-6 text-xs leading-relaxed text-slate-400">
      本問卷為課程作業，結果僅供參考，不構成投資建議。
    </p>

    <!-- Demo entry. Pre-recorded responses, scored offline: a demonstration must not
         depend on the venue's network or on anyone typing 25 answers live. -->
    <div class="mt-8 border-t border-slate-200 pt-4">
      <p class="text-xs text-slate-400">展示模式（預錄資料，不需填答，離線計算）</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="s in scenarios"
          :key="s.id"
          type="button"
          class="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
          :title="s.desc"
          @click="survey.loadDemo(s.id)"
        >
          {{ s.name }}
        </button>
      </div>
    </div>
  </div>
</template>
