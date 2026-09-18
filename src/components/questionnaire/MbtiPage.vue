<script setup lang="ts">
import NavBar from './NavBar.vue';
import { useSurveyStore } from '../../stores/survey';
import { MBTI_TYPES, parseMbti } from '../../lib/presentation/tone';

const survey = useSurveyStore();

function onChange(e: Event) {
  survey.mbti = parseMbti((e.target as HTMLSelectElement).value);
}
</script>

<template>
  <div>
    <header class="mb-5">
      <p class="text-sm font-medium text-slate-500">最後一步</p>
      <h1 class="mt-1 text-2xl font-semibold text-slate-900">你的 MBTI（選填）</h1>
      <p class="mt-2 leading-relaxed text-slate-600">
        只用來調整結果頁的說明方式，<strong class="font-medium text-slate-800">不會影響任何分數或建議</strong>。不知道或不想填都沒關係。
      </p>
    </header>

    <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <label for="mbti" class="block font-medium text-slate-900">MBTI 類型</label>
      <p class="mt-1 text-[13px] text-slate-500">如果你測的是 16personalities（例如 INTJ-A），選前四個字母即可。</p>
      <select
        id="mbti"
        :value="survey.mbti ?? ''"
        class="mt-3 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-[15px] focus:border-teal-700 focus:ring-2 focus:ring-teal-600/30 focus:outline-none sm:max-w-xs"
        @change="onChange"
      >
        <option value="">不知道／不填</option>
        <option v-for="t in MBTI_TYPES" :key="t" :value="t">{{ t }}</option>
      </select>
    </div>

    <NavBar
      :can-next="!survey.analyzing"
      primary
      :next-label="survey.analyzing ? '分析中…' : 'Analyze My Profile'"
      @back="survey.back()"
      @next="survey.analyze()"
    />
  </div>
</template>
