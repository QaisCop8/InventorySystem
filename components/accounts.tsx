"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, CheckCircle, Download, FileSpreadsheet, Plus, RefreshCw, Upload } from "lucide-react"
import DataGridView from "@/components/common/DataGridView"
import UnifiedAccounts from "@/components/customer/unified-accounts-refactored"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"
import * as XLSX from "xlsx"

interface AccountType {
  id: number
  name: string
}

interface Account {
  id: number
  code: string
  name: string
  name_lang2?: string | null
  type?: number | null
  type_name?: string
  father_id?: number | null
  level_no: number
  finanical_list_id: number
  finanical_list_name?: string
  currency_id?: number | null
  allow_trans_with_diff_curr: number
  iscalc_curr_diff_rates: boolean
  transaction_type: number
  max_transaction_amount: number
  max_balance_amount: number
  notes?: string | null
  status: string
}

interface FormState {
  code: string
  name: string
  name_lang2: string
  type: string
  father_id: string
  level_no: string
  finanical_list_id: string
  currency_id: string
  allow_trans_with_diff_curr: boolean
  iscalc_curr_diff_rates: boolean
  transaction_type: string
  max_transaction_amount: string
  max_balance_amount: string
  notes: string
  status: string
}

type ExcelAccountRow = {
  rowIndex: number
  code: string
  name: string
  name_lang2: string
  father_reference: string
  finanical_list_id: number | null
  finanical_list_name: string
  currency_id: number | null
  currency_name: string
  currency_code: string
  raw_balance_sheet_assets: string
  raw_balance_sheet_liabilities: string
  raw_income_statement_item: string
  finanical_list_assests_id: number | null
  finanical_list_liabilities_id: number | null
  finanical_list_income_id: number | null
  status: string
  errors: string[]
  isValid: boolean
}

type ExcelImportSummary = {
  success: number
  failed: number
  duplicates: number
  errors: string[]
}

export default function Accounts() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [showUnifiedPopup, setShowUnifiedPopup] = useState(false)
  const [showExcelImportDialog, setShowExcelImportDialog] = useState(false)
  const [selectedUnifiedAccountId, setSelectedUnifiedAccountId] = useState<number | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [types, setTypes] = useState<AccountType[]>([])
  const [currencies, setCurrencies] = useState<Array<{ id?: number; currency_id?: number; currency_name?: string; currency_code?: string; name?: string; code?: string }>>([])
  const [balanceSheetAssets, setBalanceSheetAssets] = useState<Array<{ id: number; name: string }>>([])
  const [balanceSheetLiabilities, setBalanceSheetLiabilities] = useState<Array<{ id: number; name: string }>>([])
  const [incomeStatementItems, setIncomeStatementItems] = useState<Array<{ id: number; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [filterFinancialList, setFilterFinancialList] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [excelRows, setExcelRows] = useState<ExcelAccountRow[]>([])
  const [excelProcessing, setExcelProcessing] = useState(false)
  const [excelImporting, setExcelImporting] = useState(false)
  const [excelImportProgress, setExcelImportProgress] = useState({ current: 0, total: 0 })
  const [excelSummary, setExcelSummary] = useState<ExcelImportSummary | null>(null)
  const [excelStep, setExcelStep] = useState<"upload" | "preview" | "result">("upload")
  const [excelTemplateType, setExcelTemplateType] = useState("none")
  const [excelExportRows, setExcelExportRows] = useState<any[]>([])
  const [excelExportLoading, setExcelExportLoading] = useState(false)
  const [excelExportError, setExcelExportError] = useState("")
  const [excelValidationAccounts, setExcelValidationAccounts] = useState<Array<{ code: string; name: string }>>([])
  const excelInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState<FormState>({
    code: "",
    name: "",
    name_lang2: "",
    type: "",
    father_id: "",
    level_no: "1",
    finanical_list_id: "1",
    currency_id: "",
    allow_trans_with_diff_curr: false,
    iscalc_curr_diff_rates: false,
    transaction_type: "0",
    max_transaction_amount: "0",
    max_balance_amount: "0",
    notes: "",
    status: "نشط",
  })

  useEffect(() => {
    loadData()
  }, [])

  const normalizeLookupValue = (value: unknown) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase()

  const normalizeReferenceValue = (value: unknown) =>
    String(value ?? "")
      .trim()
      .replace(/[\s_-]+/g, "")
      .toLowerCase()

  const getExcelCell = (row: any, keys: string[]) => {
    for (const key of keys) {
      const value = row?.[key]
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim()
      }
    }
    return ""
  }

  const resolveByIdOrName = (value: string, items: Array<{ id: number; name: string }>) => {
    const trimmed = String(value ?? "").trim()
    if (!trimmed) return null

    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) {
      const byId = items.find((item) => Number(item.id) === numeric)
      return byId ?? { id: numeric, name: trimmed }
    }

    const normalized = normalizeLookupValue(trimmed)
    return items.find((item) => normalizeLookupValue(item.name) === normalized) || null
  }

  const resolveAccountReference = (value: string, items: Account[]) => {
    const trimmed = String(value ?? "").trim()
    if (!trimmed) return null

    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) {
      const byId = items.find((item) => Number(item.id) === numeric)
      if (byId) return byId
    }

    const normalized = normalizeReferenceValue(trimmed)
    return (
      items.find((item) => {
        return (
          normalizeReferenceValue(item.code) === normalized ||
          normalizeReferenceValue(item.name) === normalized ||
          normalizeReferenceValue(item.name_lang2) === normalized
        )
      }) || null
    )
  }

  const resolveCurrency = (value: string) => {
    const trimmed = String(value ?? "").trim()
    if (!trimmed) return null

    const normalized = normalizeLookupValue(trimmed)
    const numeric = Number(trimmed)
    const aliasMap: Record<string, string[]> = {
      nis: ["nis", "ils", "شيقل", "شيكل", "شيكلاسرائيلي", "شيقلاسرائيلي"],
      ils: ["nis", "ils", "شيقل", "شيكل", "شيكلاسرائيلي", "شيقلاسرائيلي"],
    }

    const normalizedAliases = aliasMap[normalized] || [normalized]

    return (
      currencies.find((currency) => {
        const currencyId = Number(currency.currency_id ?? currency.id)
        const currencyName = String(currency.currency_name ?? currency.name ?? "")
        const currencyCode = String(currency.currency_code ?? currency.code ?? "")
        const currencyNameNormalized = normalizeLookupValue(currencyName)
        const currencyCodeNormalized = normalizeLookupValue(currencyCode)

        if (Number.isFinite(numeric) && currencyId === numeric) return true

        return (
          normalizedAliases.includes(currencyNameNormalized) ||
          normalizedAliases.includes(currencyCodeNormalized)
        )
      }) || null
    )
  }

  const currencyFallbackFor = (value: string) => {
    const normalized = normalizeLookupValue(value)
    if (!["nis", "ils", "شيقل", "شيكل", "شيكلاسرائيلي", "شيقلاسرائيلي"].includes(normalized)) {
      return null
    }

    const baseCurrency = currencies.find((currency) => Number(currency.currency_id ?? currency.id) === 1 || normalizeLookupValue(currency.currency_code ?? currency.code) === "nis")
    if (baseCurrency) return baseCurrency

    return {
      currency_id: 1,
      currency_name: "شيقل",
      currency_code: "NIS",
      id: 1,
    }
  }
  
  const normalizeAccountRecord = (item: any): Account => {
    const finanicalListId = Number(item.finanical_list_id ?? item.financial_list_id ?? 1) || 1
    const statusValue = item.status ?? item.account_status ?? "نشط"
    const normalizedStatus = typeof statusValue === "number" ? String(statusValue) : String(statusValue || "نشط")

    return {
      ...item,
      code: item.code || item.account_code || "",
      name: item.name || item.account_name || "",
      type: Number(item.type || 0),
      level_no: Number(item.level_no || 1),
      finanical_list_id: finanicalListId,
      finanical_list_name:
        item.finanical_list_name ||
        item.financial_list_name ||
        (finanicalListId === 1
          ? "الميزانية العمومية"
          : finanicalListId === 2
            ? "قائمة الدخل"
            : finanicalListId === 3
              ? "تقييم بضاعة"
              : ""),
      status: normalizedStatus,
    }
  }

  const normalizeAccountCode = (value: string) => {
    const cleaned = String(value ?? "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()

    if (!cleaned) return ""

    if (cleaned.length >= 8) {
      return cleaned.slice(0, 8)
    }

    if (/^\d+$/.test(cleaned)) {
      return cleaned.padStart(8, "0")
    }

    return cleaned.padEnd(8, "0").slice(0, 8)
  }

  const normalizeFatherCodeFromJson = (value: unknown) => {
    const trimmed = String(value ?? "").trim()
    if (!trimmed) return ""

    const collapsed = trimmed.replace(/\s+/g, "")
    if (collapsed.endsWith("0")) {
      const shortened = collapsed.slice(0, -1)
      return shortened || collapsed
    }

    return collapsed
  }

  const loadExcelValidationAccounts = async () => {
    const response = await fetch("/api/accounts?type=1")
    if (!response.ok) {
      throw new Error("فشل تحميل الحسابات للتحقق من التكرار")
    }

    const data = await response.json()
    const latestAccounts = Array.isArray(data)
      ? data.map((item: any) => ({
          code: normalizeAccountCode(String(item.code || item.account_code || "")),
          name: String(item.name || item.account_name || "").trim(),
        }))
      : []

    setExcelValidationAccounts(latestAccounts)
    return latestAccounts
  }

  const getExcelDuplicateError = (code: string, name: string, latestAccounts: Array<{ code: string; name: string }>) => {
    const normalizedCode = normalizeAccountCode(code)
    const normalizedName = normalizeLookupValue(name)

    if (normalizedCode && latestAccounts.some((account) => normalizeAccountCode(account.code) === normalizedCode)) {
      return `رقم الحساب موجود مسبقاً: ${normalizedCode}`
    }

    if (normalizedName && latestAccounts.some((account) => normalizeLookupValue(account.name) === normalizedName)) {
      return `اسم الحساب موجود مسبقاً: ${name}`
    }

    return null
  }

  const getExcelFatherSelfError = (code: string, fatherReference: string) => {
    const normalizedCode = normalizeAccountCode(code)
    const normalizedFather = normalizeAccountCode(fatherReference)

    if (normalizedCode && normalizedFather && normalizedCode === normalizedFather) {
      return "لا يمكن ان يكون الحساب تابع لنفسه"
    }

    return null
  }

  const mapFinancialList = (value: string) => {
    const normalized = normalizeLookupValue(value)
    if (!normalized) return null

    if (["1", "الميزانيةالعمومية", "الميزانية", "ميزانيةعمومية", "balance", "balancesheet"].includes(normalized)) return 1
    if (["2", "قائمةالدخل", "الدخل", "income", "incomestatement"].includes(normalized)) return 2
    if (["3", "تقييمبضاعة", "تقييم", "merchandise", "inventoryvaluation"].includes(normalized)) return 3

    const numeric = Number(value)
    return [1, 2, 3].includes(numeric) ? numeric : null
  }

  const buildExcelRows = (rawRows: any[], latestAccounts: Array<{ code: string; name: string }> = excelValidationAccounts) => {
    const seenCodes = new Set<string>()

    return rawRows.map((row, index) => {
      const errors: string[] = []
      const rawCode = getExcelCell(row, ["رقم الحساب", "account_code", "code"])
      const rawName = getExcelCell(row, ["اسم الحساب", "account_name", "name"])
      const rawFinancialList = getExcelCell(row, ["القائمة المالية", "financial_list", "finanical_list_id"])
      const rawCurrency = getExcelCell(row, ["العملة", "currency", "currency_name", "currency_code", "currency_id"])
      const rawFather = getExcelCell(row, ["حساب الاب", "الحساب الأب", "father_code", "father_account_code", "father", "parent_account", "father_id"])
      const rawBalanceSheetAssets = getExcelCell(row, ["أصول الميزانية", "اصول الميزانية", "balance_sheet_assets", "finanical_list_assests_id"])
      const rawBalanceSheetLiabilities = getExcelCell(row, ["خصوم الميزانية", "balance_sheet_liabilities", "finanical_list_liabilities_id"])
      const rawBalanceSheetItem = getExcelCell(row, ["اصول وخصوم الميزانية", "أصول وخصوم الميزانية", "balance_sheet_item"])
      const rawIncomeItem = getExcelCell(row, ["بند قائمة الدخل", "income_statement_item", "finanical_list_income_id"])

      const code = normalizeAccountCode(rawCode)
      const name = rawName.trim()
      const name_lang2 = name
      const finanical_list_id = mapFinancialList(rawFinancialList)
      const currencyMatch = resolveCurrency(rawCurrency) ?? currencyFallbackFor(rawCurrency)

      let currency_id: number | null = null
      let currency_name = ""
      let currency_code = ""
      let finanical_list_assests_id: number | null = null
      let finanical_list_liabilities_id: number | null = null
      let finanical_list_income_id: number | null = null

      if (code) {
        if (seenCodes.has(code)) {
          errors.push(`رقم الحساب مكرر داخل الملف: ${code}`)
        }
        const duplicateError = getExcelDuplicateError(code, name, latestAccounts)
        if (duplicateError) {
          errors.push(duplicateError)
        }
        seenCodes.add(code)
      }

      if (!code) errors.push("رقم الحساب مطلوب")
      if (!name) errors.push("اسم الحساب مطلوب")
      if (!finanical_list_id) errors.push("القائمة المالية مطلوبة")
      const fatherSelfError = getExcelFatherSelfError(code, rawFather)
      if (fatherSelfError) errors.push(fatherSelfError)
      if (!rawCurrency) {
        errors.push("العملة مطلوبة")
      } else if (!currencyMatch) {
        errors.push(`العملة غير موجودة: ${rawCurrency}`)
      } else {
        currency_id = Number(currencyMatch.currency_id ?? currencyMatch.id)
        currency_name = String(currencyMatch.currency_name ?? currencyMatch.name ?? "")
        currency_code = String(currencyMatch.currency_code ?? currencyMatch.code ?? "")
      }

      if (finanical_list_id === 1) {
        const assetSource = rawBalanceSheetAssets || rawBalanceSheetItem
        const liabilitySource = rawBalanceSheetLiabilities || rawBalanceSheetItem

        if (!assetSource && !liabilitySource) {
          errors.push("يجب تحديد أصول الميزانية وخصومها")
        } else {
          const assetMatch = assetSource ? resolveByIdOrName(assetSource, balanceSheetAssets) : null
          const liabilityMatch = liabilitySource ? resolveByIdOrName(liabilitySource, balanceSheetLiabilities) : null

          if (assetSource && !assetMatch) {
            errors.push(`أصول الميزانية غير موجودة: ${assetSource}`)
          }

          if (assetMatch) {
            finanical_list_assests_id = assetMatch?.id ?? null
          }

          if (liabilitySource && !liabilityMatch) {
            errors.push(`خصوم الميزانية غير موجودة: ${liabilitySource}`)
          }

          if (liabilityMatch) {
            finanical_list_liabilities_id = liabilityMatch?.id ?? null
          }
        }
      }

      if (finanical_list_id === 2 || finanical_list_id === 3) {
        if (!rawIncomeItem) {
          errors.push("بند قائمة الدخل مطلوب")
        } else {
          const incomeMatch = resolveByIdOrName(rawIncomeItem, incomeStatementItems)
          if (!incomeMatch) {
            errors.push(`بند قائمة الدخل غير موجود: ${rawIncomeItem}`)
          }
          if (incomeMatch) {
            finanical_list_income_id = incomeMatch.id
          }
        }
      }

      return {
        rowIndex: index + 2,
        code,
        name,
        name_lang2,
        father_reference: rawFather,
        finanical_list_id,
        finanical_list_name:
          finanical_list_id === 1 ? "الميزانية العمومية" : finanical_list_id === 2 ? "قائمة الدخل" : finanical_list_id === 3 ? "تقييم بضاعة" : "",
        currency_id,
        currency_name,
        currency_code,
        raw_balance_sheet_assets: rawBalanceSheetAssets || rawBalanceSheetItem,
        raw_balance_sheet_liabilities: rawBalanceSheetLiabilities || rawBalanceSheetItem,
        raw_income_statement_item: rawIncomeItem,
        finanical_list_assests_id,
        finanical_list_liabilities_id,
        finanical_list_income_id,
        status: getExcelCell(row, ["الحالة", "status"]) || "نشط",
        errors,
        isValid: errors.length === 0,
      } as ExcelAccountRow
    })
  }

  const resetExcelImport = () => {
    setExcelFile(null)
    setExcelRows([])
    setExcelSummary(null)
    setExcelStep("upload")
    setExcelProcessing(false)
    setExcelImporting(false)
    setExcelImportProgress({ current: 0, total: 0 })
    setExcelTemplateType("none")
    setExcelExportRows([])
    setExcelExportLoading(false)
    setExcelExportError("")
    if (excelInputRef.current) {
      excelInputRef.current.value = ""
    }
  }

  const loadExportRows = async (typeId: string) => {
    if (typeId === "none") {
      setExcelExportRows([])
      setExcelExportError("")
      setExcelExportLoading(false)
      return
    }

    setExcelExportLoading(true)
    setExcelExportError("")
    try {
      const response = await fetch(`/api/accounts-export-source?type=${encodeURIComponent(typeId)}`)
      if (!response.ok) {
        throw new Error("فشل تحميل بيانات الحسابات")
      }

      const data = await response.json()
      setExcelExportRows(Array.isArray(data?.rows) ? data.rows : [])
    } catch (err: any) {
      console.error(err)
      setExcelExportRows([])
      setExcelExportError(err?.message || "فشل تحميل البيانات")
    } finally {
      setExcelExportLoading(false)
    }
  }

  useEffect(() => {
    if (!showExcelImportDialog) return

    void loadExcelValidationAccounts().catch((err) => {
      console.error(err)
    })

    if (excelTemplateType === "none") {
      setExcelExportRows([])
      setExcelExportError("")
      setExcelExportLoading(false)
      return
    }

    void loadExportRows(excelTemplateType)
  }, [excelTemplateType, showExcelImportDialog])

  const excelGridColumns = [
    { header: "##", name: "rowIndex", width: 60, isReadOnly: true },
    { header: "رقم الحساب", name: "code", width: 120, isReadOnly: true },
    { header: "اسم الحساب", name: "name", width: 180, isReadOnly: true },
    { header: "اسم الحساب بالانجليزي", name: "name_lang2", width: 200, isReadOnly: true },
    { header: "الحساب الأب", name: "father_code", width: 120, isReadOnly: true },
    { header: "العملة", name: "currency_name", width: 100, isReadOnly: true },
    { header: "القائمة المالية", name: "finanical_list_name", width: 140, isReadOnly: true },
    { header: "بند أصول الميزانية", name: "finanical_list_assests_id", width: 140, isReadOnly: true },
    { header: "بند خصوم الميزانية", name: "finanical_list_liabilities_id", width: 140, isReadOnly: true },
    { header: "بند قائمة الدخل", name: "finanical_list_income_id", width: 140, isReadOnly: true },
    { header: "التحقق", name: "validation_text", width: 220, isReadOnly: true },
  ]

  const excelGridScheme = { isReport: true, columns: excelGridColumns }

  const getCurrencyDisplay = (currencyId: unknown) => {
    const numericId = Number(currencyId)
    const matchedCurrency = currencies.find((currency) => Number(currency.currency_id ?? currency.id) === numericId)
    const fallbackCurrency = currencies[0] || null
    const displayCurrency = matchedCurrency || fallbackCurrency

    if (!displayCurrency) {
      return {
        currency_id: Number.isFinite(numericId) ? numericId : 1,
        currency_name: "",
        currency_code: "",
      }
    }

    return {
      currency_id: Number(displayCurrency.currency_id ?? displayCurrency.id ?? numericId ?? 1),
      currency_name: String(displayCurrency.currency_name ?? displayCurrency.name ?? ""),
      currency_code: String(displayCurrency.currency_code ?? displayCurrency.code ?? ""),
    }
  }

  const getFinancialListLabel = (financialList: unknown) => {
    switch (String(financialList ?? "").trim()) {
      case "1":
        return "الميزانية العمومية"
      case "2":
        return "قائمة الدخل"
      case "3":
        return "تقييم بضاعة"
      default:
        return String(financialList ?? "")
    }
  }

  const buildExportGridRow = (row: any, index: number) => {
    const exportRow: any = row
    const currencyDisplay = getCurrencyDisplay(exportRow.currency_id)
    const code = normalizeAccountCode(String(exportRow.code ?? ""))
    const name = String(exportRow.name ?? "").trim()
    const errors: string[] = []
    const fatherReference = normalizeFatherCodeFromJson(exportRow.father_code || exportRow.father_account_code || exportRow.father || exportRow.father_id || "")

    if (!code) errors.push("رقم الحساب مطلوب")
    if (!name) errors.push("اسم الحساب مطلوب")
    const duplicateError = getExcelDuplicateError(code, name, excelValidationAccounts)
    if (duplicateError) errors.push(duplicateError)
    const fatherSelfError = getExcelFatherSelfError(code, fatherReference)
    if (fatherSelfError) errors.push(fatherSelfError)

    const financialListId = Number(exportRow.financial_list ?? exportRow.finanical_list_id ?? 1) || 1
    if (financialListId === 1) {
      const assetValue = String(exportRow.finanical_list_assests_id ?? exportRow.financial_list_assests ?? exportRow.financial_list_assests_id ?? "").trim()
      const liabilityValue = String(exportRow.finanical_list_liabilities_id ?? exportRow.financial_list_liabilities ?? exportRow.financial_list_liabilities_id ?? "").trim()
      const combinedValue = String(exportRow.balance_sheet_item ?? "").trim()

      if (!assetValue && !liabilityValue && !combinedValue) {
        errors.push("يجب تحديد أصول الميزانية وخصومها")
      }
    }

    if (financialListId === 2 || financialListId === 3) {
      const incomeValue = String(exportRow.finanical_list_income_id ?? exportRow.financial_list_income ?? exportRow.financial_list_income_id ?? "").trim()
      if (!incomeValue) {
        errors.push("بند قائمة الدخل مطلوب")
      }
    }

    return {
      ...exportRow,
      rowIndex: index + 1,
      code,
      name,
      name_lang2: name,
      father_code: normalizeFatherCodeFromJson(exportRow.father_code || exportRow.father_account_code || exportRow.father || exportRow.father_id || ""),
      currency_id: currencyDisplay.currency_id,
      currency_name: currencyDisplay.currency_name,
      currency_code: currencyDisplay.currency_code,
      finanical_list_name: getFinancialListLabel(exportRow.financial_list ?? exportRow.finanical_list_id ?? exportRow.finanical_list_name),
      finanical_list_assests_id:
        exportRow.finanical_list_assests_id || exportRow.financial_list_assests || exportRow.financial_list_assests_id || "",
      finanical_list_liabilities_id:
        exportRow.finanical_list_liabilities_id || exportRow.financial_list_liabilities || exportRow.financial_list_liabilities_id || "",
      finanical_list_income_id:
        exportRow.finanical_list_income_id || exportRow.financial_list_income || exportRow.financial_list_income_id || "",
      validation_text: errors.length === 0 ? "صالح" : errors[0],
    }
  }

  const buildPreviewGridRow = (row: any) => {
    const previewRow: any = row
    const currencyDisplay = getCurrencyDisplay(previewRow.currency_id)
    const fatherReference = normalizeFatherCodeFromJson(previewRow.father_code || previewRow.father_account_code || previewRow.father || previewRow.father_id || "")
    const code = normalizeAccountCode(String(previewRow.code ?? ""))
    const name = String(previewRow.name ?? previewRow.name_lang2 ?? "").trim()
    const errors: string[] = Array.isArray(previewRow.errors) ? [...previewRow.errors] : []

    const duplicateError = getExcelDuplicateError(code, name, excelValidationAccounts)
    if (duplicateError && !errors.includes(duplicateError)) errors.push(duplicateError)
    const fatherSelfError = getExcelFatherSelfError(code, fatherReference)
    if (fatherSelfError && !errors.includes(fatherSelfError)) errors.push(fatherSelfError)

    const financialListId = Number(previewRow.financial_list ?? previewRow.finanical_list_id ?? 1) || 1
    if (financialListId === 1) {
      const assetValue = String(previewRow.finanical_list_assests_id ?? previewRow.financial_list_assests_id ?? "").trim()
      const liabilityValue = String(previewRow.finanical_list_liabilities_id ?? previewRow.financial_list_liabilities_id ?? "").trim()
      const combinedValue = String(previewRow.balance_sheet_item ?? "").trim()
      if (!assetValue && !liabilityValue && !combinedValue) {
        errors.push("يجب تحديد أصول الميزانية وخصومها")
      }
    }

    if (financialListId === 2 || financialListId === 3) {
      const incomeValue = String(previewRow.finanical_list_income_id ?? previewRow.financial_list_income_id ?? "").trim()
      if (!incomeValue) {
        errors.push("بند قائمة الدخل مطلوب")
      }
    }

    return {
      ...previewRow,
      code,
      name,
      father_code: normalizeFatherCodeFromJson(previewRow.father_code || previewRow.father_account_code || previewRow.father || previewRow.father_id || ""),
      currency_id: currencyDisplay.currency_id,
      currency_name: currencyDisplay.currency_name,
      currency_code: currencyDisplay.currency_code,
      name_lang2: previewRow.name || previewRow.name_lang2 || "",
      finanical_list_name: getFinancialListLabel(previewRow.finanical_list_name || previewRow.financial_list_name),
      finanical_list_assests_id: previewRow.finanical_list_assests_id || previewRow.financial_list_assests_id || "",
      finanical_list_liabilities_id: previewRow.finanical_list_liabilities_id || previewRow.financial_list_liabilities_id || "",
      finanical_list_income_id: previewRow.finanical_list_income_id || previewRow.financial_list_income_id || "",
      validation_text: errors.length === 0 ? "صالح" : errors[0],
    }
  }

  const buildImportRowFromExportRow = (row: any, index: number): ExcelAccountRow => {
    const currencyDisplay = getCurrencyDisplay(row.currency_id)
    const code = normalizeAccountCode(String(row.code ?? ""))
    const name = String(row.name ?? "").trim()
    const errors: string[] = []
    const fatherReference = normalizeFatherCodeFromJson(row.father_code ?? row.father_account_code ?? row.father ?? row.father_id ?? "")

    if (!code) errors.push("رقم الحساب مطلوب")
    if (!name) errors.push("اسم الحساب مطلوب")
    const duplicateError = getExcelDuplicateError(code, name, excelValidationAccounts)
    if (duplicateError) errors.push(duplicateError)
    const fatherSelfError = getExcelFatherSelfError(code, fatherReference)
    if (fatherSelfError) errors.push(fatherSelfError)

    const finanical_list_id = Number(row.financial_list ?? row.finanical_list_id ?? 1) || 1
    if (finanical_list_id === 1) {
      const assetValue = String(row.finanical_list_assests_id ?? row.financial_list_assests ?? row.financial_list_assests_id ?? "").trim()
      const liabilityValue = String(row.finanical_list_liabilities_id ?? row.financial_list_liabilities ?? row.financial_list_liabilities_id ?? "").trim()
      const combinedValue = String(row.balance_sheet_item ?? "").trim()

      if (!assetValue && !liabilityValue && !combinedValue) {
        errors.push("يجب تحديد أصول الميزانية وخصومها")
      }
    }

    if (finanical_list_id === 2 || finanical_list_id === 3) {
      const incomeValue = String(row.finanical_list_income_id ?? row.financial_list_income ?? row.financial_list_income_id ?? "").trim()
      if (!incomeValue) {
        errors.push("بند قائمة الدخل مطلوب")
      }
    }

    return {
      rowIndex: index + 1,
      code,
      name,
      name_lang2: name,
      father_reference: fatherReference,
      finanical_list_id,
      finanical_list_name: getFinancialListLabel(row.financial_list ?? row.finanical_list_id ?? row.finanical_list_name),
      currency_id: currencyDisplay.currency_id,
      currency_name: currencyDisplay.currency_name,
      currency_code: currencyDisplay.currency_code,
      raw_balance_sheet_assets: String(row.finanical_list_assests_id ?? row.financial_list_assests ?? row.financial_list_assests_id ?? "").trim(),
      raw_balance_sheet_liabilities: String(row.finanical_list_liabilities_id ?? row.financial_list_liabilities ?? row.financial_list_liabilities_id ?? "").trim(),
      raw_income_statement_item: String(row.finanical_list_income_id ?? row.financial_list_income ?? row.financial_list_income_id ?? "").trim(),
      finanical_list_assests_id: null,
      finanical_list_liabilities_id: null,
      finanical_list_income_id: null,
      status: String(row.status ?? "نشط"),
      errors,
      isValid: errors.length === 0,
    }
  }

  const getRowsToImport = () => {
    if (excelRows.length > 0) {
      return excelRows.filter((row) => row.isValid)
    }

    if (excelTemplateType !== "none" && excelExportRows.length > 0) {
      return excelExportRows.map(buildImportRowFromExportRow).filter((row) => row.isValid)
    }

    return [] as ExcelAccountRow[]
  }

  const processExcelFile = async (file: File) => {
    setExcelProcessing(true)
    setError("")
    setMessage("")

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: "array" })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" })
      const latestAccounts = await loadExcelValidationAccounts()

      if (!rawRows.length) {
        setError("ملف Excel فارغ")
        setExcelRows([])
        setExcelStep("upload")
        return
      }

      setExcelRows(buildExcelRows(rawRows, latestAccounts))
      setExcelStep("preview")
    } catch (err) {
      console.error(err)
      setError("حدث خطأ أثناء قراءة ملف Excel")
      setExcelRows([])
      setExcelStep("upload")
    } finally {
      setExcelProcessing(false)
    }
  }

  const handleExcelFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      setError("يرجى اختيار ملف Excel (.xlsx أو .xls)")
      return
    }

    setExcelFile(selectedFile)
    await processExcelFile(selectedFile)
  }

  const importExcelAccounts = async () => {
    const rowsToImport = getRowsToImport()
    if (!rowsToImport.length) {
      setError("لا توجد حسابات صالحة للاستيراد")
      return
    }

    setExcelImporting(true)
    setExcelSummary(null)
    setError("")
    setMessage("")
    setExcelImportProgress({ current: 0, total: rowsToImport.length })

    const summary: ExcelImportSummary = { success: 0, failed: 0, duplicates: 0, errors: [] }

    const accountReferenceMap = new Map<string, number>()
    const accountCodeReferenceMap = new Map<string, number>()
    const accountIdReferenceMap = new Map<string, number>()
    const assetItemCache = new Map<string, { id: number; name: string }>()
    const liabilityItemCache = new Map<string, { id: number; name: string }>()
    const incomeItemCache = new Map<string, { id: number; name: string }>()

    const seedAccountReference = (account: Partial<Account> & { account_code?: string; account_name?: string; parent_account_id?: number | null }) => {
      const accountId = Number(account.id)
      if (!Number.isFinite(accountId) || accountId <= 0) return

      const idValue = normalizeReferenceValue(account.id)
      if (idValue) {
        accountIdReferenceMap.set(idValue, accountId)
      }

      const codeValues = [account.code, account.account_code]
      for (const value of codeValues) {
        const normalized = normalizeReferenceValue(value)
        if (normalized) {
          accountCodeReferenceMap.set(normalized, accountId)
        }
      }

      const nameValues = [account.name, account.name_lang2, account.account_name]
      for (const value of nameValues) {
        const normalized = normalizeReferenceValue(value)
        if (normalized && !accountReferenceMap.has(normalized)) {
          accountReferenceMap.set(normalized, accountId)
        }
      }
    }

    const resolveAccountId = async (reference: string) => {
      const normalized = normalizeReferenceValue(reference)
      if (!normalized) return null

      const searchCode = String(reference ?? "").trim().toUpperCase()
      if (!searchCode) return null

      const existingByCode = accountCodeReferenceMap.get(normalized)
      if (existingByCode) return existingByCode

      const existingById = accountIdReferenceMap.get(normalized)
      if (existingById) return existingById

      try {
        const response = await fetch(`/api/accounts/search?code=${encodeURIComponent(searchCode)}`)
        if (!response.ok) return null

        const account = await response.json()
        const foundId = Number(account?.id)
        if (!Number.isFinite(foundId) || foundId <= 0) return null

        seedAccountReference({
          id: foundId,
          code: String(account?.code ?? searchCode),
          name: String(account?.name ?? account?.account_name ?? ""),
          name_lang2: String(account?.name_lang2 ?? ""),
          father_id: account?.father_id ?? null,
          level_no: Number(account?.level_no ?? 1),
          finanical_list_id: Number(account?.finanical_list_id ?? 1),
          type: account?.type ?? null,
          allow_trans_with_diff_curr: Number(account?.allow_trans_with_diff_curr ?? 0),
          iscalc_curr_diff_rates: Boolean(account?.iscalc_curr_diff_rates),
          transaction_type: Number(account?.transaction_type ?? 0),
          max_transaction_amount: Number(account?.max_transaction_amount ?? 0),
          max_balance_amount: Number(account?.max_balance_amount ?? 0),
          status: String(account?.status ?? "نشط"),
        })

        return foundId
      } catch {
        const existing = accountReferenceMap.get(normalized)
        if (existing) return existing
        return null
      }
    }

    const seedLookupCache = (
      items: Array<{ id: number; name: string }>,
      cache: Map<string, { id: number; name: string }>,
    ) => {
      for (const item of items) {
        const normalized = normalizeReferenceValue(item.name)
        if (normalized) {
          cache.set(normalized, item)
        }
        const numericKey = normalizeReferenceValue(item.id)
        if (numericKey) {
          cache.set(numericKey, item)
        }
      }
    }

    const resolveOrCreateLookupItem = async (
      rawValue: string,
      cache: Map<string, { id: number; name: string }>,
      endpoint: string,
    ) => {
      const trimmed = String(rawValue ?? "").trim()
      if (!trimmed) return null

      const normalized = normalizeReferenceValue(trimmed)
      const cached = cache.get(normalized)
      if (cached) return cached

      const numeric = Number(trimmed)
      if (Number.isFinite(numeric)) {
        const fromNumeric = [...cache.values()].find((item) => Number(item.id) === numeric)
        if (fromNumeric) {
          cache.set(normalized, fromNumeric)
          return fromNumeric
        }
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, status: 1 }),
      })

      if (!response.ok) {
        let errorMessage = `فشل حفظ البند: ${trimmed}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          // no-op
        }
        throw new Error(errorMessage)
      }

      const created = await response.json()
      const createdItem = { id: Number(created.id), name: String(created.name ?? trimmed) }
      if (!Number.isFinite(createdItem.id)) {
        throw new Error(`تعذر حفظ البند: ${trimmed}`)
      }

      cache.set(normalized, createdItem)
      cache.set(normalizeReferenceValue(createdItem.id), createdItem)
      return createdItem
    }

    seedLookupCache(balanceSheetAssets, assetItemCache)
    seedLookupCache(balanceSheetLiabilities, liabilityItemCache)
    seedLookupCache(incomeStatementItems, incomeItemCache)

    try {
      for (const row of rowsToImport) {
        const nextCurrent = summary.success + summary.failed + summary.duplicates + 1
        setExcelImportProgress({ current: nextCurrent, total: rowsToImport.length })
        
        const resolvedAsset = row.raw_balance_sheet_assets
          ? await resolveOrCreateLookupItem(row.raw_balance_sheet_assets, assetItemCache, "/api/balance-sheet-assets-items")
          : null
        const resolvedLiability = row.raw_balance_sheet_liabilities
          ? await resolveOrCreateLookupItem(row.raw_balance_sheet_liabilities, liabilityItemCache, "/api/balance-sheet-liabilities-items")
          : null
        const resolvedIncome = row.raw_income_statement_item
          ? await resolveOrCreateLookupItem(row.raw_income_statement_item, incomeItemCache, "/api/income-statement-items")
          : null

        const payload = {
          code: row.code,
          name: row.name,
          name_lang2: row.name_lang2,
          type: 1,
          parent_code: row.father_reference || null,
          father_id: null,
          level_no: row.father_reference ? 2 : 1,
          finanical_list_id: row.finanical_list_id ?? 1,
          finanical_list_assests_id: resolvedAsset?.id ?? row.finanical_list_assests_id,
          finanical_list_liabilities_id: resolvedLiability?.id ?? row.finanical_list_liabilities_id,
          finanical_list_income_id: resolvedIncome?.id ?? row.finanical_list_income_id,
          currency_id: row.currency_id ?? 1,
          allow_trans_with_diff_curr: 0,
          iscalc_curr_diff_rates: false,
          transaction_type: 0,
          transaction_type_action: 0,
          max_transaction_amount: 0,
          max_transaction_amount_action: 0,
          max_balance_amount: 0,
          max_balance_action: null,
          budget_exceeding_perc: null,
          budget_exceeding_action: null,
          unified_report_account_no: null,
          unified_report_group_code: null,
          notes: null,
          show_notes_in_transactions_soa: false,
          status: row.status || "نشط",
        }

        const response = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          let errorMessage = "فشل استيراد الحساب"
          try {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          } catch {
            // no-op
          }

          if (errorMessage.includes("موجود")) {
            summary.duplicates += 1
          } else {
            summary.failed += 1
          }
          summary.errors.push(`السطر ${row.rowIndex}: ${errorMessage}`)
          continue
        }

                  const createdAccount = await response.json()
                  seedAccountReference({
                    id: Number(createdAccount?.id ?? 0),
                    code: createdAccount?.code || createdAccount?.account_code || row.code,
                    name: createdAccount?.name || createdAccount?.account_name || row.name,
                    name_lang2: createdAccount?.name_lang2 || row.name_lang2,
                    father_id: createdAccount?.father_id ?? null,
                    level_no: Number(createdAccount?.level_no ?? (row.father_reference ? 2 : 1)),
                    finanical_list_id: Number(createdAccount?.finanical_list_id ?? row.finanical_list_id ?? 1),
                    type: createdAccount?.type ?? null,
                    allow_trans_with_diff_curr: Number(createdAccount?.allow_trans_with_diff_curr ?? 0),
                    iscalc_curr_diff_rates: Boolean(createdAccount?.iscalc_curr_diff_rates),
                    transaction_type: Number(createdAccount?.transaction_type ?? 0),
                    max_transaction_amount: Number(createdAccount?.max_transaction_amount ?? 0),
                    max_balance_amount: Number(createdAccount?.max_balance_amount ?? 0),
                    status: createdAccount?.status || row.status || "نشط",
                  })

        summary.success += 1
      }

      setExcelSummary(summary)
      setExcelImportProgress({ current: rowsToImport.length, total: rowsToImport.length })
      setExcelStep("result")
      await loadData()
    } catch (err: any) {
      console.error(err)
      setExcelSummary({ success: 0, failed: rowsToImport.length, duplicates: 0, errors: [err?.message || "خطأ غير متوقع أثناء الاستيراد"] })
      setExcelImportProgress({ current: rowsToImport.length, total: rowsToImport.length })
      setExcelStep("result")
    } finally {
      setExcelImporting(false)
    }
  }

  const downloadExcelTemplate = async (typeId = "none") => {
    const templateTypeName =
      typeId === "commercial"
        ? "مؤسسة تجارية"
        : typeId === "commercial_continuous_inventory"
          ? "مؤسسة تجارية - جرد مستمر"
          : typeId === "services"
            ? "خدمات"
            : "بلا"

    let sourceRows = excelExportRows
    if (!sourceRows.length) {
      const response = await fetch(`/api/accounts-export-source?type=${encodeURIComponent(typeId)}`)
      if (!response.ok) {
        throw new Error("فشل تحميل بيانات الحسابات من ملف accounts.json")
      }

      const data = await response.json()
      sourceRows = Array.isArray(data?.rows) ? data.rows : []
      setExcelExportRows(sourceRows)
    }
    const parentCodeById = new Map(sourceRows.map((row: any) => [String(row.id ?? ""), row.code]))

    const templateRows = sourceRows.map((row: any) => ({
      "نوع هيكل الحسابات الافتراضي": templateTypeName,
      type: String(row.type ?? ""),
      "رقم الحساب": row.code || "",
      "اسم الحساب": row.name || "",
      "اسم الحساب انجليزي": row.name_lang2 || "",
      "الحساب الأب": row.father ? normalizeFatherCodeFromJson(parentCodeById.get(String(row.father)) || String(row.father)) : "",
      "العملة": row.currency_id ? String(row.currency_id) : "",
      "القائمة المالية": String(row.financial_list ?? row.finanical_list_id ?? ""),
      "اسم القائمة المالية": row.finanical_list_name || row.financial_list_name || "",
      "أصول الميزانية": row.financial_list_assests || row.finanical_list_assests || "",
      "خصوم الميزانية": row.financial_list_liabilities || row.finanical_list_liabilities || "",
      "بند قائمة الدخل": row.financial_list_income || row.finanical_list_income || "",
      "default_type": row.default_type || "",
      "السماح بفرق العملة": row.allow_trans_with_diff_curr ? "1" : "0",
      "احتساب فروقات العملة": row.iscalc_curr_diff_rates ? "1" : "0",
      "نوع الحركة": String(row.transaction_type ?? "0"),
      "أقصى مبلغ حركة": String(row.max_transaction_amount ?? 0),
      "أقصى رصيد": String(row.max_balance_amount ?? 0),
      "ملاحظات": row.notes || "",
      "الحالة": row.status || "",
    }))

    const worksheet = XLSX.utils.json_to_sheet(templateRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Accounts Template")
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = typeId ? `accounts_export_type_${typeId}.xlsx` : "accounts_export_all.xlsx"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const loadData = async () => {
    setLoading(true)
    setError("")
    try {
      const [typesRes, accountsRes, assetsRes, liabilitiesRes, incomeRes, currenciesRes] = await Promise.all([
        fetch("/api/account-classification-types"),
        fetch("/api/accounts?type=1"),
        fetch("/api/balance-sheet-assets-items"),
        fetch("/api/balance-sheet-liabilities-items"),
        fetch("/api/income-statement-items"),
        fetch("/api/exchange-rates"),
      ])

      if (!typesRes.ok || !accountsRes.ok) {
        setError("Failed to load data")
        return
      }

      const typesData = await typesRes.json()
      const accountsData = await accountsRes.json()
      const assetsData = assetsRes.ok ? await assetsRes.json() : []
      const liabilitiesData = liabilitiesRes.ok ? await liabilitiesRes.json() : []
      const incomeData = incomeRes.ok ? await incomeRes.json() : []
      const currenciesData = currenciesRes.ok ? await currenciesRes.json() : { rates: [] }

      setTypes(Array.isArray(typesData) ? typesData : [])
      setCurrencies(Array.isArray(currenciesData?.rates) ? currenciesData.rates : [])
      setBalanceSheetAssets(Array.isArray(assetsData) ? assetsData : [])
      setBalanceSheetLiabilities(Array.isArray(liabilitiesData) ? liabilitiesData : [])
      setIncomeStatementItems(Array.isArray(incomeData) ? incomeData : [])
      setAccounts(
        (Array.isArray(accountsData) ? accountsData : [])
          .map(normalizeAccountRecord)
          .filter((account) => Number(account.type ?? 0) === 1),
      )
    } catch (err) {
      console.error(err)
      setError("Error loading data")
    } finally {
      setLoading(false)
    }
  }

  const refreshAccounts = async () => {
    setError("")
    try {
      const response = await fetch("/api/accounts?type=1")
      if (!response.ok) {
        setError("Failed to load accounts")
        return
      }

      const accountsData = await response.json()
      setAccounts((Array.isArray(accountsData) ? accountsData : []).map(normalizeAccountRecord))
    } catch (err) {
      console.error(err)
      setError("Error loading accounts")
    }
  }

  const accountScheme = useMemo(
    () => ({
      name: "AccountsScheme",
      columns: [
        { header: "رقم الحساب", name: "code", width: 180, isReadOnly: true },
        { header: "اسم الحساب", name: "name", width: "*", minWidth: 320, isReadOnly: true },
        { header: "القائمة المالية", name: "finanical_list_name", width: 240, isReadOnly: true },
        { header: "الحالة", name: "status", width: 160, isReadOnly: true },
      ],
    }),
    [],
  )

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const matchSearch =
        !search ||
        account.code.toLowerCase().includes(search.toLowerCase()) ||
        account.name.toLowerCase().includes(search.toLowerCase())
      const matchFinancialList = !filterFinancialList || String(account.finanical_list_id) === filterFinancialList
      const matchStatus = !filterStatus || account.status === filterStatus
      return matchSearch && matchFinancialList && matchStatus
    })
  }, [accounts, search, filterFinancialList, filterStatus])

  const stats = useMemo(
    () => [
      { label: "إجمالي الحسابات", value: accounts.length, color: "bg-blue-50" },
      {
        label: "الميزانية العمومية",
        value: accounts.filter((item) => Number(item.finanical_list_id) === 1).length,
        color: "bg-green-50",
      },
      {
        label: "قائمة الدخل",
        value: accounts.filter((item) => Number(item.finanical_list_id) === 2).length,
        color: "bg-amber-50",
      },
      {
        label: "تقييم بضاعة",
        value: accounts.filter((item) => Number(item.finanical_list_id) === 3).length,
        color: "bg-slate-50",
      },
    ],
    [accounts],
  )

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      name_lang2: "",
      type: types[0] ? String(types[0].id) : "",
      father_id: "",
      level_no: "1",
      finanical_list_id: "1",
      currency_id: "",
      allow_trans_with_diff_curr: false,
      iscalc_curr_diff_rates: false,
      transaction_type: "0",
      max_transaction_amount: "0",
      max_balance_amount: "0",
      notes: "",
      status: "نشط",
    })
    setEditingId(null)
  }

  const handleNew = () => {
    // Open unified accounts as a local dialog (like فاتورة جديدة)
    setSelectedUnifiedAccountId(null)
    setShowUnifiedPopup(true)
  }

  const handleOpenUnifiedAccount = (account: Account) => {
    setSelectedUnifiedAccountId(account.id)
    setShowUnifiedPopup(true)
  }

  

  const handleEdit = (account: Account) => {
    setFormData({
      code: account.code || "",
      name: account.name || "",
      name_lang2: account.name_lang2 || "",
      type: String(account.type || ""),
      father_id: account.father_id ? String(account.father_id) : "",
      level_no: String(account.level_no || 1),
      finanical_list_id: String(account.finanical_list_id || 1),
      currency_id: account.currency_id ? String(account.currency_id) : "",
      allow_trans_with_diff_curr: Boolean(account.allow_trans_with_diff_curr),
      iscalc_curr_diff_rates: Boolean(account.iscalc_curr_diff_rates),
      transaction_type: String(account.transaction_type || 0),
      max_transaction_amount: String(account.max_transaction_amount || 0),
      max_balance_amount: String(account.max_balance_amount || 0),
      notes: account.notes || "",
      status: account.status || "نشط",
    })
    setEditingId(account.id)
    setError("")
    setMessage("")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setError("")
    setMessage("")

    if (!formData.code.trim() || !formData.name.trim()) {
      setError("Code and Name are required")
      return
    }

    try {
      setSaving(true)
      const isEdit = editingId != null
      const url = isEdit ? `/api/accounts/${editingId}` : "/api/accounts"
      const method = isEdit ? "PUT" : "POST"

      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        name_lang2: formData.name_lang2.trim() || null,
        type: formData.type ? Number(formData.type) : null,
        father_id: formData.father_id ? Number(formData.father_id) : null,
        level_no: Number(formData.level_no || 1),
        finanical_list_id: Number(formData.finanical_list_id || 1),
        currency_id: formData.currency_id ? Number(formData.currency_id) : null,
        allow_trans_with_diff_curr: formData.allow_trans_with_diff_curr,
        iscalc_curr_diff_rates: formData.iscalc_curr_diff_rates,
        transaction_type: Number(formData.transaction_type || 0),
        max_transaction_amount: Number(formData.max_transaction_amount || 0),
        max_balance_amount: Number(formData.max_balance_amount || 0),
        notes: formData.notes.trim() || null,
        status: formData.status,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "Failed to save account")
        return
      }

      let savedAccount: any = {}
      try {
        savedAccount = await response.json()
      } catch {
        savedAccount = {}
      }

      const accountId = Number(savedAccount?.id ?? editingId ?? 0)
      const nextAccount: Account = {
        ...(editingId != null ? accounts.find((item) => Number(item.id) === Number(editingId)) : {}),
        ...savedAccount,
        id: accountId,
        code: savedAccount?.code || savedAccount?.account_code || formData.code.trim(),
        name: savedAccount?.name || savedAccount?.account_name || formData.name.trim(),
        name_lang2: savedAccount?.name_lang2 || formData.name_lang2.trim() || null,
        type: Number(savedAccount?.type ?? formData.type ?? 0),
        father_id: savedAccount?.father_id ?? (formData.father_id ? Number(formData.father_id) : null),
        level_no: Number(savedAccount?.level_no ?? formData.level_no ?? 1),
        finanical_list_id: Number(savedAccount?.finanical_list_id ?? formData.finanical_list_id ?? 1),
        finanical_list_name:
          savedAccount?.finanical_list_name ||
          (Number(savedAccount?.finanical_list_id ?? formData.finanical_list_id ?? 1) === 1
            ? "الميزانية العمومية"
            : Number(savedAccount?.finanical_list_id ?? formData.finanical_list_id ?? 1) === 2
              ? "قائمة الدخل"
              : Number(savedAccount?.finanical_list_id ?? formData.finanical_list_id ?? 1) === 3
                ? "تقييم بضاعة"
                : ""),
        currency_id: savedAccount?.currency_id ?? (formData.currency_id ? Number(formData.currency_id) : null),
        allow_trans_with_diff_curr: Number(savedAccount?.allow_trans_with_diff_curr ?? (formData.allow_trans_with_diff_curr ? 1 : 0)),
        iscalc_curr_diff_rates: Boolean(savedAccount?.iscalc_curr_diff_rates ?? formData.iscalc_curr_diff_rates),
        transaction_type: Number(savedAccount?.transaction_type ?? formData.transaction_type ?? 0),
        max_transaction_amount: Number(savedAccount?.max_transaction_amount ?? formData.max_transaction_amount ?? 0),
        max_balance_amount: Number(savedAccount?.max_balance_amount ?? formData.max_balance_amount ?? 0),
        notes: savedAccount?.notes ?? (formData.notes.trim() || null),
        status: savedAccount?.status || formData.status,
      }

      setAccounts((prev) => {
        const next = [...prev]
        const index = next.findIndex((item) => Number(item.id) === accountId)
        if (index >= 0) {
          next[index] = nextAccount
        } else {
          next.unshift(nextAccount)
        }
        return next
      })

      resetForm()
      setDialogOpen(false)
      setMessage(isEdit ? "تم تعديل الحساب بنجاح" : "تم إنشاء الحساب بنجاح")
    } catch (err) {
      console.error(err)
      setError("Error saving account")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف الحساب؟")) return

    try {
      const response = await fetch(`/api/accounts/${id}`, { method: "DELETE" })
      if (!response.ok) {
        setError("Failed to delete account")
        return
      }
      setMessage("تم حذف الحساب بنجاح")
      setAccounts((prev) => prev.filter((item) => Number(item.id) !== Number(id)))
    } catch (err) {
      console.error(err)
      setError("Error deleting account")
    }
  }

  if (loading) {
    return <div className="p-6 text-center">جاري التحميل...</div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 lg:p-6" dir="rtl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-muted-foreground">نظام الحسابات</p>
            <h2 className="text-2xl font-semibold">إدارة الحسابات</h2>
            <p className="text-sm text-muted-foreground">إدارة الحسابات المحاسبية وتصنيفاتها</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 gap-2" variant="outline" onClick={() => setShowExcelImportDialog(true)}>
              <FileSpreadsheet className="h-4 w-4" /> استيراد من اكسل
            </Button>
            <Button className="h-11 gap-2" onClick={handleNew}>
              <Plus className="h-4 w-4" /> حساب جديد
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className={stat.color}>
              <CardContent className="p-6 text-right">
                <p className="text-sm font-medium text-slate-600">{stat.label}</p>
                <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>اضافة حساب او تعديل حساب</DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {error && (
                <Alert className="border-red-200 bg-red-50 text-red-900">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {message && (
                <Alert className="border-green-200 bg-green-50 text-green-900">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <Label className="mb-2 block">كود الحساب</Label>
                  <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-2 block">اسم الحساب</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <Label className="mb-2 block">الاسم بلغة أخرى</Label>
                  <Input value={formData.name_lang2} onChange={(e) => setFormData({ ...formData, name_lang2: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-2 block">نوع الحساب</Label>
                  <Select value={formData.type} onValueChange={(val) => setFormData({ ...formData, type: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر نوع الحساب" />
                    </SelectTrigger>
                    <SelectContent>
                      {types.map((type) => (
                        <SelectItem key={type.id} value={String(type.id)}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <Label className="mb-2 block">القائمة المالية</Label>
                  <PrimeDropdown
                    inputId="financial_list_id"
                    value={formData.finanical_list_id}
                    options={[
                      { label: "الميزانية العمومية", value: "1" },
                      { label: "قائمة الدخل", value: "2" },
                      { label: "تقييم بضاعة", value: "3" },
                    ]}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="اختر القائمة المالية"
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    onChange={(e: any) => setFormData({ ...formData, finanical_list_id: e.value })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">الحالة</Label>
                  <PrimeDropdown
                    inputId="status"
                    value={formData.status}
                    options={[
                      { label: "نشط", value: "نشط" },
                      { label: "موقوف", value: "موقوف" },
                      { label: "محذوف", value: "محذوف" },
                    ]}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="اختر الحالة"
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    onChange={(e: any) => setFormData({ ...formData, status: e.value })}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">ملاحظات</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="h-24" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                إلغاء
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "جاري الحفظ..." : "حفظ الحساب"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showExcelImportDialog} onOpenChange={(open) => {
          setShowExcelImportDialog(open)
          if (!open) {
            resetExcelImport()
          }
        }}>
          <DialogContent
            className="w-full max-w-6xl max-h-[92vh] overflow-hidden p-0 flex flex-col"
            dir="rtl"
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 px-4 pb-2 pt-4 sm:px-6 sm:pt-6">
                <DialogHeader>
                  <DialogTitle>استيراد الحسابات من اكسل</DialogTitle>
                </DialogHeader>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:px-6">
              <div className="flex w-full flex-nowrap items-end gap-2 overflow-x-auto pb-1">
                <div className="min-w-[260px] shrink-0">
                  <Label className="mb-2 block text-sm">نوع هيكل الحسابات الافتراضي</Label>
                  <Select value={excelTemplateType} onValueChange={(value) => {
                    setExcelTemplateType(value)
                  }}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="اختر" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بلا</SelectItem>
                      <SelectItem value="commercial">مؤسسة تجارية</SelectItem>
                      <SelectItem value="commercial_continuous_inventory">مؤسسة تجارية - جرد مستمر</SelectItem>
                      <SelectItem value="services">خدمات</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" className="gap-2 shrink-0" onClick={() => { void downloadExcelTemplate(excelTemplateType) }}>
                  <Download className="h-4 w-4" /> تحميل قالب
                </Button>
                <Button
                  variant="secondary"
                  className="gap-2 shrink-0"
                  onClick={() => excelInputRef.current?.click()}
                  disabled={excelProcessing || excelImporting}
                >
                  <Upload className="h-4 w-4" /> اختيار ملف
                </Button>
                <Input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelFileChange} />
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  الملف يجب أن يحتوي على الأعمدة: رقم الحساب، اسم الحساب، اسم الحساب انجليزي، العملة، القائمة المالية، أصول الميزانية، خصوم الميزانية، وبند قائمة الدخل.
                  إذا كان رقم الحساب أقصر من 8 أحرف سيتم ضبطه تلقائياً إلى 8 أحرف إنجليزية/أرقام.
                </AlertDescription>
              </Alert>

              {excelFile && <div className="text-sm text-muted-foreground">الملف المحدد: {excelFile.name}</div>}

              {excelProcessing && <div className="text-sm text-muted-foreground">جاري قراءة ملف Excel...</div>}

              {excelExportLoading && <div className="text-sm text-muted-foreground">جاري تحميل الحسابات من accounts.json...</div>}
              {excelExportError && <Alert className="border-red-200 bg-red-50 text-red-900"><AlertDescription>{excelExportError}</AlertDescription></Alert>}

              {excelStep === "upload" && excelTemplateType !== "none" && excelExportRows.length > 0 && (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    تم تحميل {excelExportRows.length} حسابًا للنوع المحدد.
                  </div>
                  <div className="w-full max-h-[260px] overflow-hidden rounded-md border">
                    <DataGridView
                      style={{ maxHeight: "260px", minHeight: "180px", width: "100%" }}
                      idProperty="rowIndex"
                      scheme={excelGridScheme}
                      dataSource={excelExportRows.map(buildExportGridRow)}
                      showContextMenu={false}
                      copyItemStoreDown={true}
                      dontConvertToCards={true}
                      isReport={true}
                      hideSearch={true}
                      allowSorting={true}
                    />
                  </div>
                </div>
              )}

              {excelStep === "preview" && excelRows.length > 0 && (
                <div className="space-y-4">
                  <div className="w-full max-h-[70vh] overflow-hidden rounded-md border">
                    <DataGridView
                      style={{ maxHeight: "70vh", minHeight: "50vh", width: "100%" }}
                      idProperty="rowIndex"
                      scheme={excelGridScheme}
                      dataSource={excelRows.map(buildPreviewGridRow)}
                      showContextMenu={false}
                      copyItemStoreDown={true}
                      dontConvertToCards={true}
                      isReport={true}
                      hideSearch={true}
                      allowSorting={true}
                    />
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm">
                    <span className="rounded-full bg-green-50 px-3 py-1 text-green-700">صالحة: {excelRows.filter((row) => row.isValid).length}</span>
                    <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">غير صالحة: {excelRows.filter((row) => !row.isValid).length}</span>
                  </div>
                </div>
              )}

              {excelStep === "result" && excelSummary && (
                <div className="space-y-3">
                  <Alert className="border-green-200 bg-green-50 text-green-900">
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      تم الاستيراد بنجاح: {excelSummary.success}، فشل: {excelSummary.failed}، مكررة: {excelSummary.duplicates}
                    </AlertDescription>
                  </Alert>
                  {excelSummary.errors.length > 0 && (
                    <Alert className="border-red-200 bg-red-50 text-red-900">
                      <AlertDescription>
                        <div className="space-y-1">
                          {excelSummary.errors.slice(0, 10).map((item) => (
                            <div key={item}>{item}</div>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
              </div>

              <div className="shrink-0 border-t bg-background px-4 py-4 sm:px-6">
                {excelImporting && excelImportProgress.total > 0 && (
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>جاري استيراد البيانات...</span>
                      <span>
                        {excelImportProgress.current}/{excelImportProgress.total}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all duration-200"
                        style={{
                          width: `${Math.min(100, Math.round((excelImportProgress.current / excelImportProgress.total) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowExcelImportDialog(false)} disabled={excelImporting}>
                    إلغاء
                  </Button>
                  <Button variant="secondary" onClick={resetExcelImport} disabled={excelProcessing || excelImporting}>
                    إعادة ضبط
                  </Button>
                  <Button
                    onClick={importExcelAccounts}
                    disabled={excelProcessing || excelImporting || getRowsToImport().length === 0}
                  >
                    {excelImporting ? "جاري الاستيراد..." : "استيراد البيانات"}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Search & Filters */}
        <Card>
          <CardHeader>
            <CardTitle>قائمة الحسابات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="mb-2 block text-sm">اسم الحساب</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث برقم أو اسم الحساب" className="h-10" />
              </div>
              <div>
                <Label className="mb-2 block text-sm">القائمة المالية</Label>
                <PrimeDropdown
                  inputId="filterFinancialList"
                  value={filterFinancialList || ""}
                  options={[
                    { label: "كل القوائم المالية", value: "" },
                    { label: "الميزانية العمومية", value: "1" },
                    { label: "قائمة الدخل", value: "2" },
                    { label: "تقييم بضاعة", value: "3" },
                  ]}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="كل القوائم المالية"
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  onChange={(e: any) => setFilterFinancialList(String(e.value ?? ""))}
                />
              </div>
              <div>
                <Label className="mb-2 block text-sm">الحالة</Label>
                <PrimeDropdown
                  inputId="filterStatus"
                  value={filterStatus || ""}
                  options={[
                    { label: "كل الحالات", value: "" },
                    { label: "نشط", value: "نشط" },
                    { label: "موقوف", value: "موقوف" },
                  ]}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="كل الحالات"
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  onChange={(e: any) => setFilterStatus(String(e.value ?? ""))}
                />
              </div>
              <div className="flex items-end">
                <Button variant="secondary" className="h-10 w-full" onClick={refreshAccounts}>
                  <RefreshCw className="mr-2 h-4 w-4" /> تحديث
                </Button>
              </div>
            </div>

            {error && (
              <Alert className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {message && (
              <Alert className="mb-4 border-green-400 bg-green-50 text-green-700">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}

            {/* Table */}
            <div className="h-[520px] min-h-[260px] overflow-x-auto overflow-y-hidden rounded-md border border-muted">
              <DataGridView
                scheme={accountScheme}
                dataSource={filteredAccounts}
                dontConvertToCards={true}
                onRowDoubleClick={(item: Account) => handleOpenUnifiedAccount(item)}
              />
            </div>
          </CardContent>
        </Card>
        {/* Unified accounts opened as local popup (like فاتورة جديدة) */}
        <Dialog open={showUnifiedPopup} onOpenChange={setShowUnifiedPopup}>
          <DialogContent
            hideCloseButton
            className="w-full max-w-[95vw] sm:max-w-[90vw] md:max-w-[85vw] lg:max-w-[100vh] h-[95vh] max-h-[95vh] p-0 gap-0 flex flex-col overflow-x-hidden overflow-y-hidden"
            dir="rtl"
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <div className="flex min-w-0 flex-1 overflow-hidden">
              {showUnifiedPopup && (
                <UnifiedAccounts
                  action={selectedUnifiedAccountId == null ? "new" : undefined}
                  accountId={selectedUnifiedAccountId}
                  inWindowManager
                  closeWindow={() => {
                    setShowUnifiedPopup(false)
                    setSelectedUnifiedAccountId(null)
                  }}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
