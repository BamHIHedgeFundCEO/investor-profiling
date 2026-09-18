// Shows what leaves the browser after PII stripping, for a text given on the
// command line. The server strips a second time, so this is also the text the
// analyzer actually sees.
//
//   npx vite-node scripts/probe-pii.ts "我年薪 120 萬，還是想買"

import { stripPii } from '../src/lib/analyzer/pii.js';

const texts = process.argv.slice(2);
if (!texts.length) {
  console.error('usage: vite-node scripts/probe-pii.ts "<text>" ["<text>" ...]');
  process.exit(1);
}

for (const t of texts) {
  const out = stripPii(t);
  console.log(`in : ${t}`);
  console.log(`out: ${out}`);
  console.log(`changed: ${out !== t}\n`);
}
