// Answer-quality flag for open text. Never blocks submission and never enters a
// score directly; it only sets the text layer's weight (usable 0.3 / thin 0.15 / invalid 0).

import type { TextQuality } from './types';

// Rough content-word estimate without a segmenter: CJK characters left after removing
// common function characters, halved (most Chinese content words are two characters).
const FUNCTION_CHARS = /[的了是我你他也很就都還有沒在和跟嗎呢啊吧]/g;
const KEYBOARD_MASH = /(asdf|qwer|zxcv|hjkl|1234|abcd)/i;

export function approxContentWords(text: string): number {
  const cjk = text.replace(/[^一-龥]/g, '').replace(FUNCTION_CHARS, '');
  return Math.floor(cjk.length / 2);
}

function repeatRatio(text: string): number {
  const chars = [...text.replace(/\s/g, '')];
  if (chars.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const c of chars) counts.set(c, (counts.get(c) ?? 0) + 1);
  return Math.max(...counts.values()) / chars.length;
}

// Share of the answer's characters that also appear, in order, as 4-grams of the prompt.
function promptOverlap(text: string, prompt: string): number {
  const t = text.replace(/\s/g, '');
  if (t.length < 4) return 0;
  const grams = new Set<string>();
  for (let i = 0; i + 4 <= prompt.length; i++) grams.add(prompt.slice(i, i + 4));
  let hit = 0;
  for (let i = 0; i + 4 <= t.length; i++) if (grams.has(t.slice(i, i + 4))) hit++;
  return hit / (t.length - 3);
}

export function assessQuality(text: string, prompt = ''): TextQuality {
  const t = text.trim();
  const words = approxContentWords(t);
  if (
    t.length === 0 ||
    words === 0 ||
    (t.length >= 4 && repeatRatio(t) > 0.6) ||
    KEYBOARD_MASH.test(t) ||
    (prompt && promptOverlap(t, prompt) > 0.6)
  ) {
    return 'invalid';
  }
  if ([...t].length < 15 || words < 5) return 'thin';
  return 'usable';
}

export const SOFT_HINT_BELOW = 30;
