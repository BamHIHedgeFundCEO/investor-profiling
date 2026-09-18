<script setup lang="ts">
// Section order is fixed by the spec: headline → radar → contradiction (before any
// advice) → behavior (+ open-text analysis) → guardrails → tone note → export.
import { computed, defineAsyncComponent, ref } from 'vue';
import RiskHeadline from './RiskHeadline.vue';
import RadarChart from './RadarChart.vue';
import ContradictionAlert from './ContradictionAlert.vue';
import BiasBars from './BiasBars.vue';
import TextAnalysisPanel from './TextAnalysisPanel.vue';
import GuardrailList from './GuardrailList.vue';
import ExportPanel from './ExportPanel.vue';
import type { ProfileRecord } from '../../lib/scoring/types';
import { weights } from '../../lib/scoring/data';
import { narrative, toneTemplates } from '../../lib/presentation/narrative';
import { QUALITY_NOTICES } from '../../lib/presentation/labels';
import { useSurveyStore } from '../../stores/survey';

// Debug views are loaded only when opened: they are for the audit trail and the
// demonstration, not part of what a respondent needs.
const AuditPanel = defineAsyncComponent(() => import('../debug/AuditPanel.vue'));
const ScenarioCompare = defineAsyncComponent(() => import('../debug/ScenarioCompare.vue'));
// The social layer comes after the result, so it is also loaded after it.
const SocialPanel = defineAsyncComponent(() => import('../social/SocialPanel.vue'));

const props = defineProps<{ profile: ProfileRecord }>();
const survey = useSurveyStore();

const s = computed(() => props.profile.scoring_layer);
const tone = computed(() => props.profile.presentation_layer.tone);
const text = computed(() => narrative(s.value, tone.value, weights));
const notices = computed(() => s.value.flags.flatMap((f) => (QUALITY_NOTICES[f] ? [QUALITY_NOTICES[f]] : [])));
const showAudit = ref(false);
const pairedDemo = computed(() => survey.demoId === 'calm' || survey.demoId === 'panic');
</script>

<template>
  <div class="space-y-5">
    <header>
      <p class="text-sm font-medium text-slate-500">分析結果</p>
      <h1 class="mt-1 text-2xl font-semibold text-slate-900">你的動態風險畫像</h1>
    </header>

    <ScenarioCompare v-if="pairedDemo" />

    <RiskHeadline :s="s" :text="text" />

    <aside v-if="notices.length" class="rounded-lg border border-slate-200 bg-slate-100/70 px-4 py-3 text-sm text-slate-600">
      <p class="font-medium text-slate-700">作答品質提示（不影響分數，但結果可信度可能較低）</p>
      <ul class="mt-1 space-y-0.5">
        <li v-for="n in notices" :key="n">· {{ n }}</li>
      </ul>
    </aside>

    <RadarChart :s="s" />
    <ContradictionAlert v-if="text.contradiction" :text="text.contradiction" />
    <BiasBars :s="s" />
    <TextAnalysisPanel :s="s" />
    <GuardrailList :s="s" :intro="text.guardrails" />

    <p class="px-1 text-sm text-slate-500">
      說明語氣：{{ toneTemplates.labels[tone] }}
      <template v-if="profile.presentation_layer.mbti">（依你填的 MBTI {{ profile.presentation_layer.mbti }}）</template>。
      語氣只改變措辭，分數與建議在任何語氣下都完全相同。
    </p>

    <ExportPanel :profile="profile" />

    <SocialPanel v-if="!survey.demoId" />

    <div>
      <button
        type="button"
        class="text-sm text-slate-500 underline underline-offset-2 hover:text-slate-800"
        :aria-expanded="showAudit"
        @click="showAudit = !showAudit"
      >
        {{ showAudit ? '收起稽核面板' : '打開稽核面板：看每個分數怎麼來的' }}
      </button>
    </div>
    <AuditPanel v-if="showAudit" :profile="profile" />

    <div class="flex flex-wrap gap-3 pt-2">
      <button type="button" class="rounded-md px-4 py-2.5 text-slate-600 hover:bg-slate-200/60" @click="survey.goTo('mbti')">
        回到上一步
      </button>
      <button type="button" class="rounded-md bg-slate-800 px-4 py-2.5 text-white hover:bg-slate-900" @click="survey.reset()">
        重新填寫
      </button>
    </div>
    <p class="px-1 text-xs text-slate-400">本結果為課程作業的示範，僅供參考，不構成投資建議。</p>
  </div>
</template>
