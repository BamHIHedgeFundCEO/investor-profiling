<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ProfileRecord } from '../../lib/scoring/types';
import { download, toCsv } from '../../lib/presentation/export';

const props = defineProps<{ profile: ProfileRecord }>();

const json = computed(() => JSON.stringify(props.profile, null, 2));
const stamp = computed(() => props.profile.timestamp.replace(/[:.]/g, '-').slice(0, 19));
const copied = ref(false);

async function copy() {
  try {
    await navigator.clipboard.writeText(json.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // clipboard unavailable; the JSON below stays selectable
  }
}
</script>

<template>
  <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <h2 class="text-lg font-semibold text-slate-900">匯出結果</h2>
    <p class="mt-1 text-sm text-slate-500">
      包含逐題作答、計分結果與說明語氣，可留存或提供給下一步的資產配置使用。
    </p>
    <div class="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
        @click="download(`investor-profile-${stamp}.json`, json, 'application/json')"
      >
        下載 JSON
      </button>
      <button
        type="button"
        class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        @click="download(`investor-profile-${stamp}.csv`, toCsv(profile), 'text/csv;charset=utf-8')"
      >
        下載 CSV
      </button>
      <button type="button" class="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50" @click="copy">
        {{ copied ? '已複製' : '複製 JSON' }}
      </button>
    </div>
  </section>
</template>
