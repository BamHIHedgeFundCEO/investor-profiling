<script setup lang="ts">
import ChoiceQuestion from './ChoiceQuestion.vue';
import { useSurveyStore } from '../../stores/survey';
import type { ChoiceItem, CompositeItem } from '../../lib/scoring/types';
import type { Variant } from './stageMeta';

defineProps<{ composite: CompositeItem; subs: ChoiceItem[]; number: number; variant: Variant }>();
const survey = useSurveyStore();
</script>

<template>
  <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <p class="text-[15px] font-medium text-slate-900 sm:text-base">
      <span class="mr-1.5 text-slate-400 tabular-nums">{{ number }}.</span>{{ composite.prompt }}
    </p>
    <div class="mt-4 space-y-5">
      <ChoiceQuestion
        v-for="(sub, i) in subs"
        :id="sub.item_id"
        :key="sub.item_id"
        :text="`(${String.fromCharCode(97 + i)}) ${sub.text}`"
        :options="sub.options"
        :selected="survey.selected(sub.item_id)"
        :variant="variant"
        embedded
        @select="survey.choose(sub.item_id, $event)"
      />
    </div>
  </div>
</template>
