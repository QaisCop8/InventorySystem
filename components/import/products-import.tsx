"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { ExcelImportWizard, type ImportConfig, type ImportField, type ImportIssue } from "@/components/import/excel-import-wizard"

const UNIT_COUNT = 6
const BARCODES_PER_UNIT = 6

/** أرقام الأصناف 10 خانات: رقمي ← أصفار بادئة، وإلا الحرف الأول + أصفار بعده (نفس منطق الاستيراد السابق). */
export function adjustProductCodeTo10(rawCode: string): string {
  const code = String(rawCode || "").trim()
  if (!code || code.length >= 10) return code
  if (/^\d+$/.test(code)) return code.padStart(10, "0")
  return code.slice(0, 1) + code.slice(1).padStart(9, "0")
}

type Lookups = {
  productCategories: Array<{ id: number; name: string }>
  warehouses: Array<{ id: number; name: string }>
  units: Array<{ id: number; unit_name: string; unit_name_en?: string; unit_code?: string }>
  groups: Array<{ id: number; group_name: string; group_code?: string }>
  priceCategories: Array<{ id: number; name: string; name_en?: string }>
}

const list = (data: any, key?: string) => (Array.isArray(data) ? data : key && Array.isArray(data?.[key]) ? data[key] : [])
const lookupKey = (value: unknown) => String(value ?? "").trim().toLowerCase()

function createLookupResolver<T extends { id: number }>(records: T[], url: string, names: (record: T) => unknown[], payload: (name: string) => Record<string, unknown>, label: string, signal: AbortSignal) {
  const resolved = new Map<string, number>()
  const inFlight = new Map<string, Promise<number>>()
  const resolve = async (text: string): Promise<number> => {
    const value = text.trim()
    const key = lookupKey(value)
    const cached = resolved.get(key)
    if (cached !== undefined) return cached
    // Prefer a real name over an alias, code or ID, regardless of list ordering.
    let existing: T | undefined
    let bestPriority = Infinity
    for (const record of records) {
      const priority = names(record).findIndex((name) => lookupKey(name) === key)
      if (priority >= 0 && (priority < bestPriority || (priority === bestPriority && Number(record.id) < Number(existing?.id)))) {
        existing = record
        bestPriority = priority
      }
    }
    if (existing) {
      const id = Number(existing.id)
      resolved.set(key, id)
      return id
    }

    // The API checks the database again, including when the dialog's lists are stale or unavailable.
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ ...payload(value), reuse_existing: true }) })
    const record = await response.json().catch(() => ({}))
    const id = Number(record?.id)
    if (!response.ok || !Number.isInteger(id) || id <= 0) {
      throw new Error(record?.error || record?.message || `فشل إنشاء ${label}: ${value}`)
    }
    records.push({ ...record, id })
    resolved.set(key, id)
    return id
  }
  // الصفوف تُحفظ بالتوازي: طلب إنشاء واحد فقط لكل اسم جديد مهما تكرر بالصفوف
  return (text: string): Promise<number> => {
    const key = lookupKey(text.trim())
    let pending = inFlight.get(key)
    if (!pending) {
      pending = resolve(text).finally(() => inFlight.delete(key))
      inFlight.set(key, pending)
    }
    return pending
  }
}

type ImportMode = "create" | "update"

// وضع التحديث: لا سعر شراء ولا كمية ابتدائية (لا سند إدخال بضاعة) ولا تغيير لتتبّع الصلاحية/التشغيلي/المتسلسل،
// والاسم والوحدة الرئيسية اختياريان (الفارغ يُبقي القيمة الحالية).
const UPDATE_EXCLUDED_FIELDS = new Set(["last_purchase_price", "initial_quantity", "initial_warehouse", "expiry_tracking", "batch_tracking", "serial_tracking"])

function buildFields(lookups: Lookups, mode: ImportMode = "create"): ImportField[] {
  const fields: ImportField[] = [
    { key: "product_code", label: "رقم الصنف", required: true, unique: true, aliases: ["product_code", "code", "رقم", "كود الصنف"], description: "يُكمَّل إلى 10 خانات تلقائياً", example: "1001" },
    { key: "product_name", label: "اسم الصنف", required: true, aliases: ["product_name", "name", "الاسم"], maxLength: 200, example: "سكر أبيض 1 كغم" },
    { key: "product_name_en", label: "اسم الصنف إنجليزي", aliases: ["product_name_en", "name_en", "english name"], maxLength: 200 },
    { key: "description", label: "الوصف", aliases: ["description"] },
    { key: "category_id", label: "التصنيف", aliases: ["category_id", "category", "التصنيف (رقم)"], options: lookups.productCategories.map((item) => ({ value: item.id, label: item.name, aliases: [String(item.id)] })) },
    { key: "main_stock_group", label: "مجموعة الصنف", aliases: ["main_stock_group", "main_stock_id", "item_group", "item_group_id", "group_name", "group_code", "group_id", "رقم المجموعة", "المجموعة", "group"], description: "الاسم أو الرمز أو الرقم؛ تُنشأ تلقائياً إن لم تكن موجودة" },
    { key: "default_store", label: "المستودع الافتراضي", aliases: ["default_store", "warehouse", "المستودع"], options: lookups.warehouses.map((item) => ({ value: item.id, label: item.name, aliases: [String(item.id)] })) },
    { key: "last_purchase_price", label: "سعر الشراء", type: "number", min: 0, aliases: ["last_purchase_price", "آخر سعر شراء", "سعر الشراء", "التكلفة", "purchase_price"], description: "يُستخدم أيضاً كسعر الوحدة في سند إدخال الكمية الابتدائية" },
    { key: "initial_quantity", label: "الكمية الابتدائية", type: "number", min: 0, aliases: ["initial_quantity", "opening_quantity", "الكمية الابتدائية", "الكمية الافتتاحية", "رصيد افتتاحي"], description: "إن وُجدت تُحفظ بسند إدخال بضاعة بالوحدة الرئيسية وسعر الشراء" },
    { key: "initial_warehouse", label: "مستودع الكمية الابتدائية", aliases: ["initial_warehouse", "opening_warehouse", "مستودع الكمية الابتدائية", "مستودع الكمية"], options: lookups.warehouses.map((item) => ({ value: item.id, label: item.name, aliases: [String(item.id)] })), description: "مطلوب عند وجود كمية ابتدائية" },
    { key: "price_category", label: "فئة السعر", aliases: ["price_category", "price_category_id", "pricecategory", "priceCategoryId", "priceClass", "price category", "فئة البيع", "فئة الأسعار"], description: "الاسم أو الرقم؛ تُنشأ إن لم تكن موجودة. عند تركها فارغة تُستخدم فئة السعر الافتراضية" },
  ]
  for (let unit = 1; unit <= UNIT_COUNT; unit++) {
    fields.push({ key: `unit_${unit}`, label: unit === 1 ? "الوحدة الرئيسية" : `الوحدة ${unit}`, required: unit === 1, aliases: [`unit_${unit}`, `الوحدة ${unit}`, ...(unit === 1 ? ["الوحدة", "unit", "unit_id", "unit_name", "unit_code", "الوحدة 1"] : [])], description: "الاسم أو الرمز أو الرقم؛ تُنشأ تلقائياً إن لم تكن موجودة", example: unit === 1 ? "حبة" : undefined })
    if (unit > 1) fields.push({ key: `unit_${unit}_to_main_qnty`, label: `العلاقة بالوحدة الرئيسية ${unit}`, type: "number", aliases: [`unit_${unit}_to_main_qnty`, `معامل التحويل ${unit}`] })
    for (let barcode = 1; barcode <= BARCODES_PER_UNIT; barcode++) {
      fields.push({ key: `unit_${unit}_barcode_${barcode}`, label: `باركود الوحدة ${unit} - ${barcode}`, aliases: [`unit_${unit}_barcode_${barcode}`, ...(unit === 1 && barcode === 1 ? ["الباركود", "barcode"] : [])], example: unit === 1 && barcode === 1 ? "6281000000001" : undefined })
    }
    fields.push({ key: `unit_${unit}_sale_price`, label: `سعر بيع الوحدة ${unit}`, type: "number", min: 0, aliases: [`unit_${unit}_sale_price`, ...(unit === 1 ? ["سعر البيع", "price", "السعر"] : [])], example: unit === 1 ? 4.5 : undefined })
  }
  fields.push(
    { key: "expiry_tracking", label: "له تاريخ صلاحية", type: "boolean", aliases: ["expiry_tracking", "صلاحية"] },
    { key: "batch_tracking", label: "له رقم تشغيلي", type: "boolean", aliases: ["batch_tracking"] },
    { key: "serial_tracking", label: "له رقم متسلسل", type: "boolean", aliases: ["serial_tracking", "سيريال"] },
    ...[1, 2, 3].flatMap((index) => [
      { key: `factory_number_${index}`, label: `رقم المصنع ${index}`, aliases: [`factory_number_${index}`] } as ImportField,
      { key: `original_number_${index}`, label: `الرقم الأصلي ${index}`, aliases: [`original_number_${index}`] } as ImportField,
    ]),
    { key: "notes", label: "ملاحظات", aliases: ["notes"] },
  )
  if (mode === "create") return fields
  return fields
    .filter((field) => !UPDATE_EXCLUDED_FIELDS.has(field.key))
    .map((field) => field.key === "product_name" || field.key === "unit_1" ? { ...field, required: false, description: "اتركه فارغاً لإبقاء القيمة الحالية" }
      : field.key === "product_code" ? { ...field, description: "رقم صنف موجود — يُكمَّل إلى 10 خانات تلقائياً" } : field)
}

const barcodesOf = (data: Record<string, any>) => {
  const values: Array<{ field: string; value: string }> = []
  for (let unit = 1; unit <= UNIT_COUNT; unit++) for (let barcode = 1; barcode <= BARCODES_PER_UNIT; barcode++) {
    const value = String(data[`unit_${unit}_barcode_${barcode}`] || "").trim()
    if (value) values.push({ field: `unit_${unit}_barcode_${barcode}`, value })
  }
  return values
}

async function loadDefaultItemAccounts() {
  const defaults: Record<string, number | string> = {}
  const keys = [
    ["default_selling_account_id", "selling_account_id", "selling_account_code"],
    ["default_purchase_account_id", "purchase_account_id", "purchase_account_code"],
    ["default_selling_returns_account_id", "selling_returns_account_id", "selling_returns_account_code"],
    ["default_purchase_returns_account_id", "purchase_returns_account_id", "purchase_returns_account_code"],
    ["default_stock_end_account_id", "stock_end_account_id", "stock_end_account_code"],
    ["default_stock_start_account_id", "stock_start_account_id", "stock_start_account_code"],
    ["default_production_account_id", "production_account_id", "production_account_code"],
    ["default_municipality_service_account_id", "municipality_service_account_id", "municipality_service_account_code"],
    ["default_lsti3mal_account_id", "lsti3mal_account_id", "lsti3mal_account_code"],
  ]
  try {
    const settings: Record<string, any> = await fetch("/api/settings/system").then((response) => (response.ok ? response.json() : {}))
    await Promise.all(keys.map(async ([setting, idKey, codeKey]) => {
      const accountId = Number(settings?.[setting])
      if (!Number.isInteger(accountId) || accountId <= 0) return
      const account = await fetch(`/api/accounts/${accountId}`).then((response) => (response.ok ? response.json() : null)).catch(() => null)
      if (account?.id) { defaults[idKey] = account.id; defaults[codeKey] = account.code }
    }))
  } catch { /* بلا حسابات افتراضية */ }
  return defaults
}

/** استيراد الأصناف بالمحرك الموحّد — نفس قواعد وحفظ نافذة استيراد الأصناف السابقة. */
export function ProductsImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; onImported?: () => void }) {
  const [lookups, setLookups] = useState<Lookups | null>(null)
  const [mode, setMode] = useState<ImportMode>("create")
  const { user, activeBranchId } = useAuth()

  useEffect(() => {
    if (!open) return
    setMode("create")
    const json = (url: string) => fetch(url).then((response) => (response.ok ? response.json() : [])).catch(() => [])
    Promise.all([json("/api/product-categories"), json("/api/warehouses"), json("/api/units"), json("/api/item-groups"), json("/api/pricecategory")]).then(([categories, warehouses, units, groups, prices]) => {
      setLookups({
        productCategories: list(categories, "categories").map((item: any) => ({ id: Number(item.id), name: String(item.name || item.category_name || item.id) })),
        warehouses: list(warehouses).map((item: any) => ({ id: Number(item.id), name: String(item.warehouse_name || item.name || item.id) })),
        units: list(units).map((item: any) => ({ id: Number(item.id), unit_name: String(item.unit_name || ""), unit_name_en: item.unit_name_en, unit_code: item.unit_code })),
        groups: list(groups).map((item: any) => ({ id: Number(item.id), group_name: String(item.group_name || ""), group_code: item.group_code })),
        priceCategories: list(prices).map((item: any) => ({ id: Number(item.id), name: String(item.name || ""), name_en: item.name_en })),
      })
    })
  }, [open])

  const config = useMemo<ImportConfig | null>(() => {
    if (!lookups) return null
    return {
      title: mode === "update" ? "تحديث الأصناف من Excel" : "استيراد الأصناف من Excel",
      description: mode === "update"
        ? "تحديث أصناف موجودة برقمها: تُحدَّث الأعمدة المعبّأة فقط، وتُضاف الوحدات/الباركودات الجديدة وتُحدَّث أسعار البيع. سعر الشراء والكميات لا تُستورد في هذا الوضع."
        : undefined,
      templateFileName: mode === "update" ? "نموذج-تحديث-الأصناف" : "نموذج-الأصناف",
      fields: buildFields(lookups, mode),
      uploadExtras: ({ busy }) => (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm">
          <span className="px-1 font-semibold text-slate-600">نوع الاستيراد:</span>
          {([["create", "إضافة أصناف جديدة"], ["update", "تحديث أصناف موجودة"]] as const).map(([value, label]) => (
            <button key={value} type="button" disabled={busy} onClick={() => setMode(value)}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${mode === value ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-emerald-50"}`}>{label}</button>
          ))}
          {mode === "update" && <span className="text-xs text-amber-700">لا يُحدَّث سعر الشراء ولا يُنشأ سند إدخال بضاعة</span>}
        </div>
      ),
      validate: async (rows) => {
        const result = new Map<number, ImportIssue[]>()
        const add = (id: number, issue: ImportIssue) => result.set(id, [...(result.get(id) || []), issue])
        const barcodeRows = new Map<string, number>()
        for (const row of rows) {
          const seenInRow = new Set<string>()
          for (const { field, value } of barcodesOf(row.data)) {
            const key = value.toLowerCase()
            if (seenInRow.has(key)) add(row.id, { field, message: `الباركود ${value} مكرر داخل نفس الصنف` })
            seenInRow.add(key)
            const previous = barcodeRows.get(key)
            if (previous !== undefined && previous !== row.rowNumber) add(row.id, { field, message: `الباركود ${value} مكرر مع السطر ${previous}` })
            else barcodeRows.set(key, row.rowNumber)
          }
          const initialQuantity = mode === "create" ? Number(row.data.initial_quantity) || 0 : 0
          if (initialQuantity > 0) {
            if (!Number(row.data.initial_warehouse)) add(row.id, { field: "initial_warehouse", message: "مستودع الكمية الابتدائية مطلوب عند وجود كمية ابتدائية" })
            if (row.data.expiry_tracking || row.data.batch_tracking || row.data.serial_tracking) add(row.id, { field: "initial_quantity", message: "الأصناف ذات تاريخ الصلاحية أو الرقم التشغيلي أو المتسلسل لا تقبل كمية ابتدائية بالاستيراد؛ أدخلها بسند إدخال" })
          }
          for (let unit = 2; unit <= UNIT_COUNT; unit++) {
            if (mode === "create" && String(row.data[`unit_${unit}`] || "").trim() && !(Number(row.data[`unit_${unit}_to_main_qnty`]) > 0)) {
              add(row.id, { field: `unit_${unit}_to_main_qnty`, message: `العلاقة بالوحدة الرئيسية ${unit} يجب أن تكون أكبر من صفر` })
            }
          }
        }
        // أرقام وباركودات موجودة مسبقاً في النظام
        const codes = rows.map((row) => adjustProductCodeTo10(String(row.data.product_code || ""))).filter(Boolean)
        const barcodes = rows.flatMap((row) => barcodesOf(row.data).map((item) => item.value))
        if (codes.length || barcodes.length) {
          const data: { codes?: string[]; barcodes?: Record<string, string> } = await fetch("/api/import/products-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codes, barcodes }) }).then((response) => (response.ok ? response.json() : {})).catch(() => ({}))
          const existingCodes = new Set<string>(data.codes || [])
          const existingBarcodes: Record<string, string> = data.barcodes || {}
          for (const row of rows) {
            const code = adjustProductCodeTo10(String(row.data.product_code || ""))
            if (mode === "create" && code && existingCodes.has(code)) add(row.id, { field: "product_code", message: `رقم الصنف ${code} موجود مسبقاً في النظام — اختر «تحديث أصناف موجودة» لتحديثه` })
            if (mode === "update" && code && !existingCodes.has(code)) add(row.id, { field: "product_code", message: `رقم الصنف ${code} غير موجود — التحديث للأصناف الموجودة فقط` })
            // في التحديث: باركود الصنف نفسه ليس تعارضاً
            for (const { field, value } of barcodesOf(row.data)) if (existingBarcodes[value] && !(mode === "update" && existingBarcodes[value] === code)) add(row.id, { field, message: `الباركود ${value} مستخدم للصنف ${existingBarcodes[value]}` })
          }
        }
        return result
      },
      importRows: async (rows, _ctx, report, signal) => {
        const units = [...lookups.units]
        const groups = [...lookups.groups]
        const priceCategories = [...lookups.priceCategories]
        const ensureUnit = createLookupResolver(units, "/api/units", (unit) => [unit.unit_name, unit.unit_name_en, unit.unit_code, unit.id], (name) => ({ unit_name: name, unit_name_en: name, description: "", is_active: true, status: 1 }), "الوحدة", signal)
        const resolveGroup = createLookupResolver(groups, "/api/item-groups", (group) => [group.group_name, group.group_code, group.id], (name) => ({ group_name: name, status: "نشط" }), "مجموعة الصنف", signal)
        const resolvePriceCategory = createLookupResolver(priceCategories, "/api/pricecategory", (category) => [category.name, category.name_en, category.id], (name) => ({ name, name_en: name, status: 1 }), "فئة السعر", signal)
        const ensureGroup = async (text: string) => {
          return text.trim() ? resolveGroup(text) : null
        }
        const ensurePriceCategory = async (text: string) => {
          if (text.trim()) return resolvePriceCategory(text)
          const existingDefault = priceCategories[0]
          return existingDefault ? existingDefault.id : resolvePriceCategory("سعر البيع")
        }
        const defaultAccounts = await loadDefaultItemAccounts()
        // أصناف لها كمية ابتدائية: يُؤجَّل إبلاغ نجاحها حتى يُحفظ سند إدخال البضاعة
        const pendingStock: Array<{ rowId: number; productId: number; name: string; unitId: number; unitName: string; quantity: number; price: number; warehouseId: number }> = []
        const processRow = async (row: (typeof rows)[number]) => {
          if (signal.aborted) return
          const data = row.data
          try {
            const unitEntries = new Map<number, { unit_id: number; to_main_qnty: number; barcode_list: string[] }>()
            const unitIds = new Map<number, number>()
            for (let unit = 1; unit <= UNIT_COUNT; unit++) {
              const name = String(data[`unit_${unit}`] || "").trim()
              if (!name) continue
              const unitId = await ensureUnit(name)
              unitIds.set(unit, unitId)
              const barcodes = Array.from({ length: BARCODES_PER_UNIT }, (_, index) => String(data[`unit_${unit}_barcode_${index + 1}`] || "").trim()).filter(Boolean)
              const existing = unitEntries.get(unitId)
              unitEntries.set(unitId, { unit_id: unitId, to_main_qnty: existing?.to_main_qnty || (unit === 1 ? 1 : Number(data[`unit_${unit}_to_main_qnty`]) || 1), barcode_list: [...new Set([...(existing?.barcode_list || []), ...barcodes])] })
            }
            const pricedUnits = [...unitIds.entries()].filter(([unit]) => Number(data[`unit_${unit}_sale_price`]) > 0)
            const priceCategoryId = pricedUnits.length || String(data.price_category || "").trim() ? await ensurePriceCategory(String(data.price_category || "")) : null
            const prices = pricedUnits.map(([unit, unitId]) => ({ price_category_id: priceCategoryId, unit_id: unitId, price: Number(data[`unit_${unit}_sale_price`]), currency_id: 1 }))
            const body = {
              product_code: adjustProductCodeTo10(String(data.product_code)),
              product_name: data.product_name,
              product_name_en: data.product_name_en || "",
              description: data.description || "",
              category_id: data.category_id || null,
              main_stock_id: await ensureGroup(String(data.main_stock_group || "")),
              factory_number: "", original_number: "",
              factory_numbers: [1, 2, 3].map((index) => data[`factory_number_${index}`]).filter(Boolean),
              original_numbers: [1, 2, 3].map((index) => data[`original_number_${index}`]).filter(Boolean),
              last_purchase_price: Number(data.last_purchase_price) || 0,
              currency_id: 1, tax_rate: 0, discount_rate: 0,
              expiry_tracking: Boolean(data.expiry_tracking), batch_tracking: Boolean(data.batch_tracking), serial_tracking: Boolean(data.serial_tracking),
              status: 1, type: 1, service_type: 0, product_type: 1, tax_classification_id: 0, minimum_order_quantity: 0,
              notes: data.notes || "",
              units: [...unitEntries.values()],
              stores: data.default_store ? [{ store_id: Number(data.default_store), shelf: "", reorder_quantity: 0, max_quantity: 0, min_quantity: 0 }] : [],
              prices,
              ...defaultAccounts,
            }
            if (mode === "update") {
              // تحديث جزئي (app/api/import/products-update): بلا سعر شراء ولا كمية ابتدائية
              const updateResponse = await fetch("/api/import/products-update", {
                method: "POST", headers: { "Content-Type": "application/json" }, signal,
                body: JSON.stringify({
                  product_code: body.product_code, product_name: body.product_name || "", product_name_en: body.product_name_en, description: body.description,
                  category_id: body.category_id, main_stock_id: body.main_stock_id, default_store: data.default_store || null, notes: body.notes,
                  units: [1, 2, 3, 4, 5, 6].map((unit) => {
                    const unitId = unitIds.get(unit)
                    return unitId ? { unit_id: unitId, is_main: unit === 1, to_main_qnty: unit === 1 ? 1 : Number(data[`unit_${unit}_to_main_qnty`]) || null, barcode_list: unitEntries.get(unitId)?.barcode_list || [] } : null
                  }).filter(Boolean),
                  prices, factory_numbers: body.factory_numbers, original_numbers: body.original_numbers,
                }),
              })
              const updated = await updateResponse.json().catch(() => ({}))
              report(row.id, updateResponse.ok ? { ok: true } : { ok: false, message: updated?.error || "تعذر تحديث الصنف" })
              return
            }
            // الحفظ بالتوازي: إعادة المحاولة (حتى 3 مرات) عند تعارض أقفال قاعدة البيانات (deadlock/serialization)
            let response: Response
            let saved: any
            for (let attempt = 1; ; attempt++) {
              response = await fetch("/api/inventory/products", { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify(body) })
              saved = await response.json().catch(() => ({}))
              const lockConflict = !response.ok && /deadlock|could not serialize/i.test(String(saved?.error || saved?.message || ""))
              if (!lockConflict || attempt >= 3 || signal.aborted) break
              await new Promise((resolve) => setTimeout(resolve, 150 * attempt + Math.random() * 200))
            }
            if (!response.ok) {
              report(row.id, { ok: false, message: saved.message || saved.error || "خطأ في حفظ الصنف" })
              return
            }
            const productId = Number(saved.id || saved.productId || saved.product?.id)
            const quantity = Number(data.initial_quantity) || 0
            const mainUnitId = unitIds.get(1)
            if (quantity > 0 && productId > 0 && mainUnitId) {
              pendingStock.push({ rowId: row.id, productId, name: String(data.product_name), unitId: mainUnitId, unitName: String(data.unit_1 || ""), quantity, price: Number(data.last_purchase_price) || 0, warehouseId: Number(data.initial_warehouse) })
            } else report(row.id, { ok: true })
          } catch (error: any) {
            if (signal.aborted) return
            report(row.id, { ok: false, message: error?.message || "خطأ غير متوقع" })
          }
        }

        // حفظ الأصناف بالتوازي (6 طلبات معاً) بدل صنف بعد صنف — أسرع بكثير عند آلاف الأصناف
        const queue = [...rows]
        await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
          while (queue.length && !signal.aborted) await processRow(queue.shift()!)
        }))
        if (signal.aborted || !pendingStock.length) return

        // سند إدخال بضاعة (نوع 8) لكل مستودع: بالوحدة الرئيسية وسعر الشراء، على دفعات حتى 500 سطر للسند
        const failStock = (lines: typeof pendingStock, reason: string) =>
          lines.forEach((line) => report(line.rowId, { ok: false, message: `تم حفظ الصنف لكن تعذر حفظ سند إدخال الكمية الابتدائية: ${reason}` }))
        let bookId = 0
        try {
          const booksResponse = await fetch(`/api/receipts/voucher-books?vch_type=8${user?.id ? `&user_id=${encodeURIComponent(user.id)}` : ""}`, { signal })
          const booksData = booksResponse.ok ? await booksResponse.json() : null
          bookId = Number(booksData?.default_book_id) || (Array.isArray(booksData?.books) && booksData.books.length === 1 ? Number(booksData.books[0].id) : 0)
        } catch { /* يُعالَج أدناه */ }
        if (!bookId) return failStock(pendingStock, "لا يوجد دفتر سندات افتراضي لسند إدخال البضاعة للمستخدم")
        const byWarehouse = new Map<number, typeof pendingStock>()
        for (const line of pendingStock) byWarehouse.set(line.warehouseId, [...(byWarehouse.get(line.warehouseId) || []), line])
        const today = new Date().toISOString().slice(0, 10)
        for (const [warehouseId, lines] of byWarehouse) {
          for (let start = 0; start < lines.length; start += 500) {
            if (signal.aborted) return
            const chunk = lines.slice(start, start + 500)
            try {
              const codeResponse = await fetch(`/api/stock-vouchers/generate-number?vch_type=8&vch_book_id=${bookId}${activeBranchId ? `&branch_id=${activeBranchId}` : ""}`, { cache: "no-store", signal })
              const code = String((await codeResponse.json().catch(() => ({})))?.code || "")
              if (!code) throw new Error("تعذر توليد رقم سند الإدخال")
              const voucherResponse = await fetch("/api/stock-vouchers", {
                method: "POST", headers: { "Content-Type": "application/json" }, signal,
                body: JSON.stringify({
                  vch_type: 8, vch_code: code, vch_date: today, vch_book_id: bookId, branch_id: activeBranchId || undefined,
                  currency_id: null, rate: 1, to_store_id: warehouseId, status: 2, insert_user: Number(user?.id) || null,
                  note: "كمية ابتدائية - استيراد الأصناف من Excel",
                  items: chunk.map((line) => ({
                    product_id: line.productId, product_name: line.name, unit_id: line.unitId, unit: line.unitName,
                    quantity: line.quantity, unit_price: line.price, total_price: Math.round(line.quantity * line.price * 1000) / 1000, store_id: warehouseId,
                  })),
                }),
              })
              const voucher = await voucherResponse.json().catch(() => ({}))
              if (!voucherResponse.ok) throw new Error(voucher?.error || "خطأ غير معروف")
              chunk.forEach((line) => report(line.rowId, { ok: true }))
            } catch (error: any) {
              if (signal.aborted) return
              failStock(chunk, error?.message || "خطأ غير متوقع")
            }
          }
        }
      },
    }
  }, [lookups, user?.id, activeBranchId, mode])

  if (!config) return null
  return <ExcelImportWizard open={open} onOpenChange={onOpenChange} config={config} onImported={({ success }) => { if (success) onImported?.() }} />
}
