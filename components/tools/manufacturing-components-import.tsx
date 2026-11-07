"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Plus, RefreshCw, Save, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import Messages from "@/components/common/Messages"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { useNavigationGuard } from "@/lib/navigation-guard"

// أدوات ⇐ استيراد مكونات التصنيع من Excel: رفع ملف (رقم الصنف، رقم المكون، الوحدة، الكمية)، مراجعة وتعديل
// كل الأسطر مع التحقق من الخادم، ثم حفظ المحدد منها — "إضافة فقط" أو "تعديل" (lib/manufacturing-components-bulk.ts).

type Mode = "add" | "update"
type Unit = { unit_id: number; unit_name: string; factor: number }
type Line = { key: string; product_code: string; component_code: string; unit: string; quantity: string }
type Check = {
  key: string; product_name: string; component_name: string; units: Unit[]; unit_name: string
  exists: boolean; existing_unit_name: string; existing_quantity: number | null; errors: string[]; warnings: string[]
}

const COLUMNS = { product_code: "رقم الصنف", component_code: "رقم المكون", unit: "الوحدة", quantity: "الكمية المطلوبة" } as const
const ALIASES: Record<keyof typeof COLUMNS, string[]> = {
  product_code: ["رقم الصنف", "كود الصنف", "الصنف", "product_code", "product", "parent"],
  component_code: ["رقم المكون", "رقم المكوّن", "كود المكون", "المكون", "المكوّن", "component_code", "component"],
  unit: ["الوحدة", "وحدة", "unit", "unit_name"],
  quantity: ["الكمية المطلوبة", "الكمية", "كمية", "quantity", "qty", "qnty"],
}
const API = "/api/tools/manufacturing-components-import"
let keySeed = 0
const newKey = () => `l${++keySeed}`
const cell = (value: unknown) => String(value ?? "").trim()
const normalizeHeader = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase()

export default function ManufacturingComponentsImport() {
  const [lines, setLines] = useState<Line[]>([])
  const [checks, setChecks] = useState<Map<string, Check>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<Mode>("add")
  const [fileName, setFileName] = useState("")
  const [validating, setValidating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const messagesRef = useRef<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const validateSeq = useRef(0)

  const show = (severity: "success" | "error" | "info" | "warn", detail: string) => {
    messagesRef.current?.clear?.()
    messagesRef.current?.show?.([{ severity, summary: "", detail, life: 6000, sticky: severity === "error" }])
  }

  useNavigationGuard(
    () => dirty && lines.some((line) => !saved.has(line.key)),
    (continueNavigation) => { void confirmYesNo(tr("توجد أسطر لم تُحفظ بعد. هل تريد المغادرة؟")).then((yes) => { if (yes) continueNavigation() }) },
  )

  // التحقق من الخادم بعد كل تعديل (تأخير قصير) — يعيد الأسماء والوحدات والأخطاء لكل سطر
  const runValidation = async (current: Line[], currentMode: Mode) => {
    const seq = ++validateSeq.current
    if (!current.length) { setChecks(new Map()); return }
    setValidating(true)
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "validate", mode: currentMode, rows: current }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || tr("تعذر التحقق من الأسطر"))
      if (seq !== validateSeq.current) return
      setChecks(new Map((data.rows as Check[]).map((row) => [row.key, row])))
    } catch (error) {
      if (seq === validateSeq.current) show("error", error instanceof Error ? error.message : tr("تعذر التحقق من الأسطر"))
    } finally {
      if (seq === validateSeq.current) setValidating(false)
    }
  }
  const pending = useMemo(() => lines.filter((line) => !saved.has(line.key)), [lines, saved])
  useEffect(() => {
    const timer = setTimeout(() => void runValidation(pending, mode), 450)
    return () => clearTimeout(timer)
  }, [pending, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasErrors = (key: string) => (checks.get(key)?.errors.length ?? 1) > 0
  const selectable = pending.filter((line) => !hasErrors(line.key))
  const selectedValid = selectable.filter((line) => selected.has(line.key))
  const errorCount = pending.filter((line) => checks.has(line.key) && hasErrors(line.key)).length

  // سطر صار خاطئاً بعد التحقق يُلغى تحديده تلقائياً
  useEffect(() => {
    setSelected((current) => {
      const next = new Set([...current].filter((key) => !checks.get(key)?.errors.length))
      return next.size === current.size ? current : next
    })
  }, [checks]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateLine = (key: string, field: keyof Omit<Line, "key">, value: string) => {
    setDirty(true)
    setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value } : line)))
  }
  const removeLine = (key: string) => {
    setLines((current) => current.filter((line) => line.key !== key))
    setSelected((current) => { const next = new Set(current); next.delete(key); return next })
  }
  const addLine = () => { setDirty(true); setLines((current) => [...current, { key: newKey(), product_code: "", component_code: "", unit: "", quantity: "" }]) }

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx")
    const headers = Object.values(COLUMNS).map((label) => tr(label))
    const sheet = XLSX.utils.aoa_to_sheet([headers, ["1001", "2001", tr("حبة"), 2], ["1001", "2002", "", 0.5]])
    sheet["!cols"] = headers.map(() => ({ wch: 18 }))
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, "Data")
    XLSX.writeFile(book, "نموذج-مكونات-التصنيع.xlsx")
  }

  const onFile = async (file: File) => {
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error(tr("يرجى اختيار ملف Excel (.xlsx أو .xls) أو CSV"))
      if (lines.some((line) => !saved.has(line.key)) && !(await confirmYesNo(tr("سيتم استبدال الأسطر الحالية غير المحفوظة بأسطر الملف. هل تريد المتابعة؟")))) return
      const XLSX = await import("xlsx")
      const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false })
      const matrix = XLSX.utils.sheet_to_json<any[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: "", raw: false, blankrows: false })
      const headers = (matrix[0] || []).map((value: unknown) => normalizeHeader(cell(value)))
      const indexOf = (field: keyof typeof COLUMNS) => headers.findIndex((header) => [...ALIASES[field], tr(COLUMNS[field])].some((alias) => normalizeHeader(alias) === header))
      const index = { product_code: indexOf("product_code"), component_code: indexOf("component_code"), unit: indexOf("unit"), quantity: indexOf("quantity") }
      const missing = (["product_code", "component_code", "quantity"] as const).filter((field) => index[field] < 0).map((field) => tr(COLUMNS[field]))
      if (missing.length) throw new Error(tr("أعمدة ناقصة في الملف: {0}", missing.join("، ")))
      const read = matrix.slice(1)
        .filter((row) => row.some((value) => cell(value) !== ""))
        .map((row) => ({
          key: newKey(),
          product_code: cell(row[index.product_code]),
          component_code: cell(row[index.component_code]),
          unit: index.unit >= 0 ? cell(row[index.unit]) : "",
          quantity: cell(row[index.quantity]),
        }))
      if (!read.length) throw new Error(tr("لا توجد بيانات في الورقة المختارة"))
      setLines(read)
      setSaved(new Set())
      setChecks(new Map())
      setSelected(new Set(read.map((line) => line.key)))
      setFileName(file.name)
      setDirty(true)
      show("info", tr("تمت قراءة {0} سطر — راجع الأخطاء ثم احفظ", read.length))
    } catch (error) {
      show("error", error instanceof Error ? error.message : tr("تعذر قراءة الملف"))
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const save = async () => {
    const rows = selectedValid
    if (!rows.length) return show("warn", tr("لا توجد أسطر صحيحة محددة للحفظ"))
    const updates = rows.filter((line) => checks.get(line.key)?.exists).length
    const message = mode === "update"
      ? tr("سيتم حفظ {0} سطر: إضافة {1} مكوّن جديد وتعديل {2} مكوّن موجود. هل تريد المتابعة؟", rows.length, rows.length - updates, updates)
      : tr("سيتم إضافة {0} مكوّن تصنيع. هل تريد المتابعة؟", rows.length)
    if (!(await confirmYesNo(message))) return
    setSaving(true)
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", mode, rows }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || tr("تعذر حفظ مكونات التصنيع"))
      const result = new Map((data.rows as Check[]).map((row) => [row.key, row]))
      const done = rows.filter((line) => result.get(line.key) && !result.get(line.key)!.errors.length).map((line) => line.key)
      setSaved((current) => new Set([...current, ...done]))
      setSelected((current) => { const next = new Set(current); done.forEach((key) => next.delete(key)); return next })
      show(data.failed ? "warn" : "success", tr("تمت إضافة {0} وتعديل {1} مكوّن", data.added, data.updated) + (rows.length > done.length ? " — " + tr("{0} سطر لم يُحفظ", rows.length - done.length) : ""))
    } catch (error) {
      show("error", error instanceof Error ? error.message : tr("تعذر حفظ مكونات التصنيع"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 p-4" dir={appDir()}>
      <header className="page-hero relative overflow-hidden rounded-2xl px-5 py-5 sm:px-7">
        <div className="pointer-events-none absolute -end-16 -top-24 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 start-1/3 h-56 w-56 rounded-full bg-teal-300/25 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur"><FileSpreadsheet /></div>
          <div>
            <p className="text-xs font-semibold text-emerald-50/90">{tr("أدوات")}</p>
            <h1 className="truncate text-2xl font-black text-white drop-shadow-sm sm:text-3xl">{tr("استيراد مكونات التصنيع من Excel")}</h1>
            <p className="mt-1 text-sm text-emerald-50/85">{tr("ارفع ملفاً فيه رقم الصنف ورقم المكون والوحدة والكمية، راجع الأسطر وعدّلها، ثم احفظ المحدد منها")}</p>
          </div>
        </div>
      </header>

      <Messages innerRef={messagesRef} />

      <section className="rounded-2xl border bg-background p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => void downloadTemplate()}><Download className="me-2 h-4 w-4" />{tr("تحميل النموذج")}</Button>
          <Button type="button" onClick={() => fileRef.current?.click()}><Upload className="me-2 h-4 w-4" />{tr("رفع ملف Excel")}</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file) }} />
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          <div className="ms-auto flex items-center gap-1 rounded-xl border bg-muted/40 p-1" role="radiogroup" aria-label={tr("نوع الاستيراد")}>
            {([["add", tr("إضافة فقط")], ["update", tr("تعديل")]] as [Mode, string][]).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)} className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${mode === value ? "bg-emerald-600 text-white shadow" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-white/10"}`}>{label}</button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {mode === "add"
            ? tr("إضافة فقط: يُضاف المكوّن للصنف، والمكوّن الموجود مسبقاً على نفس الصنف يظهر كخطأ ولا يُغيَّر.")
            : tr("تعديل: يُضاف المكوّن الجديد، وتُستبدل وحدة وكمية المكوّن الموجود مسبقاً على نفس الصنف.")}
          {" "}{tr("الوحدة اختيارية — إن تُركت فارغة تُستخدم الوحدة الرئيسية للمكوّن.")}
        </p>
      </section>

      <section className="rounded-2xl border bg-background shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Button type="button" variant="outline" size="sm" disabled={!selectable.length} onClick={() => setSelected(new Set(selectable.map((line) => line.key)))}>{tr("تحديد الكل")}</Button>
          <Button type="button" variant="outline" size="sm" disabled={!selected.size} onClick={() => setSelected(new Set())}>{tr("إلغاء تحديد الكل")}</Button>
          <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="me-1 h-4 w-4" />{tr("إضافة سطر")}</Button>
          <Button type="button" variant="ghost" size="sm" disabled={validating || !pending.length} onClick={() => void runValidation(pending, mode)}>
            {validating ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <RefreshCw className="me-1 h-4 w-4" />}{tr("إعادة التحقق")}
          </Button>
          <div className="ms-auto flex flex-wrap items-center gap-3 text-sm">
            <span>{tr("الأسطر")}: <b>{lines.length}</b></span>
            <span className="text-emerald-700 dark:text-emerald-400">{tr("المحدد")}: <b>{selectedValid.length}</b></span>
            {errorCount > 0 && <span className="text-red-600">{tr("بها أخطاء")}: <b>{errorCount}</b></span>}
            {saved.size > 0 && <span className="text-sky-700 dark:text-sky-400">{tr("محفوظ")}: <b>{saved.size}</b></span>}
            <Button type="button" disabled={saving || validating || !selectedValid.length} onClick={() => void save()} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}{tr("حفظ")}
            </Button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-22rem)] overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-800 text-white">
              <tr>
                <th className="w-10 p-2" />
                <th className="w-10 p-2 text-center">#</th>
                <th className="w-36 p-2 text-start">{tr("رقم الصنف")}</th>
                <th className="p-2 text-start">{tr("اسم الصنف")}</th>
                <th className="w-36 p-2 text-start">{tr("رقم المكون")}</th>
                <th className="p-2 text-start">{tr("اسم المكون")}</th>
                <th className="w-36 p-2 text-start">{tr("الوحدة")}</th>
                <th className="w-28 p-2 text-start">{tr("الكمية المطلوبة")}</th>
                <th className="w-56 p-2 text-start">{tr("الحالة")}</th>
                <th className="w-10 p-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const check = checks.get(line.key)
                const isSaved = saved.has(line.key)
                const bad = !isSaved && Boolean(check?.errors.length)
                const unitOptions = check?.units || []
                return (
                  <tr key={line.key} className={`border-t align-top ${isSaved ? "bg-sky-50/60 dark:bg-sky-950/20" : bad ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}>
                    <td className="p-2 text-center">
                      <Checkbox checked={selected.has(line.key)} disabled={isSaved || bad || !check} onCheckedChange={(value) => setSelected((current) => { const next = new Set(current); if (value === true) next.add(line.key); else next.delete(line.key); return next })} aria-label={tr("تحديد")} />
                    </td>
                    <td className="p-2 text-center text-xs text-muted-foreground">{index + 1}</td>
                    <td className="p-1"><Input value={line.product_code} disabled={isSaved} onChange={(event) => updateLine(line.key, "product_code", event.target.value)} className="h-8 font-mono text-xs" dir="ltr" /></td>
                    <td className="p-2 text-xs">{check?.product_name || "—"}</td>
                    <td className="p-1"><Input value={line.component_code} disabled={isSaved} onChange={(event) => updateLine(line.key, "component_code", event.target.value)} className="h-8 font-mono text-xs" dir="ltr" /></td>
                    <td className="p-2 text-xs">{check?.component_name || "—"}</td>
                    <td className="p-1">
                      {unitOptions.length ? (
                        <select value={unitOptions.some((unit) => unit.unit_name === line.unit) ? line.unit : line.unit ? "__other" : ""} disabled={isSaved} onChange={(event) => updateLine(line.key, "unit", event.target.value === "__other" ? line.unit : event.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                          <option value="">{tr("افتراضية ({0})", check?.unit_name || unitOptions[0].unit_name)}</option>
                          {unitOptions.map((unit) => <option key={unit.unit_id} value={unit.unit_name}>{unit.unit_name}</option>)}
                          {line.unit && !unitOptions.some((unit) => unit.unit_name === line.unit) && <option value="__other">{line.unit}</option>}
                        </select>
                      ) : (
                        <Input value={line.unit} disabled={isSaved} onChange={(event) => updateLine(line.key, "unit", event.target.value)} className="h-8 text-xs" />
                      )}
                    </td>
                    <td className="p-1"><Input value={line.quantity} disabled={isSaved} inputMode="decimal" onChange={(event) => updateLine(line.key, "quantity", event.target.value)} className="h-8 text-xs tabular-nums" dir="ltr" /></td>
                    <td className="p-2 text-xs">
                      {isSaved ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-400"><CheckCircle2 className="h-3.5 w-3.5" />{tr("تم الحفظ")}</span>
                      ) : !check ? (
                        <span className="text-muted-foreground">{validating ? tr("جاري التحقق...") : "—"}</span>
                      ) : (
                        <div className="space-y-0.5">
                          {check.errors.map((error) => <div key={error} className="flex items-start gap-1 text-red-600"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{tr(error)}</div>)}
                          {!check.errors.length && (
                            <div className={check.exists ? "font-semibold text-amber-700 dark:text-amber-400" : "font-semibold text-emerald-700 dark:text-emerald-400"}>
                              {check.exists ? tr("تعديل — الحالي: {0} {1}", check.existing_quantity ?? "", check.existing_unit_name) : tr("جديد")}
                            </div>
                          )}
                          {check.warnings.filter((warning) => warning !== "الوحدة الافتراضية").map((warning) => <div key={warning} className="text-muted-foreground">{tr(warning)}</div>)}
                        </div>
                      )}
                    </td>
                    <td className="p-1 text-center">
                      {!isSaved && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50" title={tr("حذف")} onClick={() => removeLine(line.key)}><Trash2 className="h-4 w-4" /></Button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!lines.length && (
            <div className="py-14 text-center text-sm text-muted-foreground">
              <FileSpreadsheet className="mx-auto mb-2 h-10 w-10 text-slate-300" />
              {tr("حمّل النموذج واملأه ثم ارفعه، أو أضف الأسطر يدوياً")}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
