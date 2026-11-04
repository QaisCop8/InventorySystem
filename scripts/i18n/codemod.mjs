// Codemod: يلفّ نصوص العرض العربية بـ tr() (lib/i18n.ts) ويحوّل اتجاه الواجهة لخصائص منطقية تعمل في RTL و LTR.
// الاستخدام: node scripts/i18n/codemod.mjs [--write] [--files a.tsx,b.tsx]
//   بدون --write: يطبع إحصاءات ويكتب التقرير فقط.
// النطاق: components/ app/ (عدا app/api) hooks/ contexts/ — ملفات واجهة فقط. lib/ و app/api مستبعدة عمداً: نصوصها
// تُحفظ في قاعدة البيانات أو تُقارن كأسماء صلاحيات، ورسائل الخادم تُترجم في المتصفح (auth-context#translateApiResponse).
// لا يُلفّ أي نص في موضع منطقي (مقارنة، قيمة تُرسل للخادم، مفتاح) — تُسجَّل في التقرير للمراجعة.
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const ROOT = process.cwd()
const WRITE = process.argv.includes("--write")
const CLASSES_ONLY = process.argv.includes("--classes-only")
const filesArg = process.argv.find((arg) => arg.startsWith("--files="))
const ARABIC = /[؀-ۿ]/

const INCLUDE_DIRS = ["components", "app", "hooks", "contexts"]
const EXCLUDE = [/^app[\\/]api[\\/]/, /node_modules/, /\.d\.ts$/]

// خصائص JSX التي قيمتها ليست نص عرض
const NON_DISPLAY_ATTRS = new Set(["value", "defaultValue", "key", "id", "name", "section", "field", "dataKey", "href", "src", "className", "class", "style", "type", "role", "htmlFor", "accessKey", "lang", "dir", "pattern", "accept", "autoComplete", "inputMode", "form", "target", "rel", "method", "action", "sortField", "filterField", "permission", "permissionName", "requiredPermission", "accessName", "family", "storageKey", "value_ar"])
// مفاتيح كائنات قيمتها نص عرض
const DISPLAY_KEYS = new Set(["label", "title", "description", "text", "placeholder", "header", "message", "hint", "error", "tooltip", "subtitle", "subTitle", "caption", "heading", "emptyMessage", "emptyText", "summary", "confirmText", "cancelText", "okText", "helpText", "helperText", "detail", "details", "shortLabel", "groupLabel", "sectionTitle", "buttonText", "loadingText", "successMessage", "errorMessage", "warning", "info", "badge", "tip", "legend", "suffix", "prefix", "desc", "headerName", "displayName", "confirmLabel", "cancelLabel", "actionLabel", "emptyLabel", "unitLabel", "body", "content", "question", "answer", "reason", "explanation", "instructions", "footer"])
const DISPLAY_KEY_SUFFIX = /(Label|Title|Text|Message|Placeholder|Hint|Description|Caption|Heading|Tooltip|_label|_title|_text|_message|_hint)$/
// استدعاءات وسائطها نص عرض
const DISPLAY_CALLEE = /^(set\w*(Error|Message|Status|Notice|Warning|Text|Title|Hint|Info|Feedback|Toast|Alert|Caption|Label|Problem|Issue)s?|alert|confirm|prompt|confirmYesNo|confirmDialog|showError|showMessage|showSuccess|showWarning|showInfo|notify\w*|toast(\.\w+)?|addMessage|pushMessage|reportError|setStatusText|fail|onError|showAlert|showErrorMessage|showErrorToast|showResult|showValidationMessage|showDialogMessage|show|validationError|errorText|readError|cardTitle|openDeleteConfirm|openNoteDialog|field|totalRow|act|book_append_sheet)$/
// أسماء متغيرات/دوال نتيجتها نص عرض
const DISPLAY_VAR = /(title|label|labels|message|messages|text|caption|heading|hint|description|placeholder|error|errors|tooltip|names|captions|headers|titles|issue|problem|warning|subtitle|summary)$/i
const DISPLAY_FN = /(issue|error|validat\w*|message|label|title|text|problem|reason|describe|description|hint|caption|heading|summary|warning|statusName|typeName|modeName|displayName|tooltip)$/i

const stats = { files: 0, changed: 0, wrapped: 0, dirAttrs: 0, classes: 0, skipped: 0 }
const report = []

function listFiles() {
  if (filesArg) return filesArg.slice("--files=".length).split(",").filter(Boolean)
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name)
      if (EXCLUDE.some((re) => re.test(rel))) continue
      if (entry.isDirectory()) walk(rel)
      else if (/\.(tsx|ts)$/.test(entry.name)) out.push(rel)
    }
  }
  for (const dir of INCLUDE_DIRS) if (fs.existsSync(path.join(ROOT, dir))) walk(dir)
  return out
}

// ---------- الاتجاه: خصائص Tailwind فيزيائية ⇐ منطقية (نفس الشكل في RTL، معكوسة تلقائياً في LTR) ----------
// في RTL: right = start، left = end. لذا text-right ⇐ text-start، ml ⇐ me، mr ⇐ ms ...
const CLASS_MAP = [
  // قيم Tailwind فقط (رقم، [..]، auto، px) — أسماء أصناف مخصصة مثل ml-card (شاشة دخول الإدارة) لا تُمس
  [/(^|[\s:!"'`])(-?)ml-(?=[\d[]|auto\b|px\b)/g, "$1$2me-"], [/(^|[\s:!"'`])(-?)mr-(?=[\d[]|auto\b|px\b)/g, "$1$2ms-"],
  [/(^|[\s:!"'`])pl-(?=[\d[]|px\b)/g, "$1pe-"], [/(^|[\s:!"'`])pr-(?=[\d[]|px\b)/g, "$1ps-"],
  [/(^|[\s:!"'`])text-right(?![\w-])/g, "$1text-start"], [/(^|[\s:!"'`])text-left(?![\w-])/g, "$1text-end"],
  // left-1/2 / left-[50%] تبقى فيزيائية: تُقرن بـ -translate-x-1/2 للتوسيط (translate لا ينعكس مع الاتجاه)
  [/(^|[\s:!"'`])(-?)right-(?!1\/2|\[50%\])(?=[\d[\w])/g, "$1$2start-"], [/(^|[\s:!"'`])(-?)left-(?!1\/2|\[50%\])(?=[\d[\w])/g, "$1$2end-"],
  [/(^|[\s:!"'`])border-r(?=[\s"'`-]|$)/g, "$1border-s"], [/(^|[\s:!"'`])border-l(?=[\s"'`-]|$)/g, "$1border-e"],
  [/(^|[\s:!"'`])rounded-r(?=[\s"'`-]|$)/g, "$1rounded-s"], [/(^|[\s:!"'`])rounded-l(?=[\s"'`-]|$)/g, "$1rounded-e"],
  [/(^|[\s:!"'`])rounded-tr(?=[\s"'`-]|$)/g, "$1rounded-ss"], [/(^|[\s:!"'`])rounded-tl(?=[\s"'`-]|$)/g, "$1rounded-se"],
  [/(^|[\s:!"'`])rounded-br(?=[\s"'`-]|$)/g, "$1rounded-es"], [/(^|[\s:!"'`])rounded-bl(?=[\s"'`-]|$)/g, "$1rounded-ee"],
  [/(^|[\s:!"'`])float-right(?![\w-])/g, "$1float-start"], [/(^|[\s:!"'`])float-left(?![\w-])/g, "$1float-end"],
  [/(^|[\s:!"'`])scroll-mr-/g, "$1scroll-ms-"], [/(^|[\s:!"'`])scroll-ml-/g, "$1scroll-me-"],
]
const CLASS_CALLEES = new Set(["cn", "clsx", "cx", "classNames", "twMerge", "cva", "twJoin"])
const isClassToken = (text) => /(^|[\s"'`:!])(-?m[lr]-|p[lr]-|text-(left|right)|-?(left|right)-|border-[lr]\b|rounded-[tb]?[lr]\b|float-(left|right))/.test(text)
function convertClasses(text) {
  let out = text
  for (const [re, rep] of CLASS_MAP) out = out.replace(re, rep)
  return out
}

// ---------- تحويل ملف ----------
function decodeEntities(text) {
  return text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
}
// نفس قاعدة JSX لمسافات النص متعدد الأسطر
function jsxTextValue(raw) {
  if (!raw.includes("\n")) return raw
  const lines = raw.split(/\r?\n/)
  const kept = []
  lines.forEach((line, index) => {
    let value = line
    if (index > 0) value = value.replace(/^[ \t]+/, "")
    if (index < lines.length - 1) value = value.replace(/[ \t]+$/, "")
    if (value) kept.push(value)
  })
  return kept.join(" ")
}

function nameOf(node) {
  if (!node) return ""
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  if (ts.isPropertyAccessExpression(node)) return `${nameOf(node.expression)}.${node.name.text}`
  return ""
}

function enclosingFunctionName(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) return nameOf(current.name)
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent
      if (parent && ts.isVariableDeclaration(parent)) return nameOf(parent.name)
      if (parent && ts.isPropertyAssignment(parent)) return nameOf(parent.name)
      return ""
    }
  }
  return ""
}

/** هل موضع هذا التعبير موضع عرض؟ يعيد سبباً نصياً أو null. */
function displayContext(node) {
  let child = node
  let parent = node.parent
  // الصعود عبر التعابير الشرطية/المنطقية/الأقواس/الدمج بـ + — قيمتها تذهب للموضع الأعلى
  while (parent && (
    ts.isParenthesizedExpression(parent) ||
    (ts.isConditionalExpression(parent) && parent.condition !== child) ||
    (ts.isBinaryExpression(parent) && ([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(parent.operatorToken.kind) ? parent.right === child || parent.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken : parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) ||
    ts.isAsExpression(parent) || ts.isNonNullExpression(parent) || ts.isSatisfiesExpression?.(parent)
  )) { child = parent; parent = parent.parent }
  if (!parent) return null
  // مقارنة مع تسمية مترجمة (x.label === "فعّالة") — الطرفان يُترجمان معاً وإلا تفشل المقارنة بالإنجليزية
  if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) {
    const other = parent.left === child ? parent.right : parent.left
    const otherName = nameOf(other).split(".").pop() || ""
    return ts.isPropertyAccessExpression(other) && (DISPLAY_KEYS.has(otherName) || DISPLAY_KEY_SUFFIX.test(otherName)) && otherName !== "error" && otherName !== "message" ? "compare-label" : null
  }
  if (ts.isJsxExpression(parent)) {
    const holder = parent.parent
    if (holder && (ts.isJsxElement(holder) || ts.isJsxFragment(holder))) return "jsx-child"
    if (holder && ts.isJsxAttribute(holder)) return NON_DISPLAY_ATTRS.has(nameOf(holder.name)) || nameOf(holder.name).startsWith("data-") ? null : "jsx-attr"
    return null
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === child) {
    const key = nameOf(parent.name)
    if (DISPLAY_KEYS.has(key) || DISPLAY_KEY_SUFFIX.test(key)) return "prop"
    // خريطة تسميات: const paymentLabels = { cash: "نقدي" }
    const object = parent.parent
    const holder = object?.parent
    if (holder && ts.isVariableDeclaration(holder) && DISPLAY_VAR.test(nameOf(holder.name))) return "label-map"
    if (holder && (ts.isAsExpression(holder) || ts.isSatisfiesExpression?.(holder)) && holder.parent && ts.isVariableDeclaration(holder.parent) && DISPLAY_VAR.test(nameOf(holder.parent.name))) return "label-map"
    return null
  }
  if (ts.isCallExpression(parent) && parent.arguments.includes(child)) {
    const callee = nameOf(parent.expression).split(".").pop() || ""
    const full = nameOf(parent.expression)
    if (DISPLAY_CALLEE.test(callee) || DISPLAY_CALLEE.test(full)) return "call"
    return null
  }
  if (ts.isNewExpression(parent) && parent.arguments?.includes(child) && /Error$/.test(nameOf(parent.expression))) return "error"
  if (ts.isReturnStatement(parent) || (ts.isArrowFunction(parent) && parent.body === child)) {
    return DISPLAY_FN.test(enclosingFunctionName(child)) ? "return" : null
  }
  if (ts.isVariableDeclaration(parent) && parent.initializer === child) return DISPLAY_VAR.test(nameOf(parent.name)) ? "var" : null
  if (ts.isArrayLiteralExpression(parent)) {
    const holder = parent.parent
    if (holder && ts.isVariableDeclaration(holder) && DISPLAY_VAR.test(nameOf(holder.name))) return "label-array"
    if (holder && ts.isPropertyAssignment(holder) && (DISPLAY_KEYS.has(nameOf(holder.name)) || /(labels|options|titles|headers|columns|steps|tabs)$/i.test(nameOf(holder.name)))) return "label-array"
    // رؤوس جداول PDF/Excel وأسماء الأشهر والأيام
    if (holder && ts.isPropertyAssignment(holder) && /^(head|header|headers|columns)$/.test(nameOf(holder.name))) return "label-array"
    if (holder && ts.isVariableDeclaration(holder) && /^(MONTHS|months|monthNames|MONTH_NAMES|weekdays|WEEKDAYS|dayNames|DAYS|days|header|headers|HEADERS|columns)$/.test(nameOf(holder.name))) return "label-array"
    if (holder && ts.isArrayLiteralExpression(holder) && holder.parent && ts.isPropertyAssignment(holder.parent) && /^(head|header|headers)$/.test(nameOf(holder.parent.name))) return "label-array"
    if (holder && ts.isCallExpression(holder) && /^(setErrorMessages|setErrors|setWarnings)$/.test(nameOf(holder.expression))) return "label-array"
    return null
  }
  return null
}

// للتقرير: أين ينتهي النص بعد الصعود عبر الشروط — نوع العقدة + اسم الدالة/المفتاح/المتغير
function finalContext(node) {
  let child = node
  let parent = node.parent
  while (parent && (ts.isParenthesizedExpression(parent) || ts.isConditionalExpression(parent) || (ts.isBinaryExpression(parent) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(parent.operatorToken.kind)) || ts.isAsExpression(parent))) { child = parent; parent = parent.parent }
  if (!parent) return "?"
  const kind = ts.SyntaxKind[parent.kind]
  if (ts.isCallExpression(parent)) return `call:${nameOf(parent.expression)}`
  if (ts.isNewExpression(parent)) return `new:${nameOf(parent.expression)}`
  if (ts.isPropertyAssignment(parent)) return `prop:${nameOf(parent.name)}`
  if (ts.isVariableDeclaration(parent)) return `var:${nameOf(parent.name)}`
  if (ts.isBinaryExpression(parent)) return `bin:${ts.tokenToString(parent.operatorToken.kind)}`
  if (ts.isArrayLiteralExpression(parent)) {
    const holder = parent.parent
    return `array:${holder ? (ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder) ? nameOf(holder.name) : ts.isCallExpression(holder) ? "call:" + nameOf(holder.expression) : ts.SyntaxKind[holder.kind]) : ""}`
  }
  if (ts.isReturnStatement(parent) || ts.isArrowFunction(parent)) return `return:${enclosingFunctionName(child)}`
  return kind
}

// نص داخل نوع (اتحاد أنواع حرفية، مفتاح نوع) — ليس قيمة
function isTypePosition(node) {
  let current = node.parent
  for (let depth = 0; current && depth < 6; current = current.parent, depth++) {
    if (ts.isLiteralTypeNode(current) || ts.isTypeReferenceNode(current) || ts.isUnionTypeNode(current) || ts.isIndexedAccessTypeNode(current)) return true
    if (ts.isImportDeclaration(current) || ts.isExportDeclaration(current)) return true
    if (ts.isBlock(current) || ts.isSourceFile(current)) return false
  }
  return false
}

function transformFile(rel) {
  const full = path.join(ROOT, rel)
  const source = fs.readFileSync(full, "utf8")
  const hasArabic = ARABIC.test(source)
  const hasDir = /dir=["']rtl["']|dir:\s*["']rtl["']/.test(source)
  const hasClasses = isClassToken(source)
  if (!hasArabic && !hasDir && !hasClasses) return
  stats.files++
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const edits = []
  let trName = "tr"
  let needsTr = false
  let needsDir = false
  // تعارض اسم tr مع معرّف موجود في الملف
  const declared = new Set()
  const collect = (node) => {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isParameter(node) || ts.isImportSpecifier(node)) && node.name && ts.isIdentifier(node.name)) declared.add(node.name.text)
    ts.forEachChild(node, collect)
  }
  collect(sf)
  if (declared.has("tr") && !/import \{[^}]*\btr\b[^}]*\} from "@\/lib\/i18n"/.test(source)) trName = "trText"
  const alreadyImported = /from "@\/lib\/i18n"/.test(source)

  const call = (template, args) => `${trName}(${JSON.stringify(template)}${args.map((arg) => `, ${arg}`).join("")})`
  const wrapNode = (node, reason) => {
    needsTr = true
    stats.wrapped++
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      edits.push({ start: node.getStart(sf), end: node.getEnd(), text: call(node.text, []) })
      return
    }
    // TemplateExpression ⇐ قالب {0} {1}
    let template = node.head.text
    const args = []
    node.templateSpans.forEach((span, index) => {
      template += `{${index}}` + span.literal.text
      args.push(source.slice(span.expression.getStart(sf), span.expression.getEnd()))
    })
    edits.push({ start: node.getStart(sf), end: node.getEnd(), text: call(template, args) })
    void reason
  }
  const alreadyWrapped = (node) => {
    const parent = node.parent
    return parent && ts.isCallExpression(parent) && ["tr", "trText", "translateText", "t"].includes(nameOf(parent.expression))
  }
  const line = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

  const visit = (node) => {
    // dir="rtl" ⇐ dir={appDir()}
    if (ts.isJsxAttribute(node) && nameOf(node.name) === "dir" && node.initializer && ts.isStringLiteral(node.initializer) && node.initializer.text === "rtl") {
      edits.push({ start: node.initializer.getStart(sf), end: node.initializer.getEnd(), text: "{appDir()}" })
      needsDir = true; stats.dirAttrs++
      return
    }
    // أصناف Tailwind
    const classContext = (() => {
      if (!(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))) return false
      for (let current = node.parent, depth = 0; current && depth < 8; current = current.parent, depth++) {
        if (ts.isJsxAttribute(current)) return ["className", "class", "contentClassName", "headerClassName", "bodyClassName", "panelClassName", "inputClassName", "wrapperClassName"].includes(nameOf(current.name)) || /ClassName$/.test(nameOf(current.name))
        if (ts.isCallExpression(current) && CLASS_CALLEES.has(nameOf(current.expression))) return true
        if (ts.isPropertyAssignment(current)) return /(className|class|Class)$/.test(nameOf(current.name)) || /^(base|variants?|size|default|compoundVariants)$/.test(nameOf(current.name))
        if (ts.isVariableDeclaration(current)) return /(class|Class|classes|Classes|styles?)$/.test(nameOf(current.name))
      }
      return false
    })()
    if (classContext) {
      const raw = source.slice(node.getStart(sf), node.getEnd())
      if (isClassToken(raw)) {
        const converted = convertClasses(raw)
        if (converted !== raw) { edits.push({ start: node.getStart(sf), end: node.getEnd(), text: converted }); stats.classes++ }
      }
      return
    }
    // --classes-only: تحويل أصناف الاتجاه فقط دون لفّ النصوص
    if (CLASSES_ONLY) { ts.forEachChild(node, visit); return }
    if (ts.isJsxText(node) && ARABIC.test(node.text)) {
      const value = decodeEntities(jsxTextValue(node.getFullText(sf)))
      if (value.trim()) {
        needsTr = true; stats.wrapped++
        const leading = /^\s*/.exec(node.getFullText(sf))[0]
        const trailing = /\s*$/.exec(node.getFullText(sf))[0]
        // يحافظ على المسافة المرئية حول النص (سطر جديد لا يُعدّ مسافة في JSX)
        const keepLead = leading && !leading.includes("\n") ? "" : ""
        void keepLead
        edits.push({ start: node.getFullStart(), end: node.getEnd(), text: `${leading.includes("\n") ? leading : ""}{${call(value, [])}}${trailing.includes("\n") ? trailing : ""}` })
      }
      return
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && ARABIC.test(node.initializer.text)) {
      const attr = nameOf(node.name)
      if (NON_DISPLAY_ATTRS.has(attr) || attr.startsWith("data-")) {
        stats.skipped++; report.push(`${rel}:${line(node)}\tattr:${attr}\t${node.initializer.text.slice(0, 80)}`)
      } else {
        needsTr = true; stats.wrapped++
        edits.push({ start: node.initializer.getStart(sf), end: node.initializer.getEnd(), text: `{${call(node.initializer.text, [])}}` })
      }
      return
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && ARABIC.test(node.getText(sf))) {
      if (isTypePosition(node) || alreadyWrapped(node) || (node.parent && (ts.isPropertyAssignment(node.parent) && node.parent.name === node || ts.isJsxAttribute(node.parent) || ts.isImportDeclaration(node.parent) || ts.isExternalModuleReference(node.parent) || ts.isLiteralTypeNode(node.parent) || ts.isCaseClause(node.parent) || ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node))) {
        if (node.parent && ts.isCaseClause(node.parent)) { stats.skipped++; report.push(`${rel}:${line(node)}\tcase\t${node.getText(sf).slice(0, 80)}`) }
        return
      }
      const reason = displayContext(node)
      if (reason) { wrapNode(node, reason); return }
      stats.skipped++
      report.push(`${rel}:${line(node)}\t${finalContext(node)}\t${node.getText(sf).replace(/\s+/g, " ").slice(0, 100)}`)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (!edits.length) return
  edits.sort((a, b) => b.start - a.start)
  // كود مضغوط: return"نص" ⇐ return tr("نص") لا return tr("نص")
  for (const edit of edits) if (/^[A-Za-z_$]/.test(edit.text) && /[A-Za-z0-9_$]$/.test(source.slice(0, edit.start))) edit.text = ` ${edit.text}`
  let out = source
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)

  // الاستيراد
  const names = [needsTr ? (trName === "tr" ? "tr" : "tr as trText") : null, needsDir ? "appDir" : null].filter(Boolean)
  if (names.length) {
    if (alreadyImported) {
      out = out.replace(/import \{([^}]*)\} from "@\/lib\/i18n"/, (whole, inner) => {
        const existing = inner.split(",").map((part) => part.trim()).filter(Boolean)
        for (const name of names) if (!existing.includes(name)) existing.push(name)
        return `import { ${existing.join(", ")} } from "@/lib/i18n"`
      })
    } else {
      const importLine = `import { ${names.join(", ")} } from "@/lib/i18n"\n`
      const directive = /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)(["']use (client|server)["'];?\s*\n)/.exec(out)
      if (directive) out = out.slice(0, directive[0].length) + importLine + out.slice(directive[0].length)
      else out = importLine + out
    }
  }
  stats.changed++
  if (WRITE) fs.writeFileSync(full, out)
}

for (const file of listFiles()) {
  try { transformFile(file) } catch (error) { console.error("FAILED", file, error.message) }
}
fs.mkdirSync(path.join(ROOT, "scripts/i18n/out"), { recursive: true })
fs.writeFileSync(path.join(ROOT, "scripts/i18n/out/skipped.tsv"), report.join("\n"))
console.log(JSON.stringify(stats))
