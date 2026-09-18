<script setup lang="ts">
import { useSurveyStore } from '../../stores/survey';
import { scenarios } from '../../lib/demo';

const survey = useSurveyStore();

// Cover content only. Nothing here is read by scoring.
const parts = [
  { n: '1', title: '財務狀況', desc: '這筆錢是什麼錢、你的收入與負擔' },
  { n: '2', title: '情境與想法', desc: '市場下跌、朋友賺錢時，你實際會怎麼做' },
  { n: '3', title: '風險偏好與經驗', desc: '你能接受的波動範圍，以及走過的市場' },
];

const outputs = [
  '一個 0–100 的有效風險分數，和對應的投資人類型',
  '七項行為特徵的雷達圖：焦慮、損失趨避、過度自信、從眾、紀律、信心、處分效應',
  '針對你的執行護欄——在你最想違背計畫的時候，擋住你的規則',
];
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
        <p class="font-medium text-slate-900">結果會隨情緒變動</p>
        <p class="mt-1 text-sm text-slate-500">同樣的財務條件，心情不同，能承受的風險就不同</p>
      </li>
    </ul>

    <!-- What the three parts are. Knowing the shape of the questionnaire up front
         reduces drop-off more than any reassurance sentence does. -->
    <section class="mt-10">
      <h2 class="text-sm font-medium tracking-wide text-slate-500">問卷包含三個部分</h2>
      <ol class="mt-3 grid gap-3 sm:grid-cols-3">
        <li v-for="p in parts" :key="p.n" class="rounded-lg bg-white p-4 ring-1 ring-slate-200/70">
          <span class="inline-flex size-6 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">
            {{ p.n }}
          </span>
          <p class="mt-2 font-medium text-slate-900">{{ p.title }}</p>
          <p class="mt-1 text-sm leading-relaxed text-slate-500">{{ p.desc }}</p>
        </li>
      </ol>
    </section>

    <section class="mt-8 rounded-xl border border-slate-200 bg-white p-5">
      <h2 class="font-medium text-slate-900">填完你會拿到</h2>
      <ul class="mt-3 space-y-2">
        <li v-for="o in outputs" :key="o" class="flex gap-2.5 text-sm leading-relaxed text-slate-600">
          <svg viewBox="0 0 20 20" class="mt-0.5 size-4 shrink-0 text-teal-700" fill="currentColor" aria-hidden="true">
            <path d="M8.1 14.3 4 10.2l1.4-1.4 2.7 2.6 6.5-6.5L16 6.3z" />
          </svg>
          <span>{{ o }}</span>
        </li>
      </ul>
    </section>

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
    <p class="mt-6 text-xs leading-relaxed text-slate-400">結果僅供參考，不構成投資建議。</p>

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
