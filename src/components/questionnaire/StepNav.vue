<script setup lang="ts">
import { computed } from 'vue';
import { STEPS, useSurveyStore } from '../../stores/survey';
import { STEP_LABELS } from './stageMeta';

defineProps<{ mode: 'bar' | 'list' }>();
const survey = useSurveyStore();
const current = computed(() => STEPS.indexOf(survey.step));
// The page being filled counts as reached, so part 1 already shows progress.
const progress = computed(() => current.value / (STEPS.length - 1));
</script>

<template>
  <!-- Phones and tablets: thin progress bar under the header -->
  <div v-if="mode === 'bar'" aria-hidden="true">
    <div class="h-1 bg-slate-200">
      <div class="h-1 bg-teal-700 transition-[width] duration-300" :style="{ width: `${progress * 100}%` }" />
    </div>
  </div>

  <!-- Desktop: sticky step list -->
  <nav v-else class="sticky top-8" aria-label="問卷進度">
    <ol class="space-y-1">
      <li v-for="(s, i) in STEPS" :key="String(s)">
        <button
          type="button"
          :disabled="i > current || survey.step === 'result'"
          class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors disabled:cursor-default"
          :class="
            i === current
              ? 'bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200'
              : i < current
                ? 'text-slate-600 hover:bg-white'
                : 'text-slate-400'
          "
          :aria-current="i === current ? 'step' : undefined"
          @click="survey.goTo(s)"
        >
          <span
            class="grid size-6 shrink-0 place-items-center rounded-full text-xs tabular-nums"
            :class="i < current ? 'bg-teal-700 text-white' : i === current ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-500'"
          >
            {{ i < current ? '✓' : i }}
          </span>
          {{ STEP_LABELS[i] }}
        </button>
      </li>
    </ol>
  </nav>
</template>
