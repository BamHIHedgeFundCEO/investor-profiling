<script setup lang="ts">
withDefaults(
  defineProps<{ canNext: boolean; blockedHint?: string; nextLabel?: string; primary?: boolean }>(),
  { blockedHint: '', nextLabel: '下一步', primary: false },
);
const emit = defineEmits<{ back: []; next: [] }>();
</script>

<template>
  <!-- Sticky on phones so the button is always reachable; inline on larger screens. -->
  <div
    class="sticky bottom-0 -mx-4 mt-8 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
  >
    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        class="rounded-md px-4 py-2.5 text-slate-600 hover:bg-slate-200/60 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
        @click="emit('back')"
      >
        上一步
      </button>
      <div class="flex items-center gap-3">
        <span v-if="!canNext && blockedHint" class="hidden text-sm text-slate-500 sm:inline">{{ blockedHint }}</span>
        <button
          type="button"
          :disabled="!canNext"
          class="rounded-md px-5 py-2.5 font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-300"
          :class="primary ? 'bg-teal-700 hover:bg-teal-800' : 'bg-slate-800 hover:bg-slate-900'"
          @click="emit('next')"
        >
          {{ nextLabel }}
        </button>
      </div>
    </div>
    <p v-if="!canNext && blockedHint" class="mt-1.5 text-right text-xs text-slate-500 sm:hidden">{{ blockedHint }}</p>
  </div>
</template>
