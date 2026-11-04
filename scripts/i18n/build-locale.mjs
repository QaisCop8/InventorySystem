// يدمج دفعات الترجمة (locales/parts/*.json) في locales/en.json ويولّد public/locales/en.js (يُحمَّل قبل التطبيق عند
// اختيار الإنجليزية — app/layout.tsx) و lib/i18n-build.ts (رقم نسخة لتجاوز ذاكرة المتصفح).
// الاستخدام: node scripts/i18n/build-locale.mjs
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const normalize = (text) => text.replace(/\s+/g, " ").trim()
const dictionary = fs.existsSync("locales/en.json") ? JSON.parse(fs.readFileSync("locales/en.json", "utf8")) : {}
const partsDir = "locales/parts"
let merged = 0
// دفعة = NNN.keys.json (المفاتيح العربية بالترتيب) + NNN.en.txt (سطر إنجليزي لكل مفتاح بنفس الترتيب)
const loadPart = (base) => {
  const keys = JSON.parse(fs.readFileSync(path.join(partsDir, `${base}.keys.json`), "utf8"))
  const lines = fs.readFileSync(path.join(partsDir, `${base}.en.txt`), "utf8").replace(/\r/g, "").split("\n")
  if (lines[lines.length - 1] === "") lines.pop()
  if (lines.length !== keys.length) throw new Error(`batch ${base}: ${keys.length} keys but ${lines.length} lines`)
  return Object.fromEntries(keys.map((key, index) => [key, lines[index]]))
}
if (fs.existsSync(partsDir)) {
  for (const file of fs.readdirSync(partsDir).filter((name) => name.endsWith(".en.txt")).sort()) {
    const part = loadPart(file.replace(/\.en\.txt$/, ""))
    for (const [key, value] of Object.entries(part)) {
      if (typeof value !== "string" || !value.trim()) continue
      // القالب يجب أن يحتفظ بنفس المواضع {0} {1}
      const slots = (text) => (text.match(/\{\d+\}/g) || []).sort().join()
      if (slots(key) !== slots(value)) { console.warn(`placeholder mismatch: ${key} => ${value}`); continue }
      dictionary[normalize(key)] = value.trim()
      merged++
    }
  }
}
const sorted = Object.fromEntries(Object.entries(dictionary).sort(([a], [b]) => a.localeCompare(b, "ar")))
fs.writeFileSync("locales/en.json", JSON.stringify(sorted, null, 1) + "\n")
const json = JSON.stringify(sorted)
const version = crypto.createHash("sha1").update(json).digest("hex").slice(0, 10)
fs.mkdirSync("public/locales", { recursive: true })
fs.writeFileSync("public/locales/en.js", `window.__I18N_EN=${json};\n`)
fs.writeFileSync("lib/i18n-build.ts", `// يُولَّد بواسطة scripts/i18n/build-locale.mjs — رقم نسخة القاموس لتجاوز ذاكرة المتصفح بعد كل تحديث للترجمة\nexport const I18N_BUILD = "${version}"\n`)
console.log(JSON.stringify({ entries: Object.keys(sorted).length, mergedFromParts: merged, version }))
