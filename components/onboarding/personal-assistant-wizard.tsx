"use client"

import { useCallback, useEffect, useState } from "react"
import { LicenseUsageStrip, useCompanyLicense, useLicenseRequestDialog } from "@/components/settings/license-limit"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Boxes, Building2, Check, Coins, FileSpreadsheet, Hash, Package, Sparkles, Trash2, Upload, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { useAuth } from "@/components/auth/auth-context"
import { AccountsImportDialog } from "@/components/import/accounts-import"
import { ProductsImportDialog } from "@/components/import/products-import"
import { PartyImportDialog, type PartyImportKind } from "@/components/import/customers-import"
import { buildVoucherCode } from "@/lib/voucher-code"

const steps = [
  { title: "معلومات الشركة", description: "أدخل بيانات الشركة الأساسية", icon: Building2, color: "from-teal-200 via-cyan-100 to-slate-50" },
  { title: "العملات", description: "أضف العملات وأسعار الصرف الأساسية", icon: Coins, color: "from-emerald-300 to-green-400" },
  { title: "التعريفات", description: "التعريفات الأساسية وبنود القوائم المالية", icon: Boxes, color: "from-violet-600 to-fuchsia-600" },
  { title: "الترقيم للسندات والملفات", description: "حدد بادئات وأرقام بداية السندات والملفات كما في إعدادات النظام", icon: Hash, color: "from-amber-500 to-orange-600" },
  { title: "الحسابات", description: "أنشئ دليل الحسابات أو استورده من Excel", icon: Building2, color: "from-blue-600 to-indigo-600" },
  { title: "الحسابات الافتراضية", description: "حدد الحسابات الافتراضية للنظام", icon: Building2, color: "from-sky-600 to-blue-600" },
  { title: "حسابات الأصناف", description: "حدد الحسابات الافتراضية لحركات الأصناف", icon: Package, color: "from-teal-600 to-emerald-600" },
  { title: "حسابات الصناديق والبنوك الافتراضية", description: "حدد حسابات الصندوق والشيكات والبطاقات لكل عملة", icon: Building2, color: "from-cyan-600 to-sky-700" },
  { title: "الأصناف", description: "أضف الأصناف أو استوردها من Excel", icon: Package, color: "from-emerald-600 to-teal-600" },
  { title: "العملاء", description: "أضف العملاء أو استوردهم من Excel", icon: Users, color: "from-cyan-600 to-blue-600" },
]

const defaultAccountFields = [
  ["default_customer_parent_account", "حساب أب العملاء"], ["default_customer_credit_account", "حساب أب عملاء الاعتمادات"],
  ["default_sales_tax_account", "حساب الضريبة على المبيعات"], ["default_currency_transfer_account", "حساب تحويلات العملة"],
  ["default_earned_discount_account", "حساب الخصم المكتسب"], ["default_exchange_gain_loss_account", "حساب أرباح وخسائر فروقات العملة"],
  ["default_salesman_parent_account", "حساب أب المندوبين"], ["default_supplier_parent_account", "حساب أب الموردين"],
  ["default_customer_subscription_account", "حساب أب المشتركين"], ["default_purchase_tax_account", "حساب الضريبة على المشتريات"],
  ["default_new_employee_account", "حساب الأب للموظف الجديد"], ["default_allowed_discount_account", "حساب الخصم المسموح به"],
] as const

const productAccountFields = [
  ["default_selling_account_id", "حساب المبيعات الافتراضي"], ["default_purchase_account_id", "حساب المشتريات الافتراضي"],
  ["default_selling_returns_account_id", "حساب مرتجعات المبيعات"], ["default_purchase_returns_account_id", "حساب مرتجعات المشتريات"],
  ["default_stock_end_account_id", "حساب تقييم بضاعة آخر المدة"], ["default_stock_start_account_id", "حساب تقييم بضاعة أول المدة"],
  ["default_production_account_id", "حساب الإنتاج"], ["default_municipality_service_account_id", "حساب المصاريف البلدية"],
  ["default_lsti3mal_account_id", "حساب المصروف في سند الاستعمال"],
] as const

type Notice = { type: "success" | "error" | "info"; text: string } | null
// نوع الذمة في "إضافة عميل سريع": يحدد نوع السجل المُضاف يدوياً ونوع سجلات استيراد Excel (نفس أنواع PartyImportDialog)
const PARTY_TYPES: Array<{ value: PartyImportKind; label: string; plural: string; type: number }> = [
  { value: "customers", label: "عميل", plural: "العملاء", type: 1 },
  { value: "suppliers", label: "مورد", plural: "الموردين", type: 2 },
  { value: "subscribers", label: "مشترك", plural: "المشتركين", type: 4 },
]
const voucherNumberingFields = [
  { prefix: "order_prefix", start: "order_start", label: "طلبات المبيعات" },
  { prefix: "purchase_prefix", start: "purchase_start", label: "طلبات الشراء" },
  { prefix: "receipt_prefix", start: "receipt_start", label: "سندات القبض" },
  { prefix: "payment_prefix", start: "payment_start", label: "سندات الصرف" },
  { prefix: "credit_note_prefix", start: "credit_note_start", label: "الإشعار الدائن" },
  { prefix: "debit_note_prefix", start: "debit_note_start", label: "الإشعار المدين" },
  { prefix: "stock_in_prefix", start: "stock_in_start", label: "سند إدخال بضاعة" },
  { prefix: "stock_out_prefix", start: "stock_out_start", label: "سند إخراج بضاعة" },
  { prefix: "internal_delivery_prefix", start: "internal_delivery_start", label: "إرسالية داخلية" },
  { prefix: "use_voucher_prefix", start: "use_voucher_start", label: "سند استعمال" },
  { prefix: "sales_invoice_prefix", start: "sales_invoice_start", label: "فاتورة مبيعات" },
  { prefix: "delivery_sell_prefix", start: "delivery_sell_start", label: "إرسالية مبيعات" },
  { prefix: "delivery_consignment_sale_prefix", start: "delivery_consignment_sale_start", label: "إرسالية برسم البيع" },
  { prefix: "return_delivery_consignment_sale_prefix", start: "return_delivery_consignment_sale_start", label: "مرتجع إرسالية برسم البيع" },
  { prefix: "return_sell_prefix", start: "return_sell_start", label: "مرتجع مبيعات" },
  { prefix: "purchase_invoice_prefix", start: "purchase_invoice_start", label: "فاتورة مشتريات" },
  { prefix: "delivery_pay_prefix", start: "delivery_pay_start", label: "إرسالية مشتريات" },
  { prefix: "return_purchase_prefix", start: "return_purchase_start", label: "مرتجع مشتريات" },
  { prefix: "journal_prefix", start: "journal_start", label: "سندات القيد" },
] as const
const fileNumberingFields = [
  { prefix: "account_prefix", start: "account_start", label: "الحسابات المحاسبية" },
  { prefix: "customer_prefix", start: "customer_start", label: "العملاء" },
  { prefix: "salesman_prefix", start: "salesman_start", label: "المندوبين" },
  { prefix: "employee_prefix", start: "employee_start", label: "الموظفين" },
  { prefix: "supplier_prefix", start: "supplier_start", label: "الموردين" },
  { prefix: "item_group_prefix", start: "item_group_start", label: "مجموعات الأصناف" },
  { prefix: null, start: "item_start", label: "الأصناف" },
] as const
const numberingKeys = [...voucherNumberingFields.flatMap(({ prefix, start }) => [prefix, start]), ...fileNumberingFields.flatMap(({ prefix, start }) => prefix ? [prefix, start] : [start])]
const numberingPrefixDefaults: Record<string, string> = {
  order_prefix: "SO", purchase_prefix: "PO", receipt_prefix: "R", payment_prefix: "P", credit_note_prefix: "C", debit_note_prefix: "D",
  stock_in_prefix: "I", stock_out_prefix: "O", internal_delivery_prefix: "T", use_voucher_prefix: "U", sales_invoice_prefix: "INV",
  delivery_sell_prefix: "DSL", delivery_consignment_sale_prefix: "INV", return_delivery_consignment_sale_prefix: "INV", return_sell_prefix: "INV",
  purchase_invoice_prefix: "INV", delivery_pay_prefix: "DPY", return_purchase_prefix: "RPU", journal_prefix: "J", account_prefix: "A",
  customer_prefix: "C", salesman_prefix: "M", employee_prefix: "E", supplier_prefix: "S", item_group_prefix: "G",
}
const emptyNumberingSettings = Object.fromEntries(numberingKeys.map((key) => [key, key.endsWith("_start") ? "1" : numberingPrefixDefaults[key] || ""])) as Record<string, string>
type CurrencyDefaultAccountRow = {
  currency_id: number
  currency_code: string
  currency_name: string
  cash_account_id: string
  incoming_checks_account_id: string
  returned_checks_account_id: string
  card_account_id: string
}

const normalizeLookup = (value: unknown) => String(value ?? "")
  .normalize("NFKC")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase("ar")
const lookupDefinitions = [
  { key: "warehouse", label: "المستودعات", endpoint: "/api/warehouses", field: "warehouse_name" },
  { key: "unit", label: "الوحدات", endpoint: "/api/units", field: "unit_name" },
  { key: "price", label: "فئات الأسعار", endpoint: "/api/pricecategory", field: "name" },
  { key: "branch", label: "الفروع", endpoint: "/api/branches", field: "branch_name" },
  { key: "department", label: "الأقسام", endpoint: "/api/departments", field: "department_name" },
  { key: "balanceAssets", label: "بنود أصول الميزانية", endpoint: "/api/balance-sheet-assets-items", field: "name" },
  { key: "balanceLiabilities", label: "بنود خصوم الميزانية", endpoint: "/api/balance-sheet-liabilities-items", field: "name" },
  { key: "incomeItems", label: "بنود قائمة الدخل", endpoint: "/api/income-statement-items", field: "name" },
] as const

export default function PersonalAssistantWizard() {
  const router = useRouter()
  const { user } = useAuth()
  // ترخيص الفروع: يظهر في تبويب الفروع، ويُفتح طلب زيادة الترخيص عند بلوغ الحد.
  const { license, reload: reloadLicense } = useCompanyLicense()
  const licenseRequest = useLicenseRequestDialog(() => void reloadLicense())
  const open = true
  // -1 is the company step; later indexes match the step list above minus one.
  const [step, setStep] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const [currency, setCurrency] = useState({ code: "", name: "", rate: "" })
  const [company, setCompany] = useState({
    companyName: "",
    companyNameEn: "",
    licensedWorkerNumber: "",
    taxNumber: "",
    commercialRegister: "",
    address: "",
    phone: "",
    email: "",
    website: "",
  })
  const [isFirstCurrency, setIsFirstCurrency] = useState(false)
  const [savedCurrencies, setSavedCurrencies] = useState<any[]>([])
  const [account, setAccount] = useState({ code: "", name: "", financialListId: "", assetsId: "", liabilitiesId: "", incomeId: "", currencyId: "" })
  const [savedAccounts, setSavedAccounts] = useState<any[]>([])
  // نافذة الاستيراد الموحّدة (نفس شاشات الحسابات/الأصناف/العملاء) — accountTemplate يحمّل هيكلاً جاهزاً مباشرة
  const [importDialog, setImportDialog] = useState<null | "accounts" | "products" | "customers">(null)
  const [accountTemplate, setAccountTemplate] = useState<string | undefined>(undefined)
  const [departmentBranchId, setDepartmentBranchId] = useState("")
  const [systemAccountSettings, setSystemAccountSettings] = useState<Record<string, string>>({})
  const [currencyDefaultAccounts, setCurrencyDefaultAccounts] = useState<CurrencyDefaultAccountRow[]>([])
  const [defaultAccountsBranchId, setDefaultAccountsBranchId] = useState("")
  const [defaultAccountsBranches, setDefaultAccountsBranches] = useState<any[]>([])
  const [defaultAccountStructure, setDefaultAccountStructure] = useState("commercial")
  const [financialItems, setFinancialItems] = useState<{ assets: any[]; liabilities: any[]; income: any[] }>({ assets: [], liabilities: [], income: [] })
  const [lookupValues, setLookupValues] = useState<Record<string, string>>({})
  const [activeLookupKey, setActiveLookupKey] = useState<string>(lookupDefinitions[0].key)
  const [savedLookups, setSavedLookups] = useState<Record<string, any[]>>({})
  const [product, setProduct] = useState({ code: "", name: "", unitId: "", sellingPrice: "", barcode: "" })
  const [productDefinitions, setProductDefinitions] = useState<{ units: any[]; priceCategories: any[] }>({ units: [], priceCategories: [] })
  const [savedProducts, setSavedProducts] = useState<any[]>([])
  const [customer, setCustomer] = useState({ code: "", name: "", phone: "" })
  const [savedParties, setSavedParties] = useState<Record<PartyImportKind, any[]>>({ customers: [], suppliers: [], subscribers: [] })
  const [partyKind, setPartyKind] = useState<PartyImportKind>("customers")
  const partyType = PARTY_TYPES.find((item) => item.value === partyKind) || PARTY_TYPES[0]
  const [numberingSettings, setNumberingSettings] = useState<Record<string, string>>(emptyNumberingSettings)
  const [autoNumbering, setAutoNumbering] = useState(true)

  const refreshSavedParties = useCallback(async () => {
    const entries = await Promise.all(PARTY_TYPES.map(async (party) => {
      const response = await fetch(`/api/customers?type=${party.type}`)
      if (!response.ok) return [party.value, []] as const
      const data = await response.json().catch(() => ({}))
      const rows = Array.isArray(data) ? data : Array.isArray(data?.customers) ? data.customers : []
      return [party.value, rows] as const
    }))
    setSavedParties(Object.fromEntries(entries) as Record<PartyImportKind, any[]>)
  }, [])

  useEffect(() => {
    fetch("/api/onboarding-assistant")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data?.shouldShow) return
        const savedStep = Number(data.current_step) || 0
        const migratedStep = Number(data.wizard_version) < 2 && savedStep >= 3 ? savedStep + 1 : savedStep
        setStep(Math.max(-1, Math.min(8, migratedStep - 1)))
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!open || step !== -1) return
    fetch("/api/exchange-rates")
      .then((response) => response.ok ? response.json() : [])
      .then((data) => {
        const list = Array.isArray(data?.rates) ? data.rates : Array.isArray(data) ? data : []
        setSavedCurrencies(list)
        const first = list.length === 0
        setIsFirstCurrency(first)
        if (first) setCurrency((current) => ({ ...current, rate: "1" }))
      })
      .catch(() => undefined)
  }, [open, step])

  // بيانات الشركة تُحمَّل عند خطوة "معلومات الشركة" نفسها (step = -1، أول خطوة) — كانت مشروطة بـstep === 0
  // (خطوة العملات) فتبقى حقول الشركة فارغة رغم وجود بياناتها. تُقبل المفاتيح بالصيغتين (company_name /
  // companyName) لبيانات قديمة حُفظت من شاشات أخرى.
  useEffect(() => {
    if (!open || step !== -1) return
    const pick = (data: any, ...keys: string[]) => {
      for (const key of keys) {
        const value = data?.[key]
        if (value !== undefined && value !== null && String(value).trim() !== "") return String(value)
      }
      return ""
    }
    fetch("/api/settings/system", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : {})
      .then((data: any) => setCompany({
        companyName: pick(data, "company_name", "companyName"),
        companyNameEn: pick(data, "company_name_en", "companyNameEn"),
        licensedWorkerNumber: pick(data, "licensed_worker_number", "licensedWorkerNumber"),
        taxNumber: pick(data, "tax_number", "taxNumber"),
        commercialRegister: pick(data, "commercial_register", "commercialRegister"),
        address: pick(data, "company_address", "companyAddress", "address"),
        phone: pick(data, "company_phone", "companyPhone", "phone"),
        email: pick(data, "company_email", "companyEmail", "email"),
        website: pick(data, "company_website", "companyWebsite", "website"),
      }))
      .catch(() => undefined)
  }, [open, step])

  useEffect(() => {
    if (!open || step !== 3) return
    Promise.all([
      fetch("/api/exchange-rates").then((response) => response.ok ? response.json() : []),
      fetch("/api/balance-sheet-assets-items").then((response) => response.ok ? response.json() : []),
      fetch("/api/balance-sheet-liabilities-items").then((response) => response.ok ? response.json() : []),
      fetch("/api/income-statement-items").then((response) => response.ok ? response.json() : []),
      fetch("/api/accounts?type=1").then((response) => response.ok ? response.json() : []),
    ]).then(([currenciesData, assets, liabilities, income, accounts]) => {
      setSavedCurrencies(Array.isArray(currenciesData?.rates) ? currenciesData.rates : Array.isArray(currenciesData) ? currenciesData : [])
      setFinancialItems({ assets: Array.isArray(assets) ? assets : [], liabilities: Array.isArray(liabilities) ? liabilities : [], income: Array.isArray(income) ? income : [] })
      setSavedAccounts(Array.isArray(accounts) ? accounts : [])
    }).catch(() => undefined)
  }, [open, step])

  useEffect(() => {
    if (!open || (step !== 4 && step !== 5)) return
    fetch("/api/settings/system")
      .then((response) => response.ok ? response.json() : {})
      .then((data: any) => setSystemAccountSettings(Object.fromEntries([...defaultAccountFields, ...productAccountFields].map(([key]) => [key, data?.[key] ? String(data[key]) : ""]))))
      .catch(() => undefined)
  }, [open, step])

  useEffect(() => {
    if (!open || step !== 6 || !user?.id) return
    let cancelled = false
    Promise.all([
      fetch("/api/exchange-rates").then((response) => response.ok ? response.json() : []),
      defaultAccountsBranchId ? fetch(`/api/settings/users-currencies-default?user_id=${encodeURIComponent(user.id)}&branch_id=${defaultAccountsBranchId}`).then((response) => response.ok ? response.json() : { rows: [] }) : Promise.resolve({ rows: [] }),
    ]).then(([currenciesData, mappingsData]) => {
      if (cancelled) return
      const currencies = Array.isArray(currenciesData?.rates) ? currenciesData.rates : Array.isArray(currenciesData) ? currenciesData : []
      const mappings = Array.isArray(mappingsData?.rows) ? mappingsData.rows : []
      setSavedCurrencies(currencies)
      setCurrencyDefaultAccounts(currencies.map((currency: any) => {
        const currencyId = Number(currency.currency_id ?? currency.id)
        const mapping = mappings.find((item: any) => Number(item.currency_id) === currencyId)
        return {
          currency_id: currencyId,
          currency_code: String(currency.currency_code ?? currency.code ?? ""),
          currency_name: String(currency.currency_name ?? currency.name ?? ""),
          cash_account_id: mapping?.cash_account_id ? String(mapping.cash_account_id) : "",
          incoming_checks_account_id: mapping?.incoming_checks_account_id ? String(mapping.incoming_checks_account_id) : "",
          returned_checks_account_id: mapping?.returned_checks_account_id ? String(mapping.returned_checks_account_id) : "",
          card_account_id: mapping?.card_account_id ? String(mapping.card_account_id) : "",
        }
      }))
    }).catch(() => showResult("error", "تعذر تحميل حسابات الصناديق والبنوك الافتراضية"))
    return () => { cancelled = true }
  }, [open, step, user?.id, defaultAccountsBranchId])

  useEffect(() => {
    if (!open || step !== 7) return
    Promise.all([
      fetch("/api/units").then((response) => response.ok ? response.json() : []),
      fetch("/api/pricecategory").then((response) => response.ok ? response.json() : []),
      fetch("/api/exchange-rates").then((response) => response.ok ? response.json() : []),
      fetch("/api/inventory/products").then((response) => response.ok ? response.json() : []),
    ]).then(([units, priceCategories, currenciesData, products]) => {
      setProductDefinitions({ units: Array.isArray(units) ? units : [], priceCategories: Array.isArray(priceCategories) ? priceCategories : [] })
      setSavedCurrencies(Array.isArray(currenciesData?.rates) ? currenciesData.rates : Array.isArray(currenciesData) ? currenciesData : [])
      setSavedProducts(Array.isArray(products) ? products : [])
    }).catch(() => undefined)
  }, [open, step])

  const saveCurrencyDefaultAccounts = async () => {
    if (!defaultAccountsBranchId) { showResult("error", "يجب تحديد الفرع"); return false }
    if (!user?.id) {
      showResult("error", "تعذر تحديد المستخدم الحالي")
      return false
    }
    setBusy(true)
    try {
      const response = await fetch("/api/settings/users-currencies-default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          branch_id: Number(defaultAccountsBranchId),
          rows: currencyDefaultAccounts.map((row) => ({
            currency_id: row.currency_id,
            cash_account_id: row.cash_account_id ? Number(row.cash_account_id) : null,
            incoming_checks_account_id: row.incoming_checks_account_id ? Number(row.incoming_checks_account_id) : null,
            returned_checks_account_id: row.returned_checks_account_id ? Number(row.returned_checks_account_id) : null,
            card_account_id: row.card_account_id ? Number(row.card_account_id) : null,
          })),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data?.success === false) throw new Error(data?.error || "تعذر الحفظ")
      showResult("success", "تم حفظ حسابات الصناديق والبنوك الافتراضية بنجاح")
      return true
    } catch (error) {
      showResult("error", error instanceof Error ? error.message : "تعذر الحفظ")
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveAccountSettings = async (fields: readonly (readonly [string, string])[]) => {
    setBusy(true)
    try {
      const payload = Object.fromEntries(fields.map(([key]) => [key, systemAccountSettings[key] ? Number(systemAccountSettings[key]) : null]))
      const response = await fetch("/api/settings/system", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || "تعذر حفظ الحسابات الافتراضية")
      showResult("success", "تم حفظ الحسابات الافتراضية بنجاح")
      return true
    } catch (error) {
      showResult("error", error instanceof Error ? error.message : "تعذر الحفظ")
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveNumberingSettings = async () => {
    const prefixFields = [...voucherNumberingFields.map((field) => field.prefix), ...fileNumberingFields.flatMap((field) => field.prefix ? [field.prefix] : [])]
    for (const key of prefixFields) {
      if (!/^[A-Z]{1,3}$/.test(String(numberingSettings[key] || "").trim())) {
        showResult("error", "يجب أن تكون بادئات الترقيم من حرف إلى 3 أحرف إنجليزية كبيرة")
        return false
      }
    }
    const startFields = [...voucherNumberingFields.map((field) => field.start), ...fileNumberingFields.map((field) => field.start)]
    for (const key of startFields) {
      const value = Number(numberingSettings[key])
      const max = voucherNumberingFields.some((field) => field.start === key) ? 10000 : Number.MAX_SAFE_INTEGER
      if (!Number.isInteger(value) || value < 1 || value > max) {
        showResult("error", "يجب أن يكون رقم بداية الترقيم عدداً صحيحاً أكبر من صفر")
        return false
      }
    }

    setBusy(true)
    try {
      const payload: Record<string, string | number | boolean> = {
        numbering_system: autoNumbering ? "auto" : "manual",
        auto_numbering: autoNumbering,
      }
      for (const key of prefixFields) payload[key] = numberingSettings[key].trim().toUpperCase()
      for (const key of startFields) payload[key] = Number(numberingSettings[key])
      const response = await fetch("/api/settings/system", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || "تعذر حفظ إعدادات الترقيم")
      showResult("success", "تم حفظ إعدادات الترقيم بنجاح")
      return true
    } catch (error) {
      showResult("error", error instanceof Error ? error.message : "تعذر حفظ إعدادات الترقيم")
      return false
    } finally {
      setBusy(false)
    }
  }

  const refreshSavedProducts = async () => {
    const response = await fetch("/api/inventory/products")
    if (!response.ok) return
    const data = await response.json()
    setSavedProducts(Array.isArray(data) ? data : [])
  }

  const refreshSavedAccounts = async () => {
    const response = await fetch("/api/accounts?type=1")
    if (!response.ok) return
    const data = await response.json()
    setSavedAccounts(Array.isArray(data) ? data : [])
  }

  const importDefaultAccounts = () => {
    setAccountTemplate(defaultAccountStructure)
    setImportDialog("accounts")
  }

  const openImport = (kind: "accounts" | "products" | "customers") => {
    setAccountTemplate(undefined)
    setImportDialog(kind)
  }

  useEffect(() => {
    if (!open || (step !== 3 && step !== 7 && step !== 8)) return
    const handleEnterNavigation = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target as HTMLElement | null
      const main = target?.closest("main")
      if (!main) return
      const controls = Array.from(main.querySelectorAll<HTMLElement>("input:not([disabled]), select:not([disabled]), button:not([disabled])"))
        .filter((element) => element.offsetParent !== null && !element.textContent?.includes("استيراد"))
      const currentIndex = target ? controls.indexOf(target) : -1
      if (currentIndex < 0) return
      event.preventDefault()
      event.stopPropagation()
      const current = controls[currentIndex]
      const isAddButton = current.tagName === "BUTTON" && current.textContent?.trim() === "إضافة"
      if (isAddButton) {
        ;(current as HTMLButtonElement).click()
        window.setTimeout(() => controls[0]?.focus(), 100)
        return
      }
      controls[currentIndex + 1]?.focus()
    }
    document.addEventListener("keydown", handleEnterNavigation, true)
    return () => document.removeEventListener("keydown", handleEnterNavigation, true)
  }, [open, step])

  const loadLookupRecords = async (definition: typeof lookupDefinitions[number]) => {
    const response = await fetch(definition.endpoint)
    const data = await response.json().catch(() => null)
    // فشل التحميل كان يُتجاهل بصمت — فتظهر القائمة فارغة رغم نجاح الحفظ (وتسمح بتكرار الاسم نفسه)
    if (!response.ok) {
      showResult("error", data?.error || `تعذر تحميل ${definition.label}`)
      return
    }
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Object.values(data || {}).find(Array.isArray) || []
    setSavedLookups((current) => ({ ...current, [definition.key]: rows as any[] }))
  }

  useEffect(() => {
    if (!open || step !== 1) return
    const definition = lookupDefinitions.find((item) => item.key === activeLookupKey) || lookupDefinitions[0]
    void loadLookupRecords(definition)
    // قائمة الفروع لاختيار فرع القسم
    if (definition.key === "department") void loadLookupRecords(lookupDefinitions.find((item) => item.key === "branch")!)
  }, [open, step, activeLookupKey])

  useEffect(() => {
    if (!open || step !== 2) return
    fetch("/api/settings/system")
      .then((response) => response.ok ? response.json() : {})
      .then((data: any) => {
        const settings = data?.settings ?? data
        setNumberingSettings(Object.fromEntries(numberingKeys.map((key) => [key, settings?.[key] == null ? emptyNumberingSettings[key] : String(settings[key])])) as Record<string, string>)
        setAutoNumbering(settings?.auto_numbering !== false && settings?.numbering_system !== "manual")
      })
      .catch(() => showResult("error", "تعذر تحميل إعدادات الترقيم"))
  }, [open, step])

  useEffect(() => {
    if (!open || step !== 6) return
    let cancelled = false
    fetch("/api/branches")
      .then((response) => response.ok ? response.json() : [])
      .then((data) => {
        if (cancelled) return
        const branches = Array.isArray(data) ? data : []
        setDefaultAccountsBranches(branches)
        setDefaultAccountsBranchId((current) => current || String(branches[0]?.id ?? ""))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [open, step])

  useEffect(() => {
    if (!open || step !== 8) return
    void refreshSavedParties()
  }, [open, step, refreshSavedParties])

  const saveProgress = async (nextStep: number, dismissed = false, completed = false) => {
    await fetch("/api/onboarding-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_step: completed ? steps.length - 1 : Math.max(0, nextStep + 1), wizard_version: 2, dismissed, completed }),
    })
  }

  const showResult = (type: "success" | "error" | "info", text: string) => {
    setNotice({ type, text })
    window.setTimeout(() => setNotice(null), 3500)
  }

  const post = async (url: string, body: any) => {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.error || data?.success === false) throw new Error(data?.error || data?.message || "تعذر الحفظ")
    return data
  }

  const addCurrent = async () => {
    setBusy(true)
    try {
      if (step === -1) {
        if (!/^[A-Za-z0-9]{0,30}$/.test(company.licensedWorkerNumber)) throw new Error("رقم المشتغل المرخص يجب أن يحتوي أحرفاً إنجليزية أو أرقاماً فقط وبحد أقصى 30 حرفاً")
        if (!/^[A-Za-z0-9]{0,20}$/.test(company.taxNumber)) throw new Error("الرقم الضريبي يجب أن يحتوي أحرفاً إنجليزية أو أرقاماً فقط وبحد أقصى 20 حرفاً")
        const response = await fetch("/api/settings/system", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_name: company.companyName,
            company_name_en: company.companyNameEn,
            licensed_worker_number: company.licensedWorkerNumber,
            tax_number: company.taxNumber,
            commercial_register: company.commercialRegister,
            company_address: company.address,
            company_phone: company.phone,
            company_email: company.email,
            company_website: company.website,
          }),
        })
        if (!response.ok) throw new Error("تعذر حفظ معلومات الشركة")
        showResult("success", "تم حفظ معلومات الشركة")
      } else if (step === 0) {
        const code = currency.code.trim().toUpperCase()
        const name = currency.name.trim()
        const rate = isFirstCurrency ? 1 : Number(currency.rate)
        if (!code || code.length > 3) throw new Error("رمز العملة مطلوب ويجب ألا يزيد عن 3 أحرف")
        if (!name || name.length > 30) throw new Error("اسم العملة مطلوب ويجب ألا يزيد عن 30 حرفاً")
        if (!Number.isFinite(rate) || rate < 0.001 || rate > 100000) throw new Error("سعر الصرف يجب أن يكون بين 0.001 و 100000")
        await post("/api/exchange-rates", { currency_code: code, currency_name: name, buy_rate: rate, sell_rate: rate, exchange_rate: rate, is_active: true })
        setCurrency({ code: "", name: "", rate: "" })
        setIsFirstCurrency(false)
        const refreshed = await fetch("/api/exchange-rates").then((response) => response.ok ? response.json() : { rates: [] })
        setSavedCurrencies(Array.isArray(refreshed?.rates) ? refreshed.rates : [])
      } else if (step === 3) {
        if (!account.code.trim() || !account.name.trim()) throw new Error("أدخل رقم الحساب واسمه")
        if (account.name.trim().length > 100) throw new Error("اسم الحساب يجب ألا يتجاوز 100 حرف")
        if (!["1", "2", "3"].includes(account.financialListId)) throw new Error("اختر القائمة المالية")
        if (!account.currencyId) throw new Error("اختر العملة")
        if (account.financialListId === "1" && !account.assetsId && !account.liabilitiesId) throw new Error("يجب اختيار بند أصول الميزانية أو بند خصوم الميزانية")
        if ((account.financialListId === "2" || account.financialListId === "3") && !account.incomeId) throw new Error("اختر بند قائمة الدخل")
        const accountCode = account.code.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10).padEnd(10, "0")
        await post("/api/accounts", { account_code: accountCode, account_name: account.name.trim(), company_id: 1, finanical_list_id: Number(account.financialListId), finanical_list_assests_id: account.assetsId ? Number(account.assetsId) : null, finanical_list_liabilities_id: account.liabilitiesId ? Number(account.liabilitiesId) : null, finanical_list_income_id: account.incomeId ? Number(account.incomeId) : null, currency_id: Number(account.currencyId), status: "نشط" })
        setAccount({ code: "", name: "", financialListId: "", assetsId: "", liabilitiesId: "", incomeId: "", currencyId: "" })
        await refreshSavedAccounts()
      } else if (step === 7) {
        if (!product.code.trim() || !product.name.trim()) throw new Error("أدخل رقم الصنف واسمه")
        if (!/^[A-Z0-9]{10}$/.test(product.code)) throw new Error("رقم الصنف يجب أن يتكون من 10 أحرف إنجليزية كبيرة أو أرقام")
        if (product.name.trim().length > 100) throw new Error("اسم الصنف يجب ألا يتجاوز 100 حرف")
        if (!product.unitId) throw new Error("يجب اختيار الوحدة")
        if (!productDefinitions.priceCategories.length) throw new Error("يجب تعريف فئة سعر واحدة على الأقل قبل إضافة الصنف")
        if (savedProducts.some((item) => normalizeLookup(item.product_name) === normalizeLookup(product.name))) throw new Error("اسم الصنف موجود مسبقاً")
        if (product.barcode.trim() && savedProducts.some((item) => normalizeLookup(item.first_barcode ?? item.barcode) === normalizeLookup(product.barcode))) throw new Error("الباركود موجود مسبقاً")
        const sellingPrice = Number(product.sellingPrice || 0)
        if (!Number.isFinite(sellingPrice) || sellingPrice < 0 || sellingPrice > 10000000) throw new Error("سعر البيع يجب أن يكون بين 0 و 10000000")
        if (product.barcode.trim().length > 30) throw new Error("الباركود يجب ألا يتجاوز 30 حرف")
        const selectedUnit = productDefinitions.units.find((item) => String(item.id) === product.unitId)
        const productResult = await post("/api/import/products", { data: [{ product_code: product.code, product_name: product.name.trim(), main_unit: selectedUnit?.unit_name || "قطعة", unit_id: Number(product.unitId), price_category_id: Number(productDefinitions.priceCategories[0].id), currency_id: Number(savedCurrencies[0]?.currency_id ?? savedCurrencies[0]?.id ?? 1), selling_price: sellingPrice, barcode: product.barcode.trim() }] })
        if (Number(productResult?.failed || 0) > 0 || Number(productResult?.duplicates || 0) > 0) throw new Error(productResult?.errors?.[0] || "تعذر إضافة الصنف")
        setProduct({ code: "", name: "", unitId: "", sellingPrice: "", barcode: "" })
        await refreshSavedProducts()
      } else if (step === 8) {
        if (!customer.name.trim()) throw new Error(`أدخل اسم ال${partyType.label}`)
        const partyResult = await post("/api/import/customers", { data: [{ rowIndex: 1, isValid: true, customer_code: customer.code, customer_name: customer.name, mobile1: customer.phone, type: partyType.type }] })
        const partyRow = Array.isArray(partyResult?.results) ? partyResult.results[0] : null
        if (partyRow && partyRow.status !== "success") throw new Error(partyRow.error || `تعذر إضافة ال${partyType.label}`)
        setCustomer({ code: "", name: "", phone: "" })
        await refreshSavedParties()
      }
      showResult("success", "تمت الإضافة بنجاح ويمكنك إضافة سجل آخر")
    } catch (error) {
      showResult("error", error instanceof Error ? error.message : "تعذر الحفظ")
    } finally {
      setBusy(false)
    }
  }

  const addLookup = async (definition: typeof lookupDefinitions[number]) => {
    const value = String(lookupValues[definition.key] || "").trim()
    if (!value) return
    const existingRows = savedLookups[definition.key] || []
    const duplicate = existingRows.some((row) => normalizeLookup(
      row?.[definition.field]
      ?? row?.name
      ?? row?.warehouse_name
      ?? row?.unit_name
      ?? row?.branch_name
      ?? row?.department_name,
    ) === normalizeLookup(value))
    if (duplicate) {
      showResult("error", `اسم ${definition.label} موجود مسبقاً`)
      return
    }
    // القسم يتبع فرعاً — الفرع المختار (أو الأول افتراضياً)
    const departmentBranch = departmentBranchId || String(savedLookups.branch?.[0]?.id ?? "")
    if (definition.key === "department" && !departmentBranch) {
      showResult("error", "اختر الفرع للقسم — أضف فرعاً أولاً من تبويب الفروع")
      return
    }
    if (definition.key === "branch" && license && license.usage.branches >= license.limits.branches) {
      licenseRequest.open("branches", `تم الوصول للحد المرخّص من الفروع (${license.usage.branches} من ${license.limits.branches}).`, license.pending.some((request) => request.resource === "branches"))
      return
    }
    setBusy(true)
    try {
      if (definition.key === "branch") {
        // الفرع بالاسم فقط — رقم الفرع يُولَّد تلقائياً على الخادم (quick).
        const response = await fetch(definition.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branch_name: value, status: 1, quick: true }) })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          if (licenseRequest.handleLimit(data)) return
          throw new Error(data?.error || "تعذر الحفظ")
        }
        void reloadLicense()
      } else if (definition.key === "department") {
        await post(definition.endpoint, { department_name: value, branch_id: Number(departmentBranch), is_active: true })
      } else {
        await post(definition.endpoint, { [definition.field]: value, status: 1, is_active: true })
      }
      setLookupValues((current) => ({ ...current, [definition.key]: "" }))
      await loadLookupRecords(definition)
      showResult("success", `تمت إضافة ${definition.label}`)
    } catch (error) {
      showResult("error", error instanceof Error ? error.message : "تعذر الحفظ")
    } finally {
      setBusy(false)
    }
  }

  const saveCompany = async () => {
    if (!/^[A-Za-z0-9]{0,30}$/.test(company.licensedWorkerNumber)) {
      showResult("error", "رقم المشتغل المرخص يجب أن يحتوي أحرفاً إنجليزية أو أرقاماً فقط وبحد أقصى 30 حرفاً")
      return false
    }
    if (!/^[A-Za-z0-9]{0,20}$/.test(company.taxNumber)) {
      showResult("error", "الرقم الضريبي يجب أن يحتوي أحرفاً إنجليزية أو أرقاماً فقط وبحد أقصى 20 حرفاً")
      return false
    }
    setBusy(true)
    try {
      const response = await fetch("/api/settings/system", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: company.companyName,
          company_name_en: company.companyNameEn,
          licensed_worker_number: company.licensedWorkerNumber,
          tax_number: company.taxNumber,
          commercial_register: company.commercialRegister,
          company_address: company.address,
          company_phone: company.phone,
          company_email: company.email,
          company_website: company.website,
        }),
      })
      if (!response.ok) throw new Error("تعذر حفظ معلومات الشركة")
      return true
    } catch (error) {
      showResult("error", error instanceof Error ? error.message : "تعذر حفظ معلومات الشركة")
      return false
    } finally {
      setBusy(false)
    }
  }

  const move = async (next: number) => {
    const bounded = Math.max(-1, Math.min(8, next))
    if (bounded > step && step === -1 && !(await saveCompany())) return
    if (bounded > step && step === 2 && !(await saveNumberingSettings())) return
    if (bounded > step && step === 4 && !(await saveAccountSettings(defaultAccountFields))) return
    if (bounded > step && step === 5 && !(await saveAccountSettings(productAccountFields))) return
    if (bounded > step && step === 6 && !(await saveCurrencyDefaultAccounts())) return
    setStep(bounded)
    await saveProgress(bounded)
  }

  const postpone = async () => {
    await saveProgress(step)
    router.push("/")
  }

  const finish = async () => {
    await saveProgress(8, false, true)
    router.push("/")
  }

  const displayStep = step + 1
  const StepIcon = steps[displayStep].icon
  return <>
    <div className="flex min-h-0 h-full w-full flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-sm" dir="rtl">
        <header className={`relative shrink-0 overflow-hidden bg-gradient-to-l ${steps[displayStep].color} px-4 py-3 ${displayStep === 0 ? "text-teal-950" : "text-white"} sm:px-6 sm:py-5`}>
          <div className="absolute inset-0 opacity-15 [background-image:radial-gradient(circle_at_20%_20%,white_0,transparent_35%),radial-gradient(circle_at_80%_80%,white_0,transparent_30%)]" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/55 ring-1 ring-teal-500/30"><Sparkles className="h-7 w-7 text-teal-800" /></div><div><h2 className="text-2xl font-black">البداية السريعة</h2><p className={displayStep === 0 ? "mt-1 text-sm text-teal-800" : "mt-1 text-sm text-white/85"}>إعداد شركتك بخطوات بسيطة وواضحة</p></div></div>
          </div>
        </header>

        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 sm:px-5 sm:py-4">
          <div className="flex items-center justify-between gap-2 overflow-x-auto">
            {steps.map((item, index) => { const Icon = item.icon; const active = index === displayStep; const done = index < displayStep; const companyStep = index === 0; return <button key={item.title} onClick={() => void move(index - 1)} className={`flex min-w-[150px] items-center gap-2 rounded-2xl px-3 py-2 text-right transition ${active ? companyStep ? "bg-teal-200 text-teal-950 shadow-lg ring-1 ring-teal-300" : "bg-slate-900 text-white shadow-lg" : done ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-500"}`}><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${active && companyStep ? "bg-teal-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-white/15"}`}>{done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span><span><span className="block text-xs opacity-70">الخطوة {index + 1}</span><span className="font-bold">{item.title}</span></span></button> })}
          </div>
        </div>

        <main
          className={`min-h-0 flex-1 overflow-y-auto p-3 sm:p-7 ${step >= 1 ? "md:flex" : ""}`}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement)) return
            const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])'))
            const next = focusable[focusable.indexOf(event.target) + 1]
            if (!next) return
            event.preventDefault()
            next.focus()
          }}
        >
          <div className={step >= 0 ? "quick-start-step flex min-h-0 w-full flex-1 flex-col" : "quick-start-step w-full"}>
            <div className="mb-4 flex items-center gap-3 sm:mb-6 sm:gap-4"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br sm:h-14 sm:w-14 ${steps[displayStep].color} ${displayStep === 0 ? "text-teal-900 ring-1 ring-teal-300" : "text-white"} shadow-lg`}><StepIcon className="h-6 w-6 sm:h-7 sm:w-7" /></div><div><h3 className="text-xl font-black text-slate-900 sm:text-2xl">{steps[displayStep].title}</h3><p className="text-sm text-slate-500 sm:text-base">{steps[displayStep].description}</p></div></div>
            {notice && <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-bold ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : notice.type === "info" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-red-200 bg-red-50 text-red-700"}`}>{notice.text}</div>}
            {step === -1 && <CompanyInfoStep company={company} onChange={setCompany} />}

            {step === 0 && <div className="space-y-5"><section className="grid gap-4 rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:grid-cols-3"><Field label="رمز العملة" value={currency.code} onChange={(value) => setCurrency({ ...currency, code: value.toUpperCase() })} placeholder="USD" maxLength={3} /><Field label="اسم العملة" value={currency.name} onChange={(value) => setCurrency({ ...currency, name: value })} placeholder="دولار أمريكي" maxLength={30} /><Field label={isFirstCurrency ? "سعر الصرف (العملة الأساسية)" : "سعر الصرف"} value={currency.rate} onChange={(value) => setCurrency({ ...currency, rate: value })} placeholder="3.40" type="number" min={0.001} max={100000} step="0.001" disabled={isFirstCurrency} /><AddButton busy={busy} onClick={addCurrent} label="إضافة العملة" /></section><section className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/70 px-5 py-3"><h4 className="font-black text-emerald-950">العملات المحفوظة</h4><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{savedCurrencies.length} عملة</span></div>{savedCurrencies.length === 0 ? <div className="px-5 py-8 text-center text-sm text-slate-400">لم تتم إضافة عملات بعد</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-900 text-white"><tr><th className="px-4 py-3 text-right">#</th><th className="px-4 py-3 text-right">رمز العملة</th><th className="px-4 py-3 text-right">اسم العملة</th><th className="px-4 py-3 text-right">سعر الصرف</th></tr></thead><tbody>{savedCurrencies.map((item, index) => <tr key={item.currency_id ?? item.id ?? index} className="border-b border-slate-100 last:border-0 even:bg-slate-50/70"><td className="px-4 py-3 text-slate-400">{index + 1}</td><td className="px-4 py-3 font-black text-slate-800">{item.currency_code}</td><td className="px-4 py-3 text-slate-700">{item.currency_name}</td><td className="px-4 py-3 font-semibold text-emerald-700">{Number(item.exchange_rate || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td></tr>)}</tbody></table></div>}</section></div>}
            {step === 1 && licenseRequest.element}{step === 1 && <LookupTabs extraFor={{ branch: <LicenseUsageStrip resource="branches" license={license} onRequest={() => licenseRequest.open("branches")} /> }} inlineFor={{ department: <select aria-label="الفرع" title="الفرع" value={departmentBranchId || String(savedLookups.branch?.[0]?.id ?? "")} onChange={(event) => setDepartmentBranchId(event.target.value)} className="h-11 w-56 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"><option value="">{savedLookups.branch?.length ? "اختر الفرع *" : "لا توجد فروع — أضف فرعاً أولاً"}</option>{(savedLookups.branch || []).map((branch: any) => <option key={branch.id} value={String(branch.id)}>{String(branch.branch_name ?? branch.name ?? branch.id)}</option>)}</select> }} activeKey={activeLookupKey} onTabChange={setActiveLookupKey} values={lookupValues} onValueChange={(key, value) => setLookupValues((current) => ({ ...current, [key]: value }))} records={savedLookups} busy={busy} onAdd={addLookup} />}
            {step === 2 && <NumberingSettingsStep values={numberingSettings} autoNumbering={autoNumbering} onChange={(key, value) => setNumberingSettings((current) => ({ ...current, [key]: value }))} onAutoNumberingChange={setAutoNumbering} />}
            {step === 3 && <DataStep title="إضافة حساب سريع" busy={busy} onAdd={addCurrent} onImport={() => openImport("accounts")} fields={<><Field label="رقم الحساب" value={account.code} onChange={(value) => setAccount({ ...account, code: value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) })} onBlur={() => setAccount((current) => ({ ...current, code: current.code ? current.code.padEnd(10, "0") : "" }))} maxLength={10} /><Field label="اسم الحساب" value={account.name} onChange={(value) => setAccount({ ...account, name: value })} maxLength={100} /><NativeSelect label="القائمة المالية" value={account.financialListId} onChange={(value) => setAccount({ ...account, financialListId: value, assetsId: "", liabilitiesId: "", incomeId: "" })} options={[{ value: "1", label: "الميزانية العمومية" }, { value: "2", label: "قائمة الدخل" }, { value: "3", label: "تقييم بضاعة" }]} />{account.financialListId === "1" && <><NativeSelect label="أصول الميزانية" value={account.assetsId} onChange={(value) => setAccount({ ...account, assetsId: value })} emptyLabel="عدم الإظهار" options={financialItems.assets.map((item) => ({ value: String(item.id), label: item.name }))} /><NativeSelect label="خصوم الميزانية" value={account.liabilitiesId} onChange={(value) => setAccount({ ...account, liabilitiesId: value })} emptyLabel="عدم الإظهار" options={financialItems.liabilities.map((item) => ({ value: String(item.id), label: item.name }))} /></>}{account.financialListId === "2" && <NativeSelect label="بند قائمة الدخل" value={account.incomeId} onChange={(value) => setAccount({ ...account, incomeId: value })} options={financialItems.income.map((item) => ({ value: String(item.id), label: item.name }))} />}{account.financialListId === "3" && <><NativeSelect label="أصول الميزانية" value={account.assetsId} onChange={(value) => setAccount({ ...account, assetsId: value })} emptyLabel="عدم الإظهار" options={financialItems.assets.map((item) => ({ value: String(item.id), label: item.name }))} /><NativeSelect label="بند قائمة الدخل" value={account.incomeId} onChange={(value) => setAccount({ ...account, incomeId: value })} options={financialItems.income.map((item) => ({ value: String(item.id), label: item.name }))} /></>}<NativeSelect label="العملة" value={account.currencyId} onChange={(value) => setAccount({ ...account, currencyId: value })} options={savedCurrencies.map((item) => ({ value: String(item.currency_id ?? item.id), label: `${item.currency_code} - ${item.currency_name}` }))} /><NativeSelect label="نوع هيكل الحسابات الافتراضي" value={defaultAccountStructure} onChange={setDefaultAccountStructure} options={[{ value: "commercial", label: "مؤسسة تجارية" }, { value: "commercial_continuous_inventory", label: "مؤسسة تجارية - جرد مستمر" }, { value: "services", label: "خدمات" }]} /><div className="flex items-end"><Button type="button" disabled={busy} onClick={importDefaultAccounts} className="h-11 w-full rounded-xl bg-emerald-600 px-6 hover:bg-emerald-700"><Building2 className="ml-2 h-4 w-4" />استيراد هيكل الحسابات الافتراضي</Button></div></>} savedContent={<><SavedAccountsTable accounts={savedAccounts} currencies={savedCurrencies} /></>} />}
            {step === 4 && <AccountSettingsStep title="الحسابات الافتراضية" fields={defaultAccountFields} values={systemAccountSettings} onChange={(key, value) => setSystemAccountSettings((current) => ({ ...current, [key]: value }))} busy={busy} onSave={() => void saveAccountSettings(defaultAccountFields)} />}
            {step === 5 && <AccountSettingsStep title="حسابات الأصناف" fields={productAccountFields} values={systemAccountSettings} onChange={(key, value) => setSystemAccountSettings((current) => ({ ...current, [key]: value }))} busy={busy} onSave={() => void saveAccountSettings(productAccountFields)} />}
            {step === 6 && <><NativeSelect label="الفرع *" value={defaultAccountsBranchId} onChange={setDefaultAccountsBranchId} options={defaultAccountsBranches.map(branch => ({ value: String(branch.id), label: branch.branch_name }))} /><CurrencyDefaultAccountsStep rows={currencyDefaultAccounts} busy={busy} onChange={(currencyId, field, value) => setCurrencyDefaultAccounts((current) => current.map((row) => row.currency_id === currencyId ? { ...row, [field]: value } : row))} onSave={() => void saveCurrencyDefaultAccounts()} /></>}
            {step === 7 && <DataStep title="إضافة صنف سريع" busy={busy} onAdd={addCurrent} onImport={() => openImport("products")} fields={<><Field label="رقم الصنف" value={product.code} onChange={(value) => setProduct({ ...product, code: value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) })} onBlur={() => setProduct((current) => ({ ...current, code: current.code ? current.code.padEnd(10, "0") : "" }))} maxLength={10} /><Field label="اسم الصنف" value={product.name} onChange={(value) => setProduct({ ...product, name: value })} maxLength={100} /><NativeSelect label="الوحدة" value={product.unitId} onChange={(value) => setProduct({ ...product, unitId: value })} emptyLabel="اختر الوحدة" options={productDefinitions.units.map((item) => ({ value: String(item.id), label: [item.unit_code, item.unit_name].filter(Boolean).join(" - ") }))} /><div><Label className="mb-2 block text-sm font-bold text-slate-700">فئة السعر</Label><div className={`flex h-11 items-center rounded-xl border px-3 text-sm font-bold ${productDefinitions.priceCategories.length ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{productDefinitions.priceCategories[0]?.name || "يجب تعريف فئة سعر أولاً"}</div></div><Field label="سعر البيع" value={product.sellingPrice} onChange={(value) => setProduct({ ...product, sellingPrice: value })} type="number" min={0} max={10000000} /><Field label="الباركود" value={product.barcode} onChange={(value) => setProduct({ ...product, barcode: value })} maxLength={30} /></>} savedContent={<SavedProductsTable products={savedProducts} />}/>}
            {step === 8 && <PartyRecordsStep kind={partyKind} parties={savedParties} customer={customer} busy={busy} onKindChange={setPartyKind} onCustomerChange={setCustomer} onAdd={addCurrent} onImport={() => { showResult("info", `يتم ادخال السجلات حسب نوع الذمة المختار: ${partyType.plural}`); openImport("customers") }} />}
          </div>
        </main>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-2 sm:gap-3 sm:px-5 sm:py-4">
          <Button variant="ghost" onClick={() => setConfirmDismiss(true)} className="text-slate-500 hover:bg-red-50 hover:text-red-700">عدم الإظهار مجدداً</Button>
          <div className="flex gap-2"><Button variant="outline" onClick={postpone} className="rounded-xl">تأجيل</Button>{step > -1 && <Button variant="outline" onClick={() => void move(step - 1)} className="rounded-xl"><ArrowRight className="ml-2 h-4 w-4" />السابق</Button>}<Button onClick={() => step === 8 ? void finish() : void move(step + 1)} className="rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-6 font-bold text-white shadow-sm hover:from-emerald-700 hover:to-teal-700">{step === 8 ? "إنهاء" : "التالي"}{step < 8 && <ArrowLeft className="mr-2 h-4 w-4" />}</Button></div>
        </footer>
    </div>
    <AccountsImportDialog open={importDialog === "accounts"} templateType={accountTemplate} onOpenChange={(value) => { if (!value) setImportDialog(null) }} onImported={() => { void refreshSavedAccounts() }} />
    <ProductsImportDialog open={importDialog === "products"} onOpenChange={(value) => { if (!value) setImportDialog(null) }} onImported={() => { void refreshSavedProducts() }} />
    <PartyImportDialog kind={partyKind} showKindNotice open={importDialog === "customers"} onOpenChange={(value) => { if (!value) setImportDialog(null) }} onImported={() => { void refreshSavedParties() }} />
    <ConfirmDialogYesNo visible={confirmDismiss} message="هل أنت متأكد؟ لن تستطيع الرجوع إلى البداية السريعة في حال التأكيد" onCancel={() => setConfirmDismiss(false)} onConfirm={() => { setConfirmDismiss(false); void saveProgress(step, true, false).then(() => router.push("/")) }} />
    <style jsx global>{`
      .rounded-2xl.border.border-slate-200 > .bg-slate-900 {
        background: linear-gradient(to left, #047857, #0d9488);
      }
      main.flex > div.flex > section.rounded-3xl.border-slate-200 {
        width: 100%;
        height: 100%;
        overflow-y: auto;
      }
    `}</style>
  </>
}

function NumberingSettingsStep({ values, autoNumbering, onChange, onAutoNumberingChange }: { values: Record<string, string>; autoNumbering: boolean; onChange: (key: string, value: string) => void; onAutoNumberingChange: (value: boolean) => void }) {
  const renderNumberingField = (field: { prefix: string | null; start: string; label: string }, isVoucher: boolean) => {
    const prefix = field.prefix ? String(values[field.prefix] || "") : ""
    const start = String(values[field.start] || "1")
    const numericStart = Number(start) || 1
    const preview = isVoucher
      ? buildVoucherCode(prefix, "A", numericStart)
      : field.prefix
        ? `${prefix}${String(numericStart).padStart(field.prefix === "salesman_prefix" || field.prefix === "employee_prefix" ? Math.max(1, 10 - prefix.length) : 4, "0")}`
        : String(numericStart)

    return <div key={field.start} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h5 className="mb-3 font-black text-slate-800">{field.label}</h5>
      <div className="grid gap-3 sm:grid-cols-2">
        {field.prefix && <div>
          <Label className="mb-2 block text-sm font-bold text-slate-700">بادئة {field.label}</Label>
          <Input value={prefix} onChange={(event) => onChange(field.prefix!, event.target.value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 3))} maxLength={3} className="text-right" dir="rtl" />
        </div>}
        <div>
          <Label className="mb-2 block text-sm font-bold text-slate-700">الترقيم يبدأ من</Label>
          <Input type="number" min={1} max={isVoucher ? 10000 : undefined} value={start} onChange={(event) => onChange(field.start, event.target.value)} className="text-right" dir="rtl" />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">مثال على الرقم التالي: <span className="font-mono font-bold text-slate-700">{preview}</span>{isVoucher && " (A = دفتر السندات)"}</p>
    </div>
  }

  return <section className="space-y-5 rounded-3xl border border-amber-100 bg-slate-50/60 p-4 sm:p-6">
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-bold text-amber-950">
      <input type="checkbox" checked={autoNumbering} onChange={(event) => onAutoNumberingChange(event.target.checked)} className="h-4 w-4 accent-amber-600" />
      الترقيم التلقائي للسندات والملفات
    </label>
    <div className="rounded-2xl border border-amber-100 bg-white p-4">
      <h4 className="mb-4 text-lg font-black text-slate-900">ترقيم السندات</h4>
      <div className="grid gap-3 lg:grid-cols-2">{voucherNumberingFields.map((field) => renderNumberingField(field, true))}</div>
    </div>
    <div className="rounded-2xl border border-amber-100 bg-white p-4">
      <h4 className="mb-4 text-lg font-black text-slate-900">ترقيم الملفات</h4>
      <div className="grid gap-3 lg:grid-cols-2">{fileNumberingFields.map((field) => renderNumberingField(field, false))}</div>
    </div>
  </section>
}

function PartyRecordsStep({ kind, parties, customer, busy, onKindChange, onCustomerChange, onAdd, onImport }: { kind: PartyImportKind; parties: Record<PartyImportKind, any[]>; customer: { code: string; name: string; phone: string }; busy: boolean; onKindChange: (kind: PartyImportKind) => void; onCustomerChange: (value: { code: string; name: string; phone: string }) => void; onAdd: () => void; onImport: () => void }) {
  const activeParty = PARTY_TYPES.find((party) => party.value === kind) || PARTY_TYPES[0]
  const rows = parties[kind] || []

  return <section className="overflow-hidden rounded-3xl border border-cyan-100 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-100 bg-gradient-to-l from-cyan-700 to-blue-700 px-5 py-4 text-white">
      <div><h4 className="text-lg font-black">العملاء والموردون والمشتركون</h4><p className="mt-1 text-xs text-cyan-100">اختر نوع السجل لعرض المحفوظ وإضافة سجل جديد</p></div>
      <Button type="button" variant="outline" disabled={busy} onClick={onImport} className="gap-2 rounded-xl border-white/50 bg-white text-cyan-800 hover:bg-cyan-50"><FileSpreadsheet className="h-4 w-4" /><Upload className="h-4 w-4" />استيراد {activeParty.plural} من Excel</Button>
    </div>
    <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50 p-3" role="tablist" aria-label="نوع السجل">
      {PARTY_TYPES.map((party) => <button key={party.value} type="button" role="tab" aria-selected={kind === party.value} onClick={() => onKindChange(party.value)} className={`shrink-0 rounded-xl px-5 py-2.5 text-sm font-black transition ${kind === party.value ? "bg-cyan-700 text-white shadow" : "bg-white text-slate-600 hover:bg-cyan-50"}`}>
        {party.plural}<span className={`mr-2 rounded-full px-2 py-0.5 text-xs ${kind === party.value ? "bg-white/20" : "bg-slate-100"}`}>{parties[party.value]?.length || 0}</span>
      </button>)}
    </div>
    <div className="space-y-5 p-4 sm:p-5">
      <div className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4">
        <h5 className="mb-3 font-black text-slate-800">إضافة {activeParty.label} سريع</h5>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={`رقم ${activeParty.label} (اختياري)`} value={customer.code} onChange={(value) => onCustomerChange({ ...customer, code: value })} />
          <Field label={`اسم ${activeParty.label}`} value={customer.name} onChange={(value) => onCustomerChange({ ...customer, name: value })} />
          <Field label="الجوال" value={customer.phone} onChange={(value) => onCustomerChange({ ...customer, phone: value })} />
          <AddButton busy={busy} onClick={onAdd} label="إضافة" />
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white"><h5 className="font-bold">{activeParty.plural} المحفوظون</h5><span className="rounded-full bg-white/15 px-3 py-1 text-xs">{rows.length} سجل</span></div>
        {rows.length === 0 ? <div className="py-9 text-center text-sm text-slate-400">لا توجد سجلات محفوظة</div> : <div className="max-h-72 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-100 text-slate-600"><tr><th className="w-16 px-4 py-3 text-right">#</th><th className="px-4 py-3 text-right">الرقم</th><th className="px-4 py-3 text-right">الاسم</th><th className="px-4 py-3 text-right">الجوال</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index} className="border-t border-slate-100 even:bg-slate-50/70"><td className="px-4 py-3 text-slate-400">{index + 1}</td><td className="px-4 py-3 font-mono font-bold text-slate-700">{row.customer_code ?? row.code ?? "-"}</td><td className="px-4 py-3 font-semibold text-slate-800">{row.name ?? row.customer_name ?? "-"}</td><td className="px-4 py-3 text-slate-600">{row.mobile1 ?? row.phone ?? "-"}</td></tr>)}</tbody></table></div>}
      </div>
    </div>
  </section>
}

function CompanyInfoStep({ company, onChange }: { company: { companyName: string; companyNameEn: string; licensedWorkerNumber: string; taxNumber: string; commercialRegister: string; address: string; phone: string; email: string; website: string }; onChange: (value: typeof company) => void }) {
  const filterValue = (value: string, maxLength: number) => value.replace(/[^A-Za-z0-9]/g, "").slice(0, maxLength)

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="اسم الشركة (عربي)" value={company.companyName} onChange={(value) => onChange({ ...company, companyName: value })} />
        <Field label="اسم الشركة (إنجليزي)" value={company.companyNameEn} onChange={(value) => onChange({ ...company, companyNameEn: value })} />
        <Field
          label="رقم المشتغل المرخص"
          value={company.licensedWorkerNumber}
          onChange={(value) => onChange({ ...company, licensedWorkerNumber: filterValue(value, 30) })}
          maxLength={30}
        />
        <Field
          label="الرقم الضريبي"
          value={company.taxNumber}
          onChange={(value) => onChange({ ...company, taxNumber: filterValue(value, 20) })}
          maxLength={20}
        />
        <Field label="السجل التجاري" value={company.commercialRegister} onChange={(value) => onChange({ ...company, commercialRegister: value })} />
        <Field label="الهاتف" value={company.phone} onChange={(value) => onChange({ ...company, phone: value })} />
        <Field label="البريد الإلكتروني" value={company.email} onChange={(value) => onChange({ ...company, email: value })} type="email" />
        <Field label="الموقع الإلكتروني" value={company.website} onChange={(value) => onChange({ ...company, website: value })} />
        <div className="sm:col-span-2">
          <Label className="mb-2 block text-sm font-bold text-slate-700">العنوان</Label>
          <textarea
            value={company.address}
            onChange={(event) => onChange({ ...company, address: event.target.value })}
            className="min-h-20 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
            rows={3}
          />
        </div>
      </div>
    </section>
  )
}

function LookupTabs({ activeKey, onTabChange, values, onValueChange, records, busy, onAdd, extraFor = {}, inlineFor = {} }: { activeKey: string; onTabChange: (key: string) => void; values: Record<string, string>; onValueChange: (key: string, value: string) => void; records: Record<string, any[]>; busy: boolean; onAdd: (definition: typeof lookupDefinitions[number]) => void; extraFor?: Record<string, React.ReactNode>; inlineFor?: Record<string, React.ReactNode> }) {
  const active = lookupDefinitions.find((item) => item.key === activeKey) || lookupDefinitions[0]
  const rows = records[active.key] || []
  const baseName = (row: any) => String(row?.[active.field] ?? row?.name ?? row?.warehouse_name ?? row?.unit_name ?? row?.branch_name ?? row?.department_name ?? row?.label ?? "")
  // الأقسام تُعرض مع فرعها
  const getName = (row: any) => (active.key === "department" && row?.branch_name ? `${baseName(row)} — ${row.branch_name}` : baseName(row))

  return <section className="flex min-h-[500px] w-full flex-1 flex-col overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm md:min-h-0"><div className="flex shrink-0 gap-2 overflow-x-auto border-b border-emerald-100 bg-emerald-50/70 p-3">{lookupDefinitions.map((definition) => <button key={definition.key} type="button" onClick={() => onTabChange(definition.key)} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition ${active.key === definition.key ? "bg-emerald-600 text-white shadow-md" : "bg-white text-slate-600 hover:bg-emerald-100"}`}>{definition.label}<span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] ${active.key === definition.key ? "bg-white/20" : "bg-slate-100"}`}>{(records[definition.key] || []).length}</span></button>)}</div><div className="flex min-h-0 flex-1 flex-col p-3 sm:p-5"><div className="mb-3 shrink-0 rounded-2xl border border-emerald-100 bg-slate-50/70 p-3 sm:mb-5 sm:p-4">{extraFor[active.key] && <div className="mb-3">{extraFor[active.key]}</div>}<Label className="mb-2 block font-bold text-slate-800">إضافة {active.label}</Label><div className="flex flex-wrap gap-2 sm:flex-nowrap">{inlineFor[active.key]}<Input value={values[active.key] || ""} onChange={(event) => onValueChange(active.key, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void onAdd(active) }} className="h-11 rounded-xl bg-white" placeholder={`اسم ${active.label}`} /><Button disabled={busy || !String(values[active.key] || "").trim()} onClick={() => void onAdd(active)} className="h-11 rounded-xl bg-emerald-600 px-4 font-bold hover:bg-emerald-700 sm:px-6">إضافة</Button></div></div><div className="flex min-h-[230px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 md:min-h-0"><div className="flex shrink-0 items-center justify-between bg-slate-900 px-4 py-3 text-white"><h4 className="font-bold">السجلات المحفوظة</h4><span className="rounded-full bg-white/15 px-3 py-1 text-xs">{rows.length} سجل</span></div>{rows.length === 0 ? <div className="flex flex-1 items-center justify-center px-3 text-center text-sm text-slate-400">لا توجد سجلات محفوظة في هذا التبويب</div> : <div className="min-h-0 flex-1 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-100 text-slate-600"><tr><th className="w-20 px-4 py-3 text-right">#</th><th className="px-4 py-3 text-right">الاسم</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row?.id ?? `${active.key}-${index}`} className="border-t border-slate-100 even:bg-slate-50/70"><td className="px-4 py-3 text-slate-400">{index + 1}</td><td className="px-4 py-3 font-semibold text-slate-800">{getName(row) || "-"}</td></tr>)}</tbody></table></div>}</div></div></section>
}

function Field({ label, value, onChange, onBlur, placeholder, type = "text", maxLength, min, max, step, disabled }: { label: string; value: string; onChange: (value: string) => void; onBlur?: () => void; placeholder?: string; type?: string; maxLength?: number; min?: number; max?: number; step?: string; disabled?: boolean }) {
  return <div><Label className="mb-2 block text-sm font-bold text-slate-700">{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} maxLength={maxLength} min={min} max={max} step={step} disabled={disabled} className="h-11 rounded-xl border-slate-200 bg-slate-50/70 focus-visible:bg-white disabled:bg-emerald-50 disabled:text-emerald-800 disabled:opacity-100" /></div>
}

function NativeSelect({ label, value, onChange, options, emptyLabel = "اختر" }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; emptyLabel?: string }) {
  return <div><Label className="mb-2 block text-sm font-bold text-slate-700">{label}</Label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"><option value="">{emptyLabel}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
}

function AddButton({ busy, onClick, label }: { busy: boolean; onClick: () => void; label: string }) {
  return <div className="flex items-end"><Button disabled={busy} onClick={onClick} className="h-11 w-full rounded-xl bg-emerald-600 px-6 font-bold hover:bg-emerald-700">{label}</Button></div>
}

const currencyAccountFields = [
  ["cash_account_id", "حساب الصندوق"],
  ["incoming_checks_account_id", "حساب الشيكات الواردة"],
  ["returned_checks_account_id", "حساب الشيكات المرتجعة"],
  ["card_account_id", "حساب البطاقات"],
] as const

function CurrencyDefaultAccountsStep({ rows, busy, onChange, onSave }: {
  rows: CurrencyDefaultAccountRow[]
  busy: boolean
  onChange: (currencyId: number, field: typeof currencyAccountFields[number][0], value: string) => void
  onSave: () => void
}) {
  return <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-cyan-100 bg-white shadow-sm">
    <div className="flex shrink-0 items-center justify-between bg-gradient-to-l from-cyan-700 to-sky-700 px-5 py-4 text-white">
      <div><h4 className="text-lg font-black">حسابات الصناديق والبنوك الافتراضية</h4><p className="mt-1 text-xs text-cyan-100">حدد الحسابات الافتراضية للمستخدم الحالي لكل عملة</p></div>
      <Button type="button" disabled={busy || rows.length === 0} onClick={onSave} className="rounded-xl bg-white text-sky-800 hover:bg-cyan-50">حفظ</Button>
    </div>
    {rows.length === 0 ? <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">يجب تعريف عملة واحدة على الأقل أولاً</div> :
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {rows.map((row) => <div key={row.currency_id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="mb-4 flex items-center gap-2"><span className="rounded-lg bg-sky-700 px-3 py-1 text-sm font-black text-white">{row.currency_code}</span><h5 className="font-bold text-slate-800">{row.currency_name}</h5></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {currencyAccountFields.map(([field, label]) => <div key={field}><Label className="mb-2 block text-sm font-bold text-slate-700">{label}</Label><AutoCompleteAccount label="" value={row[field]} valueMode="id" onValueChange={(value) => onChange(row.currency_id, field, String(value || ""))} onAccountSelect={(account) => onChange(row.currency_id, field, account ? String(account.id) : "")} placeholder="ابحث عن الحساب" className="w-full" showCostCenterButton={false} requiredTypeValues={[1]} leafOnly /></div>)}
          </div>
        </div>)}
      </div>}
  </section>
}

function AccountSettingsStep({ title, fields, values, onChange, busy, onSave }: { title: string; fields: readonly (readonly [string, string])[]; values: Record<string, string>; onChange: (key: string, value: string) => void; busy: boolean; onSave: () => void }) {
  return <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm"><div className="flex shrink-0 items-center justify-between bg-gradient-to-l from-blue-700 to-indigo-600 px-5 py-4 text-white"><div><h4 className="text-lg font-black">{title}</h4><p className="mt-1 text-xs text-blue-100">ابحث برقم الحساب أو اسمه ثم اختره لكل حقل</p></div></div><div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 md:grid-cols-2">{fields.map(([key, label]) => <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3"><Label className="mb-2 block text-sm font-bold text-slate-700">{label}</Label><AutoCompleteAccount label="" value={values[key] || ""} valueMode="id" onValueChange={(value) => onChange(key, String(value || ""))} onAccountSelect={(account) => onChange(key, account ? String(account.id) : "")} placeholder="ابحث عن الحساب" className="w-full" showCostCenterButton={false} requiredTypeValues={[1]} leafOnly={!/parent_account|credit_account|subscription_account|new_employee_account/.test(String(key))} /></div>)}</div></section>
}

function SavedProductsTable({ products }: { products: any[] }) {
  return <div className="mt-5 overflow-hidden rounded-2xl border border-emerald-100"><div className="flex items-center justify-between bg-gradient-to-l from-emerald-700 to-teal-600 px-4 py-3 text-white"><h4 className="font-bold">الأصناف المحفوظة</h4><span className="rounded-full bg-white/15 px-3 py-1 text-xs">{products.length} صنف</span></div>{products.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">لا توجد أصناف محفوظة</div> : <div className="max-h-52 overflow-auto"><table className="w-full min-w-[700px] text-sm"><thead className="sticky top-0 bg-slate-100 text-slate-600"><tr><th className="w-16 px-3 py-2 text-right">#</th><th className="px-3 py-2 text-right">رقم الصنف</th><th className="px-3 py-2 text-right">اسم الصنف</th><th className="px-3 py-2 text-right">الوحدة</th><th className="px-3 py-2 text-right">الباركود</th><th className="px-3 py-2 text-right">سعر البيع</th></tr></thead><tbody>{products.map((item, index) => <tr key={item.id ?? index} className="border-t border-slate-100 even:bg-slate-50/70"><td className="px-3 py-2 text-slate-400">{index + 1}</td><td className="px-3 py-2 font-mono font-bold text-slate-800">{item.product_code}</td><td className="px-3 py-2 text-slate-700">{item.product_name}</td><td className="px-3 py-2 text-slate-600">{item.first_unit || item.main_unit || "-"}</td><td className="px-3 py-2 font-mono text-slate-600">{item.first_barcode || item.barcode || "-"}</td><td className="px-3 py-2 font-bold text-emerald-700">{Number(item.first_price ?? item.selling_price ?? 0).toLocaleString()}</td></tr>)}</tbody></table></div>}</div>
}

function SavedAccountsTable({ accounts, currencies }: { accounts: any[]; currencies: any[] }) {
  const financialLabel = (value: unknown) => Number(value) === 1 ? "الميزانية العمومية" : Number(value) === 2 ? "قائمة الدخل" : Number(value) === 3 ? "تقييم بضاعة" : "-"
  const currencyLabel = (account: any) => {
    if (account.currency_code || account.currency_name) return [account.currency_code, account.currency_name].filter(Boolean).join(" - ")
    const currency = currencies.find((item) => Number(item.currency_id ?? item.id) === Number(account.currency_id))
    return currency ? [currency.currency_code ?? currency.code, currency.currency_name ?? currency.name].filter(Boolean).join(" - ") : "-"
  }
  return <div className="mt-5 overflow-hidden rounded-2xl border border-blue-100"><div className="flex items-center justify-between bg-gradient-to-l from-blue-700 to-indigo-600 px-4 py-3 text-white"><h4 className="font-bold">الحسابات المحفوظة</h4><span className="rounded-full bg-white/15 px-3 py-1 text-xs">{accounts.length} حساب</span></div>{accounts.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">لا توجد حسابات محفوظة من النوع 1</div> : <div className="max-h-52 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-100 text-slate-600"><tr><th className="w-16 px-3 py-2 text-right">#</th><th className="px-3 py-2 text-right">رقم الحساب</th><th className="px-3 py-2 text-right">اسم الحساب</th><th className="px-3 py-2 text-right">القائمة المالية</th><th className="px-3 py-2 text-right">العملة</th></tr></thead><tbody>{accounts.map((item, index) => <tr key={item.id ?? index} className="border-t border-slate-100 even:bg-slate-50/70"><td className="px-3 py-2 text-slate-400">{index + 1}</td><td className="px-3 py-2 font-mono font-bold text-slate-800">{item.code ?? item.account_code}</td><td className="px-3 py-2 text-slate-700">{item.name ?? item.account_name}</td><td className="px-3 py-2 text-slate-600">{item.finanical_list_name || financialLabel(item.finanical_list_id)}</td><td className="px-3 py-2 text-slate-600">{currencyLabel(item)}</td></tr>)}</tbody></table></div>}</div>
}

function DataStep({ title, fields, busy, onAdd, onImport, savedContent }: { title: string; fields: React.ReactNode; busy: boolean; onAdd: () => void; onImport: () => void; savedContent?: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><h4 className="text-lg font-black text-slate-900">{title}</h4><Button variant="outline" disabled={busy} onClick={onImport} className="gap-2 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"><FileSpreadsheet className="h-4 w-4" /><Upload className="h-4 w-4" />استيراد من Excel</Button></div><div className="grid gap-4 sm:grid-cols-2">{fields}<AddButton busy={busy} onClick={onAdd} label="إضافة" /></div>{savedContent}<p className="mt-4 text-xs text-slate-400">يمكنك إضافة أكثر من سجل، أو اختيار ملف Excel يحتوي على عناوين الأعمدة العربية أو الإنجليزية.</p></section>
}
