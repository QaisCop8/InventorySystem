"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Columns3, Download, FileSpreadsheet, Loader2, RefreshCw, Trash2, Upload, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { WorkspaceDialogProvider } from "@/contexts/workspace-dialog-context"
import Messages from "@/components/common/Messages"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// محرك الاستيراد الموحّد من Excel — نفس التصميم والخطوات لكل الشاشات:
//   1) رفع الملف (أو تحميل نموذج)  2) مطابقة الأعمدة (تلقائية قابلة للتعديل)
//   3) مراجعة الأخطاء وتصحيحها مباشرة بالجدول  4) الاستيراد مع نتيجة كل سطر وإعادة محاولة الفاشل.
// كل شاشة تمرّر فقط إعدادها (ImportConfig): الحقول، التحقق الخاص بها، ودالة الحفظ.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type ImportFieldType = "text" | "number" | "integer" | "boolean" | "date"

export type ImportField = {
  key: string
  label: string
  required?: boolean
  type?: ImportFieldType
  /** أسماء أعمدة بديلة تُطابَق تلقائياً (عربية/إنجليزية) */
  aliases?: string[]
  /** يجب ألا تتكرر القيمة داخل الملف */
  unique?: boolean
  /** قيمة يجب أن تكون من القائمة — تُطابَق مع label أو value أو aliases (بلا حساسية للحالة/المسافات) */
  options?: Array<{ value: string | number; label: string; aliases?: string[] }>
  maxLength?: number
  min?: number
  example?: string | number
  /** عرض العمود في جدول المراجعة */
  width?: number
  description?: string
}

export type ImportIssue = { field?: string; message: string }
export type ParsedRow = { id: number; rowNumber: number; data: Record<string, any> }
export type RowResult = { ok: boolean; message?: string }

export type ImportConfig<Ctx = any> = {
  title: string
  description?: string
  fields: ImportField[]
  templateFileName: string
  sampleRows?: Record<string, any>[]
  /** تحميل قوائم مرجعية (عملات، مستودعات، أكواد موجودة...) مرة واحدة قبل التحقق */
  prepare?: () => Promise<Ctx>
  /** تحقق خاص بالشاشة (تكرار مع قاعدة البيانات، علاقات بين الحقول...) — بالإضافة لتحقق المحرك */
  validate?: (rows: ParsedRow[], ctx: Ctx) => Map<number, ImportIssue[]> | Promise<Map<number, ImportIssue[]>>
  /** الحفظ: تُستدعى report(id, نتيجة) لكل سطر؛ ترتيب الحفظ مسؤولية الإعداد */
  importRows: (rows: ParsedRow[], ctx: Ctx, report: (id: number, result: RowResult) => void, signal: AbortSignal) => Promise<void>
  importButtonLabel?: string
  /** واجهة إضافية بخطوة الرفع (مثل اختيار هيكل حسابات جاهز) — loadRows تُحمِّل صفوفاً مفاتيحها field.key */
  uploadExtras?: (api: { loadRows: (rows: Record<string, any>[]) => void; busy: boolean }) => ReactNode
  /** إغلاق النافذة تلقائياً عند نجاح كل الأسطر (مثل استيراد أسطر فاتورة إلى الشبكة) */
  closeOnSuccess?: boolean
  /** شرط مسبق غير متحقق (مثل حساب أب افتراضي غير معرَّف) — يُعرض بمكوّن الرسائل ويمنع الرفع والاستيراد */
  blockingMessage?: string
}

type Step = "upload" | "mapping" | "review" | "result"
type EditableRow = { id: number; rowNumber: number; values: Record<string, string> }

const NONE = "__none__"
const PAGE_SIZE = 50
const STEPS: Array<{ key: Step; label: string }> = [
  { key: "upload", label: "رفع الملف" },
  { key: "mapping", label: "مطابقة الأعمدة" },
  { key: "review", label: "مراجعة الأخطاء" },
  { key: "result", label: "الاستيراد" },
]

/** تطبيع أسماء الأعمدة للمطابقة: بلا مسافات/تشكيل/همزات، ة=ه، ى=ي. */
export function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s_\-().:*#/\\]+/g, "")
    .trim()
}

const cellText = (value: unknown) => {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

function guessMapping(fields: ImportField[], headers: string[]) {
  const normalized = headers.map((header) => ({ header, key: normalizeHeader(header) }))
  const used = new Set<string>()
  const mapping: Record<string, string> = {}
  for (const field of fields) {
    const candidates = [field.label, field.key, ...(field.aliases || [])].map(normalizeHeader).filter(Boolean)
    const match = normalized.find((item) => !used.has(item.header) && candidates.includes(item.key))
    mapping[field.key] = match ? match.header : NONE
    if (match) used.add(match.header)
  }
  return mapping
}

function excelDate(value: string) {
  const serial = Number(value)
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000))
    return date.toISOString().slice(0, 10)
  }
  const match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`
  const iso = value.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
  return null
}

/** الخيار المطابق لنص (اسم، رقم، أو اسم بديل) — نفس المطابقة للتحقق ولعرض القائمة. */
function findOption(field: ImportField, raw: string) {
  const key = normalizeHeader(raw)
  if (!key) return undefined
  return field.options?.find((item) => [item.label, String(item.value), ...(item.aliases || [])].some((candidate) => normalizeHeader(candidate) === key))
}

/** تحويل قيمة نصية (كما في الملف/الجدول) إلى قيمة مكتوبة حسب نوع الحقل + أخطاء التحويل. */
function convert(field: ImportField, raw: string): { value: any; issue?: string } {
  const text = raw.trim()
  if (!text) return { value: field.type === "boolean" ? false : field.type === "number" || field.type === "integer" ? null : "" }
  if (field.options?.length) {
    const option = findOption(field, text)
    if (!option) return { value: text, issue: `القيمة "${text}" غير موجودة في ${field.label}` }
    return { value: option.value }
  }
  switch (field.type) {
    case "number":
    case "integer": {
      const numeric = Number(text.replace(/,/g, "").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))))
      if (!Number.isFinite(numeric)) return { value: text, issue: `${field.label} يجب أن يكون رقماً` }
      if (field.type === "integer" && !Number.isInteger(numeric)) return { value: numeric, issue: `${field.label} يجب أن يكون رقماً صحيحاً` }
      if (field.min !== undefined && numeric < field.min) return { value: numeric, issue: `${field.label} يجب ألا يقل عن ${field.min}` }
      return { value: numeric }
    }
    case "boolean": {
      const key = normalizeHeader(text)
      if (["1", "true", "نعم", "yes", "y", "صح"].includes(key)) return { value: true }
      if (["0", "false", "لا", "no", "n", "خطا"].includes(key)) return { value: false }
      return { value: false, issue: `${field.label}: استخدم نعم/لا أو 1/0` }
    }
    case "date": {
      const date = excelDate(text)
      return date ? { value: date } : { value: text, issue: `${field.label}: تاريخ غير صالح (استخدم YYYY-MM-DD)` }
    }
    default:
      if (field.maxLength && text.length > field.maxLength) return { value: text, issue: `${field.label} يجب ألا يزيد عن ${field.maxLength} حرفاً` }
      return { value: text }
  }
}

async function downloadSheet(fileName: string, rows: Record<string, any>[], headers: string[]) {
  const XLSX = await import("xlsx")
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers })
  sheet["!cols"] = headers.map((header) => ({ wch: Math.max(12, Math.min(40, header.length + 4)) }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, "Data")
  XLSX.writeFile(book, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`)
}

export function ExcelImportWizard<Ctx>({ open, onOpenChange, config, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; config: ImportConfig<Ctx>; onImported?: (summary: { success: number; failed: number }) => void }) {
  const [step, setStep] = useState<Step>("upload")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [fileName, setFileName] = useState("")
  const [workbook, setWorkbook] = useState<any>(null)
  const [sheetName, setSheetName] = useState("")
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [rows, setRows] = useState<EditableRow[]>([])
  const [issues, setIssues] = useState<Map<number, ImportIssue[]>>(new Map())
  const [validating, setValidating] = useState(false)
  const [filter, setFilter] = useState<"all" | "errors" | "valid">("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  const [results, setResults] = useState<Map<number, RowResult>>(new Map())
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [importing, setImporting] = useState(false)
  const ctxRef = useRef<Ctx | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const validationSeq = useRef(0)
  const messagesRef = useRef<any>(null)
  const blocked = Boolean(config.blockingMessage)

  useEffect(() => {
    if (!open || !config.blockingMessage) return
    // بعد تركيب النافذة (Messages داخل محتوى الحوار)
    const timer = setTimeout(() => {
      messagesRef.current?.clear?.()
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: config.blockingMessage, sticky: true }])
    }, 0)
    return () => clearTimeout(timer)
  }, [open, config.blockingMessage])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setStep("upload"); setBusy(false); setError(""); setFileName(""); setWorkbook(null); setSheetName(""); setHeaders([]); setRawRows([])
    setMapping({}); setRows([]); setIssues(new Map()); setFilter("all"); setSearch(""); setPage(0); setResults(new Map()); setProgress({ done: 0, total: 0 }); setImporting(false)
    ctxRef.current = null
  }, [])
  useEffect(() => { if (!open) reset() }, [open, reset])

  const ensureCtx = async () => {
    if (ctxRef.current === null && config.prepare) ctxRef.current = await config.prepare()
    return ctxRef.current as Ctx
  }

  // ── 1) الرفع ───────────────────────────────────────────────────────────────
  const readSheet = async (book: any, name: string) => {
    const XLSX = await import("xlsx")
    const sheet = book.Sheets[name]
    const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false })
    const headerRow = (matrix[0] || []).map((value: unknown) => cellText(value))
    const cleanHeaders = headerRow.map((header: string, index: number) => header || `عمود ${index + 1}`)
    const data = matrix.slice(1).filter((line) => line.some((value) => cellText(value) !== "")).map((line) => Object.fromEntries(cleanHeaders.map((header: string, index: number) => [header, cellText(line[index])])))
    if (!data.length) throw new Error("لا توجد بيانات في الورقة المختارة")
    setHeaders(cleanHeaders)
    setRawRows(data)
    setMapping(guessMapping(config.fields, cleanHeaders))
  }

  const onFile = async (file: File) => {
    if (blocked) return
    setError(""); setBusy(true)
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("يرجى اختيار ملف Excel (.xlsx أو .xls) أو CSV")
      const XLSX = await import("xlsx")
      const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false })
      const first = book.SheetNames[0]
      setWorkbook(book); setSheetName(first); setFileName(file.name)
      await readSheet(book, first)
      setStep("mapping")
    } catch (cause: any) {
      setError(cause?.message || "تعذر قراءة الملف")
    } finally { setBusy(false) }
  }

  const loadRowsDirect = (data: Record<string, any>[]) => {
    // صفوف جاهزة (مفاتيحها field.key) — تتخطّى المطابقة.
    const direct = config.fields.map((field) => field.key)
    setHeaders(direct)
    setRawRows(data.map((row) => Object.fromEntries(direct.map((key) => [key, cellText(row[key])]))))
    setMapping(Object.fromEntries(direct.map((key) => [key, key])))
    setFileName("بيانات جاهزة")
    void buildRows(data.map((row) => Object.fromEntries(direct.map((key) => [key, cellText(row[key])]))), Object.fromEntries(direct.map((key) => [key, key])))
  }

  const downloadTemplate = () => {
    const headerLabels = config.fields.map((field) => field.label)
    const samples = (config.sampleRows || [Object.fromEntries(config.fields.map((field) => [field.key, field.example ?? ""]))]).map((row) => Object.fromEntries(config.fields.map((field) => [field.label, row[field.key] ?? ""])))
    void downloadSheet(config.templateFileName, samples, headerLabels)
  }

  // ── 2) المطابقة ────────────────────────────────────────────────────────────
  const mappedFields = useMemo(() => config.fields.filter((field) => mapping[field.key] && mapping[field.key] !== NONE), [config.fields, mapping])
  const missingRequired = config.fields.filter((field) => field.required && (!mapping[field.key] || mapping[field.key] === NONE))
  const usedHeaders = new Set(Object.values(mapping).filter((value) => value && value !== NONE))
  const unmappedHeaders = headers.filter((header) => !usedHeaders.has(header))

  const buildRows = async (source = rawRows, map = mapping) => {
    setBusy(true); setError("")
    try {
      await ensureCtx()
      const editable = source.map((row, index) => ({
        id: index + 1,
        rowNumber: index + 2,
        values: Object.fromEntries(config.fields.map((field) => [field.key, map[field.key] && map[field.key] !== NONE ? cellText(row[map[field.key]]) : ""])),
      }))
      setRows(editable); setResults(new Map()); setPage(0); setFilter("all")
      setStep("review")
      await runValidation(editable)
    } catch (cause: any) {
      setError(cause?.message || "تعذر تجهيز البيانات")
    } finally { setBusy(false) }
  }

  // ── 3) التحقق والمراجعة ────────────────────────────────────────────────────
  const parse = useCallback((row: EditableRow) => {
    const data: Record<string, any> = {}
    const rowIssues: ImportIssue[] = []
    for (const field of config.fields) {
      const raw = row.values[field.key] ?? ""
      if (field.required && !raw.trim()) { rowIssues.push({ field: field.key, message: `${field.label} مطلوب` }); data[field.key] = ""; continue }
      const { value, issue } = convert(field, raw)
      data[field.key] = value
      if (issue) rowIssues.push({ field: field.key, message: issue })
    }
    return { parsed: { id: row.id, rowNumber: row.rowNumber, data } as ParsedRow, rowIssues }
  }, [config.fields])

  const runValidation = async (current: EditableRow[]) => {
    const sequence = ++validationSeq.current
    setValidating(true)
    try {
      const all = new Map<number, ImportIssue[]>()
      const parsedRows: ParsedRow[] = []
      for (const row of current) {
        const { parsed, rowIssues } = parse(row)
        parsedRows.push(parsed)
        if (rowIssues.length) all.set(row.id, rowIssues)
      }
      // تكرار داخل الملف للحقول الفريدة
      for (const field of config.fields.filter((item) => item.unique)) {
        const seen = new Map<string, number>()
        for (const row of parsedRows) {
          const key = normalizeHeader(row.data[field.key])
          if (!key) continue
          const first = seen.get(key)
          if (first !== undefined) all.set(row.id, [...(all.get(row.id) || []), { field: field.key, message: `${field.label} مكرر مع السطر ${first}` }])
          else seen.set(key, row.rowNumber)
        }
      }
      if (config.validate) {
        const custom = await config.validate(parsedRows, ctxRef.current as Ctx)
        if (sequence !== validationSeq.current) return
        for (const [id, list] of custom) if (list.length) all.set(id, [...(all.get(id) || []), ...list])
      }
      if (sequence === validationSeq.current) setIssues(all)
    } catch (cause: any) {
      if (sequence === validationSeq.current) setError(cause?.message || "تعذر التحقق من البيانات")
    } finally {
      if (sequence === validationSeq.current) setValidating(false)
    }
  }

  // إعادة التحقق بعد التعديل (مؤجَّلة قليلاً حتى لا تُعاد مع كل حرف).
  const revalidateTimer = useRef<number | null>(null)
  const scheduleValidation = (next: EditableRow[]) => {
    if (revalidateTimer.current) window.clearTimeout(revalidateTimer.current)
    revalidateTimer.current = window.setTimeout(() => void runValidation(next), 350)
  }
  const editCell = (id: number, key: string, value: string) => {
    setRows((current) => {
      const next = current.map((row) => (row.id === id ? { ...row, values: { ...row.values, [key]: value } } : row))
      scheduleValidation(next)
      return next
    })
    setResults((current) => { if (!current.has(id)) return current; const copy = new Map(current); copy.delete(id); return copy })
  }
  const deleteRows = (ids: number[]) => {
    const remove = new Set(ids)
    setRows((current) => { const next = current.filter((row) => !remove.has(row.id)); scheduleValidation(next); return next })
  }

  const rowState = (row: EditableRow) => {
    const result = results.get(row.id)
    if (result?.ok) return "done" as const
    if (result && !result.ok) return "failed" as const
    return issues.get(row.id)?.length ? ("error" as const) : ("valid" as const)
  }
  const pending = rows.filter((row) => !results.get(row.id)?.ok)
  const errorCount = pending.filter((row) => rowState(row) !== "valid").length
  const validRows = pending.filter((row) => rowState(row) === "valid")
  const visibleRows = useMemo(() => {
    const term = normalizeHeader(search)
    return rows.filter((row) => {
      const state = rowState(row)
      if (filter === "errors" && state !== "error" && state !== "failed") return false
      if (filter === "valid" && state !== "valid") return false
      if (term && !Object.values(row.values).some((value) => normalizeHeader(value).includes(term))) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, issues, results, filter, search])
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const pageRows = visibleRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  useEffect(() => { if (page >= pageCount) setPage(Math.max(0, pageCount - 1)) }, [page, pageCount])

  const downloadErrors = () => {
    const bad = rows.filter((row) => { const state = rowState(row); return state === "error" || state === "failed" })
    const headerLabels = [...config.fields.map((field) => field.label), "الأخطاء"]
    const data = bad.map((row) => ({
      ...Object.fromEntries(config.fields.map((field) => [field.label, row.values[field.key] ?? ""])),
      الأخطاء: [...(issues.get(row.id) || []).map((issue) => issue.message), results.get(row.id)?.message].filter(Boolean).join(" | "),
    }))
    void downloadSheet(`أخطاء-${config.templateFileName}`, data, headerLabels)
  }

  // ── 4) الاستيراد ──────────────────────────────────────────────────────────
  const startImport = async () => {
    const toImport = validRows
    if (!toImport.length || blocked) return
    const controller = new AbortController()
    abortRef.current = controller
    setImporting(true); setStep("result"); setError("")
    setProgress({ done: 0, total: toImport.length })
    let done = 0
    const collected = new Map(results)
    const report = (id: number, result: RowResult) => {
      collected.set(id, result)
      done += 1
      setProgress({ done, total: toImport.length })
      setResults(new Map(collected))
    }
    try {
      const ctx = await ensureCtx()
      await config.importRows(toImport.map((row) => parse(row).parsed), ctx, report, controller.signal)
    } catch (cause: any) {
      if (!controller.signal.aborted) setError(cause?.message || "توقف الاستيراد بسبب خطأ")
    } finally {
      setImporting(false)
      abortRef.current = null
      const success = toImport.filter((row) => collected.get(row.id)?.ok).length
      const failed = toImport.length - success
      onImported?.({ success, failed })
      if (config.closeOnSuccess && failed === 0 && success > 0) onOpenChange(false)
    }
  }

  const imported = rows.filter((row) => results.get(row.id)?.ok).length
  const failedRows = rows.filter((row) => results.get(row.id) && !results.get(row.id)!.ok)
  const backToFix = () => { setFilter("errors"); setPage(0); setStep("review") }

  // ── الواجهة ───────────────────────────────────────────────────────────────
  const stepIndex = STEPS.findIndex((item) => item.key === step)
  return (
    <WorkspaceDialogProvider container={null} confined={false}>
      <Dialog open={open} onOpenChange={(value) => { if (!importing) onOpenChange(value) }}>
        <DialogContent className="z-[3001] flex h-[92vh] w-[min(1280px,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0" dir="rtl" onPointerDownOutside={(event) => event.preventDefault()}>
          {/* الرأس + مؤشر الخطوات */}
          <div className="shrink-0 bg-gradient-to-l from-emerald-700 to-teal-600 px-5 pt-4 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><FileSpreadsheet className="h-5 w-5" /></span>
              <div className="min-w-0 text-right">
                <DialogTitle className="text-base font-bold">{config.title}</DialogTitle>
                <DialogDescription className="truncate text-xs text-emerald-50">{config.description || "استيراد من ملف Excel مع مطابقة الأعمدة ومراجعة الأخطاء قبل الحفظ"}{fileName ? ` — ${fileName}` : ""}</DialogDescription>
              </div>
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto pb-0">
              {STEPS.map((item, index) => (
                <div key={item.key} className={`flex min-w-max items-center gap-2 rounded-t-lg px-3 py-2 text-xs font-semibold ${index === stepIndex ? "bg-white text-emerald-800" : index < stepIndex ? "text-white" : "text-emerald-100/70"}`}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${index === stepIndex ? "bg-emerald-600 text-white" : index < stepIndex ? "bg-white/25" : "bg-white/10"}`}>{index < stepIndex ? "✓" : index + 1}</span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4 text-sm">
            <Messages innerRef={messagesRef} />
            {error && <p className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}

            {step === "upload" && (
              <div className="mx-auto max-w-2xl space-y-4">
                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void onFile(file) }}
                  onClick={() => { if (!blocked) fileInputRef.current?.click() }}
                  className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 px-6 py-12 text-center transition hover:bg-emerald-50"
                >
                  {busy ? <Loader2 className="h-10 w-10 animate-spin text-emerald-600" /> : <Upload className="h-10 w-10 text-emerald-600" />}
                  <div className="font-bold text-slate-800">اسحب ملف Excel هنا أو اضغط للاختيار</div>
                  <div className="text-xs text-muted-foreground">xlsx, xls, csv — الصف الأول يجب أن يحتوي عناوين الأعمدة</div>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onFile(file) }} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-slate-50 p-3">
                  <div className="text-xs text-slate-600">ليس لديك ملف جاهز؟ حمّل النموذج واملأه ثم ارفعه.</div>
                  <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="ml-1 h-4 w-4" />تحميل نموذج Excel</Button>
                </div>
                {config.uploadExtras?.({ loadRows: loadRowsDirect, busy })}
                <div className="rounded-xl border p-3">
                  <div className="mb-2 text-xs font-bold text-slate-600">الحقول المتوقعة ({config.fields.length})</div>
                  <div className="flex flex-wrap gap-1.5">{config.fields.map((field) => <span key={field.key} className={`rounded-full px-2 py-0.5 text-[11px] ${field.required ? "bg-rose-50 font-semibold text-rose-700 ring-1 ring-rose-200" : "bg-slate-100 text-slate-600"}`}>{field.label}{field.required ? " *" : ""}</span>)}</div>
                </div>
              </div>
            )}

            {step === "mapping" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-slate-600"><Columns3 className="ml-1 inline h-4 w-4" />اربط كل حقل في النظام بعمود من ملفك — تمت المطابقة التلقائية حسب أسماء الأعمدة. <b>{rawRows.length}</b> سطر.</div>
                  {workbook && workbook.SheetNames.length > 1 && (
                    <label className="flex items-center gap-2 text-xs">الورقة
                      <select className="h-8 rounded-md border px-2" value={sheetName} onChange={async (event) => { setSheetName(event.target.value); try { await readSheet(workbook, event.target.value) } catch (cause: any) { setError(cause.message) } }}>
                        {workbook.SheetNames.map((name: string) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                {missingRequired.length > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">حقول إجبارية بلا مطابقة: <b>{missingRequired.map((field) => field.label).join("، ")}</b></p>}
                <div className="overflow-hidden rounded-xl border">
                  <table className="w-full">
                    <thead className="bg-slate-100 text-xs text-slate-600"><tr><th className="px-3 py-2 text-right">حقل النظام</th><th className="w-72 px-3 py-2 text-right">العمود في الملف</th><th className="px-3 py-2 text-right">أمثلة من الملف</th></tr></thead>
                    <tbody>{config.fields.map((field) => {
                      const header = mapping[field.key]
                      const samples = header && header !== NONE ? rawRows.slice(0, 3).map((row) => row[header]).filter((value) => cellText(value) !== "") : []
                      return <tr key={field.key} className={`border-t ${field.required && (!header || header === NONE) ? "bg-amber-50/60" : ""}`}>
                        <td className="px-3 py-2"><span className="font-semibold">{field.label}</span>{field.required && <span className="mr-1 text-rose-600">*</span>}{field.description && <div className="text-[11px] text-muted-foreground">{field.description}</div>}</td>
                        <td className="px-3 py-1.5">
                          <select className={`h-9 w-full rounded-md border px-2 ${header && header !== NONE ? "border-emerald-300 bg-emerald-50/50" : ""}`} value={header || NONE} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}>
                            <option value={NONE}>— بدون —</option>
                            {headers.map((item) => <option key={item} value={item}>{item}{usedHeaders.has(item) && mapping[field.key] !== item ? " (مستخدم)" : ""}</option>)}
                          </select>
                        </td>
                        <td className="max-w-[320px] truncate px-3 py-2 text-xs text-muted-foreground">{samples.map(cellText).join("، ") || "—"}</td>
                      </tr>
                    })}</tbody>
                  </table>
                </div>
                {unmappedHeaders.length > 0 && <p className="text-xs text-muted-foreground">أعمدة في الملف لن تُستورد: {unmappedHeaders.join("، ")}</p>}
              </div>
            )}

            {step === "review" && (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="إجمالي الأسطر" value={rows.length} />
                  <Stat label="جاهزة للاستيراد" value={validRows.length} tone="text-emerald-700" />
                  <Stat label="تحتاج تصحيح" value={errorCount} tone={errorCount ? "text-rose-600" : "text-slate-500"} />
                  <Stat label="تم استيرادها" value={imported} tone="text-sky-700" />
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {(["all", "errors", "valid"] as const).map((value) => <button key={value} type="button" onClick={() => { setFilter(value); setPage(0) }} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === value ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>{value === "all" ? "الكل" : value === "errors" ? `الأخطاء (${errorCount})` : "الصحيحة"}</button>)}
                  <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="بحث في الأسطر..." className="h-8 w-48" />
                  {validating && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />جارٍ التحقق...</span>}
                  <div className="mr-auto flex gap-2">
                    {errorCount > 0 && <Button size="sm" variant="outline" onClick={downloadErrors}><Download className="ml-1 h-3.5 w-3.5" />تحميل الأخطاء</Button>}
                    {errorCount > 0 && <Button size="sm" variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => deleteRows(pending.filter((row) => rowState(row) === "error").map((row) => row.id))}><Trash2 className="ml-1 h-3.5 w-3.5" />حذف أسطر الأخطاء</Button>}
                    <Button size="sm" variant="outline" onClick={() => void runValidation(rows)} disabled={validating}><RefreshCw className="ml-1 h-3.5 w-3.5" />إعادة التحقق</Button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto rounded-xl border">
                  <table className="text-xs" style={{ minWidth: "100%" }}>
                    <thead className="sticky top-0 z-10 bg-slate-800 text-white"><tr>
                      <th className="sticky right-0 z-20 w-14 bg-slate-800 px-2 py-2 text-right">السطر</th>
                      <th className="w-10 px-2 py-2" />
                      {mappedFields.map((field) => <th key={field.key} className="whitespace-nowrap px-2 py-2 text-right font-semibold" style={{ minWidth: field.width || 130 }}>{field.label}{field.required ? " *" : ""}</th>)}
                      <th className="min-w-[260px] px-2 py-2 text-right">الأخطاء</th>
                      <th className="w-10 px-2 py-2" />
                    </tr></thead>
                    <tbody>
                      {pageRows.map((row) => {
                        const state = rowState(row)
                        const rowIssues = issues.get(row.id) || []
                        const fieldIssues = new Map(rowIssues.filter((issue) => issue.field).map((issue) => [issue.field!, issue.message]))
                        const result = results.get(row.id)
                        const locked = state === "done"
                        return <tr key={row.id} className={`border-t ${state === "error" || state === "failed" ? "bg-rose-50/40" : state === "done" ? "bg-sky-50/50" : ""}`}>
                          <td className="sticky right-0 bg-inherit px-2 py-1 font-mono text-slate-500">{row.rowNumber}</td>
                          <td className="px-2 py-1">{state === "valid" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : state === "done" ? <CheckCircle2 className="h-4 w-4 text-sky-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}</td>
                          {mappedFields.map((field) => {
                            const message = fieldIssues.get(field.key)
                            return <td key={field.key} className="px-1 py-1">
                              {field.options?.length
                                ? (() => {
                                  const current = row.values[field.key] ?? ""
                                  const matched = findOption(field, current)
                                  return <select disabled={locked} title={message} value={matched ? matched.label : current} onChange={(event) => editCell(row.id, field.key, event.target.value)} className={`h-8 w-full rounded border px-1 ${message ? "border-rose-400 bg-rose-50" : "border-slate-200"}`}>
                                    <option value="">—</option>
                                    {!matched && current && <option value={current}>{current} (غير موجود)</option>}
                                    {field.options!.map((option) => <option key={String(option.value)} value={option.label}>{option.label}</option>)}
                                  </select>
                                })()
                                : <input disabled={locked} title={message} value={row.values[field.key] ?? ""} onChange={(event) => editCell(row.id, field.key, event.target.value)} className={`h-8 w-full rounded border px-1.5 ${message ? "border-rose-400 bg-rose-50" : "border-slate-200"} disabled:bg-transparent`} />}
                            </td>
                          })}
                          <td className="px-2 py-1 text-[11px] leading-snug">
                            {rowIssues.map((issue, index) => <div key={index} className="text-rose-700">• {issue.message}</div>)}
                            {result && !result.ok && <div className="font-semibold text-rose-700">• فشل الحفظ: {result.message}</div>}
                            {state === "done" && <div className="text-sky-700">تم الاستيراد</div>}
                          </td>
                          <td className="px-1 py-1">{!locked && <button type="button" title="حذف السطر" onClick={() => deleteRows([row.id])} className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                        </tr>
                      })}
                      {!pageRows.length && <tr><td colSpan={mappedFields.length + 4} className="px-3 py-10 text-center text-muted-foreground">لا توجد أسطر مطابقة</td></tr>}
                    </tbody>
                  </table>
                </div>
                {pageCount > 1 && <div className="flex shrink-0 items-center justify-center gap-2 text-xs">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}><ArrowRight className="h-3.5 w-3.5" /></Button>
                  <span>صفحة {page + 1} من {pageCount} ({visibleRows.length} سطر)</span>
                  <Button size="sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}><ArrowLeft className="h-3.5 w-3.5" /></Button>
                </div>}
              </div>
            )}

            {step === "result" && (
              <div className="mx-auto max-w-3xl space-y-4">
                <div className="rounded-2xl border p-5 text-center">
                  {importing ? <Loader2 className="mx-auto mb-2 h-10 w-10 animate-spin text-emerald-600" /> : failedRows.length ? <AlertTriangle className="mx-auto mb-2 h-10 w-10 text-amber-500" /> : <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-600" />}
                  <div className="text-lg font-bold">{importing ? "جارٍ الاستيراد..." : failedRows.length ? "اكتمل الاستيراد مع أخطاء" : "اكتمل الاستيراد بنجاح"}</div>
                  <div className="mx-auto mt-3 h-2.5 max-w-md overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
                  <div className="mt-2 text-xs text-muted-foreground">{progress.done} / {progress.total}</div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <Stat label="تم استيرادها" value={imported} tone="text-emerald-700" />
                    <Stat label="فشلت" value={failedRows.length} tone={failedRows.length ? "text-rose-600" : "text-slate-500"} />
                    <Stat label="لم تُستورد (أخطاء)" value={errorCount - failedRows.length > 0 ? errorCount - failedRows.length : 0} tone="text-slate-600" />
                  </div>
                </div>
                {failedRows.length > 0 && !importing && (
                  <div className="rounded-xl border">
                    <div className="flex items-center justify-between border-b px-3 py-2"><b>الأسطر الفاشلة ({failedRows.length})</b><div className="flex gap-2"><Button size="sm" variant="outline" onClick={downloadErrors}><Download className="ml-1 h-3.5 w-3.5" />تحميل</Button><Button size="sm" onClick={backToFix}>تصحيحها وإعادة المحاولة</Button></div></div>
                    <div className="max-h-64 overflow-auto">{failedRows.slice(0, 200).map((row) => <div key={row.id} className="flex gap-3 border-b px-3 py-1.5 text-xs last:border-0"><span className="font-mono text-slate-500">السطر {row.rowNumber}</span><span className="text-rose-700">{results.get(row.id)?.message}</span></div>)}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* التذييل */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-4 py-3">
            <div className="flex gap-2">
              {step === "mapping" && <Button variant="outline" onClick={() => setStep("upload")}><ArrowRight className="ml-1 h-4 w-4" />رجوع</Button>}
              {step === "review" && <Button variant="outline" disabled={busy} onClick={() => (headers.length && fileName !== "بيانات جاهزة" ? setStep("mapping") : setStep("upload"))}><ArrowRight className="ml-1 h-4 w-4" />المطابقة</Button>}
              {step === "result" && !importing && <Button variant="outline" onClick={backToFix}>عرض الأسطر</Button>}
            </div>
            <div className="flex gap-2">
              {importing ? <Button variant="outline" onClick={() => abortRef.current?.abort()}>إيقاف</Button> : <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>}
              {step === "mapping" && <Button disabled={busy || missingRequired.length > 0} onClick={() => void buildRows()} className="bg-emerald-600 hover:bg-emerald-700">{busy ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}التالي: مراجعة البيانات<ArrowLeft className="mr-1 h-4 w-4" /></Button>}
              {step === "review" && <Button disabled={busy || validating || blocked || !validRows.length} onClick={() => void startImport()} className="bg-emerald-600 hover:bg-emerald-700"><Upload className="ml-1 h-4 w-4" />{config.importButtonLabel || "استيراد"} {validRows.length} سطر{errorCount ? ` (تخطي ${errorCount} بها أخطاء)` : ""}</Button>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceDialogProvider>
  )
}

function Stat({ label, value, tone = "text-slate-800" }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-xl border bg-slate-50 px-3 py-2 text-center"><div className="text-[11px] text-muted-foreground">{label}</div><div className={`text-lg font-black ${tone}`}>{value.toLocaleString("en-US")}</div></div>
}
