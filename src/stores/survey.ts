import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { guardrails, itemBank, weights } from '../lib/scoring/data';
import { compose } from '../lib/scoring/compose';
import { assessQuality } from '../lib/analyzer/quality';
import { analyzeText } from '../lib/analyzer';
import { toneFor } from '../lib/presentation/tone';
import { runScenario, scenarioById } from '../lib/demo';
import { saveProfile, type SaveResult } from '../lib/persistence/supabase';
import type {
  ChoiceItem,
  SocialLayer,
  CompositeItem,
  Item,
  MbtiType,
  OpenTextItem,
  ProfileRecord,
  Responses,
} from '../lib/scoring/types';
import type { OpenAnswer, Target } from '../lib/analyzer/types';

export type Stage = 1 | 2 | 3;
export type Step = 'intro' | Stage | 'mbti' | 'result';
export const STEPS: Step[] = ['intro', 1, 2, 3, 'mbti', 'result'];

// What a stage page renders, in order.
export type Block =
  | { kind: 'choice'; item: ChoiceItem }
  | { kind: 'binary'; item: ChoiceItem }
  | { kind: 'group'; composite: CompositeItem; subs: ChoiceItem[] }
  | { kind: 'open'; item: OpenTextItem };

const STORAGE_KEY = 'investor-profiling:survey';
const byId = new Map<string, Item>(itemBank.items.map((i) => [i.item_id, i]));

const isChoice = (i: Item): i is ChoiceItem =>
  i.type === 'single_choice' || i.type === 'attention_check' || i.type === 'sub_choice';

export function blocksForStage(stage: Stage): Block[] {
  const blocks: Block[] = [];
  const grouped = new Set<string>();
  for (const item of itemBank.items) {
    if (item.stage !== stage || item.type === 'composite' || item.type === 'mbti') continue;
    if (item.type === 'open_text') {
      blocks.push({ kind: 'open', item });
    } else if (item.type === 'sub_choice') {
      const parent = byId.get(item.parent) as CompositeItem;
      if (parent.rule === 'reflectionEffect') {
        blocks.push({ kind: 'binary', item }); // Q16 / Q17 are separate A-or-B questions
      } else if (!grouped.has(parent.item_id)) {
        grouped.add(parent.item_id);
        const subs = parent.sub_items.map((id) => byId.get(id) as ChoiceItem);
        blocks.push({ kind: 'group', composite: parent, subs });
      }
    } else {
      blocks.push({ kind: 'choice', item });
    }
  }
  return blocks;
}

const choiceIdsForStage = (stage: Stage): string[] =>
  itemBank.items.filter((i) => i.stage === stage && isChoice(i)).map((i) => i.item_id);

function emptyText(target: Target): OpenAnswer {
  return { target, text: '', quality: 'invalid' };
}

interface Saved {
  item_bank_version: string;
  responses: Responses;
  mbti: MbtiType | null;
  step: Step;
  startedAt: number | null;
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    // Answers to a different item bank cannot be trusted to line up.
    return saved.item_bank_version === itemBank.version ? saved : null;
  } catch {
    return null;
  }
}

export const useSurveyStore = defineStore('survey', () => {
  const saved = loadSaved();
  const responses = ref<Responses>(saved?.responses ?? {});
  const mbti = ref<MbtiType | null>(saved?.mbti ?? null);
  // A finished profile is not persisted, so a reload lands back on the MBTI page.
  const step = ref<Step>(saved?.step === 'result' ? 'mbti' : (saved?.step ?? 'intro'));
  const startedAt = ref<number | null>(saved?.startedAt ?? null);
  const profile = ref<ProfileRecord | null>(null);

  const q13Item = byId.get('Q13') as OpenTextItem;
  const q14Item = byId.get('Q14') as OpenTextItem;
  if (!responses.value.Q13) responses.value.Q13 = emptyText(q13Item.default_target ?? 'btc');
  if (!responses.value.Q14) responses.value.Q14 = emptyText((responses.value.Q13 as OpenAnswer).target);

  const hasProgress = computed(() => Object.keys(responses.value).some((k) => 'selected_index' in responses.value[k]!));

  watch(
    [responses, mbti, step, startedAt],
    () => {
      try {
        const data: Saved = {
          item_bank_version: itemBank.version,
          responses: responses.value,
          mbti: mbti.value,
          step: step.value,
          startedAt: startedAt.value,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // storage unavailable (private mode etc.) — the survey still works in memory
      }
    },
    { deep: true },
  );

  function selected(itemId: string): number | undefined {
    const r = responses.value[itemId];
    return r && 'selected_index' in r ? r.selected_index : undefined;
  }

  function choose(itemId: string, index: number) {
    responses.value[itemId] = { selected_index: index };
  }

  function openAnswer(itemId: 'Q13' | 'Q14'): OpenAnswer {
    return responses.value[itemId] as OpenAnswer;
  }

  function setText(itemId: 'Q13' | 'Q14', text: string) {
    const item = itemId === 'Q13' ? q13Item : q14Item;
    const prev = openAnswer(itemId);
    responses.value[itemId] = { ...prev, text, quality: assessQuality(text, item.text) };
  }

  // Q14 always refers to the target picked in Q13.
  function setTarget(target: Target) {
    responses.value.Q13 = { ...openAnswer('Q13'), target };
    responses.value.Q14 = { ...openAnswer('Q14'), target };
  }

  function unanswered(stage: Stage): string[] {
    return choiceIdsForStage(stage).filter((id) => selected(id) === undefined);
  }

  function goTo(s: Step) {
    step.value = s;
    window.scrollTo({ top: 0 });
  }

  function start() {
    startedAt.value ??= Date.now();
    goTo(1);
  }

  function next() {
    const i = STEPS.indexOf(step.value);
    if (i < STEPS.length - 1) goTo(STEPS[i + 1]!);
  }

  function back() {
    const i = STEPS.indexOf(step.value);
    if (i > 0) goTo(STEPS[i - 1]!);
  }

  const analyzing = ref(false);

  async function analyze() {
    const duration_sec = startedAt.value ? (Date.now() - startedAt.value) / 1000 : undefined;
    analyzing.value = true;
    // Only the two open-text answers ever leave this function; choice answers stay local.
    const text = await analyzeText(openAnswer('Q13'), openAnswer('Q14')).finally(() => (analyzing.value = false));
    const scoring = compose({
      responses: responses.value,
      itemBank,
      weights,
      guardrails,
      text,
      meta: { duration_sec },
    });
    profile.value = {
      schema_version: '1.3',
      item_bank_version: itemBank.version,
      timestamp: new Date().toISOString(),
      responses: JSON.parse(JSON.stringify(responses.value)) as Responses, // structuredClone rejects reactive proxies
      scoring_layer: scoring,
      presentation_layer: { mbti: mbti.value, tone: toneFor(mbti.value) },
      social_layer: null,
    };
    goTo('result');
  }

  // ── Demo mode ───────────────────────────────────────────────────────────────
  // Pre-recorded responses, scored offline by the rule-based analyzer so a live
  // demonstration cannot be killed by the venue's Wi-Fi or by a free-tier 429.
  // The respondent's own answers are snapshotted and restored on exit.
  const demoId = ref<string | null>(null);
  let snapshot: { responses: Responses; mbti: MbtiType | null; step: Step } | null = null;

  async function loadDemo(id: string) {
    const scenario = scenarioById(id);
    if (!scenario) return;
    if (!demoId.value) {
      snapshot = {
        responses: JSON.parse(JSON.stringify(responses.value)) as Responses,
        mbti: mbti.value,
        step: step.value,
      };
    }
    const record = await runScenario(scenario);
    responses.value = record.responses;
    mbti.value = record.presentation_layer.mbti;
    profile.value = record;
    demoId.value = id;
    goTo('result');
  }

  function exitDemo() {
    if (snapshot) {
      responses.value = snapshot.responses;
      mbti.value = snapshot.mbti;
      snapshot = null;
    }
    demoId.value = null;
    profile.value = null;
    goTo('intro');
  }

  // ── Social layer (never read by scoring; see isolation tests) ───────────────

  /** Records consent, then uploads — in that order, and only if consent was given. */
  async function submitSocial(social: SocialLayer): Promise<SaveResult> {
    if (!profile.value) return 'no_consent';
    profile.value = { ...profile.value, social_layer: social };
    // Demo scenarios are illustrations, not respondents; they never reach the database.
    if (demoId.value) return 'no_consent';
    return saveProfile(profile.value);
  }

  function declineSocial() {
    if (!profile.value) return;
    profile.value = {
      ...profile.value,
      social_layer: { interests: [], consent_matching: false, consent_research: false },
    };
  }

  function reset() {
    demoId.value = null;
    snapshot = null;
    responses.value = {
      Q13: emptyText(q13Item.default_target ?? 'btc'),
      Q14: emptyText(q13Item.default_target ?? 'btc'),
    };
    mbti.value = null;
    startedAt.value = null;
    profile.value = null;
    goTo('intro');
  }

  return {
    responses, mbti, step, profile, hasProgress, analyzing, demoId,
    selected, choose, openAnswer, setText, setTarget, unanswered,
    start, next, back, goTo, analyze, reset, loadDemo, exitDemo, submitSocial, declineSocial,
  };
});
