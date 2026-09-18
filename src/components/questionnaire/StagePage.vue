<script setup lang="ts">
import { computed } from 'vue';
import ChoiceQuestion from './ChoiceQuestion.vue';
import GroupQuestion from './GroupQuestion.vue';
import OpenTextQuestion from './OpenTextQuestion.vue';
import NavBar from './NavBar.vue';
import { STAGE_META } from './stageMeta';
import { blocksForStage, useSurveyStore, type Stage } from '../../stores/survey';

const props = defineProps<{ stage: Stage }>();
const survey = useSurveyStore();

const meta = computed(() => STAGE_META[props.stage]);
const blocks = computed(() => blocksForStage(props.stage));
const missing = computed(() => survey.unanswered(props.stage).length);
</script>

<template>
  <div>
    <header class="mb-5">
      <p class="text-sm font-medium text-slate-500">第 {{ stage }} 部分，共 3 部分</p>
      <h1 class="mt-1 text-2xl font-semibold text-slate-900">{{ meta.title }}</h1>
      <p class="mt-2 leading-relaxed text-slate-600">{{ meta.intro }}</p>
    </header>

    <div class="space-y-4">
      <template v-for="(b, i) in blocks" :key="i">
        <OpenTextQuestion v-if="b.kind === 'open'" :item="b.item" :number="i + 1" />
        <GroupQuestion
          v-else-if="b.kind === 'group'"
          :composite="b.composite"
          :subs="b.subs"
          :number="i + 1"
          :variant="meta.variant"
        />
        <ChoiceQuestion
          v-else
          :id="b.item.item_id"
          :number="i + 1"
          :text="b.item.text"
          :why="b.item.why_we_ask"
          :options="b.item.options"
          :selected="survey.selected(b.item.item_id)"
          :variant="meta.variant"
          :layout="b.kind === 'binary' ? 'binary' : 'list'"
          @select="survey.choose(b.item.item_id, $event)"
        />
      </template>
    </div>

    <NavBar
      :can-next="missing === 0"
      :blocked-hint="missing ? `還有 ${missing} 題選擇題未作答` : ''"
      @back="survey.back()"
      @next="survey.next()"
    />
  </div>
</template>
