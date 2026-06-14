"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import AccountSearchDialog, { AccountItem } from "@/components/customer/account-search-dialog"
import SearchCostCenterDialog from "@/components/customer/search-cost-center-dialog"
import SearchAccountClassificationDialog from "@/components/customer/search-account-classification-dialog"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ProgressSpinner from "../ProgressSpinner/ProgressSpinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { Plus, AlertCircle, Search, X } from "lucide-react"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"
import DataGridView from "../common/DataGridView"
import Messages from "../common/Messages"
import { isSameDay } from "date-fns"

interface AccountType {
  id: number
  name: string
}

interface FormState {
  id: number
  code: string
  name: string
  name_lang2: string
  type: string
  father_id: string
  level_no: string
  finanical_list_id: string
  finanical_list_assests_id: string
  finanical_list_liabilities_id: string
  finanical_list_income_id: string
  currency_id: string
  allow_trans_with_diff_curr: string
  iscalc_curr_diff_rates: boolean
  transaction_type: string
  transaction_type_action: string
  max_transaction_amount: string
  max_transaction_amount_action: string
  max_balance_amount: string
  max_balance_action: string
  budget_exceeding_perc: string
  budget_exceeding_action: string
  unified_report_account_no: string
  unified_report_group_code: string
  notes: string
  show_notes_in_transactions_soa: boolean
  status: string
}

interface UnifiedAccountsProps {
  action?: "new"
  accountId?: number | null
  onOpenChange?: (open: boolean) => void
  inWindowManager?: boolean
  closeWindow?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

export default function UnifiedAccounts({ action, accountId, onOpenChange, inWindowManager, closeWindow, onDirtyChange }: UnifiedAccountsProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("main")
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [types, setTypes] = useState<AccountType[]>([])
  const [voucherTypes, setVoucherTypes] = useState<any[]>([])
  const [currencies, setCurrencies] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [costCenters, setCostCenters] = useState<any[]>([])
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [stopTransactionRows, setStopTransactionRows] = useState<any[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [statusMessage, setMessage] = useState("")
  const [financialListType, setFinancialListType] = useState("1") // الميزانية العمومية, قائمة الدخل, تقييم بضاعة
  const [balanceSheetAssets, setBalanceSheetAssets] = useState<any[]>([])
  const [balanceSheetLiabilities, setBalanceSheetLiabilities] = useState<any[]>([])
  const [incomeStatementAccounts, setIncomeStatementAccounts] = useState<any[]>([])
  const [merchandiseAccounts, setMerchandiseAccounts] = useState<any[]>([])
  const [costCenterTypes, setCostCenterTypes] = useState<any[]>([])
  const [showCostCenterTypeForm, setShowCostCenterTypeForm] = useState(false)
  const [newCostCenterTypeName, setNewCostCenterTypeName] = useState("")
  const [costCenterTypeError, setCostCenterTypeError] = useState("")
  const [costCenterTypeMessage, setCostCenterTypeMessage] = useState("")
  const [searchCostCenterOpen, setSearchCostCenterOpen] = useState(false)
  const [selectedCostCenterType, setSelectedCostCenterType] = useState<any | null>(null)
  const [selectedCostCenterTypeIndex, setSelectedCostCenterTypeIndex] = useState<number>(-1)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number>(-1)

  // Account Classification States
  const [classificationTypes, setClassificationTypes] = useState<any[]>([])
  const classificationTypesRef = useRef<any[]>([])
  const [defaultClassificationTypes, setDefaultClassificationTypes] = useState<any[]>([]) 
  const [accountClassifications, setAccountClassifications] = useState<any[]>([])
  const [allClassifications, setAllClassifications] = useState<any[]>([])
  const [showClassificationTypeForm, setShowClassificationTypeForm] = useState(false)
  const [newClassificationTypeName, setNewClassificationTypeName] = useState("")
  const [classificationTypeError, setClassificationTypeError] = useState("")
  const [classificationTypeMessage, setClassificationTypeMessage] = useState("")
  const [showClassificationForm, setShowClassificationForm] = useState(false)
  const [newClassificationTypeId, setNewClassificationTypeId] = useState<string | null>(null)
  const [newClassificationName, setNewClassificationName] = useState("")
  const [classificationError, setClassificationError] = useState("")
  const [searchAccountClassificationOpen, setSearchAccountClassificationOpen] = useState(false)
  const [selectedClassificationType, setSelectedClassificationType] = useState<any | null>(null)
  const [selectedClassificationTypeIndex, setSelectedClassificationTypeIndex] = useState<number>(-1)
  const [showDeleteClassificationConfirm, setShowDeleteClassificationConfirm] = useState(false)
  const [deleteClassificationConfirmIndex, setDeleteClassificationConfirmIndex] = useState<number>(-1)
  const [showAccountDeleteConfirm, setShowAccountDeleteConfirm] = useState(false)
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)

  // Search Modal States
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [searchTarget, setSearchTarget] = useState<"father" | "code">("father")
  const [fatherAccountCode, setFatherAccountCode] = useState("")
  const [fatherAccountName, setFatherAccountName] = useState("")

  // Refs
  const costCenterTypeGridRef = useRef<any>(null)
  const classificationTypeGridRef = useRef<any>(null)
  const accountClassificationGridRef = useRef<any>(null)
  const accountNameInputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<any>(null)
  const fetchingNextCodeRef = useRef(false)
  const dialogWasOpenRef = useRef(false)
  const dirtySnapshotRef = useRef("")

  const serializeAccountSnapshot = useCallback(
    (values: {
      formData: FormState
      financialListType: string
      fatherAccountName: string
      stopTransactionRows: any[]
      costCenterTypes: any[]
      accountClassifications: any[]
    }) =>
      JSON.stringify({
        formData: {
          id: values.formData.id,
          code: values.formData.code,
          name: values.formData.name,
          name_lang2: values.formData.name_lang2,
          type: values.formData.type,
          father_id: values.formData.father_id,
          level_no: values.formData.level_no,
          finanical_list_id: values.formData.finanical_list_id,
          finanical_list_assests_id: values.formData.finanical_list_assests_id,
          finanical_list_liabilities_id: values.formData.finanical_list_liabilities_id,
          finanical_list_income_id: values.formData.finanical_list_income_id,
          currency_id: values.formData.currency_id,
          allow_trans_with_diff_curr: values.formData.allow_trans_with_diff_curr,
          iscalc_curr_diff_rates: values.formData.iscalc_curr_diff_rates,
          transaction_type: values.formData.transaction_type,
          transaction_type_action: values.formData.transaction_type_action,
          max_transaction_amount: values.formData.max_transaction_amount,
          max_transaction_amount_action: values.formData.max_transaction_amount_action,
          max_balance_amount: values.formData.max_balance_amount,
          max_balance_action: values.formData.max_balance_action,
          budget_exceeding_perc: values.formData.budget_exceeding_perc,
          budget_exceeding_action: values.formData.budget_exceeding_action,
          unified_report_account_no: values.formData.unified_report_account_no,
          unified_report_group_code: values.formData.unified_report_group_code,
          notes: values.formData.notes,
          show_notes_in_transactions_soa: values.formData.show_notes_in_transactions_soa,
          status: values.formData.status,
        },
        financialListType: values.financialListType,
        fatherAccountName: values.fatherAccountName,
        stopTransactionRows: values.stopTransactionRows.map((row) => ({
          voucher_types_id: row.voucher_types_id,
          is_stopped: Boolean(row.is_stopped),
          stop_date: row.stop_date || "",
        })),
        costCenterTypes: values.costCenterTypes.map((type) => ({
          id: type.id,
          required_in_transactions: type.required_in_transactions ?? 1,
          default_cost_center_id: type.default_cost_center_id ?? null,
          cost_center_name: type.cost_center_name || "",
        })),
        accountClassifications: values.accountClassifications.map((item) => ({
          id: item.id ?? null,
          classification_type_id: item.classification_type_id ?? null,
          classification_id: item.classification_id ?? null,
          classification_name: item.classification_name || "",
        })),
      }),
    [],
  )

  const [formData, setFormData] = useState<FormState>({
    id: 0,
    code: "",
    name: "",
    name_lang2: "",
    type: "",
    father_id: "",
    level_no: "1",
    finanical_list_id: "1",
    finanical_list_assests_id: "",
    finanical_list_liabilities_id: "",
    finanical_list_income_id: "",
    currency_id: "",
    allow_trans_with_diff_curr: "0",
    iscalc_curr_diff_rates: false,
    transaction_type: "0",
    transaction_type_action: "0",
    max_transaction_amount: "0",
    max_transaction_amount_action: "0",
    max_balance_amount: "0",
    max_balance_action: "",
    budget_exceeding_perc: "",
    budget_exceeding_action: "",
    unified_report_account_no: "",
    unified_report_group_code: "",
    notes: "",
    show_notes_in_transactions_soa: false,
    status: "نشط",
  })

  const clearBudgetSelectionMessage = useCallback(() => {
    if (formData.finanical_list_assests_id || formData.finanical_list_liabilities_id) {
      if (error === "يجب تحديد أصول الميزانية وخصومها") {
        setError("")
      }
      messagesRef.current?.clear?.()
    }
  }, [error, formData.finanical_list_assests_id, formData.finanical_list_liabilities_id])

  const currentSnapshot = useMemo(
    () =>
      serializeAccountSnapshot({
        formData,
        financialListType,
        fatherAccountName,
        stopTransactionRows,
        costCenterTypes,
        accountClassifications,
      }),
    [serializeAccountSnapshot, formData, financialListType, fatherAccountName, stopTransactionRows, costCenterTypes, accountClassifications],
  )

  useEffect(() => {
    if (onDirtyChange) {
      onDirtyChange(currentSnapshot !== dirtySnapshotRef.current)
    }
  }, [currentSnapshot, onDirtyChange])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setError("")
    try {
      const [typesRes, accountsRes] = await Promise.all([fetch("/api/account-classification-types"), fetch("/api/accounts")])

      if (!typesRes.ok || !accountsRes.ok) {
        const statusMsg = !typesRes.ok ? `Types API (${typesRes.status})` : `Accounts API (${accountsRes.status})`
        setError(`Failed to load data: ${statusMsg}`)
        console.error(`API Error: ${statusMsg}`)
      }

      const typesData = await typesRes.json()
      const accountsData = await accountsRes.json()
      let currenciesData: any[] = []
      let companiesData: any[] = []
      let voucherTypesData: any[] = []
      let costCenterTypesData: any[] = []
      let costCentersData: any[] = []
      let classificationTypesData: any[] = []
      let classificationsData: any[] = []
      let balanceSheetAssetsData: any[] = []
      let balanceSheetLiabilitiesData: any[] = []
      let incomeStatementData: any[] = []

      try {
        const ratesRes = await fetch("/api/exchange-rates")
        if (ratesRes.ok) {
          const ratesJson = await ratesRes.json()
          currenciesData = Array.isArray(ratesJson?.rates) ? ratesJson.rates : []
        }
      } catch (_) {
        try {
          const curRes = await fetch("/api/currencies")
          if (curRes.ok) currenciesData = await curRes.json()
        } catch (_) {}
      }

      try {
        const typesRes = await fetch("/api/cost-center-types")
        if (typesRes.ok) {
          costCenterTypesData = await typesRes.json()
        }
      } catch (_) {}
      try {
        const voucherTypesRes = await fetch("/api/vouchers/voucher-types")
        if (voucherTypesRes.ok) {
          voucherTypesData = await voucherTypesRes.json()
        }
      } catch (_) {}
      try {
        const centersRes = await fetch("/api/cost-centers")
        if (centersRes.ok) {
          costCentersData = await centersRes.json()
          // Sort by ID in ascending order
          if (Array.isArray(costCentersData)) {
            costCentersData.sort((a, b) => (a.id || 0) - (b.id || 0))
          }
        }
      } catch (_) {}

      try {
        const classTypesRes = await fetch("/api/account-classification-types")
        if (classTypesRes.ok) {
          classificationTypesData = await classTypesRes.json()
        }
      } catch (_) {}

      try {
        const classificationsRes = await fetch("/api/account-classifications")
        if (classificationsRes.ok) {
          classificationsData = await classificationsRes.json()
          // Sort by ID in ascending order
          if (Array.isArray(classificationsData)) {
            classificationsData.sort((a, b) => (a.id || 0) - (b.id || 0))
          }
        }
      } catch (_) {}

      try {
        const assetsRes = await fetch("/api/balance-sheet-assets-items")

        if (assetsRes.ok) {
          const json = await assetsRes.json()
          console.log("Fetched balance sheet assets:", json)
          balanceSheetAssetsData = Array.isArray(json)
            ? json.map((item: any) => ({
                ...item,
                id: item.id != null ? Number(item.id) : item.id,
                name: item.name ?? item.asset_name ?? item.label ?? "",
              }))
            : []
        } else {
          console.warn(`Balance sheet assets API returned ${assetsRes.status}`)
        }
      } catch (err) {
        console.warn("Error fetching balance sheet assets:", err)
      }
      try {
        const liabilitiesRes = await fetch("/api/balance-sheet-liabilities-items")
        if (liabilitiesRes.ok) {
          const json = await liabilitiesRes.json()
          balanceSheetLiabilitiesData = Array.isArray(json)
            ? json.map((item: any) => ({
                ...item,
                id: item.id != null ? Number(item.id) : item.id,
                name: item.name ?? item.asset_name ?? item.label ?? "",
              }))
            : []
        } else {
          console.warn(`Balance sheet liabilities API returned ${liabilitiesRes.status}`)
        }
      } catch (err) {
        console.warn("Error fetching balance sheet liabilities:", err)
      }
      try {
        const incomeRes = await fetch("/api/income-statement-items")
        if (incomeRes.ok) {
          const json = await incomeRes.json()
          incomeStatementData = Array.isArray(json)
            ? json.map((item: any) => ({
                ...item,
                id: item.id != null ? Number(item.id) : item.id,
                name: item.name ?? item.asset_name ?? item.label ?? "",
              }))
            : []
        } else {
          console.warn(`Income statement API returned ${incomeRes.status}`)
        }
      } catch (err) {
        console.warn("Error fetching income statement:", err)
      }

      setTypes(Array.isArray(typesData) ? typesData : [])
      setAccounts(
        (Array.isArray(accountsData) ? accountsData : [])
          .map((item: any) => ({
            ...item,
            code: item.code || item.account_code || "",
            name: item.name || item.account_name || "",
            father_id: item.father_id != null ? Number(item.father_id) : item.parent_account_id != null ? Number(item.parent_account_id) : null,
            father_name: item.father_name || item.parent_account_name || "",
            type: Number(item.type || item.classification_type_id || 0),
            level_no: Number(item.level_no || 1),
            finanical_list_id: Number(item.finanical_list_id || 1),
          }))
          .filter((item: any) => Number(item.status ?? 1) !== 3),
      )
      setCurrencies(Array.isArray(currenciesData) ? currenciesData : [])
      setCompanies(Array.isArray(companiesData) ? companiesData : [])
      setVoucherTypes(Array.isArray(voucherTypesData) ? voucherTypesData : [])
      // Map state_status to status_id (1=اختياري, 2=اجباري, 3=ممنوع)
      const mappedCostCenterTypes = Array.isArray(costCenterTypesData)
        ? costCenterTypesData.map((type: any) => {
            const statusMap: { [key: string]: number } = {
              'اختياري': 1,
              'اجباري': 2,
              'ممنوع': 3
            }
            const state_status = type.state_status || 'اختياري'
            const required_in_transactions = statusMap[state_status] || 1
            return { ...type, state_status, required_in_transactions }
          })
        : []
      // Sort by ID in ascending order
      if (Array.isArray(mappedCostCenterTypes)) {
        mappedCostCenterTypes.sort((a, b) => (a.id || 0) - (b.id || 0))
      }
      setCostCenterTypes(mappedCostCenterTypes)
      setCostCenters(Array.isArray(costCentersData) ? costCentersData : [])
      setClassificationTypes(Array.isArray(classificationTypesData) ? classificationTypesData : [])
      classificationTypesRef.current = Array.isArray(classificationTypesData) ? classificationTypesData : []
      //setDefaultClassificationTypes(Array.isArray(classificationTypesData) ? classificationTypesData : [])
      setAllClassifications(Array.isArray(classificationsData) ? classificationsData : [])
      setAccountClassifications(Array.isArray(classificationsData) ? classificationsData : [])
      setBalanceSheetAssets(Array.isArray(balanceSheetAssetsData) ? balanceSheetAssetsData : [])
      setBalanceSheetLiabilities(Array.isArray(balanceSheetLiabilitiesData) ? balanceSheetLiabilitiesData : [])
      setIncomeStatementAccounts(Array.isArray(incomeStatementData) ? incomeStatementData : [])
      setCurrentIndex(0)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error("Error loading data:", err)
      setError(`Error loading data: ${errorMsg}`)
    }
  }

  const activeAccounts = useMemo(
    () => accounts.filter((account) => Number(account.status ?? 1) !== 3),
    [accounts],
  )

  const currentAccount = useMemo(() => activeAccounts[currentIndex] || null, [activeAccounts, currentIndex])

  const buildStopTransactionRows = useCallback((voucherTypesList: any[], stopRows: any[] = []) => {
    const stopByVoucherType = new Map<number, any>()
    stopRows.forEach((row) => {
      const voucherTypeId = Number(row?.voucher_types_id)
      if (!Number.isNaN(voucherTypeId) && voucherTypeId > 0) {
        stopByVoucherType.set(voucherTypeId, row)
      }
    })

    return voucherTypesList.map((voucherType) => {
      const voucherTypeId = Number(voucherType.id)
      const stopRow = stopByVoucherType.get(voucherTypeId)
      return {
        voucher_types_id: voucherTypeId,
        voucher_type_name: voucherType.name || "",
        is_stopped: Boolean(stopRow),
        stop_date: stopRow?.stop_date ? String(stopRow.stop_date).slice(0, 10) : "",
      }
    })
  }, [])

  useEffect(() => {
    if (!currentAccount) return
    setStopTransactionRows(buildStopTransactionRows(voucherTypes, (currentAccount as any).stop_transactions || []))
  }, [currentAccount, voucherTypes, buildStopTransactionRows])

  const visibleStopTransactionRows = useMemo(() => {
    const hiddenNames = ["طلبية مبيعات", "طلبية مشتريات", "إرسالية مبيعات", "إرسالية مشتريات"]

    return stopTransactionRows.filter((row) => {
      const voucherTypeName = String(row?.voucher_type_name || "")
      return !hiddenNames.some((hiddenName) => voucherTypeName.includes(hiddenName))
    })
  }, [stopTransactionRows])

  // Get leaf cost centers (not parents of any other cost center)
  const leafCostCenters = useMemo(() => {
    const parentIds = new Set(
      costCenters
        .map((cc: any) => cc.parent_id)
        .filter((parentId: any) => parentId != null && parentId !== "")
    )
    return costCenters.filter((cc: any) => !parentIds.has(cc.id))
  }, [costCenters])

  const costCenterScheme = useMemo(
    () => ({
      name: "CostCenterScheme",
      columns: [
        { header: "الرقم", name: "id", width: 80, isReadOnly: true },
        { header: "اسم مركز الكلفة", name: "name", width: 240, isReadOnly: true },
        { header: "نوع مركز الكلفة", name: "cost_type_name", width: 180, isReadOnly: true },
        { header: "المركز الرئيسي", name: "parent_name", width: 180, isReadOnly: true },
        { header: "المستوى", name: "level", width: 120, isReadOnly: true },
        { header: "الحالة", name: "status", width: 120, isReadOnly: true },
      ],
    }),
    [],
  )

  const handleCostCenterTypeSearchClick = useCallback((rowIndex: number) => {
    setSelectedCostCenterTypeIndex(rowIndex)
    setSelectedCostCenterType(costCenterTypes[rowIndex])
    setSearchCostCenterOpen(true)
  }, [costCenterTypes])

  const handleCostCenterTypeDeleteClick = useCallback((rowIndex: number) => {
    setDeleteConfirmIndex(rowIndex)
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (deleteConfirmIndex >= 0 && deleteConfirmIndex < costCenterTypes.length) {
      const typeToDelete = costCenterTypes[deleteConfirmIndex]
      const hasCostCenter = typeToDelete?.cost_center_name && typeToDelete.cost_center_name.trim() !== ""
      
      const updatedList = costCenterTypes.map((type, idx) => {
        if (idx === deleteConfirmIndex) {
          return {
            ...type,
            default_cost_center_id: null,
            cost_center_name: ""
          }
        }
        return type
      })
      setCostCenterTypes(updatedList)
      
      // Only show success message if there was a cost center to delete
      if (hasCostCenter) {
        setCostCenterTypeMessage("تم حذف مركز التكلفة بنجاح")
      }
    }
    setShowDeleteConfirm(false)
    setDeleteConfirmIndex(-1)
  }, [deleteConfirmIndex, costCenterTypes])

  const handleCostCenterTypeStatusChange = useCallback((rowIndex: number) => {
    const statusValues = ["اختياري", "اجباري", "ممنوع"]
    const statusIds = [1, 2, 3] // Corresponding IDs for database
    setCostCenterTypes((prevCostCenterTypes) => {
      const updatedList = prevCostCenterTypes.map((type, idx) => {
        if (idx === rowIndex) {
          const currentStatus = type.state_status || "اختياري"
          const currentIndex = statusValues.indexOf(currentStatus)
          const nextIndex = (currentIndex + 1) % statusValues.length
          // Only update status and status_id, preserve all other data including cost center
          return {
            ...type,
            state_status: statusValues[nextIndex],
            required_in_transactions: statusIds[nextIndex]
          }
        }
        return type
      })
      return updatedList
    })
  }, [costCenterTypes])

  const handleDeleteClassificationType = useCallback((rowIndex: number) => {
    if (rowIndex >= 0 && rowIndex < classificationTypes.length) {
      const updatedList = classificationTypes.filter((_, idx) => idx !== rowIndex)
      setClassificationTypes(updatedList)
    }
  }, [classificationTypes])

  const costCenterTypeScheme = useMemo(
    () => ({
      name: "CostCenterTypeScheme",
      columns: [
        { header: "الرقم", name: "id", width: 80, isReadOnly: true },
        { header: "اسم نوع مركز الكلفة", name: "name", width: "*", minWidth: 250, isReadOnly: true },
        { header: "الحالة", name: "state_status", width: 150, isReadOnly: true },
        { header: "Required in Transactions", name: "required_in_transactions", width: 0, isReadOnly: true, visible: true },
        {
          name: 'btnStatusChange',
          header: ' ',
          width: 80,
          buttonBody: 'button',
          align: 'center',
          title: 'تغيير الحالة',
          iconType: 'edit',
          className: 'btn-status',
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            e.stopPropagation()
            handleCostCenterTypeStatusChange(ctx.row.index)
          },
          visible: true,
          visibleInColumnChooser: true
        },
        { header: "مركز التكلفة", name: "cost_center_name", width: 200, isReadOnly: true },
        {
          name: 'btnSearch',
          header: ' ',
          width: 65,
          buttonBody: 'button',
          align: 'center',
          title: 'بحث',
          iconType: 'search',
          className: 'btn-search',
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            e.stopPropagation()
            handleCostCenterTypeSearchClick(ctx.row.index)
          },
          visible: true,
          visibleInColumnChooser: true
        },
        {
          name: 'btnDelete',
          header: ' ',
          width: 65,
          buttonBody: 'button',
          align: 'center',
          title: 'حذف',
          iconType: 'delete',
          className: 'btn-delete',
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            e.stopPropagation()
            handleCostCenterTypeDeleteClick(ctx.row.index)
          },
          visible: true,
          visibleInColumnChooser: true
        },
      ],
    }),
    [handleCostCenterTypeSearchClick, handleCostCenterTypeDeleteClick, handleCostCenterTypeStatusChange, costCenterTypes],
  )

  const getCostCenterStateStatus = useCallback((value: number | string | null | undefined) => {
    const normalized = Number(value ?? 0)
    if (normalized === 2) return "اجباري"
    if (normalized === 3) return "ممنوع"
    return "اختياري"
  }, [])

  const classificationTypeScheme = useMemo(
    () => ({
      name: "ClassificationTypeScheme",
      columns: [
        { header: "الرقم", name: "id", width: 80, isReadOnly: true },
        { header: "اسم نوع التصنيف", name: "name", width: "*", minWidth: 250, isReadOnly: true },
        {
          name: 'btnDelete',
          header: ' ',
          width: 65,
          buttonBody: 'button',
          align: 'center',
          title: 'حذف',
          iconType: 'delete',
          className: 'btn-delete',
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            e.stopPropagation()
            handleDeleteClassificationType(ctx.row.index)
          },
          visible: true,
          visibleInColumnChooser: true
        },
      ],
    }),
    [handleDeleteClassificationType, classificationTypes],
  )

  const stopTransactionScheme = useMemo(
    () => ({
      name: "StopTransactionScheme",
      columns: [
        {
          header: "إيقاف الحركات",
          name: "is_stopped",
          width: 120,
          align: "center",
          isReadOnly: true,
          body: (cell: any) => (
            <div className="flex h-full items-center justify-center">
              <Checkbox
                checked={Boolean(cell.row.dataItem.is_stopped)}
                className="size-3.5 rounded-sm border-slate-400 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600"
                onCheckedChange={(checked) => {
                  const nextValue = Boolean(checked)
                  setStopTransactionRows((prev) =>
                    prev.map((row) =>
                      row.voucher_types_id === cell.row.dataItem.voucher_types_id
                        ? {
                            ...row,
                            is_stopped: nextValue,
                            stop_date: nextValue ? row.stop_date || new Date().toISOString().slice(0, 10) : "",
                          }
                        : row,
                    ),
                  )
                }}
              />
            </div>
          ),
        },
        { header: "نوع الحركة", name: "voucher_type_name", width: "*", minWidth: 260, isReadOnly: true },
        {
          header: "تاريخ إيقاف الحركة",
          name: "stop_date",
          width: 140,
          align: "center",
          isReadOnly: true,
          body: (cell: any) => (
            <Input
              type="date"
              value={cell.row.dataItem.stop_date || ""}
              disabled={!cell.row.dataItem.is_stopped}
              onChange={(e) => {
                const value = e.target.value
                setStopTransactionRows((prev) =>
                  prev.map((row) =>
                    row.voucher_types_id === cell.row.dataItem.voucher_types_id
                      ? { ...row, stop_date: value }
                      : row,
                  ),
                )
              }}
              className="h-9 text-right"
            />
          ),
        },
      ],
    }),
    [],
  )

  const focusPrimeDropdownRoot = (e: any) => {
    const target = e?.originalEvent?.target || e?.target
    const dropdownRoot = target?.closest?.(".p-dropdown") as HTMLElement | null
    if (!dropdownRoot) return
    setTimeout(() => dropdownRoot.focus(), 0)
  }

  const refocusDropdownInput = (inputId: string) => {
    setTimeout(() => {
      const element = document.getElementById(inputId) as HTMLElement | null
      element?.focus()
    }, 0)
  }

  const formatAccountLabel = useCallback((account: Partial<AccountItem> & { id?: number | null; code?: string; name?: string }) => {
    return [account.id != null ? String(account.id) : "", account.code || "", account.name || ""]
      .filter((part) => part.trim())
      .join(" - ")
  }, [])

  const resolveFatherAccountLabel = useCallback(
    (account: AccountItem) => {
      if (!account.father_id) return ""

      const parentAccount = activeAccounts.find((item) => Number(item.id) === Number(account.father_id))
      if (parentAccount) {
        return formatAccountLabel(parentAccount)
      }

      const fallbackParent = account as AccountItem & {
        parent_account_id?: number | null
        parent_account_code?: string | null
        parent_account_name?: string | null
        father_name?: string | null
      }

      return [
        fallbackParent.parent_account_id != null ? String(fallbackParent.parent_account_id) : String(account.father_id),
        fallbackParent.parent_account_code || "",
        fallbackParent.parent_account_name || fallbackParent.father_name || "",
      ]
        .filter((part) => part.trim())
        .join(" - ")
    },
    [activeAccounts, formatAccountLabel],
  )

  const loadAccountToForm = useCallback((account: AccountItem) => {
    const assignedCostCenters = Array.isArray((account as any).cost_centers) ? (account as any).cost_centers : []
    const nextCostCenterTypes = costCenterTypes.map((type) => {
      const assignment = assignedCostCenters.find((row: any) => Number(row?.cost_center_type_id) === Number(type.id))
      const selectedCostCenterId = assignment?.default_cost_center_id != null ? Number(assignment.default_cost_center_id) : null
      const selectedCostCenter = selectedCostCenterId != null ? costCenters.find((center: any) => Number(center?.id) === selectedCostCenterId) : null
      const requiredInTransactions = Number(assignment?.required_in_transactions ?? type.required_in_transactions ?? 1)

      return {
        ...type,
        required_in_transactions: requiredInTransactions,
        state_status: getCostCenterStateStatus(requiredInTransactions),
        default_cost_center_id: selectedCostCenterId,
        cost_center_name: selectedCostCenter?.name || "",
      }
    })
    const nextAccountClassifications = Array.isArray((account as any).account_classifications) ? (account as any).account_classifications : []
    const nextFatherName = resolveFatherAccountLabel(account)
    const nextFatherAccount = account.father_id ? activeAccounts.find((item) => Number(item.id) === Number(account.father_id)) : null
    setFormData({
      id: account.id || 0,
      code: account.code || "",
      name: account.name || "",
      name_lang2: account.name_lang2 || "",
      type: String(account.type || ""),
      father_id: account.father_id ? String(account.father_id) : "",
      level_no: String(account.level_no || 1),
      finanical_list_id: String(account.finanical_list_id || 1),
      finanical_list_assests_id: account.finanical_list_assests_id ? String(account.finanical_list_assests_id) : "",
      finanical_list_liabilities_id: account.finanical_list_liabilities_id ? String(account.finanical_list_liabilities_id) : "",
      finanical_list_income_id: account.finanical_list_income_id ? String(account.finanical_list_income_id) : "",
      currency_id: account.currency_id ? String(account.currency_id) : "",
      allow_trans_with_diff_curr: account.allow_trans_with_diff_curr != null ? String(account.allow_trans_with_diff_curr) : "0",
      iscalc_curr_diff_rates: Boolean(account.iscalc_curr_diff_rates),
      transaction_type: String(account.transaction_type || 0),
      transaction_type_action: String(account.transaction_type_action || 0),
      max_transaction_amount: String(account.max_transaction_amount || 0),
      max_transaction_amount_action: String(account.max_transaction_amount_action || 0),
      max_balance_amount: String(account.max_balance_amount || 0),
      max_balance_action: account.max_balance_action ? String(account.max_balance_action) : "",
      budget_exceeding_perc: account.budget_exceeding_perc ? String(account.budget_exceeding_perc) : "",
      budget_exceeding_action: account.budget_exceeding_action ? String(account.budget_exceeding_action) : "",
      unified_report_account_no: account.unified_report_account_no || "",
      unified_report_group_code: account.unified_report_group_code || "",
      notes: account.notes || "",
      show_notes_in_transactions_soa: Boolean(account.show_notes_in_transactions_soa),
      status: account.status || "نشط",
    })
    setFinancialListType(String(account.finanical_list_id || 1))
    setCostCenterTypes(nextCostCenterTypes)
    setAccountClassifications(nextAccountClassifications)
    // Set father account name
    setFatherAccountName(nextFatherName)
    setFatherAccountCode(nextFatherAccount?.code || "")
    // set preview if account has image url
    if ((account as any).image_url) {
      setImagePreview((account as any).image_url)
    } else {
      setImagePreview(null)
    }
    setStopTransactionRows(buildStopTransactionRows(voucherTypes, (account as any).stop_transactions || []))
    dirtySnapshotRef.current = serializeAccountSnapshot({
      formData: {
        id: account.id || 0,
        code: account.code || "",
        name: account.name || "",
        name_lang2: account.name_lang2 || "",
        type: String(account.type || ""),
        father_id: account.father_id ? String(account.father_id) : "",
        level_no: String(account.level_no || 1),
        finanical_list_id: String(account.finanical_list_id || 1),
        finanical_list_assests_id: account.finanical_list_assests_id ? String(account.finanical_list_assests_id) : "",
        finanical_list_liabilities_id: account.finanical_list_liabilities_id ? String(account.finanical_list_liabilities_id) : "",
        finanical_list_income_id: account.finanical_list_income_id ? String(account.finanical_list_income_id) : "",
        currency_id: account.currency_id ? String(account.currency_id) : "",
        allow_trans_with_diff_curr: account.allow_trans_with_diff_curr != null ? String(account.allow_trans_with_diff_curr) : "0",
        iscalc_curr_diff_rates: Boolean(account.iscalc_curr_diff_rates),
        transaction_type: String(account.transaction_type || 0),
        transaction_type_action: String(account.transaction_type_action || 0),
        max_transaction_amount: String(account.max_transaction_amount || 0),
        max_transaction_amount_action: String(account.max_transaction_amount_action || 0),
        max_balance_amount: String(account.max_balance_amount || 0),
        max_balance_action: account.max_balance_action ? String(account.max_balance_action) : "",
        budget_exceeding_perc: account.budget_exceeding_perc ? String(account.budget_exceeding_perc) : "",
        budget_exceeding_action: account.budget_exceeding_action ? String(account.budget_exceeding_action) : "",
        unified_report_account_no: account.unified_report_account_no || "",
        unified_report_group_code: account.unified_report_group_code || "",
        notes: account.notes || "",
        show_notes_in_transactions_soa: Boolean(account.show_notes_in_transactions_soa),
        status: account.status || "نشط",
      },
      financialListType: String(account.finanical_list_id || 1),
      fatherAccountName: nextFatherName,
      stopTransactionRows: buildStopTransactionRows(voucherTypes, (account as any).stop_transactions || []),
      costCenterTypes: nextCostCenterTypes,
      accountClassifications: nextAccountClassifications,
    })
  }, [activeAccounts, resolveFatherAccountLabel, voucherTypes, buildStopTransactionRows, costCenters])

  const handleNew = async () => {
    await reset_fields()
    setDialogOpen(true)
    setActiveTab("main")
    
    // Focus on Arabic name input after dialog opens
    
  }

  const handleOpenSearchModal = (target: "father" | "code") => {
    setSearchTarget(target)
    setSearchModalOpen(true)
  }

  const handleSelectSearchResult = (account: AccountItem) => {
    if (searchTarget === "father") {
      setFormData({
        ...formData,
        father_id: String(account.id),
      })
      setFatherAccountCode(account.code)
      setFatherAccountName(formatAccountLabel(account))
    } else {
      const foundIndex = activeAccounts.findIndex((item) => item.id === account.id)
      if (foundIndex >= 0) {
        setCurrentIndex(foundIndex)
      }
      loadAccountToForm(account)
    }
    setSearchModalOpen(false)
  }

  // Adjust account code to 8 characters (pad with zeros)
  const adjustCode = (code: string, codeLen: number = 8): string => {
    if (!code || !code.trim()) return ''

    return code
      .trim()
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, codeLen)
      .toUpperCase()
  }

  // Reset all fields to blank/default (for new account entry)
  const reset_fields = useCallback(async () => {
    const defaultCurrencyId = currencies && currencies.length > 0 ? String(currencies[0].currency_id ?? currencies[0].id ?? "") : "1"
    messagesRef.current?.clear?.()
    // Fetch next account code from API - prevent concurrent calls
    let nextCode = "A0000001"
    if (!fetchingNextCodeRef.current) {
      fetchingNextCodeRef.current = true
      try {
        const response = await fetch("/api/accounts/next-code")
        console.log("Next code API response:", response)
        if (response.ok) {
          const data = await response.json()
          nextCode = data.code || "A0000001"
        }
      } catch (err) {
        console.error("Error fetching next account code:", err)
        nextCode = "A0000001"
      } finally {
        fetchingNextCodeRef.current = false
      }
    }
    console.log("defaultCurrencyId:")
    setFormData({
      id: 0,
      code: nextCode,
      name: "",
      name_lang2: "",
      type: types && types.length > 0 ? String(types[0].id) : "",
      father_id: "",
      level_no: "1",
      finanical_list_id: "1",
      finanical_list_assests_id: "",
      finanical_list_liabilities_id: "",
      finanical_list_income_id: "",
      currency_id: defaultCurrencyId,
      allow_trans_with_diff_curr: "0",
      iscalc_curr_diff_rates: false,
      transaction_type: "0",
      transaction_type_action: "0",
      max_transaction_amount: "0",
      max_transaction_amount_action: "0",
      max_balance_amount: "0",
      max_balance_action: "",
      budget_exceeding_perc: "",
      budget_exceeding_action: "",
      unified_report_account_no: "",
      unified_report_group_code: "",
      notes: "",
      show_notes_in_transactions_soa: false,
      status: "نشط",
    })
    setFinancialListType("1")
    setFatherAccountCode("")
    setFatherAccountName("")
    setImagePreview(null)
    setImageFile(null)
    setStopTransactionRows(buildStopTransactionRows(voucherTypes, []))
    setError("")
    setMessage("")
    
    // Clear cost center selections (but keep the available types list)
    setCostCenterTypes((prevTypes) =>
      prevTypes.map((type) => ({
        ...type,
        cost_center_id: null,
        default_cost_center_id: null,
        cost_center_name: "",
      }))
    )
    
    // Clear all classification selections - reset to defaults
    console.log("Resetting classifications to default types:", classificationTypesRef.current)
    setClassificationTypes(classificationTypesRef.current || [])
    setAccountClassifications(classificationTypesRef.current || [])
    
    setSelectedCostCenterType(null)
    setSelectedCostCenterTypeIndex(-1)
    setShowDeleteConfirm(false)
    setDeleteConfirmIndex(-1)
    setShowCostCenterTypeForm(false)
    setNewCostCenterTypeName("")
    setCostCenterTypeError("")
    setCostCenterTypeMessage("")
    setSearchCostCenterOpen(false)
    
    // Clear classifications
    setSelectedClassificationType(null)
    setSelectedClassificationTypeIndex(-1)
    setShowDeleteClassificationConfirm(false)
    setDeleteClassificationConfirmIndex(-1)
    setShowClassificationForm(false)
    setNewClassificationTypeId(null)
    setNewClassificationName("")
    setClassificationError("")
    setSearchAccountClassificationOpen(false)

    dirtySnapshotRef.current = serializeAccountSnapshot({
      formData: {
        id: 0,
        code: nextCode,
        name: "",
        name_lang2: "",
        type: types && types.length > 0 ? String(types[0].id) : "",
        father_id: "",
        level_no: "1",
        finanical_list_id: "1",
        finanical_list_assests_id: "",
        finanical_list_liabilities_id: "",
        finanical_list_income_id: "",
        currency_id: defaultCurrencyId,
        allow_trans_with_diff_curr: "0",
        iscalc_curr_diff_rates: false,
        transaction_type: "0",
        transaction_type_action: "0",
        max_transaction_amount: "0",
        max_transaction_amount_action: "0",
        max_balance_amount: "0",
        max_balance_action: "",
        budget_exceeding_perc: "",
        budget_exceeding_action: "",
        unified_report_account_no: "",
        unified_report_group_code: "",
        notes: "",
        show_notes_in_transactions_soa: false,
        status: "نشط",
      },
      financialListType: "1",
      fatherAccountName: "",
      stopTransactionRows: buildStopTransactionRows(voucherTypes, []),
      costCenterTypes: costCenterTypes.map((type) => ({
        ...type,
        cost_center_id: null,
        default_cost_center_id: null,
        cost_center_name: "",
      })),
      accountClassifications: classificationTypesRef.current || [],
    })
    
    setTimeout(() => {
      accountNameInputRef.current?.focus()
    }, 100)
  }, [currencies, types, voucherTypes, buildStopTransactionRows])

  // Reset fields but keep the code (similar to handleNew but preserves code)
  const resetFieldsWithCode = (codeToKeep: string) => {
    const defaultCurrencyId = currencies && currencies.length > 0 ? String(currencies[0].currency_id ?? currencies[0].id ?? "") : "1"
    const resetCostCenterTypes = costCenterTypes.map((type) => ({
      ...type,
      cost_center_id: null,
      default_cost_center_id: null,
      cost_center_name: "",
    }))

    messagesRef.current?.clear?.()
    setFormData({
      id: 0,
      code: codeToKeep,
      name: "",
      name_lang2: "",
      type: types && types.length > 0 ? String(types[0].id) : "",
      father_id: "",
      level_no: "1",
      finanical_list_id: "1",
      finanical_list_assests_id: "",
      finanical_list_liabilities_id: "",
      finanical_list_income_id: "",
      currency_id: defaultCurrencyId,
      allow_trans_with_diff_curr: "0",
      iscalc_curr_diff_rates: false,
      transaction_type: "0",
      transaction_type_action: "0",
      max_transaction_amount: "0",
      max_transaction_amount_action: "0",
      max_balance_amount: "0",
      max_balance_action: "",
      budget_exceeding_perc: "",
      budget_exceeding_action: "",
      unified_report_account_no: "",
      unified_report_group_code: "",
      notes: "",
      show_notes_in_transactions_soa: false,
      status: "نشط",
    })
    setFinancialListType("1")
    setFatherAccountCode("")
    setFatherAccountName("")
    setImagePreview(null)
    setImageFile(null)
    setStopTransactionRows(buildStopTransactionRows(voucherTypes, []))
    setError("")
    setMessage("")
    setCostCenterTypes(resetCostCenterTypes)
    setClassificationTypes(classificationTypesRef.current || [])
    setAccountClassifications(classificationTypesRef.current || [])
    setSelectedCostCenterType(null)
    setSelectedCostCenterTypeIndex(-1)
    setShowDeleteConfirm(false)
    setDeleteConfirmIndex(-1)
    setShowCostCenterTypeForm(false)
    setNewCostCenterTypeName("")
    setCostCenterTypeError("")
    setCostCenterTypeMessage("")
    setSearchCostCenterOpen(false)
    setSelectedClassificationType(null)
    setSelectedClassificationTypeIndex(-1)
    setShowDeleteClassificationConfirm(false)
    setDeleteClassificationConfirmIndex(-1)
    setShowClassificationForm(false)
    setNewClassificationTypeId(null)
    setNewClassificationName("")
    setClassificationError("")
    setSearchAccountClassificationOpen(false)

    dirtySnapshotRef.current = serializeAccountSnapshot({
      formData: {
        id: 0,
        code: codeToKeep,
        name: "",
        name_lang2: "",
        type: types && types.length > 0 ? String(types[0].id) : "",
        father_id: "",
        level_no: "1",
        finanical_list_id: "1",
        finanical_list_assests_id: "",
        finanical_list_liabilities_id: "",
        finanical_list_income_id: "",
        currency_id: defaultCurrencyId,
        allow_trans_with_diff_curr: "0",
        iscalc_curr_diff_rates: false,
        transaction_type: "0",
        transaction_type_action: "0",
        max_transaction_amount: "0",
        max_transaction_amount_action: "0",
        max_balance_amount: "0",
        max_balance_action: "",
        budget_exceeding_perc: "",
        budget_exceeding_action: "",
        unified_report_account_no: "",
        unified_report_group_code: "",
        notes: "",
        show_notes_in_transactions_soa: false,
        status: "نشط",
      },
      financialListType: "1",
      fatherAccountName: "",
      stopTransactionRows: buildStopTransactionRows(voucherTypes, []),
      costCenterTypes: resetCostCenterTypes,
      accountClassifications: classificationTypesRef.current || [],
    })
  }

  // Search for account by code
  const searchAccountByCode = async (code: string) => {
    if (!code || code.length === 0) return

    try {
      setError("")
      
      const response = await fetch(`/api/accounts/search?code=${encodeURIComponent(code)}`)
      if (response.ok) {
        const account = await response.json()
        if (account && account.id) {
          if (Number(account.status ?? 1) === 3) {
            messagesRef.current?.clear?.()
            messagesRef.current?.show({
              severity: "warn",
              summary: "",
              detail: "الحساب المختار محذوف لا يمكن عرض تفاصيله",
              sticky: false,
              life: 3000,
            })
            await reset_fields()
            return
          }
          // Account found - load it
          setCurrentIndex(activeAccounts.findIndex((a) => a.id === account.id))
          loadAccountToForm(account)
        }
      } else if (response.status === 404) {
        // Account not found - reset fields but keep code
        resetFieldsWithCode(code)
      } else if (response.status === 403) {
        messagesRef.current?.clear?.()
        messagesRef.current?.show({
          severity: "warn",
          summary: "",
          detail: "الحساب المختار محذوف لا يمكن عرض تفاصيله",
          sticky: false,
          life: 3000,
        })
        await reset_fields()
      }
    } catch (error) {
      console.error("Error searching for account:", error)
      setError("حدث خطأ أثناء البحث عن الحساب")
    }
  }

  // Handle account code input change - validate and clean
  const handleAccountCodeChange = (value: string) => {
    // Allow only English letters and digits, then force uppercase
    const cleanValue = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase()
    setFormData({ ...formData, code: cleanValue })
  }

  // Handle account code blur - adjust and search
  const handleAccountCodeBlur = () => {
    const adjustedCode = adjustCode(formData.code)
    setFormData({ ...formData, code: adjustedCode })
    void searchAccountByCode(adjustedCode)
  }

  useEffect(() => {
    console.log("[unified-refactored] mount/effect action:", action)
    if (action === "new" && !dialogOpen) {
      setActiveTab("main")
      setDialogOpen(true)
    }
  }, [action, dialogOpen])

  useEffect(() => {
    if (accountId == null) return
    setLoading(true)
    setActiveTab("main")
    setDialogOpen(true)
  }, [accountId])

  useEffect(() => {
    if (onOpenChange) onOpenChange(dialogOpen)
  }, [dialogOpen, onOpenChange])

  useEffect(() => {
    if (!dialogOpen) {
      dialogWasOpenRef.current = false
      return
    }

    if (dialogWasOpenRef.current) return
    dialogWasOpenRef.current = true

    console.log("[unified-refactored] dialogOpen changed:", dialogOpen)
    const init = async () => {
      try {
        setLoading(true)

        // Wait for definitions to load
        await loadData()

        // Only reset the form when the dialog is opened for a new account.
        // When `accountId` is set, the dedicated accountId effect loads the row.
        if (accountId == null) {
          // New account entry
          await handleNew()
          // Completely clear classifications grid for new account
          setAccountClassifications([])
        }
      } catch (error) {
        console.error("Failed to fetch definitions:", error)
      } finally {
        // Keep loading on until the selected account is applied.
        if (accountId == null) {
          setLoading(false)
        }
      }
    }

    init()
  }, [dialogOpen, accountId, loadAccountToForm, handleNew])

  useEffect(() => {
    if (!dialogOpen || accountId == null || activeAccounts.length === 0) return

    const targetIndex = activeAccounts.findIndex((item) => item.id === accountId)
    if (targetIndex < 0) {
      setLoading(false)
      return
    }

    const targetAccount = activeAccounts[targetIndex]
    setCurrentIndex(targetIndex)
    loadAccountToForm(targetAccount)
    setLoading(false)
  }, [dialogOpen, accountId, activeAccounts, loadAccountToForm])

  useEffect(() => {
    // Monitor row selection in cost center types grid
    if (costCenterTypeGridRef.current && costCenterTypeGridRef.current.flex) {
      const flex = costCenterTypeGridRef.current.flex
      const handleSelectionChange = () => {
        const selectedRow = flex.selection.row
        if (selectedRow >= 0 && selectedRow < costCenterTypes.length) {
          setSelectedCostCenterTypeIndex(selectedRow)
          setSelectedCostCenterType(costCenterTypes[selectedRow])
        } else {
          setSelectedCostCenterTypeIndex(-1)
          setSelectedCostCenterType(null)
        }
      }
      flex.addEventListener('selectionChanged', handleSelectionChange)
      return () => {
        try {
          flex.removeEventListener('selectionChanged', handleSelectionChange)
        } catch (_) {}
      }
    }
  }, [costCenterTypes])

  const handleSave = async (options?: { closeAfterSave?: boolean }): Promise<boolean> => {
    setError("")
    setMessage("")
    messagesRef.current?.clear?.()

    const showValidationMessage = (detail: string) => {
      messagesRef.current?.clear?.()
      messagesRef.current?.show({
        severity: "error",
        summary: "",
        detail,
        sticky: false,
        life: 3000,
      })
    }

    // Get and clean the form data
    const trimmedCode = formData.code.trim().toUpperCase()
    const trimmedName = formData.name.trim()
    
    // Validate that both fields are filled
    if (!trimmedCode) {
      showValidationMessage("يجب ملء رقم الحساب")
      return false
    }
    
    if (!trimmedName) {
      showValidationMessage("يجب ملء اسم الحساب")
      return false
    }

    if (!/^[A-Z0-9]{8}$/.test(trimmedCode)) {
      showValidationMessage("يجب أن يكون رقم الحساب 8 أحرف إنجليزية أو أرقام وبحروف كبيرة")
      return false
    }

    if (trimmedName.length > 150) {
      showValidationMessage("اسم الحساب يجب ألا يتجاوز 150 حرفاً")
      return false
    }

    const trimmedEnglishName = formData.name_lang2.trim()
    if (trimmedEnglishName.length > 150) {
      showValidationMessage("اسم الحساب بالإنجليزية يجب ألا يتجاوز 150 حرفاً")
      return false
    }

    const duplicateAccount = activeAccounts.find((account) => {
      if (Number(account.id) === Number(formData.id)) return false
      return String(account.name || "").trim() === trimmedName
    })
    if (duplicateAccount) {
      showValidationMessage(`اسم الحساب مكرر. الكود: ${duplicateAccount.code}`)
      return false
    }

    if (financialListType === "1") {
      const hasAssets = Boolean(formData.finanical_list_assests_id)
      const hasLiabilities = Boolean(formData.finanical_list_liabilities_id)
      if (!hasAssets && !hasLiabilities) {
        showValidationMessage("يجب تحديد أصول الميزانية وخصومها")
        return false
      }
    }

    if (financialListType === "2" || financialListType === "3") {
      if (!formData.finanical_list_income_id) {
        showValidationMessage("يجب تحديد بند قائمة الدخل")
        return false
      }
    }

    // Validate currency is selected
    const currencyId = formData.currency_id ? Number(formData.currency_id) : 0
    if (!currencyId || currencyId <= 0) {
      showValidationMessage("يجب تحديد العملة")
      return false
    }

    // Adjust code if not already adjusted (ensure it's 8 uppercase alphanumeric characters)
    let finalCode = trimmedCode
    if (finalCode.length !== 8) {
      finalCode = adjustCode(finalCode)
    }

    // Validate account code length - must be exactly 8 uppercase English alphanumeric characters
    if (!/^[A-Z0-9]{8}$/.test(finalCode)) {
      showValidationMessage("طول رقم الحساب غير صحيح - يجب أن يكون 8 أحرف إنجليزية أو أرقام وبحروف كبيرة")
      return false
    }

    const resolveFatherAccount = () => {
      const trimmedFather = String(formData.father_id ?? "").trim()
      if (!trimmedFather) return null

      const numericFatherId = Number(trimmedFather)
      if (Number.isFinite(numericFatherId)) {
        const matchedById = activeAccounts.find((account) => Number(account.id) === numericFatherId)
        if (matchedById) return matchedById
      }

      const normalizedFatherCode = trimmedFather.replace(/\s+/g, "").toUpperCase()
      const matchedByCode = activeAccounts.find((account) => String(account.code ?? "").replace(/\s+/g, "").toUpperCase() === normalizedFatherCode)
      if (matchedByCode) return matchedByCode

      return null
    }

    const fatherAccount = resolveFatherAccount()
    if (fatherAccount) {
      const sameFatherId = Number(fatherAccount.id) === Number(formData.id) && Number(formData.id) !== 0
      const sameFatherCode = String(fatherAccount.code ?? "").toUpperCase() === finalCode

      if (sameFatherId || sameFatherCode) {
        showValidationMessage("لا يمكن ان يكون الحساب تابع لنفسه")
        return false
      }
    }

    try {
      setLoading(true)
      setSaving(true)
      // Detect if new or edit based on formData.id
      const isNewAccount = formData.id === 0
      const url = isNewAccount ? "/api/accounts" : `/api/accounts/${formData.id}`
      const method = isNewAccount ? "POST" : "PUT"
      // prepare image base64 if available
      const imageBase64 = imagePreview && imagePreview.startsWith("data:") ? imagePreview.split(",")[1] : null

      // Extract cost centers from grid state
      let costCentersData: any[] = []
      if (Array.isArray(costCenterTypes)) {
        costCentersData = costCenterTypes
          .filter((row) => row.default_cost_center_id != null && row.default_cost_center_id !== "")
          .map((row) => ({
          cost_center_type_id: row.id || null,
          cost_center_id: row.default_cost_center_id || null,
          required_in_transactions: row.required_in_transactions ?? row.status_id ?? 1,
          default_cost_center_id: row.default_cost_center_id || null,
        }))
      }

      // Extract classifications from grid state
      let classificationsData: any[] = []
      if (Array.isArray(accountClassifications)) {
        classificationsData = accountClassifications.map((row) => ({
          classification_id: row.classification_id || row.id || null,
        }))
      }

      const stopTransactionsData = Array.isArray(stopTransactionRows)
        ? stopTransactionRows
            .filter((row) => row.is_stopped)
            .map((row) => ({
              voucher_types_id: row.voucher_types_id,
              stop_date: row.stop_date || null,
            }))
        : []

      const payload = {
        id: formData.id || 0,
        code: finalCode,
        name: trimmedName,
        name_lang2: trimmedEnglishName || trimmedName,
        type: 1,
        father_id: fatherAccount ? fatherAccount.id : null,
        level_no: Number(formData.level_no || 1),
        finanical_list_id: Number(formData.finanical_list_id || 1),
        finanical_list_assests_id: formData.finanical_list_assests_id ? Number(formData.finanical_list_assests_id) : null,
        finanical_list_liabilities_id: formData.finanical_list_liabilities_id ? Number(formData.finanical_list_liabilities_id) : null,
        finanical_list_income_id: formData.finanical_list_income_id ? Number(formData.finanical_list_income_id) : null,
        currency_id: formData.currency_id ? Number(formData.currency_id) : null,
        allow_trans_with_diff_curr: Number(formData.allow_trans_with_diff_curr || "0"),
        iscalc_curr_diff_rates: formData.iscalc_curr_diff_rates,
        transaction_type: Number(formData.transaction_type || 0),
        transaction_type_action: Number(formData.transaction_type_action || 0),
        max_transaction_amount: Number(formData.max_transaction_amount || 0),
        max_transaction_amount_action: Number(formData.max_transaction_amount_action || 0),
        max_balance_amount: Number(formData.max_balance_amount || 0),
        max_balance_action: formData.max_balance_action ? Number(formData.max_balance_action) : null,
        budget_exceeding_perc: formData.budget_exceeding_perc ? Number(formData.budget_exceeding_perc) : null,
        budget_exceeding_action: formData.budget_exceeding_action ? Number(formData.budget_exceeding_action) : null,
        unified_report_account_no: formData.unified_report_account_no.trim() || null,
        unified_report_group_code: formData.unified_report_group_code.trim() || null,
        notes: formData.notes.trim() || null,
        show_notes_in_transactions_soa: formData.show_notes_in_transactions_soa,
        status: formData.status,
        image_base64: imageBase64,
        stop_transactions: stopTransactionsData,
        cost_centers: costCentersData,
        account_classifications: classificationsData,
      }
      console.log("Saving account with payload:", payload)
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "فشل حفظ الحساب")
        return false
      }

      const savedAccount = await response.json()
      const savedCode = savedAccount?.code || savedAccount?.account_code || finalCode
      const codeWasChanged = savedCode !== finalCode
      
      let messageText = isNewAccount ? " تم حفظ الحساب بنجاح" : " تم تعديل الحساب بنجاح"
      if (codeWasChanged && isNewAccount) {
        messageText += ` (رقم الحساب: ${savedCode})`
      }
      
      messagesRef.current?.clear?.()
      messagesRef.current?.show({
        severity: "success",
        summary: "",
        detail: messageText,
        sticky: false,
        life: 3000,
      })
      setError("")
      
      // Refresh the in-memory list so the search dialog sees the new record immediately.
      await loadData()
      dirtySnapshotRef.current = currentSnapshot

      // If new account, reset form for next entry, otherwise close dialog
      /*if (isNewAccount) {
        await reset_fields()
      } else {
        setDialogOpen(false)
      }*/
     await reset_fields()
      if (options?.closeAfterSave && closeWindow) {
        closeWindow()
      }
      return true
    } catch (err) {
      console.error(err)
      setError("خطأ في حفظ الحساب")
      return false
    } finally {
      setSaving(false)
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!currentAccount) return
    setShowAccountDeleteConfirm(true)
  }

  const handleConfirmDeleteAccount = useCallback(async () => {
    if (!currentAccount) return
    setShowAccountDeleteConfirm(false)
    setLoading(true)

    try {
      const response = await fetch(`/api/accounts/${currentAccount.id}`, { method: "DELETE" })
      if (!response.ok) {
        setError("فشل حذف الحساب")
        return
      }
      setMessage("الحساب تم حذفه بنجاح")
      await loadData()
      await reset_fields()
      setDialogOpen(true)
      setActiveTab("main")
    } catch (err) {
      console.error(err)
      setError("خطأ في حذف الحساب")
    } finally {
      setLoading(false)
    }
  }, [currentAccount])

  const handleFirst = () => {
    if (activeAccounts.length) {
      setCurrentIndex(0)
      loadAccountToForm(activeAccounts[0])
    }
  }

  const handlePrevious = () => {
    if (!activeAccounts.length) return

    if (formData.id === 0) {
      const lastIndex = activeAccounts.length - 1
      setCurrentIndex(lastIndex)
      loadAccountToForm(activeAccounts[lastIndex])
      return
    }

    const newIndex = currentIndex > 0 ? currentIndex - 1 : activeAccounts.length - 1
    setCurrentIndex(newIndex)
    loadAccountToForm(activeAccounts[newIndex])
  }

  const handleNext = () => {
    if (!activeAccounts.length) return

    if (formData.id === 0) {
      setCurrentIndex(0)
      loadAccountToForm(activeAccounts[0])
      return
    }

    const newIndex = currentIndex < activeAccounts.length - 1 ? currentIndex + 1 : 0
    setCurrentIndex(newIndex)
    loadAccountToForm(activeAccounts[newIndex])
  }

  const handleLast = () => {
    if (activeAccounts.length) {
      const lastIndex = activeAccounts.length - 1
      setCurrentIndex(lastIndex)
      loadAccountToForm(activeAccounts[lastIndex])
    }
  }

  const handleOpenDialog = () => {
    if (currentAccount) {
      loadAccountToForm(currentAccount)
    }
    setDialogOpen(true)
    setActiveTab("main")
  }

  const handleRequestClose = async () => {
    if (currentSnapshot !== dirtySnapshotRef.current) {
      setShowUnsavedConfirm(true)
      return
    }

    if (closeWindow) {
      closeWindow()
    }
  }

  const handleDeleteCostCenterType = async () => {
    if (selectedCostCenterTypeIndex < 0 || !costCenterTypes[selectedCostCenterTypeIndex]) return

    try {
      const typeToDelete = costCenterTypes[selectedCostCenterTypeIndex]
      const response = await fetch(`/api/cost-center-types/${typeToDelete.id}`, { method: "DELETE" })
      if (!response.ok) {
        setCostCenterTypeError("Failed to delete cost center type")
        return
      }
      setCostCenterTypeMessage("Cost center type deleted successfully")
      setSelectedCostCenterTypeIndex(-1)
      setSelectedCostCenterType(null)
      await loadData()
    } catch (err) {
      console.error(err)
      setCostCenterTypeError("Error deleting cost center type")
    }
  }

  const handleAddCostCenterType = () => {
    setNewCostCenterTypeName("")
    setShowCostCenterTypeForm(true)
    setCostCenterTypeError("")
    setCostCenterTypeMessage("")
  }

  const handleSaveCostCenterType = async () => {
    if (!newCostCenterTypeName.trim()) {
      setCostCenterTypeError("Cost center type name is required")
      return
    }

    try {
      const payload = {
        name: newCostCenterTypeName.trim(),
        status: 1,
      }

      const response = await fetch("/api/cost-center-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        setCostCenterTypeError(data.error || "Failed to save cost center type")
        return
      }

      setShowCostCenterTypeForm(false)
      setNewCostCenterTypeName("")
      
      // Reload only cost center types grid
      try {
        const typesRes = await fetch("/api/cost-center-types")
        if (typesRes.ok) {
          const typesData = await typesRes.json()
          const mappedTypes = Array.isArray(typesData)
            ? typesData.map((type: any) => {
                const statusMap: { [key: string]: number } = {
                  'اختياري': 1,
                  'اجباري': 2,
                  'ممنوع': 3
                }
                const state_status = type.state_status || 'اختياري'
                const required_in_transactions = statusMap[state_status] || 1
                
                // Preserve existing cost center selection from previous state
                const existingType = costCenterTypes.find((t: any) => t.id === type.id)
                
                return {
                  id: type.id,
                  name: type.name,
                  status: type.status,
                  state_status,
                  required_in_transactions,
                  default_cost_center_id: existingType?.default_cost_center_id || null,
                  cost_center_name: existingType?.cost_center_name || "",
                  created_at: type.created_at,
                  updated_at: type.updated_at,
                }
              }).sort((a, b) => a.id - b.id)
            : []
          setCostCenterTypes(mappedTypes)
        }
      } catch (_) {
        console.error("Error reloading cost center types")
      }
    } catch (err) {
      console.error(err)
      setCostCenterTypeError("Error saving cost center type")
    }
  }

  const handleSearchCostCenter = () => {
    setSearchCostCenterOpen(true)
  }

  const handleSelectCostCenter = (center: any) => {
    // Update the selected cost center type row with the selected center
    if (selectedCostCenterTypeIndex >= 0 && selectedCostCenterTypeIndex < costCenterTypes.length) {
      const updatedList = costCenterTypes.map((type, idx) => {
        if (idx === selectedCostCenterTypeIndex) {
          return {
            ...type,
            default_cost_center_id: center.id,
            cost_center_name: center.name,
          }
        }
        return type
      })
      setCostCenterTypes(updatedList)
      setCostCenterTypeMessage("تم تحديث مركز التكلفة بنجاح")
      // Reset selection state
      setSelectedCostCenterTypeIndex(-1)
      setSelectedCostCenterType(null)
      // Close the search dialog explicitly
      setSearchCostCenterOpen(false)
    }
  }

  const handleDeleteCostCenter = (index: number) => {
    // Remove cost center from the specific row
    if (index >= 0 && index < costCenterTypes.length) {
      const updatedList = costCenterTypes.map((type, idx) => {
        if (idx === index) {
          return {
            ...type,
            cost_center_id: null,
            cost_center_name: ""
          }
        }
        return type
      })
      setCostCenterTypes(updatedList)
      setCostCenterTypeMessage("تم حذف مركز التكلفة")
    }
  }

  // Account Classification Handlers
  const handleAddClassificationType = () => {
    setNewClassificationTypeName("")
    setShowClassificationTypeForm(true)
    setClassificationTypeError("")
    setClassificationTypeMessage("")
  }

  const handleSaveClassificationType = async () => {
    if (!newClassificationTypeName.trim()) {
      setClassificationTypeError("اسم النوع مطلوب")
      return
    }

    try {
      const payload = {
        name: newClassificationTypeName.trim(),
        status: 1,
      }

      const response = await fetch("/api/account-classification-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        setClassificationTypeError(data.error || "Failed to save classification type")
        return
      }

      setShowClassificationTypeForm(false)
      setNewClassificationTypeName("")
      
      // Reload classification types grid
      try {
        const typesRes = await fetch("/api/account-classification-types")
        if (typesRes.ok) {
          const typesData = await typesRes.json()
          const mappedTypes = Array.isArray(typesData)
            ? typesData.map((type: any) => {
                const existingType = classificationTypes.find((t: any) => t.id === type.id)
                return {
                  id: type.id,
                  name: type.name,
                  status: type.status,
                  classification_id: existingType?.classification_id || null,
                  classification_name: existingType?.classification_name || "",
                  created_at: type.created_at,
                  updated_at: type.updated_at,
                }
              }).sort((a, b) => a.id - b.id)
            : []
          setClassificationTypes(mappedTypes)
        }
      } catch (_) {
        console.error("Error reloading classification types")
      }
    } catch (err) {
      console.error(err)
      setClassificationTypeError("Error saving classification type")
    }
  }

  const handleAddClassificationRow = () => {
    setNewClassificationTypeId(null)
    setNewClassificationName("")
    setClassificationError("")
    setShowClassificationForm(true)
  }

  const handleSaveClassification = () => {
    if (!newClassificationTypeId) {
      setClassificationError("يجب اختيار نوع التصنيف")
      return
    }
    if (!newClassificationName.trim()) {
      setClassificationError("اسم التصنيف مطلوب")
      return
    }

    const selectedType = classificationTypes.find((t: any) => t.id === Number(newClassificationTypeId))
    if (!selectedType) {
      setClassificationError("نوع التصنيف غير صحيح")
      return
    }

    const newRow = {
      classification_type_id: selectedType.id,
      classification_type_name: selectedType.name,
      classification_id: null,
      classification_name: newClassificationName.trim(),
    }
    setAccountClassifications([...accountClassifications, newRow])
    setShowClassificationForm(false)
    setNewClassificationTypeId(null)
    setNewClassificationName("")
    setClassificationError("")
  }

  const handleSelectClassificationType = (index: number) => {
    if (index >= 0 && index < classificationTypes.length) {
      const selectedItem = classificationTypes[index]
      setSelectedClassificationTypeIndex(index)
      setSelectedClassificationType(selectedItem)
    }
  }

  const handleSelectAccountClassification = (classification: any) => {
    if (selectedClassificationTypeIndex >= 0 && selectedClassificationTypeIndex < classificationTypes.length) {
      const updatedList = classificationTypes.map((item, idx) => {
        if (idx === selectedClassificationTypeIndex) {
          return {
            ...item,
            classification_id: classification.id,
            classification_name: classification.name,
          }
        }
        return item
      })
      setClassificationTypes(updatedList)
      setSelectedClassificationTypeIndex(-1)
      setSelectedClassificationType(null)
      setSearchAccountClassificationOpen(false)
    }
  }

  const handleDeleteAccountClassification = (index: number) => {
    setDeleteClassificationConfirmIndex(index)
    setShowDeleteClassificationConfirm(true)
  }

  const handleConfirmDeleteClassification = useCallback(() => {
    if (deleteClassificationConfirmIndex >= 0 && deleteClassificationConfirmIndex < classificationTypes.length) {
      const updatedList = classificationTypes.map((item, idx) => {
        if (idx === deleteClassificationConfirmIndex) {
          return {
            ...item,
            classification_id: null,
            classification_name: ""
          }
        }
        return item
      })
      setClassificationTypes(updatedList)
    }
    setShowDeleteClassificationConfirm(false)
    setDeleteClassificationConfirmIndex(-1)
  }, [deleteClassificationConfirmIndex, classificationTypes])

  /*if (loading) {
    return <div className="p-6 text-center">Loading...</div>
  }*/

  if (inWindowManager) {
    return (
      <div className="w-full h-full p-0 gap-0 flex flex-col overflow-hidden text-base" dir="rtl">
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-blue-50 to-slate-50 px-6 py-4">
          <h2 className="text-2xl font-bold">{formData.id === 0 ? "إضافة حساب جديد" : "تعديل حساب"}</h2>
          <Button variant="ghost" onClick={() => void handleRequestClose()}>
            ✕
          </Button>
        </div>

        <div className="border-b bg-white/95 px-4 py-2">
          <UniversalToolbar
            currentRecord={activeAccounts.length > 0 ? currentIndex + 1 : 0}
            totalRecords={activeAccounts.length}
            onNew={handleNew}
            onSave={() => void handleSave()}
            onDelete={handleDelete}
            onFirst={handleFirst}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onLast={handleLast}
            canDelete={formData.id !== 0}
            isSaving={saving}
            labels={{
              new: "جديد",
              save: saving ? "جاري الحفظ" : "حفظ",
              previous: "السابق",
              next: "التالي",
              first: "الأول",
              last: "الأخير",
              delete: "حذف",
              report: "استعلام",
              exportExcel: "تصدير إكسل",
              print: "طباعة",
              clone: "نسخ",
            }}
          />
          <Messages innerRef={messagesRef} />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {statusMessage && null}

          <ProgressSpinner loading={loading} />
          <div className="space-y-4 border-b pb-4">
            <div className="grid gap-4 md:grid-cols-2 items-end">
              <div>
                <Label className="mb-2 block text-sm font-medium">رقم الحساب * (8 أحرف إنجليزية أو أرقام، بحروف كبيرة)</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    value={formData.code}
                    onChange={(e) => handleAccountCodeChange(e.target.value)}
                    onBlur={handleAccountCodeBlur}
                    placeholder=""
                    className="text-right flex-1 font-mono text-lg font-semibold tracking-widest"
                    maxLength={8}
                  />
                  <Button 
                    variant="default" 
                    onClick={() => handleOpenSearchModal("code")} 
                    size="sm"
                    className="px-3 h-8 flex items-center gap-1.5"
                    title="بحث عن حساب"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-col">
                <Label className="mb-2 block text-sm font-medium">المستوى</Label>
                <Input
                  value={formData.level_no}
                  onChange={(e) => setFormData({ ...formData, level_no: e.target.value })}
                  placeholder="المستوى"
                  className="text-right"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="mb-2 block text-sm font-medium">اسم الحساب (AR) *</Label>
                <Input
                  ref={accountNameInputRef}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="اسم الحساب"
                  className="text-right text-lg"
                />
              </div>
              <div>
                <Label className="mb-2 block text-sm font-medium">اسم الحساب (EN)</Label>
                <Input
                  value={formData.name_lang2}
                  onChange={(e) => setFormData({ ...formData, name_lang2: e.target.value })}
                  placeholder="Account name in English"
                  className="text-right text-lg"
                />
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList dir="rtl" className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-gradient-to-r from-slate-50 via-blue-50 to-slate-50 p-2 shadow-md border border-slate-200/60 backdrop-blur-sm">
              <TabsTrigger value="main" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">الرئيسية</TabsTrigger>
              <TabsTrigger value="cost-centers" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">مراكز التكلفة</TabsTrigger>
              <TabsTrigger value="classification" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-orange-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">تصنيفات الحساب</TabsTrigger>
              <TabsTrigger value="stop-transactions" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500 data-[state=active]:to-red-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">إيقاف الحركات</TabsTrigger>
              <TabsTrigger value="constraints" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">محددات الحساب</TabsTrigger>
            </TabsList>

            <TabsContent value="main" className="space-y-6">
              {/* Currency and Financial Settings */}
              <div className="space-y-4 border-b pb-6">
                <h4 className="font-semibold text-base">الإعدادات المالية</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <AutoCompleteAccount
                      label="الحساب الرئيسي (تابع ل)"
                      value={fatherAccountCode}
                      placeholder="اختر الحساب الرئيسي"
                      onValueChange={(nextCode) => {
                        setFatherAccountCode(nextCode)
                        if (!nextCode) {
                          setFormData({ ...formData, father_id: "" })
                          setFatherAccountName("")
                        }
                      }}
                      onAccountSelect={(account) => {
                        setFormData({ ...formData, father_id: account ? String(account.id) : "" })
                        setFatherAccountName(account ? `${account.code} - ${account.name}` : "")
                        setFatherAccountCode(account ? account.code : "")
                      }}
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">العملة</Label>
                    <PrimeDropdown
                      inputId="currency_id"
                      value={formData.currency_id ? Number(formData.currency_id) : null}
                      options={(() => {
                        const options = currencies.map((c) => ({
                          label: c.currency_name || c.name || c.currency_code || "غير محدد",
                          value: c.currency_id ?? c.id,
                        }))
                        // Sort options: selected currency first
                        if (formData.currency_id) {
                          const selectedId = Number(formData.currency_id)
                          options.sort((a, b) => {
                            if (a.value === selectedId) return -1
                            if (b.value === selectedId) return 1
                            return 0
                          })
                        }
                        return options
                      })()}
                      optionLabel="label"
                      optionValue="value"
                      placeholder="اختر العملة"
                      filter={true}
                      filterInputAutoFocus={true}
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      onChange={(e: any) => {
                        setFormData({ ...formData, currency_id: e.value ? String(e.value) : "" })
                        focusPrimeDropdownRoot(e)
                      }}
                      onHide={() => refocusDropdownInput("currency_id")}
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">القائمة المالية *</Label>
                    <PrimeDropdown
                      inputId="financial_list_id"
                      value={financialListType}
                      options={[
                        { label: "الميزانية العمومية", value: "1" },
                        { label: "قائمة الدخل", value: "2" },
                        { label: "تقييم بضاعة", value: "3" },
                      ]}
                      optionLabel="label"
                      optionValue="value"
                      placeholder="اختر القائمة"
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      onChange={(e: any) => {
                        setFinancialListType(e.value)
                        setFormData({ ...formData, finanical_list_id: e.value })
                        focusPrimeDropdownRoot(e)
                      }}
                      onHide={() => refocusDropdownInput("financial_list_id")}
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">السماح بعمل حركة على الحساب بغير عملته</Label>
                    <PrimeDropdown
                      inputId="allow_trans_with_diff_curr"
                      value={formData.allow_trans_with_diff_curr}
                      options={[
                        { label: "مسموح بدون تنبيه", value: "0" },
                        { label: "مسموح مع تنبيه", value: "1" },
                        { label: "ممنوع", value: "2" },
                      ]}
                      optionLabel="label"
                      optionValue="value"
                      placeholder="اختر الخيار"
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      onChange={(e: any) => {
                        setFormData({ ...formData, allow_trans_with_diff_curr: e.value ?? "0" })
                        focusPrimeDropdownRoot(e)
                      }}
                      onHide={() => refocusDropdownInput("allow_trans_with_diff_curr")}
                    />
                  </div>

                  {/* Conditional dropdowns for Balance Sheet */}
                  {financialListType === "1" && (
                    <>
                      <div>
                        <Label className="mb-2 block text-sm font-medium">أصول الميزانية</Label>
                        <PrimeDropdown
                          inputId="financial_list_assets_id"
                          value={formData.finanical_list_assests_id || null}
                          options={[
                            { label: "عدم الاظهار", value: null },
                            ...balanceSheetAssets.map((asset) => ({
                              label: asset.name,
                              value: String(asset.id),
                            })),
                          ]}
                          optionLabel="label"
                          optionValue="value"
                          placeholder="اختر الأصل"
                          filter={true}
                          filterInputAutoFocus={true}
                          className="invoice-currency-dropdown w-full"
                          panelClassName="invoice-currency-dropdown-panel"
                          appendTo="self"
                          onChange={(e: any) => {
                            setFormData({ ...formData, finanical_list_assests_id: e.value ? String(e.value) : "" })
                            if (e.value || formData.finanical_list_liabilities_id) {
                              clearBudgetSelectionMessage()
                            }
                            focusPrimeDropdownRoot(e)
                          }}
                          onHide={() => refocusDropdownInput("financial_list_assets_id")}
                        />
                      </div>
                      <div>
                        <Label className="mb-2 block text-sm font-medium">خصوم الميزانية</Label>
                        <PrimeDropdown
                          inputId="financial_list_liabilities_id"
                          value={formData.finanical_list_liabilities_id || null}
                          options={[
                            { label: "عدم الاظهار", value: null },
                            ...balanceSheetLiabilities.map((liability) => ({
                              label: liability.name,
                              value: String(liability.id),
                            })),
                          ]}
                          optionLabel="label"
                          optionValue="value"
                          placeholder="اختر الخصوم"
                          filter={true}
                          filterInputAutoFocus={true}
                          className="invoice-currency-dropdown w-full"
                          panelClassName="invoice-currency-dropdown-panel"
                          appendTo="self"
                          onChange={(e: any) => {
                            setFormData({ ...formData, finanical_list_liabilities_id: e.value ? String(e.value) : "" })
                            if (e.value || formData.finanical_list_assests_id) {
                              clearBudgetSelectionMessage()
                            }
                            focusPrimeDropdownRoot(e)
                          }}
                          onHide={() => refocusDropdownInput("financial_list_liabilities_id")}
                        />
                      </div>
                    </>
                  )}

                  {/* Conditional dropdown for Income Statement */}
                  {financialListType === "2" && (
                    <div>
                      <Label className="mb-2 block text-sm font-medium">قائمة الدخل</Label>
                      <PrimeDropdown
                        inputId="financial_list_income_id"
                        value={formData.finanical_list_income_id || null}
                        options={
                          incomeStatementAccounts.map((income) => ({
                            label: income.name,
                            value: String(income.id),
                          }))
                        }
                        optionLabel="label"
                        optionValue="value"
                        placeholder="اختر من قائمة الدخل"
                        filter={true}
                        filterInputAutoFocus={true}
                        className="invoice-currency-dropdown w-full"
                        panelClassName="invoice-currency-dropdown-panel"
                        appendTo="self"
                        onChange={(e: any) => {
                          setFormData({ ...formData, finanical_list_income_id: e.value ? String(e.value) : "" })
                          focusPrimeDropdownRoot(e)
                        }}
                        onHide={() => refocusDropdownInput("financial_list_income_id")}
                      />
                    </div>
                  )}

                  {/* Conditional dropdowns for Merchandise Valuation => show Balance Sheet Assets + Income Statement */}
                  {financialListType === "3" && (
                    <>
                      <div>
                        <Label className="mb-2 block text-sm font-medium">أصول الميزانية</Label>
                        <PrimeDropdown
                          inputId="financial_list_assets_id"
                          value={formData.finanical_list_assests_id || null}
                          options={[
                            { label: "عدم الاظهار", value: null },
                            ...balanceSheetAssets.map((asset) => ({
                              label: asset.name,
                              value: String(asset.id),
                            })),
                          ]}
                          optionLabel="label"
                          optionValue="value"
                          placeholder="اختر الأصل"
                          filter={true}
                          filterInputAutoFocus={true}
                          className="invoice-currency-dropdown w-full"
                          panelClassName="invoice-currency-dropdown-panel"
                          appendTo="self"
                          onChange={(e: any) => {
                            setFormData({ ...formData, finanical_list_assests_id: e.value ? String(e.value) : "" })
                            focusPrimeDropdownRoot(e)
                          }}
                          onHide={() => refocusDropdownInput("financial_list_assets_id")}
                        />
                      </div>
                      <div>
                        <Label className="mb-2 block text-sm font-medium">قائمة الدخل</Label>
                        <PrimeDropdown
                          inputId="financial_list_income_id"
                          value={formData.finanical_list_income_id || null}
                          options={
                            incomeStatementAccounts.map((income) => ({
                              label: income.name,
                              value: String(income.id),
                            }))
                          }
                          optionLabel="label"
                          optionValue="value"
                          placeholder="اختر من قائمة الدخل"
                          filter={true}
                          filterInputAutoFocus={true}
                          className="invoice-currency-dropdown w-full"
                          panelClassName="invoice-currency-dropdown-panel"
                          appendTo="self"
                          onChange={(e: any) => {
                            setFormData({ ...formData, finanical_list_income_id: e.value ? String(e.value) : "" })
                            focusPrimeDropdownRoot(e)
                          }}
                          onHide={() => refocusDropdownInput("financial_list_income_id")}
                        />
                      </div>
                    </>
                  )}

                </div>
                <div className="mt-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={formData.iscalc_curr_diff_rates}
                      onCheckedChange={(checked) => setFormData({ ...formData, iscalc_curr_diff_rates: checked as boolean })}
                    />
                      <span className="text-lg font-medium">الحساب يخضع لفرق العملة</span>
                  </label>
                </div>
              </div>

            </TabsContent>
              <TabsContent value="constraints" className="space-y-4" dir="rtl">
                <div className="space-y-4">
                  <h4 className="font-semibold text-base">الحدود المالية والإجراءات</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="mb-2 block text-sm font-medium">الحد الأقصى للحركة</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        maxLength={9}
                        value={formData.max_transaction_amount}
                        onChange={(e) => setFormData({ ...formData, max_transaction_amount: e.target.value.replace(/\D/g, "").slice(0, 9) })}
                        placeholder="0"
                        className="text-right"
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">إجراء تجاوز الحد الأقصى للحركة</Label>
                      <PrimeDropdown
                        inputId="max_transaction_amount_action"
                        value={formData.max_transaction_amount_action || "0"}
                        options={[
                          { label: "تحذير", value: "0" },
                          { label: "منع", value: "1" },
                          { label: "السماح", value: "2" },
                        ]}
                        optionLabel="label"
                        optionValue="value"
                        placeholder="اختر الإجراء"
                        className="invoice-currency-dropdown w-full"
                        panelClassName="invoice-currency-dropdown-panel"
                        appendTo="self"
                        onChange={(e: any) => {
                          setFormData({ ...formData, max_transaction_amount_action: e.value ?? "0" })
                          focusPrimeDropdownRoot(e)
                        }}
                        onHide={() => refocusDropdownInput("max_transaction_amount_action")}
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">الحد الأقصى للرصيد</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        maxLength={9}
                        value={formData.max_balance_amount}
                        onChange={(e) => setFormData({ ...formData, max_balance_amount: e.target.value.replace(/\D/g, "").slice(0, 9) })}
                        placeholder="0"
                        className="text-right"
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block text-sm font-medium">إجراء تجاوز الحد الأقصى للرصيد</Label>
                      <PrimeDropdown
                        inputId="max_balance_action"
                        value={formData.max_balance_action || "0"}
                        options={[
                          { label: "تحذير", value: "0" },
                          { label: "منع", value: "1" },
                          { label: "السماح", value: "2" },
                        ]}
                        optionLabel="label"
                        optionValue="value"
                        placeholder="اختر الإجراء"
                        className="invoice-currency-dropdown w-full"
                        panelClassName="invoice-currency-dropdown-panel"
                        appendTo="self"
                        onChange={(e: any) => {
                          setFormData({ ...formData, max_balance_action: e.value ?? "0" })
                          focusPrimeDropdownRoot(e)
                        }}
                        onHide={() => refocusDropdownInput("max_balance_action")}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
            <TabsContent value="stop-transactions" className="space-y-4" dir="rtl">
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-red-50 to-white px-4 py-3">
                  <Checkbox
                    checked={visibleStopTransactionRows.length > 0 && visibleStopTransactionRows.every((row) => row.is_stopped)}
                    className="size-3 rounded-[3px] border-slate-300 bg-white shadow-sm transition-all duration-150 hover:scale-105 hover:border-blue-500 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:shadow-blue-200 [&_svg]:size-2.5"
                    onCheckedChange={(checked) => {
                      const nextValue = Boolean(checked)
                      setStopTransactionRows((prev) =>
                        prev.map((row) => ({
                          ...row,
                          is_stopped: nextValue,
                          stop_date: nextValue ? row.stop_date || new Date().toISOString().slice(0, 10) : "",
                        })),
                      )
                    }}
                  />
                  <Label className="cursor-pointer text-sm font-medium">إيقاف كافة الحركات على الحساب</Label>
                </div>

                <div className="rounded-md border border-slate-300 overflow-hidden bg-white" dir="rtl">
                  {visibleStopTransactionRows.length > 0 ? (
                    <div className="h-[600px] min-h-[300px] overflow-y-auto [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-transparent scrollbar-hide">
                      <DataGridView scheme={stopTransactionScheme} dataSource={visibleStopTransactionRows} />
                    </div>
                  ) : (
                    <div className="h-[600px] flex items-center justify-center bg-slate-50">
                      <p className="text-slate-500 text-sm">لا توجد أنواع حركات</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="cost-centers" className="space-y-4" dir="rtl">
              <div className="space-y-4">
                {/* Header Section */}
                <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-blue-50 to-slate-50 p-4 rounded-md border border-slate-200">
                  <div className="flex-1">
                    <h4 className="font-semibold text-base">مراكز التكلفة</h4>
                  </div>
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={handleAddCostCenterType}
                    className="flex items-center gap-2 whitespace-nowrap bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    <Plus className="w-4 h-4" />
                    اضافة نوع مركز تكلفة جديد
                  </Button>
                </div>

                {/* Alert Messages */}
                {costCenterTypeError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{costCenterTypeError}</AlertDescription>
                  </Alert>
                )}
                {costCenterTypeMessage && (
                  <Alert className="bg-green-50 border-green-200">
                    <AlertDescription className="text-green-800">{costCenterTypeMessage}</AlertDescription>
                  </Alert>
                )}

                {/* Data Grid */}
                <div className="rounded-md border border-slate-300 overflow-hidden" dir="rtl">
                  {costCenterTypes && costCenterTypes.length > 0 ? (
                    <div className="h-[500px] min-h-[300px] overflow-y-auto [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-transparent scrollbar-hide">
                      <DataGridView 
                        scheme={costCenterTypeScheme} 
                        dataSource={costCenterTypes} 
                        innerRef={costCenterTypeGridRef}
                      />
                    </div>
                  ) : (
                    <div className="h-[500px] flex items-center justify-center bg-slate-50">
                      <p className="text-slate-500 text-sm">لا توجد بيانات - قم بإضافة نوع مركز تكلفة جديد</p>
                    </div>
                  )}
                </div>

              </div>
            </TabsContent>

            <TabsContent value="classification" className="space-y-4" dir="rtl">
              <div className="space-y-4">
                {/* Unified Classification Section */}
                
                {/* Header with Two Action Buttons */}
                <div className="flex items-center justify-end gap-3 bg-gradient-to-r from-orange-50 via-blue-50 to-slate-50 p-4 rounded-md border border-slate-200">
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={handleAddClassificationRow}
                    className="flex items-center gap-2 whitespace-nowrap bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    <Plus className="w-4 h-4" />
                    اضافة تصنيف جديد
                  </Button>
                  
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={handleAddClassificationType}
                    className="flex items-center gap-2 whitespace-nowrap bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    <Plus className="w-4 h-4" />
                    اضافة نوع جديد
                  </Button>
                </div>

                {/* Alert Messages */}
                {classificationTypeError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{classificationTypeError}</AlertDescription>
                  </Alert>
                )}
                {classificationTypeMessage && (
                  <Alert className="bg-green-50 border-green-200">
                    <AlertDescription className="text-green-800">{classificationTypeMessage}</AlertDescription>
                  </Alert>
                )}

                {/* Unified Classifications Grid */}
                <div className="rounded-md border border-slate-300 overflow-hidden" dir="rtl">
                  {classificationTypes && classificationTypes.length > 0 ? (
                    <div className="h-[600px] min-h-[300px] overflow-y-auto [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-transparent scrollbar-hide">
                      <DataGridView 
                        scheme={{
                          name: "AccountClassificationScheme",
                          columns: [
                            { header: "##", name: "__index__", width: 50, isReadOnly: true, visible: true },
                            { header: "معرف نوع التصنيف", name: "id", width: 120, isReadOnly: true, visible: false },
                            { header: "نوع التصنيف", name: "name", width: 200, isReadOnly: true, visible: true },
                            { header: "معرف التصنيف", name: "classification_id", width: 120, isReadOnly: true, visible: false },
                            { header: "التصنيف", name: "classification_name", width: "*", minWidth: 200, isReadOnly: true, visible: true },
                            {
                              name: 'btnSearchClassification',
                              header: ' ',
                              width: 65,
                              buttonBody: 'button',
                              align: 'center',
                              title: 'بحث',
                              iconType: 'search',
                              className: 'btn-search',
                              isReadOnly: true,
                              onClick: (e: any, ctx: any) => {
                                e.stopPropagation()
                                handleSelectClassificationType(ctx.row.index)
                                setSearchAccountClassificationOpen(true)
                              },
                              visible: true,
                              visibleInColumnChooser: true
                            },
                            {
                              name: 'btnDelete',
                              header: ' ',
                              width: 65,
                              buttonBody: 'button',
                              align: 'center',
                              title: 'حذف',
                              iconType: 'delete',
                              className: 'btn-delete',
                              isReadOnly: true,
                              onClick: (e: any, ctx: any) => {
                                e.stopPropagation()
                                handleDeleteAccountClassification(ctx.row.index)
                              },
                              visible: true,
                              visibleInColumnChooser: true
                            },
                          ],
                        }}
                        dataSource={classificationTypes
                          .sort((a: any, b: any) => (a.id || 0) - (b.id || 0))
                          .map((item: any, index: number) => ({
                            ...item,
                            __index__: index + 1
                          }))}
                        innerRef={accountClassificationGridRef}
                      />
                    </div>
                  ) : (
                    <div className="h-[600px] flex items-center justify-center bg-slate-50">
                      <p className="text-slate-500 text-sm">لا توجد أنواع تصنيفات - قم بإضافة نوع جديد</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <AccountSearchDialog
          open={searchModalOpen}
          onOpenChange={setSearchModalOpen}
          accounts={activeAccounts}
          onSelect={handleSelectSearchResult}
        />

        <SearchCostCenterDialog
          open={searchCostCenterOpen}
          onOpenChange={setSearchCostCenterOpen}
          type={selectedCostCenterType}
          costCenters={costCenters}
          onSelect={handleSelectCostCenter}
        />

        <SearchAccountClassificationDialog
          open={searchAccountClassificationOpen}
          onOpenChange={setSearchAccountClassificationOpen}
          type={selectedClassificationType?.id ? { 
            id: selectedClassificationType.id, 
            name: selectedClassificationType.name || "" 
          } : undefined}
          classifications={allClassifications}
          onSelect={handleSelectAccountClassification}
        />

        <ConfirmDialogYesNo
          visible={showDeleteConfirm}
          message="هل تريد حذف مركز التكلفة؟"
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setShowDeleteConfirm(false)
            setDeleteConfirmIndex(-1)
          }}
          isCompact={true}
        />

        <ConfirmDialogYesNo
          visible={showDeleteClassificationConfirm}
          message="هل تريد حذف التصنيف؟"
          onConfirm={handleConfirmDeleteClassification}
          onCancel={() => {
            setShowDeleteClassificationConfirm(false)
            setDeleteClassificationConfirmIndex(-1)
          }}
          isCompact={true}
        />

        <ConfirmDialogYesNo
          visible={showAccountDeleteConfirm}
          message="هل أنت متأكد من حذف السجل؟"
          onConfirm={handleConfirmDeleteAccount}
          onCancel={() => setShowAccountDeleteConfirm(false)}
        />

        <Dialog open={showClassificationTypeForm} onOpenChange={setShowClassificationTypeForm}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة نوع تصنيف جديد</DialogTitle>
              <DialogDescription>
                أدخل اسم نوع التصنيف الجديد
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {classificationTypeError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{classificationTypeError}</AlertDescription>
                </Alert>
              )}
              <div>
                <Label htmlFor="classificationTypeName" className="mb-2 block text-sm font-medium">
                  اسم النوع *
                </Label>
                <Input
                  id="classificationTypeName"
                  value={newClassificationTypeName}
                  onChange={(e) => setNewClassificationTypeName(e.target.value)}
                  placeholder="أدخل اسم النوع"
                  className="text-right"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowClassificationTypeForm(false)
                  setNewClassificationTypeName("")
                  setClassificationTypeError("")
                }}
              >
                إلغاء
              </Button>
              <Button 
                onClick={handleSaveClassificationType}
              >
                حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showClassificationForm} onOpenChange={setShowClassificationForm}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة تصنيف جديد</DialogTitle>
              <DialogDescription>
                حدد نوع التصنيف واسم التصنيف
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {classificationError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{classificationError}</AlertDescription>
                </Alert>
              )}
              <div>
                <Label htmlFor="classificationTypeSelect" className="mb-2 block text-sm font-medium">
                  نوع التصنيف *
                </Label>
                <PrimeDropdown
                  inputId="classificationTypeSelect"
                  value={newClassificationTypeId}
                  options={classificationTypes.map((type: any) => ({
                    label: type.name,
                    value: String(type.id),
                  }))}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="اختر نوع التصنيف"
                  filter={true}
                  filterInputAutoFocus={true}
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  onChange={(e: any) => {
                    setNewClassificationTypeId(e.value)
                    focusPrimeDropdownRoot(e)
                  }}
                  onHide={() => refocusDropdownInput("classificationTypeSelect")}
                />
              </div>
              <div>
                <Label htmlFor="classificationNameInput" className="mb-2 block text-sm font-medium">
                  اسم التصنيف *
                </Label>
                <Input
                  id="classificationNameInput"
                  value={newClassificationName}
                  onChange={(e) => setNewClassificationName(e.target.value)}
                  placeholder="أدخل اسم التصنيف"
                  className="text-right"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowClassificationForm(false)
                  setNewClassificationTypeId(null)
                  setNewClassificationName("")
                  setClassificationError("")
                }}
              >
                إلغاء
              </Button>
              <Button 
                onClick={handleSaveClassification}
              >
                حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showCostCenterTypeForm} onOpenChange={setShowCostCenterTypeForm}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة نوع مركز كلفة جديد</DialogTitle>
              <DialogDescription>
                أدخل اسم نوع مركز الكلفة الجديد
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {costCenterTypeError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{costCenterTypeError}</AlertDescription>
                </Alert>
              )}
              <div>
                <Label htmlFor="costCenterTypeName" className="mb-2 block text-sm font-medium">
                  اسم نوع مركز الكلفة *
                </Label>
                <Input
                  id="costCenterTypeName"
                  value={newCostCenterTypeName}
                  onChange={(e) => setNewCostCenterTypeName(e.target.value)}
                  placeholder="أدخل اسم النوع"
                  className="text-right"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCostCenterTypeForm(false)
                  setNewCostCenterTypeName("")
                  setCostCenterTypeError("")
                }}
              >
                إلغاء
              </Button>
              <Button 
                onClick={handleSaveCostCenterType}
              >
                حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialogYesNo
          visible={showUnsavedConfirm}
          message="تم تعديل السجل هل تريد الحفظ؟"
          onConfirm={async () => {
            setShowUnsavedConfirm(false)
            await handleSave({ closeAfterSave: true })
          }}
          onCancel={() => {
            setShowUnsavedConfirm(false)
            if (closeWindow) {
              closeWindow()
            }
          }}
          onBack={() => setShowUnsavedConfirm(false)}
          showBack={true}
        />
      </div>
    )
  }
}
