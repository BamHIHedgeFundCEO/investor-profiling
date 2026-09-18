// Scoring-domain types. The data itself (item bank, weights, guardrails) lives in
// src/data/*.json; these types describe that data and the three isolated output layers.

import type {
  AnalyzerName,
  BehaviorScores,
  SentimentReading,
  OpenAnswer,
  ReasoningMode,
  Target,
  TextQuality,
} from '../analyzer/types';

// ── Primitives ────────────────────────────────────────────────────────────────

export type Tier = 'low' | 'mid' | 'high';
export type Range = [number, number];

export type CapacityFacet =
  | 'life_stage' | 'horizon' | 'liquidity' | 'concentration' | 'income_stability'
  | 'surplus' | 'burden' | 'disruption';
export type WillingnessFacet = 'risk_tolerance' | 'risk_range' | 'goal';
export type CompetenceFacet = 'knowledge' | 'experience';
export type Facet = CapacityFacet | WillingnessFacet | CompetenceFacet;

// The three slow-variable constraints; baseline_risk is their minimum.
export type Construct = 'capacity' | 'willingness' | 'competence';

export const BEHAVIOR_DIMS = [
  'anxiety', 'loss_aversion', 'overconfidence', 'herding',
  'discipline', 'confidence', 'disposition',
] as const;
export type BehaviorDim = (typeof BEHAVIOR_DIMS)[number];

// bias_index is locked to these four. discipline is protective, confidence only
// matters alongside overconfidence, disposition is an execution-side bias.
export const BIAS_DIMS = ['anxiety', 'loss_aversion', 'overconfidence', 'herding'] as const;
export type BiasDim = (typeof BIAS_DIMS)[number];

// The only dimensions text analysis may adjust.
export const TEXT_BLENDED_DIMS = ['overconfidence', 'herding'] as const;

export type Deltas = Partial<Record<BehaviorDim, number>>;

export interface DimScore {
  score: number;
  tier: Tier;
  evidence: string[];
}

// ── Item bank ─────────────────────────────────────────────────────────────────

interface ItemBase {
  item_id: string;
  stage: 1 | 2 | 3 | 4;
  text: string;
  why_we_ask?: string;
}

export interface ChoiceOption {
  label: string;
  value?: number; // absolute 0–100; facet items only
  deltas?: Deltas; // accumulated, behavior dimensions only
  code?: string | number; // read by composite rules
  lambda?: number; // Q18, display only
  correct?: boolean; // quiz sub-items
}

export interface SingleChoiceItem extends ItemBase {
  type: 'single_choice';
  construct: Construct | 'behavior';
  facet?: Facet; // required when construct is capacity | willingness | competence
  options: ChoiceOption[];
}

export interface AttentionCheckItem extends ItemBase {
  type: 'attention_check';
  correct_index: number;
  options: ChoiceOption[];
}

// Displayed like a single choice, but scored only through its parent composite.
export interface SubChoiceItem extends ItemBase {
  type: 'sub_choice';
  parent: string;
  options: ChoiceOption[];
}

interface CompositeBase extends ItemBase {
  type: 'composite';
  prompt?: string; // shown above the grouped sub-items
  sub_items: string[];
  // Required on every composite; read by deriveTheoreticalRange() and checked
  // against exhaustive enumeration of the rule at load time.
  declared_range: Partial<Record<BehaviorDim, Range>>;
}

export interface ReflectionEffectItem extends CompositeBase {
  rule: 'reflectionEffect';
  // key: sub-item option codes joined by '|', e.g. "A|B"
  outcomes: Record<string, { deltas: Deltas; flag?: Flag }>;
}

export interface OverconfidenceParams {
  rank_high: number;
  freq_high: number;
  freq_very_high: number;
  score_both: number;
  score_rank_only: number;
  score_freq_only: number;
  confidence_by_rank_option: number[];
}

export interface OverconfidenceInteractionItem extends CompositeBase {
  rule: 'overconfidenceInteraction';
  params: OverconfidenceParams;
}

export interface KnowledgeQuizItem extends CompositeBase {
  rule: 'knowledgeQuiz';
  construct: 'competence';
  facet: 'knowledge';
  value_by_correct: number[];
}

export type CompositeItem =
  | ReflectionEffectItem
  | OverconfidenceInteractionItem
  | KnowledgeQuizItem;

export interface OpenTextItem extends ItemBase {
  type: 'open_text';
  hint?: string;
  targets?: Target[];
  default_target?: Target;
  paired_with?: string;
  drop_by_target?: Record<Target, number>;
}

// Answer is stored in presentation_layer, never in responses.
export interface MbtiItem extends ItemBase {
  type: 'mbti';
}

export type ChoiceItem = SingleChoiceItem | AttentionCheckItem | SubChoiceItem;
export type Item = ChoiceItem | CompositeItem | OpenTextItem | MbtiItem;

export interface ItemBank {
  version: string;
  items: Item[];
}

// ── Responses (store the choice, never the score) ─────────────────────────────

export interface ChoiceResponse {
  selected_index: number;
}
export type Responses = Record<string, ChoiceResponse | OpenAnswer>;

// ── Config ────────────────────────────────────────────────────────────────────

export type InvestorTypeId =
  | 'Conservative' | 'Moderately Conservative' | 'Balanced' | 'Growth' | 'Aggressive';

export interface Weights {
  version: string;
  capacity: Record<CapacityFacet, number>;
  willingness: Record<WillingnessFacet, number>;
  competence: Record<CompetenceFacet, number>;
  competence_cap: { floor: number; slope: number };
  emotion: {
    anxiety_cut: number;
    euphoria_cut: number;
    max_discount: number;
    deviated_min: number;
    highly_deviated_above: number;
  };
  bias_penalty: { k: number; center: number; max: number };
  text_blend: Record<TextQuality, number>;
  tiers: { mid_min: number; high_min: number };
  thresholds: {
    inconsistency_gap: number;
    capacity_willingness_gap: number;
    framing_gap: number;
    // Overconfidence is scored as stance × (100 − depth). In a very short answer
    // depth is necessarily 0 — not because the respondent has no reasons, but
    // because the sentence has no room for them — so the text reading is
    // mechanically inflated and is not used below this many characters.
    depth_floor_chars: number;
  };
  framing_pair: [string, string];
  target_vol: { min: number; span: number };
  investor_types: { id: InvestorTypeId; zh: string; lo: number; hi: number }[]; // [lo, hi)
  quality: {
    min_duration_sec: number;
    straight_line_run: number;
    straight_line_min_options: number;
  };
}

export type GuardrailId =
  | 'quarterly_rebalance_locked' | 'no_single_position_over_10pct'
  | 'trade_cooldown_48h' | 'dca_enforced'
  | 'reduce_initial_position' | 'review_in_3_months'
  | 'auto_rebalance' | 'hide_daily_pnl'
  | 'auto_stop_loss_rule' | 'hide_unrealized_pnl'
  | 'mandatory_thesis_review' | 'no_price_alerts';

// Signals a guardrail condition may test: behavior dimensions plus the two
// guardrail-only text outputs.
export type Signal = BehaviorDim | 'belief_rigidity' | 'price_anchoring';

export interface GuardrailCondition {
  signal: Signal;
  tier: Tier;
}

export interface GuardrailConfig {
  version: string;
  rules: { id: string; when: GuardrailCondition[]; add: GuardrailId[] }[];
  exemptions: { id: string; note?: string; when: GuardrailCondition[]; remove: GuardrailId[] }[];
  labels: Record<GuardrailId, { title: string; desc: string }>;
  general_advice: { title: string; desc: string }[]; // shown when no guardrail is triggered
}

export interface GuardrailTrace {
  guardrail: GuardrailId;
  because: Signal[]; // signals whose tier met the rule
}

// ── Output: three isolated layers ─────────────────────────────────────────────

export type Flag =
  | 'capacity_willingness_gap'
  | 'inconsistency_overconfidence'
  | 'inconsistency_herding'
  | 'framing_sensitivity'
  | 'text_invalid'
  | 'atypical_prospect_pattern'
  | 'attention_check_failed'
  | 'straight_lining_flag'
  | 'data_quality_flag';

export type AlertReason =
  | { kind: 'capacity_willingness_gap' }
  | { kind: 'high_emotional_deviation' }
  | { kind: 'high_bias'; dim: BiasDim }
  | { kind: 'inconsistency'; dim: 'overconfidence' | 'herding' }
  | { kind: 'framing_sensitivity' };

export type EmotionState = 'calm' | 'deviated' | 'highly_deviated';

export interface EmotionalState {
  anxiety: number;
  confidence: number;
  deviation: number;
  state: EmotionState;
}

export interface ConstraintGaps {
  capacity: number;
  willingness: number;
  competence_cap: number;
  binding: Construct;
  headroom: number; // second-lowest − binding: how far baseline rises if the binding constraint lifts
  headroom_vol: number; // the same in target_vol units
}

export interface TextAnalysis {
  analyzer: AnalyzerName;
  quality: { q13: TextQuality; q14: TextQuality };
  text_weight: number;
  // Option-only vs text-only readings of the two blended dimensions, for side-by-side display.
  option_scores: { overconfidence: number; herding: number };
  // Whether each text reading was admitted into the score. False means it is
  // shown for comparison only — see textApplies() in behavior.ts.
  applied: { overconfidence: boolean; herding: boolean };
  overconfidence: DimScore;
  herding: DimScore;
  reasoning_mode: ReasoningMode;
  belief_rigidity: DimScore; // guardrail + display only
  price_anchoring: DimScore; // guardrail + display only
  sentiment: SentimentReading; // display only, shown beside the option-based scores
}

export interface ScoringLayer {
  capacity: number;
  willingness: number;
  competence: number;
  competence_cap: number;
  baseline_risk: number;
  binding_constraint: Construct;
  constraint_gaps: ConstraintGaps;
  emotional_state: EmotionalState;
  emotion_mult: number;
  bias_index: number;
  bias_penalty: number;
  effective_risk: number;
  investor_type: InvestorTypeId;
  target_vol: number;
  facets: Record<Facet, number>;
  behavior: Record<BehaviorDim, DimScore>;
  text_analysis: TextAnalysis | null; // null when text is invalid or not analyzed
  behavioral_alert: boolean;
  alert_reasons: AlertReason[];
  flags: Flag[];
  guardrails: GuardrailId[];
  guardrail_trace: GuardrailTrace[];
  exemptions_applied: string[];
}

export type MbtiType = `${'E' | 'I'}${'S' | 'N'}${'T' | 'F'}${'J' | 'P'}`;
export type Tone = 'analytical' | 'diplomatic' | 'sentinel' | 'explorer' | 'neutral';

// Decides only HOW results are phrased. Never read by any scoring path.
export interface PresentationLayer {
  mbti: MbtiType | null;
  tone: Tone;
}

// Interests and contact preference. Never read by any scoring path — see the
// ComposeInput guards below and tests/isolation.test-d.ts.
export type ContactPref = 'online_only' | 'open_to_offline' | 'undecided';

export interface SocialLayer {
  interests: string[];
  contact_pref?: ContactPref; // omitted unless consent_matching
  consent_matching: boolean;
  // Uploading anything at all is its own decision. Without this the record stays
  // in the browser, which is what the intro page promises.
  consent_research: boolean;
}

export interface ProfileRecord {
  schema_version: '1.3';
  item_bank_version: string;
  timestamp: string;
  responses: Responses;
  scoring_layer: ScoringLayer;
  presentation_layer: PresentationLayer;
  social_layer: SocialLayer | null;
}

// ── compose() input: structurally unable to receive presentation data ─────────

export interface TextInput {
  analyzer: AnalyzerName;
  scores: BehaviorScores;
}

export interface ComposeInput {
  responses: Responses;
  itemBank: ItemBank;
  weights: Weights;
  guardrails: GuardrailConfig;
  text: TextInput | null;
  meta?: { duration_sec?: number };
  // TypeScript lets extra properties through when passing a variable, so these
  // are declared `never` to reject presentation data explicitly.
  presentation_layer?: never;
  mbti?: never;
  tone?: never;
}
