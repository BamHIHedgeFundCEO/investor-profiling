// The per-MBTI opening line of the results page.
//
// Two layers, deliberately separate:
//   · voice   — sixteen openers, one per MBTI type. Persona only.
//   · tone    — five template sets (tone_templates.json) that state the FACTS.
//
// The split exists because a persona is the one place where MBTI could leak into
// advice without any type check noticing: nothing stops a string from saying
// "open more leverage" to an ESTP whose score is 18 and whose guardrails enforce a
// 48-hour cooldown. So an opener may describe what the result is and how it will be
// phrased, and may not recommend an action, name an instrument, or imply a position
// size. tests/voice.test.ts enforces that against a blacklist; this file imports
// nothing from ../scoring beyond the MbtiType alias.

import voicesJson from '../../data/mbti_voices.json';
import type { MbtiType } from '../scoring/types';

export interface Voice {
  /** The four-letter code, e.g. "INTJ". */
  code: MbtiType;
  /** The familiar Chinese nickname, e.g. 建築師. */
  label: string;
  /** One or two sentences of persona. Contains no placeholders and no advice. */
  opener: string;
}

interface VoiceFile {
  version: string;
  note: string;
  voices: Record<string, { label: string; opener: string }>;
}

const file = voicesJson as VoiceFile;

export const voicesVersion = file.version;
export const VOICES = file.voices;

export function voiceFor(mbti: MbtiType | null | undefined): Voice | null {
  if (!mbti) return null;
  const v = VOICES[mbti];
  return v ? { code: mbti, label: v.label, opener: v.opener } : null;
}
