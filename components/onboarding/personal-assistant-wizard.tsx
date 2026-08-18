"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Boxes, Building2, Check, Coins, FileSpreadsheet, Package, Sparkles, Trash2, Upload, Users, X } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"

const steps = [
  { title: "العملات", description: "أضف العملات وأسعار الصرف الأساسية", icon: Coins, color: "from-emerald-300 to-green-400" },
  { title: "التعريفات", description: "التعريفات الأساسية وبنود القوائم المالية", icon: Boxes, color: "from-violet-600 to-fuchsia-600" },
  { title: "الحسابات", description: "أنشئ دليل الحسابات أو استورده من Excel", icon: Building2, color: "from-blue-600 to-indigo-600" },
  { title: "الحسابات الافتراضية", description: "حدد الحسابات الافتراضية للنظام", icon: Building2, color: "from-sky-600 to-blue-600" },
  { title: "حسابات الأصناف", description: "حدد الحسابات الافتراضية لحركات الأصناف", icon: Package, color: "from-teal-600 to-emerald-600" },
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

type Notice = { type: "success" | "error"; text: string } | null
type AccountPreviewRow = { rowNumber: number; payload: Record<string, any>; errors: string[] }

const cell = (row: Record<string, any>, names: string[]) => {
  for (const name of names) if (row[name] !== undefined && row[name] !== null) return row[name]
  return ""
}

const normalizeLookup = (value: unknown) => String(value ?? "").trim().toLowerCase()
const isNoDisplayChoice = (value: unknown) => ["", "عدم الإظهار", "عدم الاظهار", "none", "null", "0"].includes(normalizeLookup(value))

const resolveLookupId = (value: unknown, rows: any[], idFields: string[], codeFields: string[], nameFields: string[]) => {
  const wanted = normalizeLookup(value)
  if (!wanted) return null
  const match = rows.find((row) => [...idFields, ...codeFields, ...nameFields].some((field) => normalizeLookup(row?.[field]) === wanted))
  if (!match) return null
  const id = idFields.map((field) => Number(match?.[field])).find((candidate) => Number.isFinite(candidate) && candidate > 0)
  return id ?? null
}

const resolveFinancialListId = (value: unknown) => {
  const normalized = normalizeLookup(value).replace(/\s+/g, " ")
  if (["1", "الميزانية العمومية", "الميزانية", "balance sheet"].includes(normalized)) return 1
  if (["2", "قائمة الدخل", "income statement"].includes(normalized)) return 2
  if (["3", "تقييم بضاعة", "تقييم البضاعة", "inventory valuation", "merchandise valuation"].includes(normalized)) return 3
  return null
}

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
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [currency, setCurrency] = useState({ code: "", name: "", rate: "" })
  const [isFirstCurrency, setIsFirstCurrency] = useState(false)
  const [savedCurrencies, setSavedCurrencies] = useState<any[]>([])
  const [account, setAccount] = useState({ code: "", name: "", financialListId: "", assetsId: "", liabilitiesId: "", incomeId: "", currencyId: "" })
  const [savedAccounts, setSavedAccounts] = useState<any[]>([])
  const [accountPreview, setAccountPreview] = useState<AccountPreviewRow[]>([])
  const [systemAccountSettings, setSystemAccountSettings] = useState<Record<string, string>>({})
  const [defaultAccountStructure, setDefaultAccountStructure] = useState("commercial")
  const [financialItems, setFinancialItems] = useState<{ assets: any[]; liabilities: any[]; income: any[] }>({ assets: [], liabilities: [], income: [] })
  const [lookupValues, setLookupValues] = useState<Record<string, string>>({})
  const [activeLookupKey, setActiveLookupKey] = useState<string>(lookupDefinitions[0].key)
  const [savedLookups, setSavedLookups] = useState<Record<string, any[]>>({})
  const [product, setProduct] = useState({ code: "", name: "", unitId: "", sellingPrice: "", barcode: "" })
  const [productDefinitions, setProductDefinitions] = useState<{ units: any[]; priceCategories: any[] }>({ units: [], priceCategories: [] })
  const [savedProducts, setSavedProducts] = useState<any[]>([])
  const [customer, setCustomer] = useState({ code: "", name: "", phone: "" })

  useEffect(() => {
    fetch("/api/onboarding-assistant")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data?.shouldShow) return
        setStep(Math.max(0, Math.min(6, Number(data.current_step) || 0)))
        setOpen(true)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!open || step !== 0) return
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

  useEffect(() => {
    if (!open || step !== 2) return
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
    if (!open || (step !== 3 && step !== 4)) return
    fetch("/api/settings/system")
      .then((response) => response.ok ? response.json() : {})
      .then((data: any) => setSystemAccountSettings(Object.fromEntries([...defaultAccountFields, ...productAccountFields].map(([key]) => [key, data?.[key] ? String(data[key]) : ""]))))
      .catch(() => undefined)
  }, [open, step])

  useEffect(() => {
    if (!open || step !== 5) return
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

  const importDefaultAccounts = async () => {
    setBusy(true)
    try {
      const response = await fetch(`/api/accounts-export-source?type=${encodeURIComponent(defaultAccountStructure)}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || "تعذر تحميل هيكل الحسابات الافتراضي")
      const rows = Array.isArray(data?.rows) ? data.rows : []
      if (!rows.length) throw new Error("لا توجد حسابات في الهيكل الافتراضي المحدد")
      const file = new File([JSON.stringify(rows)], "accounts.json", { type: "application/json" })
      await importExcel(file)
    } catch (error) {
      showResult("error", error instanceof Error ? error.message : "تعذر استيراد هيكل الحسابات الافتراضي")
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open || (step !== 2 && step !== 5 && step !== 6)) return
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
    if (!response.ok) return
    const data = await response.json()
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
  }, [open, step, activeLookupKey])

  useEffect(() => {
    const openFromMenu = async () => {
      try {
        const response = await fetch("/api/onboarding-assistant")
        const data = response.ok ? await response.json() : null
        if (data?.dismissed) {
          window.alert("تم اختيار عدم إظهار المساعد الشخصي مجدداً، لذلك لا يمكن الرجوع إليه.")
          return
        }
        setStep(Math.max(0, Math.min(6, Number(data?.current_step) || 0)))
        setOpen(true)
      } catch {
        window.alert("تعذر فتح المساعد الشخصي")
      }
    }
    window.addEventListener("erp:open-personal-assistant", openFromMenu)
    return () => window.removeEventListener("erp:open-personal-assistant", openFromMenu)
  }, [])

  const saveProgress = async (nextStep: number, dismissed = false, completed = false) => {
    await fetch("/api/onboarding-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_step: nextStep, dismissed, completed }),
    })
  }

  const showResult = (type: "success" | "error", text: string) => {
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
      if (step === 0) {
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
      } else if (step === 2) {
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
      } else if (step === 5) {
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
      } else if (step === 6) {
        if (!customer.name.trim()) throw new Error("أدخل اسم العميل")
        await post("/api/import/customers", { data: [{ rowIndex: 1, isValid: true, customer_code: customer.code, customer_name: customer.name, mobile1: customer.phone, type: 1 }] })
        setCustomer({ code: "", name: "", phone: "" })
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
    setBusy(true)
    try {
      await post(definition.endpoint, { [definition.field]: value, status: 1, is_active: true })
      setLookupValues((current) => ({ ...current, [definition.key]: "" }))
      await loadLookupRecords(definition)
      showResult("success", `تمت إضافة ${definition.label}`)
    } catch (error) {
      showResult("error", error instanceof Error ? error.message : "تعذر الحفظ")
    } finally {
      setBusy(false)
    }
  }

  const importExcel = async (file: File) => {
    setBusy(true)
    try {
      let rows: Record<string, any>[] = []
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(await file.text())
        const jsonRows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.accounts) ? parsed.accounts : Array.isArray(parsed?.data) ? parsed.data : null
        if (!jsonRows) throw new Error("ملف JSON يجب أن يحتوي على مصفوفة حسابات أو خاصية accounts أو data")
        rows = jsonRows.filter((row: unknown) => row && typeof row === "object") as Record<string, any>[]
      } else {
        const XLSX = await import("xlsx")
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })
        rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" })
      }
      if (!rows.length) throw new Error("ملف الاستيراد فارغ")
      if (step === 2) {
        const [currenciesData, assetsData, liabilitiesData, incomeData, accountsData] = await Promise.all([
          fetch("/api/exchange-rates").then((response) => response.ok ? response.json() : []),
          fetch("/api/balance-sheet-assets-items").then((response) => response.ok ? response.json() : []),
          fetch("/api/balance-sheet-liabilities-items").then((response) => response.ok ? response.json() : []),
          fetch("/api/income-statement-items").then((response) => response.ok ? response.json() : []),
          fetch("/api/accounts?type=1").then((response) => response.ok ? response.json() : []),
        ])
        const currencies = Array.isArray(currenciesData?.rates) ? currenciesData.rates : Array.isArray(currenciesData) ? currenciesData : []
        const assets = Array.isArray(assetsData) ? assetsData : []
        const liabilities = Array.isArray(liabilitiesData) ? liabilitiesData : []
        const incomeItems = Array.isArray(incomeData) ? incomeData : []
        const existingAccounts = Array.isArray(accountsData) ? accountsData : []
        const preparedRows = rows.map((row, index) => {
          const rowNumber = index + 2
          const rawCode = String(cell(row, ["رقم الحساب", "account_code", "code"]) ?? "")
          const cleanedCode = rawCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10)
          const code = cleanedCode.padEnd(10, "0")
          const rawFatherCode = String(cell(row, ["الحساب الأب", "الحساب الاب", "father", "father_code", "parent_code"]) ?? "")
          const cleanedFatherCode = rawFatherCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10)
          const fatherCode = cleanedFatherCode ? cleanedFatherCode.padEnd(10, "0") : null
          const name = String(cell(row, ["اسم الحساب", "account_name", "name"]) ?? "").trim()
          const financialListId = resolveFinancialListId(cell(row, ["القائمة المالية", "financial_list", "finanical_list_id", "financial_list_id"]))
          const rawAssets = cell(row, ["أصول الميزانية", "بند أصول الميزانية", "finanical_list_assests_id", "financial_list_assets_id", "financial_list_assests", "finanical_list_assests"])
          const rawLiabilities = cell(row, ["خصوم الميزانية", "بند خصوم الميزانية", "finanical_list_liabilities_id", "financial_list_liabilities_id", "financial_list_liabilities", "finanical_list_liabilities"])
          const rawIncome = cell(row, ["بند قائمة الدخل", "قائمة الدخل", "finanical_list_income_id", "financial_list_income_id", "financial_list_income", "finanical_list_income"])
          const assetsId = resolveLookupId(rawAssets, assets, ["id"], ["code", "item_code"], ["name", "asset_name"])
          const liabilitiesId = resolveLookupId(rawLiabilities, liabilities, ["id"], ["code", "item_code"], ["name", "liability_name"])
          const incomeId = resolveLookupId(rawIncome, incomeItems, ["id"], ["code", "item_code"], ["name", "income_name"])
          const currencyId = resolveLookupId(cell(row, ["العملة", "رمز العملة", "currency", "currency_id", "currency_code", "currency_name"]), currencies, ["currency_id", "id"], ["currency_code", "code"], ["currency_name", "name"])

          const errors: string[] = []
          if (!cleanedCode) errors.push("رقم الحساب مطلوب ويجب أن يحتوي أحرفاً أو أرقاماً إنجليزية")
          if (!name) errors.push("اسم الحساب مطلوب")
          if (name.length > 100) errors.push("اسم الحساب يجب ألا يتجاوز 100 حرف")
          if (!financialListId) errors.push("القائمة المالية غير صحيحة")
          if (!currencyId) errors.push("تعذر مطابقة العملة بالرقم أو الرمز أو الاسم")
          if ((financialListId === 1 || financialListId === 3) && !isNoDisplayChoice(rawAssets) && !assetsId) errors.push("تعذر مطابقة بند أصول الميزانية")
          if (financialListId === 1 && !isNoDisplayChoice(rawLiabilities) && !liabilitiesId) errors.push("تعذر مطابقة بند خصوم الميزانية")
          if ((financialListId === 2 || financialListId === 3) && !isNoDisplayChoice(rawIncome) && !incomeId) errors.push("تعذر مطابقة بند قائمة الدخل")
          if (financialListId === 1 && !assetsId && !liabilitiesId) errors.push("يجب تحديد بند أصول أو بند خصوم الميزانية")
          if ((financialListId === 2 || financialListId === 3) && !incomeId) errors.push("يجب تحديد بند قائمة الدخل")

          return { rowNumber, errors, payload: { account_code: code, account_name: name, father_code: fatherCode, company_id: 1, finanical_list_id: financialListId, finanical_list_assests_id: financialListId === 1 || financialListId === 3 ? assetsId : null, finanical_list_liabilities_id: financialListId === 1 ? liabilitiesId : null, finanical_list_income_id: financialListId === 2 || financialListId === 3 ? incomeId : null, currency_id: currencyId, status: "نشط" } }
        })
        const codes = preparedRows.map((row) => row.payload.account_code)
        const names = preparedRows.map((row) => normalizeLookup(row.payload.account_name))
        const duplicateCodes = new Set(codes.filter((code, index) => code && codes.indexOf(code) !== index))
        const duplicateNames = new Set(names.filter((name, index) => name && names.indexOf(name) !== index))
        const existingCodes = new Set(existingAccounts.map((row: any) => String(row.code ?? row.account_code ?? "").toUpperCase()))
        const existingNames = new Set(existingAccounts.map((row: any) => normalizeLookup(row.name ?? row.account_name)))
        preparedRows.forEach((row, index) => {
          if (duplicateCodes.has(row.payload.account_code)) row.errors.push("رقم الحساب مكرر داخل الملف")
          if (duplicateNames.has(names[index])) row.errors.push("اسم الحساب مكرر داخل الملف")
          if (existingCodes.has(row.payload.account_code)) row.errors.push("رقم الحساب موجود مسبقاً")
          if (existingNames.has(names[index])) row.errors.push("اسم الحساب موجود مسبقاً")
        })
        setAccountPreview(preparedRows)
        showResult(preparedRows.some((row) => row.errors.length) ? "error" : "success", `تم تجهيز ${preparedRows.length} حساباً للمراجعة قبل الحفظ`)
      } else if (step === 5) {
        await post("/api/import/products", { data: rows.map((row) => { const rawCode = String(cell(row, ["رمز الصنف", "رقم الصنف", "product_code"]) || ""); return { product_code: rawCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10).padEnd(10, "0"), product_name: String(cell(row, ["اسم الصنف", "product_name", "name"]) || "").trim().slice(0, 100), main_unit: cell(row, ["الوحدة", "main_unit", "unit"]) || "قطعة", selling_price: Number(cell(row, ["سعر البيع", "selling_price", "sale_price", "price"])) || 0, barcode: String(cell(row, ["الباركود", "barcode", "unit_1_barcode"]) || "").trim() } }) })
      } else if (step === 6) {
        await post("/api/import/customers", { data: rows.map((row, index) => ({ rowIndex: index + 2, isValid: Boolean(cell(row, ["اسم العميل", "customer_name", "name"])), customer_code: cell(row, ["رقم العميل", "customer_code", "code"]), customer_name: cell(row, ["اسم العميل", "customer_name", "name"]), mobile1: cell(row, ["الجوال", "mobile", "mobile1", "phone"]), type: 1 })) })
      }
      if (step !== 2) showResult("success", `تم استيراد ${rows.length} سطراً`)
    } catch (error) {
      showResult("error", error instanceof Error ? error.message : "تعذر استيراد الملف")
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const saveAccountPreview = async () => {
    if (!accountPreview.length || accountPreview.some((row) => row.errors.length)) return
    setBusy(true)
    try {
      for (const row of accountPreview) await post("/api/accounts", row.payload)
      const count = accountPreview.length
      setAccountPreview([])
      await refreshSavedAccounts()
      showResult("success", `تم حفظ ${count} حساباً بنجاح`)
    } catch (error) {
      showResult("error", error instanceof Error ? error.message : "تعذر حفظ الحسابات")
    } finally {
      setBusy(false)
    }
  }

  const move = async (next: number) => {
    const bounded = Math.max(0, Math.min(6, next))
    if (bounded > step && step === 3 && !(await saveAccountSettings(defaultAccountFields))) return
    if (bounded > step && step === 4 && !(await saveAccountSettings(productAccountFields))) return
    setStep(bounded)
    await saveProgress(bounded)
  }

  const postpone = async () => {
    await saveProgress(step)
    setOpen(false)
  }

  const finish = async () => {
    await saveProgress(6, false, true)
    setOpen(false)
  }

  const StepIcon = steps[step].icon
  return <>
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent hideCloseButton className="flex h-[94vh] w-[98vw] max-w-[1500px] flex-col overflow-hidden rounded-[30px] border-0 bg-slate-50 p-0 shadow-2xl" dir="rtl">
        <header className={`relative shrink-0 overflow-hidden bg-gradient-to-l ${steps[step].color} px-6 py-5 text-white`}>
          <div className="absolute inset-0 opacity-15 [background-image:radial-gradient(circle_at_20%_20%,white_0,transparent_35%),radial-gradient(circle_at_80%_80%,white_0,transparent_30%)]" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30"><Sparkles className="h-7 w-7" /></div><div><h2 className="text-2xl font-black">المساعد الشخصي</h2><p className="mt-1 text-sm text-white/85">إعداد شركتك بخطوات بسيطة وواضحة</p></div></div>
            <button onClick={postpone} className="rounded-full bg-white/15 p-3 transition hover:bg-white/25" title="تأجيل"><X className="h-5 w-5" /></button>
          </div>
        </header>

        <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center justify-between gap-2 overflow-x-auto">
            {steps.map((item, index) => { const Icon = item.icon; const active = index === step; const done = index < step; return <button key={item.title} onClick={() => void move(index)} className={`flex min-w-[150px] items-center gap-2 rounded-2xl px-3 py-2 text-right transition ${active ? "bg-slate-900 text-white shadow-lg" : done ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-500"}`}><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${done ? "bg-emerald-500 text-white" : "bg-white/15"}`}>{done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span><span><span className="block text-xs opacity-70">الخطوة {index + 1}</span><span className="font-bold">{item.title}</span></span></button> })}
          </div>
        </div>

        <main className={`min-h-0 flex-1 p-5 sm:p-7 ${step >= 1 ? "flex overflow-hidden" : "overflow-y-auto"}`}>
          <div className={step >= 1 ? "flex min-h-0 w-full flex-1 flex-col" : "mx-auto max-w-4xl"}>
            <div className="mb-6 flex items-center gap-4"><div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${steps[step].color} text-white shadow-lg`}><StepIcon className="h-7 w-7" /></div><div><h3 className="text-2xl font-black text-slate-900">{steps[step].title}</h3><p className="text-slate-500">{steps[step].description}</p></div></div>
            {notice && <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-bold ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{notice.text}</div>}

            {step === 0 && <div className="space-y-5"><section className="grid gap-4 rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:grid-cols-3"><Field label="رمز العملة" value={currency.code} onChange={(value) => setCurrency({ ...currency, code: value.toUpperCase() })} placeholder="USD" maxLength={3} /><Field label="اسم العملة" value={currency.name} onChange={(value) => setCurrency({ ...currency, name: value })} placeholder="دولار أمريكي" maxLength={30} /><Field label={isFirstCurrency ? "سعر الصرف (العملة الأساسية)" : "سعر الصرف"} value={currency.rate} onChange={(value) => setCurrency({ ...currency, rate: value })} placeholder="3.40" type="number" min={0.001} max={100000} step="0.001" disabled={isFirstCurrency} /><AddButton busy={busy} onClick={addCurrent} label="إضافة العملة" /></section><section className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/70 px-5 py-3"><h4 className="font-black text-emerald-950">العملات المحفوظة</h4><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{savedCurrencies.length} عملة</span></div>{savedCurrencies.length === 0 ? <div className="px-5 py-8 text-center text-sm text-slate-400">لم تتم إضافة عملات بعد</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-900 text-white"><tr><th className="px-4 py-3 text-right">#</th><th className="px-4 py-3 text-right">رمز العملة</th><th className="px-4 py-3 text-right">اسم العملة</th><th className="px-4 py-3 text-right">سعر الصرف</th></tr></thead><tbody>{savedCurrencies.map((item, index) => <tr key={item.currency_id ?? item.id ?? index} className="border-b border-slate-100 last:border-0 even:bg-slate-50/70"><td className="px-4 py-3 text-slate-400">{index + 1}</td><td className="px-4 py-3 font-black text-slate-800">{item.currency_code}</td><td className="px-4 py-3 text-slate-700">{item.currency_name}</td><td className="px-4 py-3 font-semibold text-emerald-700">{Number(item.exchange_rate || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td></tr>)}</tbody></table></div>}</section></div>}
            {step === 1 && <LookupTabs activeKey={activeLookupKey} onTabChange={setActiveLookupKey} values={lookupValues} onValueChange={(key, value) => setLookupValues((current) => ({ ...current, [key]: value }))} records={savedLookups} busy={busy} onAdd={addLookup} />}
            {step === 2 && <DataStep title="إضافة حساب سريع" busy={busy} onAdd={addCurrent} onImport={() => fileRef.current?.click()} fields={<><Field label="رقم الحساب" value={account.code} onChange={(value) => setAccount({ ...account, code: value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) })} onBlur={() => setAccount((current) => ({ ...current, code: current.code ? current.code.padEnd(10, "0") : "" }))} maxLength={10} /><Field label="اسم الحساب" value={account.name} onChange={(value) => setAccount({ ...account, name: value })} maxLength={100} /><NativeSelect label="القائمة المالية" value={account.financialListId} onChange={(value) => setAccount({ ...account, financialListId: value, assetsId: "", liabilitiesId: "", incomeId: "" })} options={[{ value: "1", label: "الميزانية العمومية" }, { value: "2", label: "قائمة الدخل" }, { value: "3", label: "تقييم بضاعة" }]} />{account.financialListId === "1" && <><NativeSelect label="أصول الميزانية" value={account.assetsId} onChange={(value) => setAccount({ ...account, assetsId: value })} emptyLabel="عدم الإظهار" options={financialItems.assets.map((item) => ({ value: String(item.id), label: item.name }))} /><NativeSelect label="خصوم الميزانية" value={account.liabilitiesId} onChange={(value) => setAccount({ ...account, liabilitiesId: value })} emptyLabel="عدم الإظهار" options={financialItems.liabilities.map((item) => ({ value: String(item.id), label: item.name }))} /></>}{account.financialListId === "2" && <NativeSelect label="بند قائمة الدخل" value={account.incomeId} onChange={(value) => setAccount({ ...account, incomeId: value })} options={financialItems.income.map((item) => ({ value: String(item.id), label: item.name }))} />}{account.financialListId === "3" && <><NativeSelect label="أصول الميزانية" value={account.assetsId} onChange={(value) => setAccount({ ...account, assetsId: value })} emptyLabel="عدم الإظهار" options={financialItems.assets.map((item) => ({ value: String(item.id), label: item.name }))} /><NativeSelect label="بند قائمة الدخل" value={account.incomeId} onChange={(value) => setAccount({ ...account, incomeId: value })} options={financialItems.income.map((item) => ({ value: String(item.id), label: item.name }))} /></>}<NativeSelect label="العملة" value={account.currencyId} onChange={(value) => setAccount({ ...account, currencyId: value })} options={savedCurrencies.map((item) => ({ value: String(item.currency_id ?? item.id), label: `${item.currency_code} - ${item.currency_name}` }))} /><NativeSelect label="نوع هيكل الحسابات الافتراضي" value={defaultAccountStructure} onChange={setDefaultAccountStructure} options={[{ value: "commercial", label: "مؤسسة تجارية" }, { value: "commercial_continuous_inventory", label: "مؤسسة تجارية - جرد مستمر" }, { value: "services", label: "خدمات" }]} /><div className="flex items-end"><Button type="button" disabled={busy} onClick={() => void importDefaultAccounts()} className="h-11 w-full rounded-xl bg-emerald-600 px-6 hover:bg-emerald-700"><Building2 className="ml-2 h-4 w-4" />استيراد هيكل الحسابات الافتراضي</Button></div></>} savedContent={<><AccountImportPreview rows={accountPreview} busy={busy} onDelete={(index) => setAccountPreview((current) => current.filter((_, rowIndex) => rowIndex !== index))} onSave={() => void saveAccountPreview()} /><SavedAccountsTable accounts={savedAccounts} currencies={savedCurrencies} /></>} />}
            {step === 3 && <AccountSettingsStep title="الحسابات الافتراضية" fields={defaultAccountFields} values={systemAccountSettings} onChange={(key, value) => setSystemAccountSettings((current) => ({ ...current, [key]: value }))} busy={busy} onSave={() => void saveAccountSettings(defaultAccountFields)} />}
            {step === 4 && <AccountSettingsStep title="حسابات الأصناف" fields={productAccountFields} values={systemAccountSettings} onChange={(key, value) => setSystemAccountSettings((current) => ({ ...current, [key]: value }))} busy={busy} onSave={() => void saveAccountSettings(productAccountFields)} />}
            {step === 5 && <DataStep title="إضافة صنف سريع" busy={busy} onAdd={addCurrent} onImport={() => fileRef.current?.click()} fields={<><Field label="رقم الصنف" value={product.code} onChange={(value) => setProduct({ ...product, code: value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) })} onBlur={() => setProduct((current) => ({ ...current, code: current.code ? current.code.padEnd(10, "0") : "" }))} maxLength={10} /><Field label="اسم الصنف" value={product.name} onChange={(value) => setProduct({ ...product, name: value })} maxLength={100} /><NativeSelect label="الوحدة" value={product.unitId} onChange={(value) => setProduct({ ...product, unitId: value })} emptyLabel="اختر الوحدة" options={productDefinitions.units.map((item) => ({ value: String(item.id), label: [item.unit_code, item.unit_name].filter(Boolean).join(" - ") }))} /><div><Label className="mb-2 block text-sm font-bold text-slate-700">فئة السعر</Label><div className={`flex h-11 items-center rounded-xl border px-3 text-sm font-bold ${productDefinitions.priceCategories.length ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{productDefinitions.priceCategories[0]?.name || "يجب تعريف فئة سعر أولاً"}</div></div><Field label="سعر البيع" value={product.sellingPrice} onChange={(value) => setProduct({ ...product, sellingPrice: value })} type="number" min={0} max={10000000} /><Field label="الباركود" value={product.barcode} onChange={(value) => setProduct({ ...product, barcode: value })} maxLength={30} /></>} savedContent={<SavedProductsTable products={savedProducts} />}/>}
            {step === 6 && <DataStep title="إضافة عميل سريع" busy={busy} onAdd={addCurrent} onImport={() => fileRef.current?.click()} fields={<><Field label="رقم العميل (اختياري)" value={customer.code} onChange={(value) => setCustomer({ ...customer, code: value })} /><Field label="اسم العميل" value={customer.name} onChange={(value) => setCustomer({ ...customer, name: value })} /><Field label="الجوال" value={customer.phone} onChange={(value) => setCustomer({ ...customer, phone: value })} /></>} />}
          </div>
        </main>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <Button variant="ghost" onClick={() => setConfirmDismiss(true)} className="text-slate-500 hover:bg-red-50 hover:text-red-700">عدم الإظهار مجدداً</Button>
          <div className="flex gap-2"><Button variant="outline" onClick={postpone} className="rounded-xl">تأجيل</Button>{step > 0 && <Button variant="outline" onClick={() => void move(step - 1)} className="rounded-xl"><ArrowRight className="ml-2 h-4 w-4" />السابق</Button>}<Button onClick={() => step === 6 ? void finish() : void move(step + 1)} className={`rounded-xl bg-gradient-to-l ${steps[step].color} px-6 text-white`}>{step === 6 ? "إنهاء" : "التالي"}{step < 6 && <ArrowLeft className="mr-2 h-4 w-4" />}</Button></div>
        </footer>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importExcel(file) }} />
      </DialogContent>
    </Dialog>
    <ConfirmDialogYesNo visible={confirmDismiss} message="هل أنت متأكد؟ لن تستطيع الرجوع إلى المساعد الشخصي في حال التأكيد" onCancel={() => setConfirmDismiss(false)} onConfirm={() => { setConfirmDismiss(false); void saveProgress(step, true, false).then(() => setOpen(false)) }} />
    <style jsx global>{`
      .rounded-2xl.border.border-slate-200 > .bg-slate-900 {
        background: linear-gradient(to left, #6d28d9, #4f46e5);
      }
      main.flex > div.flex > section.rounded-3xl.border-slate-200 {
        width: 100%;
        height: 100%;
        overflow-y: auto;
      }
    `}</style>
  </>
}

function LookupTabs({ activeKey, onTabChange, values, onValueChange, records, busy, onAdd }: { activeKey: string; onTabChange: (key: string) => void; values: Record<string, string>; onValueChange: (key: string, value: string) => void; records: Record<string, any[]>; busy: boolean; onAdd: (definition: typeof lookupDefinitions[number]) => void }) {
  const active = lookupDefinitions.find((item) => item.key === activeKey) || lookupDefinitions[0]
  const rows = records[active.key] || []
  const getName = (row: any) => String(row?.[active.field] ?? row?.name ?? row?.warehouse_name ?? row?.unit_name ?? row?.branch_name ?? row?.department_name ?? row?.label ?? "")

  return <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm"><div className="flex shrink-0 gap-2 overflow-x-auto border-b border-violet-100 bg-violet-50/70 p-3">{lookupDefinitions.map((definition) => <button key={definition.key} type="button" onClick={() => onTabChange(definition.key)} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition ${active.key === definition.key ? "bg-violet-600 text-white shadow-md" : "bg-white text-slate-600 hover:bg-violet-100"}`}>{definition.label}<span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] ${active.key === definition.key ? "bg-white/20" : "bg-slate-100"}`}>{(records[definition.key] || []).length}</span></button>)}</div><div className="flex min-h-0 flex-1 flex-col p-5"><div className="mb-5 shrink-0 rounded-2xl border border-violet-100 bg-slate-50/70 p-4"><Label className="mb-2 block font-bold text-slate-800">إضافة {active.label}</Label><div className="flex gap-2"><Input value={values[active.key] || ""} onChange={(event) => onValueChange(active.key, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void onAdd(active) }} className="h-11 rounded-xl bg-white" placeholder={`اسم ${active.label}`} /><Button disabled={busy || !String(values[active.key] || "").trim()} onClick={() => void onAdd(active)} className="h-11 rounded-xl bg-violet-600 px-6 hover:bg-violet-700">إضافة</Button></div></div><div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200"><div className="flex shrink-0 items-center justify-between bg-slate-900 px-4 py-3 text-white"><h4 className="font-bold">السجلات المحفوظة</h4><span className="rounded-full bg-white/15 px-3 py-1 text-xs">{rows.length} سجل</span></div>{rows.length === 0 ? <div className="flex flex-1 items-center justify-center text-sm text-slate-400">لا توجد سجلات محفوظة في هذا التبويب</div> : <div className="min-h-0 flex-1 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-100 text-slate-600"><tr><th className="w-20 px-4 py-3 text-right">#</th><th className="px-4 py-3 text-right">الاسم</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row?.id ?? `${active.key}-${index}`} className="border-t border-slate-100 even:bg-slate-50/70"><td className="px-4 py-3 text-slate-400">{index + 1}</td><td className="px-4 py-3 font-semibold text-slate-800">{getName(row) || "-"}</td></tr>)}</tbody></table></div>}</div></div></section>
}

function Field({ label, value, onChange, onBlur, placeholder, type = "text", maxLength, min, max, step, disabled }: { label: string; value: string; onChange: (value: string) => void; onBlur?: () => void; placeholder?: string; type?: string; maxLength?: number; min?: number; max?: number; step?: string; disabled?: boolean }) {
  return <div><Label className="mb-2 block text-sm font-bold text-slate-700">{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} maxLength={maxLength} min={min} max={max} step={step} disabled={disabled} className="h-11 rounded-xl border-slate-200 bg-slate-50/70 focus-visible:bg-white disabled:bg-emerald-50 disabled:text-emerald-800 disabled:opacity-100" /></div>
}

function NativeSelect({ label, value, onChange, options, emptyLabel = "اختر" }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; emptyLabel?: string }) {
  return <div><Label className="mb-2 block text-sm font-bold text-slate-700">{label}</Label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"><option value="">{emptyLabel}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
}

function AddButton({ busy, onClick, label }: { busy: boolean; onClick: () => void; label: string }) {
  return <div className="flex items-end"><Button disabled={busy} onClick={onClick} className="h-11 w-full rounded-xl bg-slate-900 px-6 hover:bg-slate-800">{label}</Button></div>
}

function AccountSettingsStep({ title, fields, values, onChange, busy, onSave }: { title: string; fields: readonly (readonly [string, string])[]; values: Record<string, string>; onChange: (key: string, value: string) => void; busy: boolean; onSave: () => void }) {
  return <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm"><div className="flex shrink-0 items-center justify-between bg-gradient-to-l from-blue-700 to-indigo-600 px-5 py-4 text-white"><div><h4 className="text-lg font-black">{title}</h4><p className="mt-1 text-xs text-blue-100">ابحث برقم الحساب أو اسمه ثم اختره لكل حقل</p></div></div><div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 md:grid-cols-2">{fields.map(([key, label]) => <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3"><Label className="mb-2 block text-sm font-bold text-slate-700">{label}</Label><AutoCompleteAccount label="" value={values[key] || ""} valueMode="id" onValueChange={(value) => onChange(key, String(value || ""))} onAccountSelect={(account) => onChange(key, account ? String(account.id) : "")} placeholder="ابحث عن الحساب" className="w-full" showCostCenterButton={false} requiredTypeValues={[1]} leafOnly /></div>)}</div></section>
}

function SavedProductsTable({ products }: { products: any[] }) {
  return <div className="mt-5 overflow-hidden rounded-2xl border border-emerald-100"><div className="flex items-center justify-between bg-gradient-to-l from-emerald-700 to-teal-600 px-4 py-3 text-white"><h4 className="font-bold">الأصناف المحفوظة</h4><span className="rounded-full bg-white/15 px-3 py-1 text-xs">{products.length} صنف</span></div>{products.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">لا توجد أصناف محفوظة</div> : <div className="max-h-52 overflow-auto"><table className="w-full min-w-[700px] text-sm"><thead className="sticky top-0 bg-slate-100 text-slate-600"><tr><th className="w-16 px-3 py-2 text-right">#</th><th className="px-3 py-2 text-right">رقم الصنف</th><th className="px-3 py-2 text-right">اسم الصنف</th><th className="px-3 py-2 text-right">الوحدة</th><th className="px-3 py-2 text-right">الباركود</th><th className="px-3 py-2 text-right">سعر البيع</th></tr></thead><tbody>{products.map((item, index) => <tr key={item.id ?? index} className="border-t border-slate-100 even:bg-slate-50/70"><td className="px-3 py-2 text-slate-400">{index + 1}</td><td className="px-3 py-2 font-mono font-bold text-slate-800">{item.product_code}</td><td className="px-3 py-2 text-slate-700">{item.product_name}</td><td className="px-3 py-2 text-slate-600">{item.first_unit || item.main_unit || "-"}</td><td className="px-3 py-2 font-mono text-slate-600">{item.first_barcode || item.barcode || "-"}</td><td className="px-3 py-2 font-bold text-emerald-700">{Number(item.first_price ?? item.selling_price ?? 0).toLocaleString()}</td></tr>)}</tbody></table></div>}</div>
}

function AccountImportPreview({ rows, busy, onDelete, onSave }: { rows: AccountPreviewRow[]; busy: boolean; onDelete: (index: number) => void; onSave: () => void }) {
  if (!rows.length) return null
  const errorCount = rows.filter((row) => row.errors.length).length
  return <div className="mt-5 overflow-hidden rounded-2xl border border-indigo-200"><div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50 px-4 py-3"><div><h4 className="font-black text-indigo-950">مراجعة الحسابات قبل الحفظ</h4><p className="text-xs text-indigo-700">{rows.length} حساب · {errorCount} صف يحتوي أخطاء</p></div><Button type="button" disabled={busy || errorCount > 0 || rows.length === 0} onClick={onSave} className="rounded-xl bg-emerald-600 hover:bg-emerald-700">حفظ الحسابات</Button></div><div className="max-h-64 overflow-auto"><table className="w-full min-w-[850px] text-sm"><thead className="sticky top-0 bg-slate-900 text-white"><tr><th className="px-3 py-2 text-right">السطر</th><th className="px-3 py-2 text-right">رقم الحساب</th><th className="px-3 py-2 text-right">اسم الحساب</th><th className="px-3 py-2 text-right">الحساب الأب</th><th className="px-3 py-2 text-right">الحالة</th><th className="w-20 px-3 py-2 text-center">حذف</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.rowNumber}-${index}`} className={`border-t ${row.errors.length ? "border-red-200 bg-red-100 text-red-950" : "border-emerald-100 bg-emerald-50/60 text-slate-800"}`}><td className="px-3 py-2 font-bold">{row.rowNumber}</td><td className="px-3 py-2 font-mono font-bold">{row.payload.account_code || "-"}</td><td className="px-3 py-2">{row.payload.account_name || "-"}</td><td className="px-3 py-2 font-mono">{row.payload.father_code || "-"}</td><td className="px-3 py-2">{row.errors.length ? <ul className="list-inside list-disc text-xs font-semibold">{row.errors.map((error) => <li key={error}>{error}</li>)}</ul> : <span className="font-bold text-emerald-700">صحيح</span>}</td><td className="px-3 py-2 text-center"><Button type="button" variant="ghost" size="icon" onClick={() => onDelete(index)} className="text-red-600 hover:bg-red-200 hover:text-red-800" title="حذف الصف"><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody></table></div>{errorCount > 0 && <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">يجب حذف الصفوف التي تحتوي أخطاء أو تصحيح ملف الاستيراد وإعادة رفعه قبل الحفظ.</div>}</div>
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
