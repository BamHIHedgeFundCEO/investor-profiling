<script setup lang="ts">
// The social layer, shown AFTER the result. Asking about hobbies mid-questionnaire
// breaks the context and raises drop-off; after the result it reads as an invitation.
//
// Multi-select, unordered, unweighted — it genuinely does not count towards
// anything, so it must not be dressed up to look like it does.
import { computed, ref } from 'vue';
import interestsData from '../../data/interests.json';
import { useSurveyStore } from '../../stores/survey';
import type { ContactPref } from '../../lib/scoring/types';

const data = interestsData as {
  interests: { id: string; label: string }[];
  contact_prefs: { id: string; label: string }[];
};

const survey = useSurveyStore();
const picked = ref<string[]>([]);
const pref = ref<ContactPref | null>(null);
const state = ref<'editing' | 'sending' | 'done'>('editing');
const outcome = ref<string>('');

const toggle = (id: string) => {
  picked.value = picked.value.includes(id) ? picked.value.filter((x) => x !== id) : [...picked.value, id];
};

const canSubmit = computed(() => state.value === 'editing');

// Pressing 送出 IS the consent — there is no separate checkbox to tick. The line
// above the button says what gets sent, so the click is still informed; 不用，謝謝
// sends nothing at all.
async function submit() {
  state.value = 'sending';
  const result = await survey.submitSocial({
    interests: picked.value,
    contact_pref: pref.value ?? undefined,
    consent_matching: true,
    consent_research: true,
  });
  outcome.value =
    result === 'saved' ? '已送出，謝謝。'
    : result === 'not_configured' ? '已記錄在本機（目前未設定資料庫）。'
    : result === 'failed' ? '網路沒通，資料沒有送出——不影響你上面的結果。'
    : '沒有送出任何資料。';
  state.value = 'done';
}

function decline() {
  survey.declineSocial();
  outcome.value = '好的，沒有上傳任何資料。';
  state.value = 'done';
}
</script>

<template>
  <section class="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <h2 class="font-semibold text-slate-900">最後，一個與評估無關的邀請</h2>
    <p class="mt-1 text-sm leading-relaxed text-slate-500">
      以下資料<span class="font-medium text-slate-700">不影響你的風險評估結果</span>，
      上面的分數、投資人分類與行為護欄都已經算完了，不會因為這一段而改變。全部選填。
    </p>

    <template v-if="state !== 'done'">
      <fieldset class="mt-5">
        <legend class="text-sm font-medium text-slate-800">你平常從事哪些活動？（可複選）</legend>
        <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label
            v-for="i in data.interests"
            :key="i.id"
            class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
            :class="picked.includes(i.id) ? 'border-teal-600 bg-teal-50 text-teal-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
          >
            <input type="checkbox" class="accent-teal-700" :checked="picked.includes(i.id)" @change="toggle(i.id)" />
            <span>{{ i.label }}</span>
          </label>
        </div>
      </fieldset>

      <fieldset class="mt-5">
        <legend class="text-sm font-medium text-slate-800">你希望的互動方式？</legend>
        <div class="mt-2 flex flex-wrap gap-2">
          <label
            v-for="p in data.contact_prefs"
            :key="p.id"
            class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
            :class="pref === p.id ? 'border-teal-600 bg-teal-50 text-teal-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
          >
            <input type="radio" name="contact-pref" class="accent-teal-700" :value="p.id" @change="pref = p.id as ContactPref" />
            <span>{{ p.label }}</span>
          </label>
        </div>
      </fieldset>

      <div class="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="rounded-md bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          :disabled="!canSubmit"
          @click="submit"
        >
          {{ state === 'sending' ? '送出中…' : '送出' }}
        </button>
        <button type="button" class="rounded-md px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-100" @click="decline">
          不用，謝謝
        </button>
      </div>
    </template>

    <p v-else class="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{{ outcome }}</p>
  </section>
</template>
