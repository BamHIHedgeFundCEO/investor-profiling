import type { Stage } from '../../stores/survey';

export type Variant = 'form' | 'scenario' | 'neutral';

export const STAGE_META: Record<Stage, { title: string; intro: string; variant: Variant }> = {
  1: {
    title: '財務狀況',
    intro: '請想像你準備拿來投資的一筆錢。以下問題了解這筆錢，以及你目前的財務條件。',
    variant: 'form',
  },
  2: {
    title: '情境與想法',
    intro: '以下是一些投資情境。沒有標準答案，請選最接近你真實反應的選項。',
    variant: 'scenario',
  },
  3: {
    title: '風險偏好與經驗',
    intro: '最後是幾題標準的風險評估問題。',
    variant: 'neutral',
  },
};

export const STEP_LABELS = ['開始', '財務狀況', '情境與想法', '風險偏好與經驗', 'MBTI（選填）', '結果'];
