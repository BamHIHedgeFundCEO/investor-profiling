// MBTI decides only the wording of the results page. Nothing here is imported by scoring.

import type { MbtiType, Tone } from '../scoring/types';

export const MBTI_TYPES: MbtiType[] = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

// Accepts 16personalities-style input such as "INTJ-A"; the suffix is ignored.
export function parseMbti(input: string | null | undefined): MbtiType | null {
  const core = (input ?? '').trim().toUpperCase().slice(0, 4);
  return (MBTI_TYPES as string[]).includes(core) ? (core as MbtiType) : null;
}

export function toneFor(mbti: MbtiType | null): Tone {
  if (!mbti) return 'neutral';
  const [, sn, tf, jp] = mbti;
  if (sn === 'N') return tf === 'T' ? 'analytical' : 'diplomatic';
  return jp === 'J' ? 'sentinel' : 'explorer';
}
