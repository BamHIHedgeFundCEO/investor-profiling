import type { AnalyzerName, ReasoningMode, Target } from '../analyzer/types';
import type { AlertReason, BehaviorDim, Construct, Flag, Signal } from '../scoring/types';

export const TARGET_LABELS: Record<Target, string> = {
  btc: '比特幣',
  ai: '股票',
  gold: '黃金',
};

export const formatDrop = (drop: number): string => `${Math.round(drop * 100)}%`;

export const DIM_LABELS: Record<BehaviorDim, string> = {
  anxiety: '焦慮',
  loss_aversion: '損失趨避',
  overconfidence: '過度自信',
  herding: '從眾',
  discipline: '紀律',
  confidence: '自信',
  disposition: '處分效應',
};

export const SIGNAL_LABELS: Record<Signal, string> = {
  ...DIM_LABELS,
  belief_rigidity: '信念僵固',
  price_anchoring: '價格錨定',
};

export const CONSTRUCT_LABELS: Record<Construct, string> = {
  capacity: '財務條件',
  willingness: '風險偏好',
  competence: '知識與經驗',
};

export const TIER_LABELS = { low: '低', mid: '中', high: '高' } as const;

export function alertReasonLabel(r: AlertReason): string {
  switch (r.kind) {
    case 'capacity_willingness_gap':
      return '財務條件與風險意願落差大';
    case 'high_emotional_deviation':
      return '當下情緒高度偏離';
    case 'high_bias':
      return `${DIM_LABELS[r.dim]}傾向偏高`;
    case 'inconsistency':
      return `${DIM_LABELS[r.dim]}：選擇題與文字回答不一致`;
    case 'framing_sensitivity':
      return '兩種問法下的風險承受度差距大';
  }
}

// Quality notices shown on the results page. None of them changes a score.
export const QUALITY_NOTICES: Partial<Record<Flag, string>> = {
  attention_check_failed: '注意力檢核題沒有選到指定的選項。',
  straight_lining_flag: '連續多題選了相同位置的選項。',
  data_quality_flag: '作答時間少於 90 秒。',
  text_invalid: '開放式回答較難分析，本次只以選擇題計分。',
  atypical_prospect_pattern: '情境一、二的選擇組合在研究中較少見。',
};

export const REASONING_LABELS: Record<ReasoningMode, { title: string; desc: string }> = {
  mechanism: { title: '機制分析', desc: '從價值來源、基本面或總體因素推論' },
  narrative: { title: '敘事與個人看法', desc: '以整體印象或故事說明，較少具體論據' },
  authority: { title: '參考他人意見', desc: '主要依據朋友、媒體或專家的說法' },
  price_action: { title: '價格走勢', desc: '主要依據漲跌幅度或目標價位' },
};

export const ANALYZER_LABELS: Record<AnalyzerName, string> = {
  gemini: 'Gemini 語意分析',
  rule_based: '規則式分析（離線備援）',
};
