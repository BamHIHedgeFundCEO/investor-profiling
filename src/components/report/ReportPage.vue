<script setup lang="ts">
// Section order is fixed by the spec: headline → radar → contradiction (before any
// advice) → behavior (+ open-text analysis) → guardrails → tone note → export.
import { computed, defineAsyncComponent, ref } from 'vue';
import RiskHeadline from './RiskHeadline.vue';
import RadarChart from './RadarChart.vue';
import LiftPanel from './LiftPanel.vue';
import ContradictionAlert from './ContradictionAlert.vue';
import BiasBars from './BiasBars.vue';
import TextAnalysisPanel from './TextAnalysisPanel.vue';
import GuardrailList from './GuardrailList.vue';
import ExportPanel from './ExportPanel.vue';
import type { ProfileRecord } from '../../lib/scoring/types';
import { weights } from '../../lib/scoring/data';
import { narrative, toneTemplates } from '../../lib/presentation/narrative';
import { voiceFor } from '../../lib/presentation/voice';
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
const voice = computed(() => voiceFor(props.profile.presentation_layer.mbti));
const showAudit = ref(false);
const pairedDemo = computed(() => survey.demoId === 'calm' || survey.demoId === 'panic');
</script>

<template>
  <div class="space-y-5">
    <header>
      <p class="text-sm font-medium text-slate-500">分析結果</p>
      <h1 class="mt-1 text-2xl font-semibold text-slate-900">你的動態風險畫像</h1>
    </header>

    <!-- The MBTI opener. Persona only — every number below it comes from the
         scoring layer and is identical whatever type was entered. -->
    <p v-if="voice" class="border-l-2 border-teal-600 py-0.5 pl-4 text-[15px] leading-relaxed text-slate-700 sm:text-base">
      {{ voice.opener }}
      <span class="mt-1 block text-xs text-slate-400">{{ voice.code }}·{{ voice.label }}</span>
    </p>

    <ScenarioCompare v-if="pairedDemo" />

    <RiskHeadline :s="s" :text="text" />

    <aside v-if="notices.length" class="rounded-lg border border-slate-200 bg-slate-100/70 px-4 py-3 text-sm text-slate-600">
      <p class="font-medium text-slate-700">作答品質提示（不影響分數，但結果可信度可能較低）</p>
      <ul class="mt-1 space-y-0.5">
        <li v-for="n in notices" :key="n">· {{ n }}</li>
      </ul>
    </aside>

    <RadarChart :s="s" />
    <!-- After the contradiction, never before it: the lift panel is advice, and the
         spec puts the capacity/willingness contradiction ahead of any advice. -->
    <ContradictionAlert v-if="text.contradiction" :text="text.contradiction" />
    <LiftPanel :s="s" :text="text" />
    <BiasBars :s="s" />
    <TextAnalysisPanel :s="s" />
    <GuardrailList :s="s" :intro="text.guardrails" />

    <p class="px-1 text-sm text-slate-500">
      說明語氣：{{ toneTemplates.labels[tone] }}
      <template v-if="voice">（依你填的 MBTI {{ voice.code }}·{{ voice.label }}）</template>。
      MBTI 只決定開場白與措辭，上面的分數、投資人分類與每一條護欄，在任何語氣下都完全相同。
    </p>

    <ExportPanel :profile="profile" />

    <SocialPanel v-if="!survey.demoId" />

    <!-- The audit trail is for the demonstration and the marker, not for a respondent:
         it is the engine's working, and showing it to everyone buries the result.
         Reachable only from demo mode, where explaining the machine is the point. -->
    <template v-if="survey.demoId">
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
    </template>

    <div class="flex flex-wrap gap-3 pt-2">
      <button type="button" class="rounded-md px-4 py-2.5 text-slate-600 hover:bg-slate-200/60" @click="survey.goTo('mbti')">
        回到上一步
      </button>
      <button type="button" class="rounded-md bg-slate-800 px-4 py-2.5 text-white hover:bg-slate-900" @click="survey.reset()">
        重新填寫
      </button>
    </div>
  </div>
</template>
