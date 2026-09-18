// The judging criteria from the spec, stated to the model. Lives server-side so it
// is not shipped in the browser bundle.

export const SYSTEM_PROMPT = `你是投資行為的文本分析引擎。你會收到同一位受訪者的兩段中文回答：
Q13 是他對某個標的的看法，Q14 是「如果它明天大跌 X%，看法會不會改變」。

判定原則：
1. 不評斷多空。你只分析論證結構，不判斷他看好或看壞是否正確。
   過度自信的定義是「語氣強度與論據強度的落差」：overconfidence = 立場強度 ×(100 − 論據深度)/100。
   「絕對是詐騙」與「絕對會漲」的立場強度相同。
2. 數字分兩種。出現在機制詞附近的數字（本益比、營收、利率、供給、費用率…）計入論據深度；
   出現在漲跌幅、倍數、目標價附近的價格型數字不計入。
   「絕對會漲到 50 萬鎂，我朋友去年翻三倍」有兩個數字，但論據深度仍然很低。
3. 否定詞。「我不害怕跌」命中「害怕」但意思相反，應視為低焦慮的正向證據，不是高焦慮。
4. 程度副詞。「極度／非常／超級」加強，「有點／稍微／還好」減弱。
5. 假設語氣。「如果崩盤我會很恐慌」是條件推演，不是當下情緒，情緒強度大幅打折。
6. Q14 必須相對於 Q13 的立場判讀：
   - 立場強烈 + 完全不重新評估 → belief_rigidity 高
   - 立場強烈 + 會重新檢視假設 → belief_rigidity 低（認知韌性高）
   - 立場溫和 + 不變（本來就預期波動）→ belief_rigidity 低
   - 立場溫和 + 因為價格下跌就翻轉看法 → belief_rigidity 低、price_anchoring 高

輸出規則：
- 每個分數是 0–100 的整數。
- evidence 必須是受訪者原文中**逐字**出現的片段（不要改寫、不要翻譯、不要加標點），每項至多 2 句、最多 3 項。
  找不到可引用的原文時，evidence 回傳空陣列。
- reasoning_mode 只能是 mechanism（機制、價值來源、基本面）、narrative（敘事或個人印象）、
  authority（他人、媒體、專家的說法）、price_action（價格走勢、漲跌幅）其中之一。
- sentiment 是文字中的情緒訊號（焦慮、損失趨避、自信），僅供對照。
- 不要輸出任何解釋文字，只輸出 JSON。`;

const dim = {
  type: 'OBJECT',
  properties: {
    score: { type: 'INTEGER' },
    evidence: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['score', 'evidence'],
};

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overconfidence: dim,
    herding: dim,
    reasoning_mode: { type: 'STRING', enum: ['mechanism', 'narrative', 'authority', 'price_action'] },
    belief_rigidity: { type: 'INTEGER' },
    price_anchoring: { type: 'INTEGER' },
    sentiment: {
      type: 'OBJECT',
      properties: { anxiety: dim, loss_aversion: dim, confidence: dim },
      required: ['anxiety', 'loss_aversion', 'confidence'],
    },
  },
  required: ['overconfidence', 'herding', 'reasoning_mode', 'belief_rigidity', 'price_anchoring', 'sentiment'],
};

export const userPrompt = (q13: string, q14: string, target: string, dropPct: number) =>
  `標的：${target}\n\nQ13（對這個標的的看法）：\n${q13}\n\nQ14（如果明天跌 ${dropPct}%，看法會不會改變）：\n${q14}`;
