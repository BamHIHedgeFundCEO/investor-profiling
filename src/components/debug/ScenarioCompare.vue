<script setup lang="ts">
// The dual-scenario table: the same person, the same Stage 1 and Stage 3 answers,
// two different moments. baseline_risk does not move; everything below it does.
// That is the whole claim of a *dynamic* risk profile, and it is checked here
// rather than asserted — invariantsHold() re-reads the numbers actually produced.
import { onMounted, ref } from 'vue';
import { compareRows, invariantsHold, runScenario, scenarioById, type CompareRow } from '../../lib/demo';
import { useSurveyStore } from '../../stores/survey';

const survey = useSurveyStore();
const rows = ref<CompareRow[]>([]);
const names = ref<[string, string]>(['平靜版', '恐慌版']);
const differs = ref<string[]>([]);
const ok = ref(true);
const broken = ref<string[]>([]);
const loading = ref(true);

onMounted(async () => {
  const calm = scenarioById('calm');
  const panic = scenarioById('panic');
  if (!calm || !panic) return;
  names.value = [calm.name, panic.name];
  differs.value = panic.differs_in ?? [];
  const a = (await runScenario(calm)).scoring_layer;
  const b = (await runScenario(panic)).scoring_layer;
  rows.value = compareRows(a, b);
  const inv = invariantsHold(a, b);
  ok.value = inv.ok;
  broken.value = inv.broken;
  loading.value = false;
});

const fmt = (x: number, digits: number) => (digits === 0 ? (x ? '觸發' : '無') : x.toFixed(digits));
</script>

<template>
  <section class="rounded-xl border border-slate-300 bg-white">
    <header class="border-b border-slate-200 px-4 py-3 sm:px-5">
      <h2 class="font-semibold text-slate-900">雙情境對照</h2>
      <p class="mt-1 text-sm leading-relaxed text-slate-500">
        同一位受訪者，兩個時點。Stage 1（財務）與 Stage 3（風險偏好、知識經驗）逐題相同，
        只有 <span class="font-medium text-slate-700">{{ differs.join('、') }}</span> 不同。
      </p>
    </header>

    <div v-if="loading" class="px-4 py-6 text-sm text-slate-500 sm:px-5">計算中…</div>

    <div v-else class="overflow-x-auto px-4 py-4 sm:px-5">
      <table class="min-w-[30rem] w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-xs text-slate-500">
            <th class="py-2 pr-2 text-left font-normal">指標</th>
            <th class="py-2 pr-2 text-right font-normal">{{ names[0] }}</th>
            <th class="py-2 pr-2 text-right font-normal">{{ names[1] }}</th>
            <th class="py-2 text-left font-normal"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.key"
            class="border-b border-slate-100 last:border-b-0"
            :class="r.invariant ? 'bg-slate-50/70' : ''"
          >
            <td class="py-2 pr-2 text-slate-700">{{ r.label }}</td>
            <td class="py-2 pr-2 text-right tabular-nums text-slate-700">{{ fmt(r.a, r.digits) }}</td>
            <td class="py-2 pr-2 text-right font-medium tabular-nums" :class="r.a === r.b ? 'text-slate-700' : 'text-amber-700'">
              {{ fmt(r.b, r.digits) }}
            </td>
            <td class="py-2 text-xs whitespace-nowrap">
              <span v-if="r.invariant" class="text-teal-700">不變</span>
              <span v-else-if="r.a !== r.b" class="text-amber-700">變動</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="ok" class="mt-4 rounded-md bg-teal-50 px-3 py-2 text-sm leading-relaxed text-teal-900">
        慢變數四項完全相同。情緒與行為改變的是 <span class="font-medium">emotion_mult</span> 與
        <span class="font-medium">bias_penalty</span>，不是財務條件或風險偏好——一個人不會因為今天恐慌就變窮，
        但他確實更可能在低點賣掉。
      </p>
      <p v-else class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
        慢變數竟然改變了（{{ broken.join(', ') }}）。這是 bug，不是展示效果。
      </p>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          @click="survey.loadDemo('calm')"
        >
          看 {{ names[0] }} 的完整報告
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          @click="survey.loadDemo('panic')"
        >
          看 {{ names[1] }} 的完整報告
        </button>
      </div>
    </div>
  </section>
</template>
