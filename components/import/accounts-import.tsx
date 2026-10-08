"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ExcelImportWizard, normalizeHeader, type ImportConfig, type ImportIssue, type ParsedRow } from "@/components/import/excel-import-wizard"

/** رقم الحساب 10 خانات: أحرف/أرقام إنجليزية فقط، يُكمَّل بأصفار في النهاية (110000000 ← 1100000000). */
export function normalizeAccountCode(value: unknown) {
  const cleaned = String(value ?? "").trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  if (!cleaned) return ""
  return cleaned.padEnd(10, "0").slice(0, 10)
}

export const ACCOUNT_TEMPLATE_TYPES = [
  { value: "commercial", label: "مؤسسة تجارية" },
  { value: "commercial_continuous_inventory", label: "مؤسسة تجارية - جرد مستمر" },
  { value: "services", label: "خدمات" },
]

type Currency = { id: number; name: string; code: string }
type LookupItem = { id: number; name: string }
type Lookups = { currencies: Currency[]; assets: LookupItem[]; liabilities: LookupItem[]; income: LookupItem[] }
type Ctx = { existing: Array<{ code: string; name: string }> }

const SHEKEL_ALIASES = ["nis", "ils", "شيقل", "شيكل", "شيكل اسرائيلي", "شيقل اسرائيلي"]
const FINANCIAL_LISTS = [
  { value: 1, label: "الميزانية العمومية", aliases: ["الميزانية", "ميزانية عمومية", "balance", "balance sheet"] },
  { value: 2, label: "قائمة الدخل", aliases: ["الدخل", "income", "income statement"] },
  { value: 3, label: "تقييم بضاعة", aliases: ["تقييم", "merchandise", "inventory valuation"] },
]

const asList = (data: any) => (Array.isArray(data) ? data : [])
const text = (value: unknown) => String(value ?? "").trim()
/** "عدم الإظهار"/0/none في أعمدة البنود = بلا بند */
const lookupText = (value: unknown) => (["عدمالاظهار", "none", "null", "0"].includes(normalizeHeader(value)) ? "" : text(value))

/** صف من هيكل حسابات جاهز (accounts-export-source) ← صف بمفاتيح حقول الاستيراد. */
function exportRowToFields(row: any, parentCodeById: Map<string, string>, fallbackCurrency: number | undefined) {
  const father = text(row.father_code || row.father_account_code) || (row.father ? parentCodeById.get(String(row.father)) || String(row.father) : "")
  return {
    code: text(row.code),
    name: text(row.name),
    name_lang2: text(row.name_lang2) || text(row.name),
    father: father ? normalizeAccountCode(father) : "",
    currency: row.currency_id ?? fallbackCurrency ?? "",
    financial_list: row.financial_list ?? row.finanical_list_id ?? 1,
    assets: text(row.financial_list_assests ?? row.finanical_list_assests ?? row.finanical_list_assests_id ?? row.financial_list_assests_id),
    liabilities: text(row.financial_list_liabilities ?? row.finanical_list_liabilities ?? row.finanical_list_liabilities_id ?? row.financial_list_liabilities_id),
    balance_sheet_item: text(row.balance_sheet_item),
    income: text(row.financial_list_income ?? row.finanical_list_income ?? row.finanical_list_income_id ?? row.financial_list_income_id),
    allow_trans_with_diff_curr: row.allow_trans_with_diff_curr ? "1" : "0",
    iscalc_curr_diff_rates: row.iscalc_curr_diff_rates ? "1" : "0",
    transaction_type: row.transaction_type ?? 0,
    transaction_type_action: row.transaction_type_action ?? 0,
    max_transaction_amount: row.max_transaction_amount ?? 0,
    max_transaction_amount_action: row.max_transaction_amount_action ?? 0,
    max_balance_amount: row.max_balance_amount ?? 0,
    max_balance_action: row.max_balance_action ?? "",
    budget_exceeding_perc: row.budget_exceeding_perc ?? "",
    budget_exceeding_action: row.budget_exceeding_action ?? "",
    unified_report_account_no: text(row.unified_report_account_no),
    unified_report_group_code: text(row.unified_report_group_code),
    show_notes_in_transactions_soa: row.show_notes_in_transactions_soa ? "1" : "0",
    notes: text(row.notes),
    status: text(row.status) || "نشط",
  }
}

/** ترتيب الحفظ: الحساب الأب قبل أبنائه (حتى لو جاء بعدهم بالملف). */
function parentsFirst(rows: ParsedRow[]) {
  const byCode = new Map(rows.map((row) => [normalizeAccountCode(row.data.code), row]))
  const depth = new Map<number, number>()
  const depthOf = (row: ParsedRow, guard = 0): number => {
    if (depth.has(row.id)) return depth.get(row.id)!
    const parent = byCode.get(normalizeAccountCode(row.data.father))
    const value = parent && parent !== row && guard < 50 ? depthOf(parent, guard + 1) + 1 : 0
    depth.set(row.id, value)
    return value
  }
  return rows.map((row, index) => ({ row, index, depth: depthOf(row) })).sort((a, b) => a.depth - b.depth || a.index - b.index).map((item) => item.row)
}

/** اختيار هيكل حسابات جاهز وتحميله لشاشة المراجعة؛ autoLoad يحمّله فور فتح النافذة. */
function AccountTemplatePicker({ loadRows, busy, currencyId, initialType, autoLoad, onAutoLoad }: { loadRows: (rows: Record<string, any>[]) => void; busy: boolean; currencyId?: number; initialType?: string; autoLoad?: boolean; onAutoLoad?: () => void }) {
  const [type, setType] = useState(initialType || ACCOUNT_TEMPLATE_TYPES[0].value)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const load = async (selected = type) => {
    setError(""); setLoading(true)
    try {
      const response = await fetch(`/api/accounts-export-source?type=${encodeURIComponent(selected)}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "فشل تحميل الهيكل")
      const source = asList(data.rows)
      if (!source.length) throw new Error("الهيكل المختار فارغ")
      const parentCodeById = new Map<string, string>(source.map((row: any) => [String(row.id ?? ""), text(row.code)]))
      loadRows(source.map((row: any) => exportRowToFields(row, parentCodeById, currencyId)))
    } catch (cause: any) {
      setError(cause?.message || "فشل تحميل الهيكل")
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!autoLoad) return
    onAutoLoad?.()
    void load(initialType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad])

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 text-sm font-medium">أو ابدأ من هيكل حسابات جاهز</div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={type} onChange={(event) => setType(event.target.value)} className="h-9 min-w-[220px] rounded-md border bg-background px-2 text-sm">
          {ACCOUNT_TEMPLATE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <Button type="button" variant="secondary" size="sm" disabled={busy || loading} onClick={() => void load()}>
          {loading && <Loader2 className="ml-1 h-4 w-4 animate-spin" />} تحميل الهيكل للمراجعة
        </Button>
      </div>
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
    </div>
  )
}

/**
 * استيراد الحسابات بالمحرك الموحّد — شاشة الحسابات والبداية السريعة.
 * templateType: يحمّل هيكل الحسابات الجاهز المحدد مباشرة للمراجعة عند الفتح.
 */
export function AccountsImportDialog({ open, onOpenChange, onImported, templateType }: { open: boolean; onOpenChange: (open: boolean) => void; onImported?: () => void; templateType?: string }) {
  const [lookups, setLookups] = useState<Lookups | null>(null)
  const autoLoadDone = useRef(false)

  useEffect(() => {
    autoLoadDone.current = false
    if (!open) return
    const json = (url: string) => fetch(url).then((response) => (response.ok ? response.json() : [])).catch(() => [])
    Promise.all([json("/api/exchange-rates"), json("/api/balance-sheet-assets-items"), json("/api/balance-sheet-liabilities-items"), json("/api/income-statement-items")]).then(([rates, assets, liabilities, income]) => {
      const item = (row: any) => ({ id: Number(row.id), name: text(row.name) })
      setLookups({
        currencies: asList(rates?.rates).map((row: any) => ({ id: Number(row.currency_id ?? row.id), name: text(row.currency_name ?? row.name), code: text(row.currency_code ?? row.code) })),
        assets: asList(assets).map(item),
        liabilities: asList(liabilities).map(item),
        income: asList(income).map(item),
      })
    })
  }, [open])

  const config = useMemo<ImportConfig<Ctx> | null>(() => {
    if (!lookups) return null
    const baseCurrency = lookups.currencies.find((currency) => currency.id === 1 || normalizeHeader(currency.code) === "nis") || lookups.currencies[0]
    const lookupHint = "يُنشأ البند تلقائياً إن لم يكن موجوداً"
    return {
      title: "استيراد الحسابات من Excel",
      description: "رقم الحساب يُضبط تلقائياً إلى 10 خانات. يُحفظ الحساب الأب قبل أبنائه تلقائياً.",
      templateFileName: "نموذج-الحسابات",
      fields: [
        { key: "code", label: "رقم الحساب", required: true, aliases: ["account_code", "code"], example: "1100000000" },
        { key: "name", label: "اسم الحساب", required: true, aliases: ["account_name", "name"], maxLength: 200, example: "الأصول المتداولة" },
        { key: "name_lang2", label: "اسم الحساب انجليزي", aliases: ["name_lang2", "اسم الحساب بالانجليزي", "english name"], maxLength: 200 },
        { key: "father", label: "الحساب الأب", aliases: ["حساب الاب", "father_code", "father_account_code", "father", "parent_account", "father_id"], description: "رقم حساب موجود أو موجود بالملف" },
        {
          key: "currency", label: "العملة", required: true, aliases: ["currency", "currency_name", "currency_code", "currency_id"],
          options: lookups.currencies.map((currency) => ({ value: currency.id, label: currency.name || currency.code, aliases: [currency.code, ...(currency.id === baseCurrency?.id ? SHEKEL_ALIASES : [])] })),
          example: baseCurrency?.name,
        },
        { key: "financial_list", label: "القائمة المالية", required: true, aliases: ["financial_list", "finanical_list_id", "اسم القائمة المالية"], options: FINANCIAL_LISTS, example: "الميزانية العمومية" },
        { key: "assets", label: "أصول الميزانية", aliases: ["balance_sheet_assets", "finanical_list_assests_id"], description: lookupHint },
        { key: "liabilities", label: "خصوم الميزانية", aliases: ["balance_sheet_liabilities", "finanical_list_liabilities_id"], description: lookupHint },
        { key: "balance_sheet_item", label: "أصول وخصوم الميزانية", aliases: ["balance_sheet_item"], description: "يُستخدم للأصول والخصوم معاً إن تُركا فارغين" },
        { key: "income", label: "بند قائمة الدخل", aliases: ["income_statement_item", "finanical_list_income_id"], description: lookupHint },
        { key: "allow_trans_with_diff_curr", label: "السماح بفرق العملة", type: "boolean" },
        { key: "iscalc_curr_diff_rates", label: "احتساب فروقات العملة", type: "boolean" },
        { key: "transaction_type", label: "نوع الحركة", type: "integer", min: 0 },
        { key: "transaction_type_action", label: "إجراء نوع الحركة", type: "integer", min: 0 },
        { key: "max_transaction_amount", label: "أقصى مبلغ حركة", type: "number", min: 0 },
        { key: "max_transaction_amount_action", label: "إجراء أقصى مبلغ حركة", type: "integer", min: 0 },
        { key: "max_balance_amount", label: "أقصى رصيد", type: "number", min: 0 },
        { key: "max_balance_action", label: "إجراء أقصى رصيد", type: "integer", min: 0 },
        { key: "budget_exceeding_perc", label: "نسبة تجاوز الموازنة", type: "number", min: 0 },
        { key: "budget_exceeding_action", label: "إجراء تجاوز الموازنة", type: "integer", min: 0 },
        { key: "unified_report_account_no", label: "رقم الحساب الموحد" },
        { key: "unified_report_group_code", label: "رمز مجموعة التقرير الموحد" },
        { key: "show_notes_in_transactions_soa", label: "إظهار الملاحظات في كشف الحساب", type: "boolean" },
        { key: "notes", label: "ملاحظات", aliases: ["notes"] },
        { key: "status", label: "الحالة", aliases: ["status"], example: "نشط" },
      ],
      prepare: async () => {
        const data = await fetch("/api/accounts?type=1").then((response) => (response.ok ? response.json() : [])).catch(() => [])
        return { existing: asList(data).map((row: any) => ({ code: normalizeAccountCode(row.code || row.account_code), name: text(row.name || row.account_name) })) }
      },
      validate: (rows, ctx) => {
        const result = new Map<number, ImportIssue[]>()
        const add = (id: number, issue: ImportIssue) => result.set(id, [...(result.get(id) || []), issue])
        const existingCodes = new Set(ctx.existing.map((account) => account.code))
        const existingNames = new Set(ctx.existing.map((account) => normalizeHeader(account.name)))
        const fileCodes = new Map<string, number>()
        for (const row of rows) {
          const code = normalizeAccountCode(row.data.code)
          if (!code) continue
          if (fileCodes.has(code)) add(row.id, { field: "code", message: `رقم الحساب ${code} مكرر مع السطر ${fileCodes.get(code)}` })
          else fileCodes.set(code, row.rowNumber)
        }
        for (const row of rows) {
          const data = row.data
          const code = normalizeAccountCode(data.code)
          if (text(data.code) && !code) add(row.id, { field: "code", message: "رقم الحساب يجب أن يحتوي أحرفاً أو أرقاماً إنجليزية" })
          if (code && existingCodes.has(code)) add(row.id, { field: "code", message: `رقم الحساب ${code} موجود مسبقاً` })
          if (text(data.name) && existingNames.has(normalizeHeader(data.name))) add(row.id, { field: "name", message: `اسم الحساب "${text(data.name)}" موجود مسبقاً` })
          const father = normalizeAccountCode(data.father)
          if (father && father === code) add(row.id, { field: "father", message: "لا يمكن أن يكون الحساب تابعاً لنفسه" })
          else if (father && !fileCodes.has(father) && !existingCodes.has(father)) add(row.id, { field: "father", message: `الحساب الأب ${father} غير موجود` })
          const list = Number(data.financial_list)
          if (list === 1 && !lookupText(data.assets) && !lookupText(data.liabilities) && !lookupText(data.balance_sheet_item)) add(row.id, { field: "assets", message: "يجب تحديد أصول الميزانية أو خصومها" })
          if ((list === 2 || list === 3) && !lookupText(data.income)) add(row.id, { field: "income", message: "بند قائمة الدخل مطلوب" })
        }
        return result
      },
      uploadExtras: ({ loadRows, busy }) => (
        <AccountTemplatePicker loadRows={loadRows} busy={busy} currencyId={baseCurrency?.id} initialType={templateType} autoLoad={Boolean(templateType) && !autoLoadDone.current} onAutoLoad={() => { autoLoadDone.current = true }} />
      ),
      importRows: async (rows, ctx, report, signal) => {
        // الأب الموجود فقط بسطر فيه أخطاء (لم يُرسل للاستيراد) — يُبلَّغ عن الابن بوضوح بدل رفض الخادم
        const available = new Set([...ctx.existing.map((account) => account.code), ...rows.map((row) => normalizeAccountCode(row.data.code))])
        const caches = { assets: new Map<string, LookupItem>(), liabilities: new Map<string, LookupItem>(), income: new Map<string, LookupItem>() }
        const seed = (items: LookupItem[], cache: Map<string, LookupItem>) => items.forEach((item) => { cache.set(normalizeHeader(item.name), item); cache.set(String(item.id), item) })
        seed(lookups.assets, caches.assets); seed(lookups.liabilities, caches.liabilities); seed(lookups.income, caches.income)
        const resolveLookup = async (raw: string, cache: Map<string, LookupItem>, endpoint: string) => {
          const value = lookupText(raw)
          if (!value) return null
          const cached = cache.get(normalizeHeader(value)) || cache.get(value)
          if (cached) return cached
          const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ name: value, status: 1 }) })
          const created = await response.json().catch(() => ({}))
          if (!response.ok) {
            // موجود فعلياً بفارق كتابة بسيط — إعادة البحث بالقائمة بدل الفشل
            const fresh = await fetch(endpoint).then((res) => (res.ok ? res.json() : [])).catch(() => [])
            const match = asList(fresh).find((item: any) => normalizeHeader(item.name) === normalizeHeader(value))
            if (match) { const item = { id: Number(match.id), name: text(match.name) }; cache.set(normalizeHeader(value), item); return item }
            throw new Error(created.error || `فشل حفظ البند: ${value}`)
          }
          const item = { id: Number(created.id), name: text(created.name) || value }
          cache.set(normalizeHeader(value), item); cache.set(String(item.id), item)
          return item
        }
        const failedCodes = new Set<string>()
        for (const row of parentsFirst(rows)) {
          if (signal.aborted) return
          const data = row.data
          const code = normalizeAccountCode(data.code)
          const father = normalizeAccountCode(data.father)
          if (father && !available.has(father)) { failedCodes.add(code); report(row.id, { ok: false, message: `الحساب الأب ${father} لم يُستورد (به أخطاء) — صحّحه أولاً` }); continue }
          if (father && failedCodes.has(father)) { failedCodes.add(code); report(row.id, { ok: false, message: `لم يُحفظ الحساب الأب ${father}` }); continue }
          try {
            const asset = await resolveLookup(lookupText(data.assets) || data.balance_sheet_item, caches.assets, "/api/balance-sheet-assets-items")
            const liability = await resolveLookup(lookupText(data.liabilities) || data.balance_sheet_item, caches.liabilities, "/api/balance-sheet-liabilities-items")
            const income = await resolveLookup(data.income, caches.income, "/api/income-statement-items")
            const optionalNumber = (value: unknown) => (value === null || value === "" || value === undefined ? null : Number(value))
            const payload = {
              code, name: text(data.name), name_lang2: text(data.name_lang2) || text(data.name),
              type: 1, parent_code: father || null, father_id: null, level_no: father ? 2 : 1,
              finanical_list_id: Number(data.financial_list) || 1,
              finanical_list_assests_id: asset?.id ?? null,
              finanical_list_liabilities_id: liability?.id ?? null,
              finanical_list_income_id: income?.id ?? null,
              currency_id: Number(data.currency) || 1,
              allow_trans_with_diff_curr: data.allow_trans_with_diff_curr ? 1 : 0,
              iscalc_curr_diff_rates: Boolean(data.iscalc_curr_diff_rates),
              transaction_type: Number(data.transaction_type) || 0,
              transaction_type_action: Number(data.transaction_type_action) || 0,
              max_transaction_amount: Number(data.max_transaction_amount) || 0,
              max_transaction_amount_action: Number(data.max_transaction_amount_action) || 0,
              max_balance_amount: Number(data.max_balance_amount) || 0,
              max_balance_action: optionalNumber(data.max_balance_action),
              budget_exceeding_perc: optionalNumber(data.budget_exceeding_perc),
              budget_exceeding_action: optionalNumber(data.budget_exceeding_action),
              unified_report_account_no: text(data.unified_report_account_no) || null,
              unified_report_group_code: text(data.unified_report_group_code) || null,
              notes: text(data.notes) || null,
              show_notes_in_transactions_soa: Boolean(data.show_notes_in_transactions_soa),
              status: text(data.status) || "نشط",
            }
            const response = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify(payload) })
            if (!response.ok) {
              const error = await response.json().catch(() => ({}))
              failedCodes.add(code)
              report(row.id, { ok: false, message: error.error || error.message || "فشل حفظ الحساب" })
            } else report(row.id, { ok: true })
          } catch (error: any) {
            if (signal.aborted) return
            failedCodes.add(code)
            report(row.id, { ok: false, message: error?.message || "خطأ غير متوقع" })
          }
        }
      },
    }
  }, [lookups, templateType])

  if (!config) return null
  return <ExcelImportWizard open={open} onOpenChange={onOpenChange} config={config} onImported={({ success }) => { if (success) onImported?.() }} />
}
