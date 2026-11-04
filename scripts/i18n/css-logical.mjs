// يحوّل خصائص الاتجاه الفيزيائية إلى منطقية حتى تنعكس الواجهة تلقائياً في LTR (الشكل في RTL لا يتغير: start = يمين).
// - ملفات CSS في app/ و components/: text-align، margin/padding/border الجانبية، left/right، float، زوايا border-radius، direction: rtl.
// - أنماط React المضمّنة (style={{...}}) في ملفات الواجهة: textAlign و margin/padding الجانبية بقيم ثابتة فقط.
//   left/right في الأنماط المضمّنة تبقى كما هي: غالباً إحداثيات محسوبة من getBoundingClientRect (قوائم منبثقة).
// الاستخدام: node scripts/i18n/css-logical.mjs [--write]
import fs from "node:fs"
import path from "node:path"

const WRITE = process.argv.includes("--write")
const walk = (dir, test, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (/node_modules|[\\/]api[\\/]/.test(full)) continue
    if (entry.isDirectory()) walk(full, test, out)
    else if (test(entry.name)) out.push(full)
  }
  return out
}

const CSS_RULES = [
  [/direction:\s*rtl/g, "direction: var(--app-dir, rtl)"],
  [/text-align:\s*right/g, "text-align: start"], [/text-align:\s*left/g, "text-align: end"],
  [/(^|[\s;{])margin-left(\s*:)/g, "$1margin-inline-end$2"], [/(^|[\s;{])margin-right(\s*:)/g, "$1margin-inline-start$2"],
  [/(^|[\s;{])padding-left(\s*:)/g, "$1padding-inline-end$2"], [/(^|[\s;{])padding-right(\s*:)/g, "$1padding-inline-start$2"],
  [/(^|[\s;{])border-left(-[a-z]+)?(\s*:)/g, "$1border-inline-end$2$3"], [/(^|[\s;{])border-right(-[a-z]+)?(\s*:)/g, "$1border-inline-start$2$3"],
  [/border-top-left-radius/g, "border-start-end-radius"], [/border-top-right-radius/g, "border-start-start-radius"],
  [/border-bottom-left-radius/g, "border-end-end-radius"], [/border-bottom-right-radius/g, "border-end-start-radius"],
  [/(^|[\s;{])left(\s*:)/g, "$1inset-inline-end$2"], [/(^|[\s;{])right(\s*:)/g, "$1inset-inline-start$2"],
  [/float:\s*right/g, "float: inline-start"], [/float:\s*left/g, "float: inline-end"],
]
const STYLE_RULES = [
  [/textAlign:\s*(["'])right\1/g, 'textAlign: "start"'], [/textAlign:\s*(["'])left\1/g, 'textAlign: "end"'],
  [/\bmarginLeft(\s*:\s*["'\d-])/g, "marginInlineEnd$1"], [/\bmarginRight(\s*:\s*["'\d-])/g, "marginInlineStart$1"],
  [/\bpaddingLeft(\s*:\s*["'\d-])/g, "paddingInlineEnd$1"], [/\bpaddingRight(\s*:\s*["'\d-])/g, "paddingInlineStart$1"],
]

let changed = 0, replacements = 0
const apply = (file, rules, transform = (text, fn) => fn(text)) => {
  const source = fs.readFileSync(file, "utf8")
  const out = transform(source, (text) => rules.reduce((acc, [re, rep]) => acc.replace(re, (...args) => { replacements++; return typeof rep === "string" ? rep.replace(/\$(\d)/g, (_, i) => args[Number(i)] ?? "") : rep }), text))
  if (out !== source) { changed++; if (WRITE) fs.writeFileSync(file, out) }
}

for (const file of [...walk("app", (name) => name.endsWith(".css")), ...walk("components", (name) => name.endsWith(".css"))]) {
  apply(file, CSS_RULES, (text, fn) => text.split(/(\/\*[\s\S]*?\*\/)/).map((part, index) => (index % 2 ? part : fn(part))).join(""))
}
// أنماط مضمّنة في TSX: داخل style={{ ... }} فقط
for (const file of [...walk("components", (name) => name.endsWith(".tsx")), ...walk("app", (name) => name.endsWith(".tsx"))]) {
  apply(file, STYLE_RULES, (text, fn) => text.replace(/style=\{\{[\s\S]*?\}\}/g, (block) => fn(block)))
}
console.log(JSON.stringify({ changed, replacements, write: WRITE }))
