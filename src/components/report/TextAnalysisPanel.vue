<script setup lang="ts">
import { computed } from 'vue';
import type { DimScore, ScoringLayer, Tier } from '../../lib/scoring/types';
import { weights } from '../../lib/scoring/data';
import { tierOf } from '../../lib/scoring/util';
import { ANALYZER_LABELS, REASONING_LABELS, TIER_LABELS } from '../../lib/presentation/labels';

const props = defineProps<{ s: ScoringLayer }>();
const t = computed(() => props.s.text_analysis);
const tier = (n: number): Tier => tierOf(n, weights.tiers);

// Rows compare the choice-question reading with the text reading of the same trait.
const blended = computed(() =>
  t.value
    ? [
        {
          label: '過度自信',
          option: tier(t.value.option_scores.overconfidence),
          text: t.value.overconfidence,
          applied: t.value.applied.overconfidence,
        },
        {
          label: '從眾',
          option: tier(t.value.option_scores.herding),
          text: t.value.herding,
          applied: t.value.applied.herding,
        },
      ]
    : [],
);
const sentiment = computed(() =>
  t.value
    ? [
        { label: '焦慮', option: props.s.behavior.anxiety.tier, text: t.value.sentiment.anxiety },
        { label: '損失趨避', option: props.s.behavior.loss_aversion.tier, text: t.value.sentiment.loss_aversion },
        { label: '自信', option: props.s.behavior.confidence.tier, text: t.value.sentiment.confidence },
      ]
    : [],
);

const textTier = (d: DimScore) => (d.evidence.length ? TIER_LABELS[d.tier] : '無明顯訊號');
const differs = (option: Tier, d: DimScore) => d.evidence.length > 0 && option !== d.tier;

// Why a text reading was left out of the score. Said plainly, because a
// respondent who disagrees with a verdict deserves to know it wasn't counted.
const withheld = (r: { text: DimScore; applied: boolean }): string | null => {
  if (r.applied) return null;
  return r.text.evidence.length === 0
    ? '文字裡沒有足夠訊號，這一項完全以選擇題計分。'
    : '文字太短，判斷「有沒有講出理由」並不可靠，這一項完全以選擇題計分。';
};
</script>

<template>
  <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <h2 class="text-lg font-semibold text-slate-900">開放式回答分析</h2>

    <p v-if="!t" class="mt-2 text-[15px] leading-relaxed text-slate-600">
      開放式問題沒有填寫，或內容較難分析，本次只以選擇題計分。選擇題已涵蓋所有行為指標，結果仍然完整。
    </p>

    <template v-else>
      <p class="mt-1 text-sm text-slate-500">
        分析方式：{{ ANALYZER_LABELS[t.analyzer] }}。本系統不評斷你看多或看空，只看論證的結構。
      </p>

      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <div class="rounded-lg bg-slate-50 p-4">
          <p class="text-xs font-medium text-slate-500">你的論證方式</p>
          <p class="mt-1 text-lg font-semibold text-slate-900">{{ REASONING_LABELS[t.reasoning_mode].title }}</p>
          <p class="text-sm text-slate-600">{{ REASONING_LABELS[t.reasoning_mode].desc }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 p-4">
          <p class="text-xs font-medium text-slate-500">面對大跌時的想法調整</p>
          <p class="mt-1 text-lg font-semibold text-slate-900">
            {{ t.belief_rigidity.tier === 'high' ? '較不會重新評估' : t.belief_rigidity.tier === 'mid' ? '部分調整' : '願意重新檢視' }}
          </p>
          <p class="text-sm text-slate-600">信念僵固程度：{{ TIER_LABELS[t.belief_rigidity.tier] }}</p>
        </div>
      </div>

      <h3 class="mt-6 font-medium text-slate-900">選擇題與文字的交叉比對</h3>
      <p class="mt-0.5 text-xs text-slate-500">
        以下兩項，文字分析最多占 {{ Math.round(t.text_weight * 100) }}%，而且必須引用得出你的原文才會採計。兩種方法差距過大時，會列入行為提醒。
      </p>
      <ul class="mt-2 divide-y divide-slate-100">
        <li v-for="r in blended" :key="r.label" class="py-3">
          <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span class="w-16 font-medium text-slate-800">{{ r.label }}</span>
            <span class="text-sm text-slate-600">選擇題 <b class="font-semibold text-slate-900">{{ TIER_LABELS[r.option] }}</b></span>
            <span class="text-sm text-slate-600">
              文字
              <b
                class="font-semibold"
                :class="!r.applied ? 'font-normal text-slate-400' : differs(r.option, r.text) ? 'text-amber-800' : 'text-slate-900'"
                >{{ textTier(r.text) }}</b
              >
              <span v-if="!r.applied" class="text-slate-400">（未採計）</span>
            </span>
          </div>
          <p v-if="withheld(r)" class="mt-1 text-sm leading-relaxed text-slate-500">{{ withheld(r) }}</p>
          <p v-for="q in r.text.evidence" :key="q" class="mt-1 text-sm leading-relaxed text-slate-600">「{{ q }}」</p>
        </li>
      </ul>

      <h3 class="mt-6 font-medium text-slate-900">文字中的情緒訊號</h3>
      <p class="mt-0.5 text-xs text-slate-500">
        僅供對照，不計分：文字裡的情緒容易被假設語氣（例如「如果崩盤我會很怕」）影響，這些指標以選擇題為準。
      </p>
      <ul class="mt-2 divide-y divide-slate-100">
        <li v-for="r in sentiment" :key="r.label" class="py-3">
          <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span class="w-16 font-medium text-slate-800">{{ r.label }}</span>
            <span class="text-sm text-slate-600">選擇題（計分） <b class="font-semibold text-slate-900">{{ TIER_LABELS[r.option] }}</b></span>
            <span class="text-sm text-slate-600">
              文字（對照）
              <b class="font-semibold" :class="r.text.evidence.length ? 'text-slate-900' : 'font-normal text-slate-400'">{{ textTier(r.text) }}</b>
            </span>
          </div>
          <p v-for="q in r.text.evidence" :key="q" class="mt-1 text-sm leading-relaxed text-slate-600">「{{ q }}」</p>
        </li>
      </ul>
    </template>
  </section>
</template>
