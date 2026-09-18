<script setup lang="ts">
import IntroPage from './components/questionnaire/IntroPage.vue';
import StagePage from './components/questionnaire/StagePage.vue';
import MbtiPage from './components/questionnaire/MbtiPage.vue';
import StepNav from './components/questionnaire/StepNav.vue';
import DemoBar from './components/debug/DemoBar.vue';
import { defineAsyncComponent } from 'vue';
// Loaded on demand so the questionnaire does not ship the charting library.
const ReportPage = defineAsyncComponent(() => import('./components/report/ReportPage.vue'));
import { useSurveyStore } from './stores/survey';

const survey = useSurveyStore();
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-800 antialiased">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex h-14 max-w-5xl items-center px-4 sm:px-6">
        <span class="font-semibold text-slate-900">投資人風險畫像</span>
        <span class="ml-2 hidden text-sm text-slate-400 sm:inline">Digital Investor Profiling</span>
      </div>
      <div v-if="survey.step !== 'intro'" class="lg:hidden"><StepNav mode="bar" /></div>
      <DemoBar />
    </header>

    <main class="mx-auto w-full max-w-5xl px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
      <div :class="survey.step === 'intro' ? '' : 'lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10'">
        <aside v-if="survey.step !== 'intro'" class="hidden lg:block">
          <StepNav mode="list" />
        </aside>
        <section class="mx-auto lg:mx-0" :class="survey.step === 'result' ? 'max-w-3xl' : 'max-w-2xl'">
          <IntroPage v-if="survey.step === 'intro'" />
          <StagePage v-else-if="typeof survey.step === 'number'" :key="survey.step" :stage="survey.step" />
          <MbtiPage v-else-if="survey.step === 'mbti'" />
          <ReportPage v-else-if="survey.profile" :profile="survey.profile" />
          <MbtiPage v-else />
        </section>
      </div>
    </main>
  </div>
</template>
