<script setup lang="ts">
import { computed } from 'vue';
import type { Variant } from './stageMeta';

const props = defineProps<{
  id: string;
  text: string;
  options: { label: string }[];
  selected?: number;
  number?: number;
  why?: string;
  variant: Variant;
  layout?: 'list' | 'binary';
  embedded?: boolean; // rendered inside a group card
}>();
const emit = defineEmits<{ select: [index: number] }>();

const binary = computed(() => props.layout === 'binary');
const accent = computed(() => props.variant !== 'form');
</script>

<template>
  <fieldset
    :class="
      embedded
        ? ''
        : ['rounded-lg border bg-white p-4 sm:p-5', accent ? 'border-slate-200 shadow-sm' : 'border-slate-300']
    "
  >
    <legend class="contents">
      <span
        class="block text-[15px] leading-relaxed font-medium text-slate-900 sm:text-base"
        :class="variant === 'scenario' && !embedded ? 'border-l-4 border-teal-600 pl-3' : ''"
      >
        <span v-if="number" class="mr-1.5 text-slate-400 tabular-nums">{{ number }}.</span>{{ text }}
      </span>
    </legend>
    <p v-if="why" class="mt-1.5 text-[13px] leading-snug text-slate-500">{{ why }}</p>

    <div class="mt-3 grid gap-2" :class="binary ? 'sm:grid-cols-2' : ''">
      <label
        v-for="(opt, i) in options"
        :key="i"
        class="flex cursor-pointer items-center gap-3 rounded-md border px-3.5 py-3 text-[15px] leading-snug transition-colors has-focus-visible:ring-2 has-focus-visible:ring-teal-600 has-focus-visible:ring-offset-1"
        :class="[
          selected === i
            ? accent
              ? 'border-teal-700 bg-teal-50 text-slate-900'
              : 'border-slate-800 bg-slate-100 text-slate-900'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400',
          binary ? 'sm:min-h-20' : '',
        ]"
      >
        <input
          type="radio"
          class="sr-only"
          :name="id"
          :value="i"
          :checked="selected === i"
          @change="emit('select', i)"
        />
        <span
          aria-hidden="true"
          class="grid size-4 shrink-0 place-items-center rounded-full border"
          :class="selected === i ? (accent ? 'border-teal-700' : 'border-slate-800') : 'border-slate-400'"
        >
          <span v-if="selected === i" class="size-2 rounded-full" :class="accent ? 'bg-teal-700' : 'bg-slate-800'" />
        </span>
        <span>
          <span v-if="binary" class="mr-1.5 font-semibold">{{ i === 0 ? 'A' : 'B' }}</span>{{ opt.label }}
        </span>
      </label>
    </div>
  </fieldset>
</template>
