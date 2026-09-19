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
  | 'revise' | 'hold' | 'anxiety' | 'loss_aversion' | 'confidence' | 'negation'
  | 'self' | 'prediction';
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
// Only a mechanism the respondent DISMISSES is excluded, not one whose absence is
// their argument. 「不需要分散」 rejects a practice and gives no reason; 「沒有現金流」
// asserts a fact about the asset and is the reason. Both carry a negation, so the
// negation alone cannot tell them apart — the dismissal verbs can.
const DISMISSAL = /不需要|不用|不必|不看|不管|不理|懶得/;

const usedMechanisms = (text: string) =>
  hits(text, 'mechanism').filter(
    (m) => !DISMISSAL.test(text.slice(Math.max(0, m.index - 4), m.index)),
  );

const nearMechanism = (text: string, index: number) =>
  hits(text, 'mechanism').some((m) => Math.abs(m.index - index) <= MECHANISM_NUMBER_WINDOW + m.term.length);

// Overconfidence is miscalibration about oneself — overestimating one's ability,
// one's ranking, or the precision of one's own forecast (Moore & Healy). A
// confident statement about the world is not it: "大盤長期向上" is a claim about
// history that happens to be well supported, and scoring it as overconfidence
// tells a respondent they are arrogant for being right. So an absolute term only
// counts when it sits next to a first-person marker or a claim about what will
// happen. The cost is accepted deliberately: this narrowing trades false
// positives for false negatives, and in a suitability tool a wrong accusation
// costs more than a missed borderline case — the respondent stops trusting the
// whole report, which is exactly what happened when it first shipped.
const CLAIM_WINDOW = 12; // characters either side of an absolute term

const claimMarkers = (text: string) => [...hits(text, 'self'), ...hits(text, 'prediction')];

function claimHits(text: string): Hit[] {
  const markers = claimMarkers(text);
  return hits(text, 'absolute').filter((h) =>
    markers.some((m) => Math.abs(m.index - h.index) <= CLAIM_WINDOW + m.term.length),
  );
}

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
  // But only claims about the speaker's own judgement or about what will happen count.
  const stance = clamp(40 + 25 * Math.min(claimHits(a).length, CAP) - 15 * count(a, 'hedge'), 0, 100);
  // A mechanism the respondent is dismissing is not an argument they made:
  // 「不需要分散」 mentions diversification in order to reject it, and counting it
  // as depth let a bare assertion look reasoned.
  const depth = clamp(25 * Math.min(usedMechanisms(both).length, CAP) + 15 * mechanismNumbers(both), 0, 100);
  const overconfidence = (stance * (100 - depth)) / 100;

  // A stated independent judgment outweighs a single social mention.
  const herding = 35 * count(both, 'social') - 40 * count(both, 'independent');

  const modes: [ReasoningMode, number][] = [
    ['mechanism', Math.min(usedMechanisms(both).length, CAP)],
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
  const stanceHits = [...claimHits(a), ...hits(a, 'hedge')];
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
