// Data minimization: only the two open-text answers ever leave the browser, and
// they are stripped first. Free-tier LLM terms allow the provider to train on
// input, so this is a design requirement, not decoration.
//
// Deliberately NOT stripped: listed-company names, tickers and industry terms
// ("輝達", "台積電", "2330") — they are the content being analyzed. Removing them
// would destroy the answer.

export const PII_RULES: { name: string; re: RegExp; to: string }[] = [
  { name: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, to: '[EMAIL]' },
  { name: 'tw_id', re: /\b[A-Z][12]\d{8}\b/g, to: '[ID]' },
  { name: 'phone', re: /\b09\d{2}[-\s]?\d{3}[-\s]?\d{3}\b|\b0\d{1,2}-\d{6,8}\b/g, to: '[PHONE]' },
  // Amounts: a number followed by a currency/scale word.
  { name: 'amount', re: /\d[\d,.]*\s*(萬元|萬塊|萬鎂|億元|億|萬|元|塊|美金|美元|鎂|台幣|新台幣|NTD|USD|\$)/gi, to: '[AMOUNT]' },
  { name: 'salary', re: /(年薪|月薪|年收|月收|存款|資產|薪水)\s*[\d,.]+\s*[^\s，。、]*/g, to: '$1[AMOUNT]' },
  { name: 'age', re: /(我|今年)?\s*\d{1,2}\s*歲/g, to: '[AGE]' },
  { name: 'employer', re: /我在[一-龥A-Za-z0-9]{2,10}(公司|上班|工作|任職)/g, to: '我在[EMPLOYER]工作' },
];

export function stripPii(text: string): string {
  return PII_RULES.reduce((s, r) => s.replace(r.re, r.to), text);
}
