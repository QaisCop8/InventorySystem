"use client"

import { useEffect, useMemo, useState } from "react"
import { ExcelImportWizard, normalizeHeader, type ImportConfig, type ImportField, type ImportIssue } from "@/components/import/excel-import-wizard"

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
  units: Array<{ id: number; unit_name: string }>
  groups: Array<{ id: number; group_name: string; group_code?: string }>
  priceCategoryId: number
}

const list = (data: any, key?: string) => (Array.isArray(data) ? data : key && Array.isArray(data?.[key]) ? data[key] : [])

function buildFields(lookups: Lookups): ImportField[] {
  const fields: ImportField[] = [
    { key: "product_code", label: "رقم الصنف", required: true, unique: true, aliases: ["product_code", "code", "رقم", "كود الصنف"], description: "يُكمَّل إلى 10 خانات تلقائياً", example: "1001" },
    { key: "product_name", label: "اسم الصنف", required: true, aliases: ["product_name", "name", "الاسم"], maxLength: 200, example: "سكر أبيض 1 كغم" },
    { key: "product_name_en", label: "اسم الصنف إنجليزي", aliases: ["product_name_en", "name_en", "english name"], maxLength: 200 },
    { key: "description", label: "الوصف", aliases: ["description"] },
    { key: "category_id", label: "التصنيف", aliases: ["category_id", "category", "التصنيف (رقم)"], options: lookups.productCategories.map((item) => ({ value: item.id, label: item.name, aliases: [String(item.id)] })) },
    { key: "main_stock_group", label: "مجموعة الصنف", aliases: ["main_stock_group", "رقم المجموعة", "المجموعة", "group"], description: "تُنشأ تلقائياً إن لم تكن موجودة" },
    { key: "default_store", label: "المستودع الافتراضي", aliases: ["default_store", "warehouse", "المستودع"], options: lookups.warehouses.map((item) => ({ value: item.id, label: item.name, aliases: [String(item.id)] })) },
    { key: "last_purchase_price", label: "آخر سعر شراء", type: "number", min: 0, aliases: ["last_purchase_price", "سعر الشراء", "التكلفة"] },
  ]
  for (let unit = 1; unit <= UNIT_COUNT; unit++) {
    fields.push({ key: `unit_${unit}`, label: unit === 1 ? "الوحدة الرئيسية" : `الوحدة ${unit}`, required: unit === 1, aliases: [`unit_${unit}`, `الوحدة ${unit}`, ...(unit === 1 ? ["الوحدة", "unit", "الوحدة 1"] : [])], description: "تُنشأ تلقائياً إن لم تكن موجودة", example: unit === 1 ? "حبة" : undefined })
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
  return fields
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

  useEffect(() => {
    if (!open) return
    const json = (url: string) => fetch(url).then((response) => (response.ok ? response.json() : [])).catch(() => [])
    Promise.all([json("/api/product-categories"), json("/api/warehouses"), json("/api/units"), json("/api/item-groups"), json("/api/pricecategory")]).then(([categories, warehouses, units, groups, prices]) => {
      setLookups({
        productCategories: list(categories, "categories").map((item: any) => ({ id: Number(item.id), name: String(item.name || item.category_name || item.id) })),
        warehouses: list(warehouses).map((item: any) => ({ id: Number(item.id), name: String(item.warehouse_name || item.name || item.id) })),
        units: list(units).map((item: any) => ({ id: Number(item.id), unit_name: String(item.unit_name || "") })),
        groups: list(groups).map((item: any) => ({ id: Number(item.id), group_name: String(item.group_name || ""), group_code: item.group_code })),
        priceCategoryId: Number(list(prices)[0]?.id || 1),
      })
    })
  }, [open])

  const config = useMemo<ImportConfig | null>(() => {
    if (!lookups) return null
    return {
      title: "استيراد الأصناف من Excel",
      templateFileName: "نموذج-الأصناف",
      fields: buildFields(lookups),
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
          for (let unit = 2; unit <= UNIT_COUNT; unit++) {
            if (String(row.data[`unit_${unit}`] || "").trim() && !(Number(row.data[`unit_${unit}_to_main_qnty`]) > 0)) {
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
            if (code && existingCodes.has(code)) add(row.id, { field: "product_code", message: `رقم الصنف ${code} موجود مسبقاً في النظام` })
            for (const { field, value } of barcodesOf(row.data)) if (existingBarcodes[value]) add(row.id, { field, message: `الباركود ${value} مستخدم للصنف ${existingBarcodes[value]}` })
          }
        }
        return result
      },
      importRows: async (rows, _ctx, report, signal) => {
        const units = [...lookups.units]
        const groups = [...lookups.groups]
        const ensureUnit = async (name: string) => {
          const value = name.trim()
          const existing = units.find((unit) => normalizeHeader(unit.unit_name) === normalizeHeader(value))
          if (existing) return existing.id
          const response = await fetch("/api/units", { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ unit_name: value, unit_name_en: value, description: "", is_active: true, status: 1 }) })
          const created = await response.json().catch(() => ({}))
          if (!response.ok || !created?.id) throw new Error(created?.error || `فشل إنشاء الوحدة: ${value}`)
          units.push({ id: Number(created.id), unit_name: value })
          return Number(created.id)
        }
        const ensureGroup = async (text: string) => {
          const value = text.trim()
          if (!value) return null
          const existing = groups.find((group) => [group.group_name, group.group_code, String(group.id)].some((candidate) => normalizeHeader(candidate) === normalizeHeader(value)))
          if (existing) return existing.id
          const response = await fetch("/api/item-groups", { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ group_name: value, group_code: value, status: "نشط" }) })
          const created = await response.json().catch(() => ({}))
          if (!response.ok || !created?.id) throw new Error(`فشل إنشاء مجموعة الصنف: ${value}`)
          groups.push({ id: Number(created.id), group_name: value, group_code: value })
          return Number(created.id)
        }
        const defaultAccounts = await loadDefaultItemAccounts()
        for (const row of rows) {
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
            const prices = [...unitIds.entries()].filter(([unit]) => Number(data[`unit_${unit}_sale_price`]) > 0).map(([unit, unitId]) => ({ price_category_id: lookups.priceCategoryId, unit_id: unitId, price: Number(data[`unit_${unit}_sale_price`]), currency_id: 1 }))
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
            const response = await fetch("/api/inventory/products", { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify(body) })
            if (!response.ok) {
              const error = await response.json().catch(() => ({}))
              report(row.id, { ok: false, message: error.message || error.error || "خطأ في حفظ الصنف" })
            } else report(row.id, { ok: true })
          } catch (error: any) {
            if (signal.aborted) return
            report(row.id, { ok: false, message: error?.message || "خطأ غير متوقع" })
          }
        }
      },
    }
  }, [lookups])

  if (!config) return null
  return <ExcelImportWizard open={open} onOpenChange={onOpenChange} config={config} onImported={({ success }) => { if (success) onImported?.() }} />
}
