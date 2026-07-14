const fs = require('fs');
const code = fs.readFileSync('app/api/inventory/products/route.ts', 'utf8');
const starts = [
  /const insertColumns = canSaveDefaultStore\s*\?/g,
  /const insertColumns = canSaveDefaultStore\s*:/g,
  /const insertValues = canSaveDefaultStore\s*\?/g,
  /const insertValues = canSaveDefaultStore\s*:/g,
];
function extractArr(idx) {
  const start = code.indexOf('[', idx);
  if (start < 0) return null;
  let depth = 0;
  for (let j = start; j < code.length; j++) {
    if (code[j] === '[') depth++;
    else if (code[j] === ']') {
      depth--;
      if (depth === 0) return code.slice(start, j + 1);
    }
  }
  return null;
}
for (const re of starts) {
  let match;
  while ((match = re.exec(code)) !== null) {
    const arr = extractArr(match.index);
    console.log('SECTION', re, 'at', match.index);
    if (!arr) {
      console.log('missing');
      continue;
    }
    try {
      const p = eval(arr);
      console.log('len', p.length);
      console.log(p.slice(0, 5));
    } catch (err) {
      console.log('ERR', err.message);
      console.log(arr.slice(0, 200));
    }
  }
}
