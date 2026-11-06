"use client"

import { tr } from "@/lib/i18n"
import { useEffect, useMemo, useState } from "react"
import { ExcelImportWizard, type ImportConfig, type ImportField, type ImportIssue } from "@/components/import/excel-import-wizard"

export type PartyImportKind = "customers" | "suppliers" | "subscribers"

// parentSetting: مفتاح حساب الأب في "الحسابات الافتراضية" بإعدادات النظام — نفس ما يقرؤه الخادم عند الحفظ.
const LABELS: Record<PartyImportKind, { plural: string; single: string; type: number; parentSetting: string; parentLabel: string }> = {
  customers: { plural: "العملاء", single: "العميل", type: 1, parentSetting: "default_customer_parent_account", parentLabel: tr("للعملاء") },
  suppliers: { plural: "الموردين", single: "المورد", type: 2, parentSetting: "default_supplier_parent_account", parentLabel: tr("للموردين") },
  subscribers: { plural: "المشتركين", single: "المشترك", type: 4, parentSetting: "default_customer_subscription_account", parentLabel: tr("للمشتركين") },
}

type Lookups = { cities: string[]; classifications: string[]; priceCategories: Array<{ id: number; name: string }>; currencies: Array<{ id: number; code: string; name: string }>; hasParentAccount: boolean }

type ImportMode = "create" | "update"
// وضع التحديث: الرصيد الافتتاحي له سند قيد مستقل فلا يُحدَّث من هنا
const UPDATE_EXCLUDED_FIELDS = new Set(["opening_balance", "opening_currency", "opening_date"])

const asArray = (data: any, key?: string) => (Array.isArray(data) ? data : key && Array.isArray(data?.[key]) ? data[key] : [])

/** استيراد العملاء/الموردين/المشتركين بالمحرك الموحّد. */
// showKindNotice: عند اختيار النوع من خارج النافذة (البداية السريعة) ⇐ تنبيه أن السجلات تُدخَل بالنوع المختار
export function PartyImportDialog({ kind, open, onOpenChange, onImported, showKindNotice = false }: { kind: PartyImportKind; open: boolean; onOpenChange: (open: boolean) => void; onImported?: () => void; showKindNotice?: boolean }) {
  const [lookups, setLookups] = useState<Lookups | null>(null)
  const [mode, setMode] = useState<ImportMode>("create")
  const label = LABELS[kind]

  useEffect(() => {
    if (!open) return
    setMode("create")
    const json = (url: string) => fetch(url).then((response) => (response.ok ? response.json() : [])).catch(() => [])
    Promise.all([json("/api/cities"), json(kind === "suppliers" ? "/api/supplier-categories" : "/api/customer-categories"), json("/api/pricecategory"), json("/api/settings/system"), json("/api/exchange-rates")]).then(([cities, categories, prices, settingsData, ratesData]) => {
      const settings = (settingsData as any)?.settings ?? settingsData
      const parentId = Number(settings?.[LABELS[kind].parentSetting] || 0)
      setLookups({
        hasParentAccount: Number.isFinite(parentId) && parentId > 0,
        cities: asArray(cities).map((city: any) => String(city.name || city.city_name || "")).filter(Boolean),
        classifications: asArray(categories, "categories").map((category: any) => String(category.name || "")).filter(Boolean),
        priceCategories: asArray(prices).map((price: any) => ({ id: Number(price.id), name: String(price.name || price.category_name || price.id) })),
        currencies: asArray(ratesData, "rates").map((currency: any) => ({ id: Number(currency.currency_id ?? currency.id), code: String(currency.currency_code ?? currency.code ?? ""), name: String(currency.currency_name ?? currency.name ?? "") })).filter((currency: any) => currency.id > 0),
      })
    })
  }, [open, kind])

  const config = useMemo<ImportConfig | null>(() => {
    if (!lookups) return null
    const isUpdate = mode === "update"
    const allFields: ImportField[] = [
        { key: "customer_code", label: tr("رقم {0}", label.single), aliases: ["customer_code", "code", "رقم", "الرقم", "كود"], unique: true, description: tr("يُولَّد تلقائياً إن تُرك فارغاً"), example: "" },
        { key: "customer_name", label: tr("اسم {0}", label.single), required: true, aliases: ["customer_name", "name", "الاسم", "اسم العميل", "اسم المورد", "اسم المشترك"], maxLength: 150, example: "شركة النور" },
        { key: "mobile1", label: tr("الجوال الأول"), aliases: ["mobile1", "mobile", "الجوال", "الموبايل", "هاتف"], maxLength: 30, example: "0599000000" },
        { key: "mobile2", label: tr("الجوال الثاني"), aliases: ["mobile2"], maxLength: 30 },
        { key: "whatsapp1", label: tr("واتساب"), aliases: ["whatsapp1", "whatsapp", "واتساب الأول"], maxLength: 30 },
        { key: "city", label: tr("المدينة"), aliases: ["city", "المنطقة"], options: lookups.cities.map((name) => ({ value: name, label: name })) },
        { key: "address", label: tr("العنوان"), aliases: ["address"], maxLength: 300 },
        { key: "email", label: tr("البريد الإلكتروني"), aliases: ["email", "الايميل"], maxLength: 150 },
        { key: "classification", label: tr("التصنيف"), aliases: ["classification", "classifications"], options: lookups.classifications.map((name) => ({ value: name, label: name })) },
        { key: "price_category", label: tr("فئة السعر"), aliases: ["priceClass", "price_category", "pricecategory"], options: lookups.priceCategories.map((price) => ({ value: price.id, label: price.name, aliases: [String(price.id)] })) },
        {
          key: "opening_balance", label: tr("الرصيد"), type: "number",
          aliases: ["opening_balance", "balance", "الرصيد", "الرصيد الافتتاحي", "رصيد افتتاحي"],
          description: kind === "suppliers"
            ? tr("رصيد افتتاحي: موجب = دائن (له)، سالب = مدين (عليه). يُقيَّد بسند قيد مقابل الحساب الوسيط للأرصدة الافتتاحية")
            : tr("رصيد افتتاحي: موجب = مدين (عليه)، سالب = دائن (له). يُقيَّد بسند قيد مقابل الحساب الوسيط للأرصدة الافتتاحية"),
        },
        {
          key: "opening_currency", label: tr("عملة الرصيد الافتتاحي"),
          aliases: ["opening_currency", "currency", "العملة", "عملة الرصيد", "عملة الرصيد الافتتاحي"],
          options: lookups.currencies.map((currency) => ({ value: currency.id, label: currency.code || currency.name, aliases: [currency.name, String(currency.id)] })),
          description: tr("وهي عملة الحساب أيضاً. فارغة ⇐ عملة الأساس"),
        },
        { key: "opening_date", label: tr("تاريخ الرصيد"), type: "date", aliases: ["opening_date", "تاريخ الرصيد", "تاريخ الرصيد الافتتاحي"], description: tr("تاريخ سند القيد — فارغ ⇐ تاريخ اليوم") },
      ]
    const fields = !isUpdate ? allFields : allFields
      .filter((field) => !UPDATE_EXCLUDED_FIELDS.has(field.key))
      .map((field) => field.key === "customer_code" ? { ...field, required: true, description: tr("رقم موجود — للمطابقة فقط ولا يتغيّر") }
        : field.key === "customer_name" ? { ...field, required: false, description: tr("اتركه فارغاً لإبقاء القيمة الحالية") } : field)
    return {
      title: isUpdate ? tr("تحديث {0} من Excel", label.plural) : tr("استيراد {0} من Excel", label.plural),
      description: isUpdate
        ? tr("تحديث سجلات موجودة برقمها: تُحدَّث الأعمدة المعبّأة فقط والفارغة تبقى كما هي. الرقم لا يتغيّر، والرصيد الافتتاحي لا يُحدَّث في هذا الوضع.")
        : showKindNotice ? tr("يتم ادخال السجلات حسب نوع الذمة المختار: {0}", label.plural) : undefined,
      blockingMessage: isUpdate || lookups.hasParentAccount ? undefined : tr("يجب الذهاب الى الحسابات الافتراضية واختيار حساب الاب {0}", label.parentLabel),
      templateFileName: isUpdate ? `نموذج-تحديث-${label.plural}` : `نموذج-${label.plural}`,
      fields,
      uploadExtras: ({ busy }) => (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm">
          <span className="px-1 font-semibold text-slate-600">{tr("نوع الاستيراد:")}</span>
          {([["create", tr("إضافة {0} جدد", label.plural)], ["update", tr("تحديث {0} موجودين", label.plural)]] as const).map(([value, text]) => (
            <button key={value} type="button" disabled={busy} onClick={() => setMode(value)}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${mode === value ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-emerald-50"}`}>{text}</button>
          ))}
          {isUpdate && <span className="text-xs text-amber-700">{tr("الرقم للمطابقة فقط — كل البيانات الأخرى قابلة للتحديث")}</span>}
        </div>
      ),
      validate: async (rows) => {
        const result = new Map<number, ImportIssue[]>()
        const add = (id: number, issue: ImportIssue) => result.set(id, [...(result.get(id) || []), issue])
        for (const row of rows) {
          const email = String(row.data.email || "")
          if (!isUpdate && Number(row.data.opening_balance) && !row.data.opening_currency && lookups.currencies.length > 1) add(row.id, { field: "opening_currency", message: tr("حدّد عملة الرصيد الافتتاحي") })
          if (email && !/^\S+@\S+\.\S+$/.test(email)) add(row.id, { field: "email", message: tr("صيغة البريد الإلكتروني غير صحيحة") })
        }
        // الأرقام الموجودة مسبقاً في النظام
        const codes = rows.map((row) => String(row.data.customer_code || "").trim()).filter(Boolean)
        if (codes.length) {
          const response = await fetch("/api/import/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ check: true, codes, type: label.type }) })
          const data = await response.json().catch(() => ({}))
          const existing = new Set<string>((data.existing || []).map((code: string) => code))
          const types: Record<string, number> = data.types || {}
          const normalized = new Map<string, string>(Object.entries(data.normalized || {}))
          for (const row of rows) {
            const code = String(row.data.customer_code || "").trim()
            const stored = normalized.get(code) || code
            if (!code) continue
            if (!isUpdate && existing.has(stored)) add(row.id, { field: "customer_code", message: tr("الرقم {0} موجود مسبقاً في النظام — اختر «تحديث {1} موجودين» لتحديثه", stored, label.plural) })
            if (isUpdate && !existing.has(stored)) add(row.id, { field: "customer_code", message: tr("الرقم {0} غير موجود — التحديث للسجلات الموجودة فقط", stored) })
            else if (isUpdate && types[stored] && types[stored] !== label.type) add(row.id, { field: "customer_code", message: tr("الرقم {0} ليس من {1}", stored, label.plural) })
          }
        }
        return result
      },
      importRows: async (rows, _ctx, report, signal) => {
        for (let index = 0; index < rows.length && !signal.aborted; index += 200) {
          const batch = rows.slice(index, index + 200)
          const payload = batch.map((row) => isUpdate ? ({
            rowIndex: row.id,
            type: label.type,
            customer_code: row.data.customer_code,
            customer_name: row.data.customer_name,
            mobile1: row.data.mobile1, mobile2: row.data.mobile2, whatsapp1: row.data.whatsapp1,
            city: row.data.city, address: row.data.address, email: row.data.email,
            classification: row.data.classification,
            priceCategory: row.data.price_category,
          }) : ({
            rowIndex: row.id,
            isValid: true,
            type: label.type,
            customer_code: row.data.customer_code,
            customer_name: row.data.customer_name,
            mobile1: row.data.mobile1, mobile2: row.data.mobile2, whatsapp1: row.data.whatsapp1,
            city: row.data.city, address: row.data.address, email: row.data.email,
            classification: row.data.classification,
            priceCategory: row.data.price_category,
            opening_balance: Number(row.data.opening_balance) || 0,
            opening_currency_id: row.data.opening_currency || null,
            opening_date: row.data.opening_date || null,
          }))
          try {
            const response = await fetch("/api/import/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: payload, ...(isUpdate ? { mode: "update" } : {}) }), signal })
            const data = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(data.error || tr("فشل الاستيراد"))
            const byRow = new Map<number, any>((data.results || []).map((item: any) => [Number(item.rowIndex), item]))
            for (const row of batch) {
              const item = byRow.get(row.id)
              report(row.id, item?.status === "success" ? { ok: true } : { ok: false, message: item?.error || tr("لم يُحفظ") })
            }
          } catch (error: any) {
            if (signal.aborted) return
            for (const row of batch) report(row.id, { ok: false, message: error?.message || tr("خطأ في الاتصال") })
          }
        }
      },
    }
  }, [lookups, label, kind, showKindNotice, mode])

  if (!config) return null
  return <ExcelImportWizard open={open} onOpenChange={onOpenChange} config={config} onImported={({ success }) => { if (success) onImported?.() }} />
}
