// يستخرج مفاتيح القاموس: (1) الوسيط الأول لكل tr()/trText()/textMatches() في الواجهة، (2) رسائل الخادم العربية في
// app/api و lib (قيم error/message/...، وسائط new XError()، رسائل NextResponse) كقوالب {0} لمطابقة الرسائل المركّبة.
// الناتج: scripts/i18n/out/keys.json (مفاتيح بلا ترجمة بعد مقارنة بـ locales/en.json) + إحصاءات.
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const ARABIC = /[؀-ۿ]/
const normalize = (text) => text.replace(/\s+/g, " ").trim()
const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (/node_modules/.test(full)) continue
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(tsx?|mjs)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full)
  }
  return out
}
const nameOf = (node) => (!node ? "" : ts.isIdentifier(node) ? node.text : ts.isStringLiteral(node) ? node.text : ts.isPropertyAccessExpression(node) ? `${nameOf(node.expression)}.${node.name.text}` : "")
const templateKey = (node) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span, index) => `{${index}}${span.literal.text}`).join("")
  return null
}

const ui = new Map()      // key -> first location
const server = new Map()
const add = (map, key, where) => { const k = normalize(key || ""); if (k && ARABIC.test(k) && !map.has(k)) map.set(k, where) }

const MESSAGE_KEYS = new Set(["error", "message", "warning", "title", "description", "detail", "reason", "hint"])
for (const file of [...walk("components"), ...walk("app"), ...walk("hooks"), ...walk("contexts"), ...walk("lib")]) {
  const source = fs.readFileSync(file, "utf8")
  if (!ARABIC.test(source)) continue
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const isServer = /^(app[\\/]api|lib)[\\/]/.test(file)
  const at = (node) => `${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = nameOf(node.expression)
      if (["tr", "trText"].includes(callee) && node.arguments[0]) add(ui, templateKey(node.arguments[0]), at(node))
      if (callee === "textMatches" && node.arguments[1] && ts.isArrayLiteralExpression(node.arguments[1])) node.arguments[1].elements.forEach((element) => add(ui, templateKey(element), at(node)))
    }
    if (isServer) {
      const key = templateKey(node)
      if (key !== null && ARABIC.test(key)) {
        // رسائل: قيمة حقل رسالة، وسيط new XError(...)، وسيط throw/Error، أو أي طرف في تعبير شرطي داخل هذه المواضع
        let child = node, parent = node.parent
        while (parent && (ts.isConditionalExpression(parent) || ts.isParenthesizedExpression(parent) || (ts.isBinaryExpression(parent) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(parent.operatorToken.kind)))) { child = parent; parent = parent.parent }
        const isMessage = parent && (
          (ts.isPropertyAssignment(parent) && MESSAGE_KEYS.has(nameOf(parent.name))) ||
          (ts.isNewExpression(parent) && /Error$/.test(nameOf(parent.expression))) ||
          (ts.isCallExpression(parent) && /(Error|error|fail|deny|denied|reject|Denied|Body|message|Message)$/.test(nameOf(parent.expression).split(".").pop() || "")) ||
          ts.isReturnStatement(parent) || ts.isThrowStatement(parent) ||
          (ts.isVariableDeclaration(parent) && /(error|message|msg|reason|problem|issue|label|title)$/i.test(nameOf(parent.name)))
        )
        if (isMessage) add(server, key, at(node))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

const existing = fs.existsSync("locales/en.json") ? JSON.parse(fs.readFileSync("locales/en.json", "utf8")) : {}
const all = new Map([...server, ...ui])
const missing = [...all.keys()].filter((key) => existing[key] === undefined)
fs.mkdirSync("scripts/i18n/out", { recursive: true })
fs.writeFileSync("scripts/i18n/out/keys.json", JSON.stringify(missing, null, 0))
fs.writeFileSync("scripts/i18n/out/key-locations.json", JSON.stringify(Object.fromEntries(missing.map((key) => [key, all.get(key)]))))
const chars = missing.reduce((sum, key) => sum + key.length, 0)
console.log(JSON.stringify({ ui: ui.size, server: server.size, total: all.size, translated: all.size - missing.length, missing: missing.length, missingChars: chars }))
