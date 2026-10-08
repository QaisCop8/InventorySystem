"use client"

import { useEffect, useMemo, useState } from "react"
import { ExcelImportWizard, type ImportConfig, type ImportIssue } from "@/components/import/excel-import-wizard"

export type PartyImportKind = "customers" | "suppliers" | "subscribers"

// parentSetting: مفتاح حساب الأب في "الحسابات الافتراضية" بإعدادات النظام — نفس ما يقرؤه الخادم عند الحفظ.
const LABELS: Record<PartyImportKind, { plural: string; single: string; type: number; parentSetting: string; parentLabel: string }> = {
  customers: { plural: "العملاء", single: "العميل", type: 1, parentSetting: "default_customer_parent_account", parentLabel: "للعملاء" },
  suppliers: { plural: "الموردين", single: "المورد", type: 2, parentSetting: "default_supplier_parent_account", parentLabel: "للموردين" },
  subscribers: { plural: "المشتركين", single: "المشترك", type: 4, parentSetting: "default_customer_subscription_account", parentLabel: "للمشتركين" },
}

type Lookups = { cities: string[]; classifications: string[]; priceCategories: Array<{ id: number; name: string }>; hasParentAccount: boolean }

const asArray = (data: any, key?: string) => (Array.isArray(data) ? data : key && Array.isArray(data?.[key]) ? data[key] : [])

/** استيراد العملاء/الموردين/المشتركين بالمحرك الموحّد. */
export function PartyImportDialog({ kind, open, onOpenChange, onImported }: { kind: PartyImportKind; open: boolean; onOpenChange: (open: boolean) => void; onImported?: () => void }) {
  const [lookups, setLookups] = useState<Lookups | null>(null)
  const label = LABELS[kind]

  useEffect(() => {
    if (!open) return
    const json = (url: string) => fetch(url).then((response) => (response.ok ? response.json() : [])).catch(() => [])
    Promise.all([json("/api/cities"), json(kind === "suppliers" ? "/api/supplier-categories" : "/api/customer-categories"), json("/api/pricecategory"), json("/api/settings/system")]).then(([cities, categories, prices, settingsData]) => {
      const settings = (settingsData as any)?.settings ?? settingsData
      const parentId = Number(settings?.[LABELS[kind].parentSetting] || 0)
      setLookups({
        hasParentAccount: Number.isFinite(parentId) && parentId > 0,
        cities: asArray(cities).map((city: any) => String(city.name || city.city_name || "")).filter(Boolean),
        classifications: asArray(categories, "categories").map((category: any) => String(category.name || "")).filter(Boolean),
        priceCategories: asArray(prices).map((price: any) => ({ id: Number(price.id), name: String(price.name || price.category_name || price.id) })),
      })
    })
  }, [open, kind])

  const config = useMemo<ImportConfig | null>(() => {
    if (!lookups) return null
    return {
      title: `استيراد ${label.plural} من Excel`,
      blockingMessage: lookups.hasParentAccount ? undefined : `يجب الذهاب الى الحسابات الافتراضية واختيار حساب الاب ${label.parentLabel}`,
      templateFileName: `نموذج-${label.plural}`,
      fields: [
        { key: "customer_code", label: `رقم ${label.single}`, aliases: ["customer_code", "code", "رقم", "الرقم", "كود"], unique: true, description: "يُولَّد تلقائياً إن تُرك فارغاً", example: "" },
        { key: "customer_name", label: `اسم ${label.single}`, required: true, aliases: ["customer_name", "name", "الاسم", "اسم العميل", "اسم المورد", "اسم المشترك"], maxLength: 150, example: "شركة النور" },
        { key: "mobile1", label: "الجوال الأول", aliases: ["mobile1", "mobile", "الجوال", "الموبايل", "هاتف"], maxLength: 30, example: "0599000000" },
        { key: "mobile2", label: "الجوال الثاني", aliases: ["mobile2"], maxLength: 30 },
        { key: "whatsapp1", label: "واتساب", aliases: ["whatsapp1", "whatsapp", "واتساب الأول"], maxLength: 30 },
        { key: "city", label: "المدينة", aliases: ["city", "المنطقة"], options: lookups.cities.map((name) => ({ value: name, label: name })) },
        { key: "address", label: "العنوان", aliases: ["address"], maxLength: 300 },
        { key: "email", label: "البريد الإلكتروني", aliases: ["email", "الايميل"], maxLength: 150 },
        { key: "classification", label: "التصنيف", aliases: ["classification", "classifications"], options: lookups.classifications.map((name) => ({ value: name, label: name })) },
        { key: "price_category", label: "فئة السعر", aliases: ["priceClass", "price_category", "pricecategory"], options: lookups.priceCategories.map((price) => ({ value: price.id, label: price.name, aliases: [String(price.id)] })) },
      ],
      validate: async (rows) => {
        const result = new Map<number, ImportIssue[]>()
        const add = (id: number, issue: ImportIssue) => result.set(id, [...(result.get(id) || []), issue])
        for (const row of rows) {
          const email = String(row.data.email || "")
          if (email && !/^\S+@\S+\.\S+$/.test(email)) add(row.id, { field: "email", message: "صيغة البريد الإلكتروني غير صحيحة" })
        }
        // الأرقام الموجودة مسبقاً في النظام
        const codes = rows.map((row) => String(row.data.customer_code || "").trim()).filter(Boolean)
        if (codes.length) {
          const response = await fetch("/api/import/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ check: true, codes, type: label.type }) })
          const data = await response.json().catch(() => ({}))
          const existing = new Set<string>((data.existing || []).map((code: string) => code))
          const normalized = new Map<string, string>(Object.entries(data.normalized || {}))
          for (const row of rows) {
            const code = String(row.data.customer_code || "").trim()
            if (code && existing.has(normalized.get(code) || code)) add(row.id, { field: "customer_code", message: `الرقم ${normalized.get(code) || code} موجود مسبقاً في النظام` })
          }
        }
        return result
      },
      importRows: async (rows, _ctx, report, signal) => {
        for (let index = 0; index < rows.length && !signal.aborted; index += 200) {
          const batch = rows.slice(index, index + 200)
          const payload = batch.map((row) => ({
            rowIndex: row.id,
            isValid: true,
            type: label.type,
            customer_code: row.data.customer_code,
            customer_name: row.data.customer_name,
            mobile1: row.data.mobile1, mobile2: row.data.mobile2, whatsapp1: row.data.whatsapp1,
            city: row.data.city, address: row.data.address, email: row.data.email,
            classification: row.data.classification,
            priceCategory: row.data.price_category,
          }))
          try {
            const response = await fetch("/api/import/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: payload }), signal })
            const data = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(data.error || "فشل الاستيراد")
            const byRow = new Map<number, any>((data.results || []).map((item: any) => [Number(item.rowIndex), item]))
            for (const row of batch) {
              const item = byRow.get(row.id)
              report(row.id, item?.status === "success" ? { ok: true } : { ok: false, message: item?.error || "لم يُحفظ" })
            }
          } catch (error: any) {
            if (signal.aborted) return
            for (const row of batch) report(row.id, { ok: false, message: error?.message || "خطأ في الاتصال" })
          }
        }
      },
    }
  }, [lookups, label])

  if (!config) return null
  return <ExcelImportWizard open={open} onOpenChange={onOpenChange} config={config} onImported={({ success }) => { if (success) onImported?.() }} />
}
