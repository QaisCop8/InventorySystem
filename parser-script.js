const fs=require("fs");
const ts=require("typescript");
const src=fs.readFileSync("components/products/compact-product-form.tsx","utf8");
const sf=ts.createSourceFile("compact-product-form.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
sf.parseDiagnostics.forEach(d=>{
  const loc=sf.getLineAndCharacterOfPosition(d.start);
  console.log(`${loc.line+1}:${loc.character+1} ${ts.flattenDiagnosticMessageText(d.messageText," ")}`);
});
