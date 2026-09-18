<script setup lang="ts">
// The audit trail. Every number on the report page can be opened here and traced
// back to the items that produced it, the weight each carried, and the rule that
// was taken. Nothing here is recomputed by hand: it all comes from explain(),
// which reads the same pure functions compose() uses.
import { computed, ref } from 'vue';
import InteractionGrid from './InteractionGrid.vue';
import { explain } from '../../lib/audit/explain';
import { guardrails, itemBank, weights } from '../../lib/scoring/data';
import { CONSTRUCT_LABELS, DIM_LABELS, SIGNAL_LABELS, TIER_LABELS } from '../../lib/presentation/labels';
import type { ProfileRecord, Signal } from '../../lib/scoring/types';

const props = defineProps<{ profile: ProfileRecord }>();

const audit = computed(() =>
  explain(itemBank, props.profile.responses, weights, guardrails, props.profile.scoring_layer),
);
const s = computed(() => props.profile.scoring_layer);

const open = ref<Set<string>>(new Set(['constructs']));
const toggle = (k: string) => (open.value.has(k) ? open.value.delete(k) : open.value.add(k), (open.value = new Set(open.value)));
const isOpen = (k: string) => open.value.has(k);

const n = (x: number, d = 1) => x.toFixed(d);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const signalLabel = (x: string) => SIGNAL_LABELS[x as Signal] ?? x;

const SECTIONS = [
  { key: 'constructs', title: '1. 三個構念怎麼算出來的', hint: '加權平均，權重來自 weights.json' },
  { key: 'baseline', title: '2. baseline_risk 取最小值', hint: '不是平均——矛盾要被看見' },
  { key: 'behavior', title: '3. 行為維度：加分、正規化、文字融合', hint: '值域由題庫推導，不寫死' },
  { key: 'interaction', title: '4. Q12 交互項（唯一的非線性規則）', hint: '4×4 完整格子' },
  { key: 'emotion', title: '5. 情緒偏離與 emotion_mult', hint: '只會打折，不會加分' },
  { key: 'effective', title: '6. effective_risk 與護欄', hint: '最後一段算式' },
];
</script>

<template>
  <section class="rounded-xl border border-slate-300 bg-white">
    <header class="border-b border-slate-200 px-4 py-3 sm:px-5">
      <h2 class="font-semibold text-slate-900">稽核面板</h2>
      <p class="mt-1 text-sm leading-relaxed text-slate-500">
        每個分數都能追到來源題目、貢獻分數、權重與走過的規則。
        金融商品的可解釋性是法規要求（MiFID II 適合度報告、金管會對自動化投資顧問的規範），不是加分項目。
      </p>
    </header>

    <div v-for="sec in SECTIONS" :key="sec.key" class="border-b border-slate-200 last:border-b-0">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 sm:px-5"
        :aria-expanded="isOpen(sec.key)"
        @click="toggle(sec.key)"
      >
        <span>
          <span class="font-medium text-slate-800">{{ sec.title }}</span>
          <span class="ml-2 text-xs text-slate-400">{{ sec.hint }}</span>
        </span>
        <span class="shrink-0 text-slate-400">{{ isOpen(sec.key) ? '−' : '+' }}</span>
      </button>

      <div v-if="isOpen(sec.key)" class="px-4 pb-5 sm:px-5">
        <!-- 1. constructs -->
        <div v-if="sec.key === 'constructs'" class="space-y-5">
          <div v-for="c in audit.constructs" :key="c.construct">
            <p class="text-sm font-medium text-slate-800">
              {{ CONSTRUCT_LABELS[c.construct] }}（{{ c.construct }}）＝ {{ n(c.score) }}
            </p>
            <div class="mt-2 overflow-x-auto">
              <table class="min-w-[34rem] w-full text-xs">
                <thead class="text-slate-500">
                  <tr class="border-b border-slate-200">
                    <th class="py-1 pr-2 text-left font-normal">題號</th>
                    <th class="py-1 pr-2 text-left font-normal">你的答案</th>
                    <th class="py-1 pr-2 text-right font-normal">選項值</th>
                    <th class="py-1 pr-2 text-right font-normal">權重</th>
                    <th class="py-1 text-right font-normal">貢獻</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in c.rows" :key="r.facet" class="border-b border-slate-100 last:border-b-0">
                    <td class="py-1.5 pr-2 whitespace-nowrap text-slate-500">
                      {{ r.itemId }}<span class="ml-1 text-slate-400">{{ r.facet }}</span>
                    </td>
                    <td class="py-1.5 pr-2 text-slate-700">{{ r.answer }}</td>
                    <td class="py-1.5 pr-2 text-right tabular-nums text-slate-700">{{ n(r.value, 0) }}</td>
                    <td class="py-1.5 pr-2 text-right tabular-nums text-slate-500">{{ pct(r.share) }}</td>
                    <td class="py-1.5 text-right tabular-nums text-slate-900">{{ n(r.contribution) }}</td>
                  </tr>
                  <tr class="font-medium">
                    <td class="py-1.5 pr-2 text-slate-500" colspan="4">合計</td>
                    <td class="py-1.5 text-right tabular-nums text-slate-900">{{ n(c.score) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p class="rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            知識與經驗不併入風險偏好，而是換算成上限：competence_cap ＝
            {{ audit.competenceCap.floor }} ＋ {{ audit.competenceCap.slope }} ×
            {{ n(audit.competenceCap.competence) }} ＝ <span class="font-medium">{{ n(audit.competenceCap.cap) }}</span>。
            依 MiFID II，知識與經驗屬於「適當性」，風險偏好屬於「適合度」；把兩者平均會讓「你不懂」去壓低「你想要」。
          </p>
        </div>

        <!-- 2. baseline -->
        <div v-else-if="sec.key === 'baseline'" class="space-y-3">
          <div v-for="k in (['capacity', 'willingness', 'competence_cap'] as const)" :key="k" class="flex items-center gap-3">
            <span class="w-32 shrink-0 text-xs text-slate-500">{{ k }}</span>
            <div class="h-2 flex-1 rounded-full bg-slate-100">
              <div
                class="h-2 rounded-full"
                :class="audit.baseline.binding === (k === 'competence_cap' ? 'competence' : k) ? 'bg-teal-600' : 'bg-slate-300'"
                :style="{ width: `${audit.baseline[k]}%` }"
              />
            </div>
            <span class="w-12 shrink-0 text-right text-xs tabular-nums text-slate-700">{{ n(audit.baseline[k]) }}</span>
          </div>
          <p class="text-sm text-slate-700">
            baseline_risk ＝ min(三者) ＝ <span class="font-medium">{{ n(audit.baseline.baseline) }}</span>，
            受限於 <span class="font-medium">{{ CONSTRUCT_LABELS[audit.baseline.binding] }}</span>；
            若這個限制解除，第二低的限制會接手，baseline 最多再上升
            <span class="font-medium">{{ n(audit.baseline.headroom) }}</span> 分。
          </p>
          <p class="rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            取最小值而非平均：財務撐得住但心理撐不住的人，平均後會得到一個兩邊都不成立的中間值，
            而真正會在下跌時出場的是心理那一邊。
          </p>
        </div>

        <!-- 3. behavior -->
        <div v-else-if="sec.key === 'behavior'" class="space-y-4">
          <details v-for="b in audit.behavior" :key="b.dim" class="rounded-md border border-slate-200 px-3 py-2">
            <summary class="cursor-pointer text-sm text-slate-700">
              {{ DIM_LABELS[b.dim] }}
              <span class="ml-2 tabular-nums text-slate-900">{{ n(b.score) }}</span>
              <span class="ml-1 text-xs text-slate-400">（{{ TIER_LABELS[b.tier as 'low' | 'mid' | 'high'] }}）</span>
            </summary>
            <div class="mt-2 space-y-2 text-xs text-slate-600">
              <ul v-if="b.contributions.length" class="space-y-0.5">
                <li v-for="(c, i) in b.contributions" :key="i">
                  {{ c.itemId }}「{{ c.label }}」
                  <span class="tabular-nums" :class="c.delta > 0 ? 'text-amber-700' : 'text-teal-700'">
                    {{ c.delta > 0 ? '+' : '' }}{{ c.delta }}
                  </span>
                  <span v-if="c.viaRule" class="text-slate-400">（規則 {{ c.viaRule }}）</span>
                </li>
              </ul>
              <p v-else class="text-slate-400">沒有題目加分到這個維度。</p>
              <p>
                原始累積 {{ n(b.raw, 0) }}，題庫推導出的理論值域 [{{ n(b.range.min, 0) }}, {{ n(b.range.max, 0) }}]，
                正規化後 = <span class="tabular-nums">{{ n(b.optionScore) }}</span>
              </p>
              <div v-if="b.text" class="rounded bg-slate-50 px-2 py-1.5">
                <p>
                  文字分析給 {{ n(b.text.score) }} 分，權重 {{ pct(b.text.weight) }}：
                  {{ n(b.optionScore) }} × {{ pct(1 - b.text.weight) }} + {{ n(b.text.score) }} × {{ pct(b.text.weight) }}
                  = <span class="font-medium">{{ n(b.score) }}</span>
                </p>
                <p v-if="b.text.evidence.length" class="mt-1">
                  引用原文：<span v-for="(q, i) in b.text.evidence" :key="i" class="mr-1">「{{ q }}」</span>
                </p>
                <p v-if="b.text.disagreement > 25" class="mt-1 text-amber-700">
                  兩種方法相差 {{ n(b.text.disagreement, 0) }} 分，已標記為不一致——兩個獨立方法不同意，本身就是一個發現。
                </p>
              </div>
            </div>
          </details>
        </div>

        <!-- 4. Q12 -->
        <InteractionGrid v-else-if="sec.key === 'interaction' && audit.interaction" :a="audit.interaction" />

        <!-- 5. emotion -->
        <div v-else-if="sec.key === 'emotion'" class="space-y-2 text-sm text-slate-700">
          <p>
            anxiety {{ n(audit.emotion.anxiety) }} → 超出切點的比例
            {{ n(audit.emotion.anxietyExcess, 2) }}；confidence {{ n(audit.emotion.confidence) }} → 亢奮比例
            {{ n(audit.emotion.euphoriaExcess, 2) }}
          </p>
          <p>
            deviation ＝ 100 × max(兩者) ＝ <span class="font-medium">{{ n(audit.emotion.deviation) }}</span>
            （{{ s.emotional_state.state === 'calm' ? '平靜' : s.emotional_state.state === 'deviated' ? '偏離' : '高度偏離' }}）
          </p>
          <p v-if="audit.emotion.deviation < audit.emotion.deviatedMin">
            deviation &lt; {{ audit.emotion.deviatedMin }}，判定為平靜，不打折：emotion_mult ＝
            <span class="font-medium">{{ n(audit.emotion.mult, 3) }}</span>
          </p>
          <p v-else>
            emotion_mult ＝ 1 − {{ audit.emotion.maxDiscount }} × ({{ n(audit.emotion.deviation) }} −
            {{ audit.emotion.deviatedMin }}) / (100 − {{ audit.emotion.deviatedMin }}) ＝
            <span class="font-medium">{{ n(audit.emotion.mult, 3) }}</span>
          </p>
          <p class="rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            取 max 不取和：恐慌與亢奮是互斥狀態，相加等於重複懲罰。上界固定為 1.0——情緒只會讓建議變保守，
            不會讓一個人更有資格承擔風險。低於偏離門檻完全不打折，否則畫面寫「情緒平穩」、分數卻被扣，
            說的跟算的就是兩件事。
          </p>
        </div>

        <!-- 6. effective + guardrails -->
        <div v-else-if="sec.key === 'effective'" class="space-y-3 text-sm text-slate-700">
          <p>
            bias_index ＝ 焦慮、損失趨避、過度自信、從眾四項的平均 ＝ {{ n(audit.penalty.biasIndex) }}；
            bias_penalty ＝ clamp({{ audit.penalty.k }} × ({{ n(audit.penalty.biasIndex) }} − {{ audit.penalty.center }}), 0,
            {{ audit.penalty.max }}) ＝ <span class="font-medium">{{ n(audit.penalty.penalty) }}</span>
          </p>
          <p class="rounded-md bg-slate-100 px-3 py-2 font-medium">
            effective_risk ＝ {{ n(audit.effective.baseline) }} × {{ n(audit.effective.mult, 3) }} −
            {{ n(audit.effective.penalty) }} ＝ {{ n(audit.effective.effective) }}　→　{{ s.investor_type }}，
            target_vol {{ (audit.effective.targetVol * 100).toFixed(1) }}%
          </p>
          <div>
            <p class="font-medium text-slate-800">護欄觸發紀錄</p>
            <ul v-if="audit.guardrails.length" class="mt-1 space-y-1 text-xs text-slate-600">
              <li v-for="g in audit.guardrails" :key="g.id">
                {{ g.title }}
                <span class="text-slate-400">（{{ g.id }}）</span>
                ← 因為 {{ g.because.map(signalLabel).join('、') }} 達到門檻
              </li>
            </ul>
            <p v-else class="mt-1 text-xs text-slate-500">沒有任何護欄條件成立。</p>
            <p v-if="audit.exemptions.length" class="mt-1 text-xs text-teal-700">
              套用豁免：{{ audit.exemptions.join('、') }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
