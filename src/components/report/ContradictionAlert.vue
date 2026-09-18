<script setup lang="ts">
defineProps<{ text: string }>();
</script>

<template>
  <section role="note" class="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-5 sm:p-6">
    <svg viewBox="0 0 20 20" class="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" fill="currentColor">
      <path d="M10 2 1 18h18L10 2Zm0 5 .01 5.5M10 14.5v.01" stroke="white" stroke-width="1.8" stroke-linecap="round" />
    </svg>
    <div>
      <h2 class="font-semibold text-amber-900">財務條件與風險意願不一致</h2>
      <p class="mt-1 leading-relaxed whitespace-pre-line text-amber-950">{{ text }}</p>
    </div>
  </section>
</template>
