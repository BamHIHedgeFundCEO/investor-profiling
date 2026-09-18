// Minimal rule-based fallback. Its job is to keep the flow alive when the LLM is
// unavailable, not to be accurate: regex word lists + a negation window + linear
// mapping. No segmentation, no sigmoid, no hypothetical-mood or degree handling.

import lexiconJson from '../../data/lexicon.json';
import { weights } from '../scoring/data';
import { clamp, tierOf } from '../scoring/util';
import type { DimScore } from '../scoring/types';
import type { BehaviorScores, OpenAnswer, ReasoningMode, TextAnalyzer } from './types';

type ListName =
  | 'absolute' | 'hedge' | 'social' | 'independent' | 'mechanism' | 'price'
  | 'revise' | 'hold' | 'anxiety' | 'loss_aversion' | 'confidence' | 'negation';
const lexicon = lexiconJson as unknown as Record<ListName, string[]>;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Longest terms first so "不可能" wins over "可能".
const patterns = Object.fromEntries(
  Object.entries(lexicon)
    .filter(([k]) => !k.startsWith('_') && k !== 'version')
    .map(([k, terms]) => [k, new RegExp([...terms].sort((a, b) => b.length - a.length).map(escape).join('|'), 'g')]),
) as Record<ListName, RegExp>;

const NEGATION_WINDOW = 3; // characters before a term
const negation = new RegExp(patterns.negation.source); // non-global: safe for .test()
const MECHANISM_NUMBER_WINDOW = 5; // characters around a mechanism term
const CAP = 3; // count at most this many hits per list, so long answers don't inflate

// Full-width letters, digits and % become half-width; Chinese punctuation is kept so
// quoted evidence reads as the respondent wrote it.
export function normalizeText(text: string): string {
  return text
    .replace(/[％０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Hit {
  term: string;
  index: number;
  negated: boolean;
}

function hits(text: string, list: ListName): Hit[] {
  return [...text.matchAll(patterns[list])].map((m) => {
    const before = text.slice(Math.max(0, m.index - NEGATION_WINDOW), m.index);
    return { term: m[0], index: m.index, negated: negation.test(before) };
  });
}

const count = (text: string, list: ListName) => Math.min(hits(text, list).length, CAP);

function sentenceAt(text: string, index: number): string {
  const stops = /[。！？!?\n；;]/;
  let a = index;
  let b = index;
  while (a > 0 && !stops.test(text[a - 1]!)) a--;
  while (b < text.length && !stops.test(text[b]!)) b++;
  return text.slice(a, b).trim();
}

function evidence(text: string, found: Hit[]): string[] {
  return [...new Set(found.map((h) => sentenceAt(text, h.index)))].slice(0, 3);
}

function dim(score: number, ev: string[]): DimScore {
  const s = clamp(score, 0, 100);
  return { score: s, tier: tierOf(s, weights.tiers), evidence: ev };
}

// Numbers near a mechanism term are arguments; numbers near price words are not.
// A number or price word inside a mechanism window belongs to the argument
// ("本益比只有 15 倍"), so it is never also counted as price talk.
const nearMechanism = (text: string, index: number) =>
  hits(text, 'mechanism').some((m) => Math.abs(m.index - index) <= MECHANISM_NUMBER_WINDOW + m.term.length);

const numbers = (text: string) => [...text.matchAll(/\d+(\.\d+)?/g)].map((n) => n.index);

const mechanismNumbers = (text: string) => numbers(text).filter((i) => nearMechanism(text, i)).length;

const priceTerms = (text: string) => hits(text, 'price').filter((p) => !nearMechanism(text, p.index));

function priceNumbers(text: string): number {
  const price = priceTerms(text);
  return numbers(text).filter((i) => !nearMechanism(text, i) && price.some((p) => Math.abs(p.index - i) <= 4)).length;
}

// Emotion words; a negated hit ("不害怕") counts as evidence for the opposite.
function sentiment(text: string, list: ListName): DimScore {
  const found = hits(text, list);
  const net = found.reduce((s, h) => s + (h.negated ? -1 : 1), 0);
  return dim(50 + 20 * clamp(net, -CAP, CAP), evidence(text, found));
}

export function analyzeRules(q13: OpenAnswer, q14: OpenAnswer): BehaviorScores {
  const a = normalizeText(q13.text);
  const b = normalizeText(q14.text);
  const both = `${a}。${b}`;

  // Stance strength is direction-free: "surely a scam" and "surely going up" score alike.
  const stance = clamp(40 + 25 * count(a, 'absolute') - 15 * count(a, 'hedge'), 0, 100);
  const depth = clamp(25 * count(both, 'mechanism') + 15 * mechanismNumbers(both), 0, 100);
  const overconfidence = (stance * (100 - depth)) / 100;

  // A stated independent judgment outweighs a single social mention.
  const herding = 35 * count(both, 'social') - 40 * count(both, 'independent');

  const modes: [ReasoningMode, number][] = [
    ['mechanism', count(both, 'mechanism')],
    ['authority', count(both, 'social') - count(both, 'independent')],
    ['price_action', Math.min(priceTerms(both).length, CAP) + priceNumbers(both)],
  ];
  const [topMode, topCount] = modes.reduce((x, y) => (y[1] > x[1] ? y : x));
  const reasoning_mode: ReasoningMode = topCount > 0 ? topMode : 'narrative';

  // Q14 is read relative to Q13: holding firm after a big drop is rigidity only
  // when the original stance was strong.
  // "不會改變" also contains "會改變"; a negated revise-term is not a revision.
  const revisions = Math.min(hits(b, 'revise').filter((h) => !h.negated).length, CAP);
  const holds = count(b, 'hold') > revisions;
  const belief_rigidity = holds ? stance : stance * 0.2;

  // Evidence must cover every term that moved the number, not only the ones that
  // raised it. A downstream gate withholds any reading it cannot quote for, so
  // citing hedges and mechanisms is what lets a well-argued answer pull the score
  // down at all. `a` is a prefix of `both`, so its indices carry over unchanged.
  const stanceHits = [...hits(a, 'absolute'), ...hits(a, 'hedge')];
  const socialHits = [...hits(both, 'social'), ...hits(both, 'independent')];

  return {
    overconfidence: dim(overconfidence, evidence(both, [...stanceHits, ...hits(both, 'mechanism')])),
    herding: dim(herding, evidence(both, socialHits)),
    reasoning_mode,
    belief_rigidity: clamp(belief_rigidity, 0, 100),
    price_anchoring: clamp(20 * priceNumbers(both) + 10 * Math.min(priceTerms(both).length, CAP), 0, 100),
    sentiment: {
      anxiety: sentiment(both, 'anxiety'),
      loss_aversion: sentiment(both, 'loss_aversion'),
      confidence: sentiment(both, 'confidence'),
    },
  };
}

export class RuleBasedAnalyzer implements TextAnalyzer {
  readonly name = 'rule_based' as const;
  async analyze(q13: OpenAnswer, q14: OpenAnswer): Promise<BehaviorScores> {
    return analyzeRules(q13, q14);
  }
}
