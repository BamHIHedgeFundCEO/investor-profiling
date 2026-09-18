<script setup lang="ts">
import { computed } from 'vue';
import { useSurveyStore } from '../../stores/survey';
import { SOFT_HINT_BELOW } from '../../lib/analyzer/quality';
import { TARGET_LABELS, formatDrop } from '../../lib/presentation/labels';
import type { OpenTextItem } from '../../lib/scoring/types';

const props = defineProps<{ item: OpenTextItem; number: number }>();
const survey = useSurveyStore();

const id = computed(() => props.item.item_id as 'Q13' | 'Q14');
const answer = computed(() => survey.openAnswer(id.value));
const target = computed(() => survey.openAnswer('Q13').target);
const drop = computed(() => props.item.drop_by_target?.[target.value]);
// Q14 wording comes from the item bank: {target} and {drop} are filled from Q13's choice.
const promptParts = computed(() =>
  props.item.text.replace('{target}', TARGET_LABELS[target.value]).split('{drop}'),
);
const length = computed(() => [...answer.value.text.trim()].length);

function onInput(e: Event) {
  survey.setText(id.value, (e.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <label
      :for="`text-${id}`"
      class="block border-l-4 border-teal-600 pl-3 text-[15px] leading-relaxed font-medium text-slate-900 sm:text-base"
    >
      <span class="mr-1.5 text-slate-400 tabular-nums">{{ number }}.</span>
      <template v-for="(part, i) in promptParts" :key="i">
        <strong v-if="i > 0 && drop !== undefined" class="text-teal-800">{{ formatDrop(drop) }}</strong>{{ part }}
      </template>
    </label>

    <div v-if="item.targets" class="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="選擇標的">
      <label
        v-for="t in item.targets"
        :key="t"
        class="cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-teal-600"
        :class="target === t ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 text-slate-700 hover:border-slate-500'"
      >
        <input type="radio" class="sr-only" name="q13-target" :checked="target === t" @change="survey.setTarget(t)" />
        {{ TARGET_LABELS[t] }}
      </label>
    </div>

    <p v-if="item.hint" class="mt-3 text-[13px] leading-snug text-slate-500">{{ item.hint }}</p>

    <textarea
      :id="`text-${id}`"
      :value="answer.text"
      rows="5"
      class="mt-3 block w-full resize-y rounded-md border border-slate-300 px-3 py-2.5 text-[15px] leading-relaxed placeholder:text-slate-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-600/30 focus:outline-none"
      placeholder="寫下你的想法（選填）"
      @input="onInput"
    />
    <div class="mt-1.5 flex items-start justify-between gap-4 text-[13px]">
      <p v-if="length < SOFT_HINT_BELOW" class="text-slate-400">
        多寫幾句的話，分析會準一些。例如：你是從哪裡形成這個看法的。
      </p>
      <span v-else />
      <span class="shrink-0 text-slate-400 tabular-nums">{{ length }} 字</span>
    </div>
  </div>
</template>
