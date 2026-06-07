"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import AccountSearchDialog, { AccountItem } from "@/components/customer/account-search-dialog"
import SearchCostCenterDialog from "@/components/customer/search-cost-center-dialog"
import SearchAccountClassificationDialog from "@/components/customer/search-account-classification-dialog"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { toast } from "@/hooks/use-toast"

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
  onOpenChange?: (open: boolean) => void
  inWindowManager?: boolean
  closeWindow?: () => void
}

export default function UnifiedAccounts({ action, onOpenChange, inWindowManager, closeWindow }: UnifiedAccountsProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("main")
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [types, setTypes] = useState<AccountType[]>([])
  const [currencies, setCurrencies] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [costCenters, setCostCenters] = useState<any[]>([])
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
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

  // Search Modal States
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [searchTarget, setSearchTarget] = useState<"father" | "code">("father")
  const [fatherAccountName, setFatherAccountName] = useState("")

  // Refs
  const costCenterTypeGridRef = useRef<any>(null)
  const classificationTypeGridRef = useRef<any>(null)
  const accountClassificationGridRef = useRef<any>(null)
  const accountNameInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError("")
    try {
      const [typesRes, accountsRes] = await Promise.all([
        fetch("/api/account-classification-types"),
        fetch("/api/accounts"),
      ])

      if (!typesRes.ok || !accountsRes.ok) {
        const statusMsg = !typesRes.ok ? `Types API (${typesRes.status})` : `Accounts API (${accountsRes.status})`
        setError(`Failed to load data: ${statusMsg}`)
        console.error(`API Error: ${statusMsg}`)
        return
      }

      const typesData = await typesRes.json()
      const accountsData = await accountsRes.json()
      let currenciesData: any[] = []
      let companiesData: any[] = []
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
        (Array.isArray(accountsData) ? accountsData : []).map((item: any) => ({
          ...item,
          code: item.code || item.account_code || "",
          name: item.name || item.account_name || "",
          type: Number(item.type || item.classification_type_id || 0),
          level_no: Number(item.level_no || 1),
          finanical_list_id: Number(item.finanical_list_id || 1),
        })),
      )
      setCurrencies(Array.isArray(currenciesData) ? currenciesData : [])
      setCompanies(Array.isArray(companiesData) ? companiesData : [])
      // Map state_status to status_id (1=اختياري, 2=اجباري, 3=ممنوع)
      const mappedCostCenterTypes = Array.isArray(costCenterTypesData)
        ? costCenterTypesData.map((type: any) => {
            const statusMap: { [key: string]: number } = {
              'اختياري': 1,
              'اجباري': 2,
              'ممنوع': 3
            }
            const state_status = type.state_status || 'اختياري'
            const status_id = statusMap[state_status] || 1
            return { ...type, state_status, status_id }
          })
        : []
      // Sort by ID in ascending order
      if (Array.isArray(mappedCostCenterTypes)) {
        mappedCostCenterTypes.sort((a, b) => (a.id || 0) - (b.id || 0))
      }
      setCostCenterTypes(mappedCostCenterTypes)
      setCostCenters(Array.isArray(costCentersData) ? costCentersData : [])
      setClassificationTypes(Array.isArray(classificationTypesData) ? classificationTypesData : [])
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
    } finally {
      setLoading(false)
    }
  }

  const currentAccount = useMemo(() => accounts[currentIndex] || null, [accounts, currentIndex])

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
            cost_center_id: null,
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
            status_id: statusIds[nextIndex]
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
        { header: "Status ID", name: "status_id", width: 0, isReadOnly: true, visible: false },
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

  const loadAccountToForm = useCallback((account: AccountItem) => {
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
    // Set father account name
    if (account.father_id) {
      const father = accounts.find((a) => a.id === account.father_id)
      setFatherAccountName(father ? `${father.code} ${father.name}` : "")
    } else {
      setFatherAccountName("")
    }
    // set preview if account has image url
    if ((account as any).image_url) {
      setImagePreview((account as any).image_url)
    } else {
      setImagePreview(null)
    }
  }, [accounts])

  const handleNew = async () => {
    const defaultCurrencyId = currencies[0] ? String(currencies[0].currency_id ?? currencies[0].id ?? "") : ""
    
    // Generate next account code - get max code from ALL accounts (not just type=1)
    let nextCode = ""
    try {
      // Fetch ALL accounts to find the max code
      const accountsRes = await fetch("/api/accounts")
      if (accountsRes.ok) {
        const data = await accountsRes.json()
        const allAccounts = Array.isArray(data) ? data : []
        
        // Fetch system settings for prefix and start number
        const settingsRes = await fetch("/api/settings/system")
        let prefix = "A"
        let accountStart = 1
        
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json()
          prefix = settingsData.accountPrefix || "A"
          accountStart = settingsData.accountStart || 1
        }
        
        // Get max code from ALL accounts
        let maxNumber = accountStart - 1
        if (allAccounts.length > 0) {
          allAccounts.forEach((acc: any) => {
            const code = acc.code || acc.account_code || ""
            // Extract numeric part from code
            const match = code.match(/\d+$/)
            if (match) {
              const num = parseInt(match[0], 10)
              if (num > maxNumber) {
                maxNumber = num
              }
            }
          })
        }
        
        // Generate next code - 8 characters total (prefix + 7 digits)
        const nextNumber = (maxNumber + 1).toString().padStart(7, "0")
        nextCode = prefix + nextNumber
      }
    } catch (err) {
      console.error("Error fetching next account code:", err)
      // Fallback to default (8 characters total)
      nextCode = "A0000001"
    }
    
    setFormData({
      id: 0,
      code: nextCode,
      name: "",
      name_lang2: "",
      type: types[0] ? String(types[0].id) : "",
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
    setDialogOpen(true)
    setActiveTab("main")
    
    // Focus on Arabic name input after dialog opens
    setTimeout(() => {
      accountNameInputRef.current?.focus()
    }, 100)
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
      setFatherAccountName(`${account.code} ${account.name}`)
    } else {
      const foundIndex = accounts.findIndex((item) => item.id === account.id)
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

    code = code.trim().toUpperCase()

    // Separate prefix (letters) and numeric part
    const match = code.match(/^([A-Z]*)(\d*)$/)
    if (!match) return code // invalid pattern (contains symbols)

    let [, prefix, numPart] = match
    const padLen = Math.max(codeLen - prefix.length, 0)
    const paddedNum = numPart.padStart(padLen, '0')

    return `${prefix}${paddedNum}`
  }

  // Reset fields but keep the code (similar to handleNew but preserves code)
  const resetFieldsWithCode = (codeToKeep: string) => {
    const defaultCurrencyId = currencies[0] ? String(currencies[0].currency_id ?? currencies[0].id ?? "") : ""
    
    setFormData({
      id: 0,
      code: codeToKeep,
      name: "",
      name_lang2: "",
      type: types[0] ? String(types[0].id) : "",
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
    setImagePreview(null)
    setImageFile(null)
    setFatherAccountName("")
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
          // Account found - load it
          setCurrentIndex(accounts.findIndex((a) => a.id === account.id))
          loadAccountToForm(account)
        }
      } else if (response.status === 404) {
        // Account not found - reset fields but keep code
        resetFieldsWithCode(code)
      } else if (response.status === 403) {
        setError('الحساب محذوف لا يمكن عرض بياناته')
        resetFieldsWithCode(code)
      }
    } catch (error) {
      console.error("Error searching for account:", error)
      setError("حدث خطأ أثناء البحث عن الحساب")
    }
  }

  // Handle account code input change - validate and clean
  const handleAccountCodeChange = (value: string) => {
    // Allow only A-Za-z0-9, max 8 characters
    const cleanValue = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8)
    setFormData({ ...formData, code: cleanValue.toUpperCase() })
  }

  // Handle account code blur - adjust and search
  const handleAccountCodeBlur = () => {
    const adjustedCode = adjustCode(formData.code)
    setFormData({ ...formData, code: adjustedCode })
    searchAccountByCode(adjustedCode)
  }

  useEffect(() => {
    console.log("[unified-refactored] mount/effect action:", action)
    if (action === "new") {
      setActiveTab("main")
      setDialogOpen(true)
      console.log("[unified-refactored] set dialogOpen true due to action=new")
    }
  }, [action])

  useEffect(() => {
    console.log("[unified-refactored] dialogOpen changed:", dialogOpen)
    if (onOpenChange) onOpenChange(dialogOpen)
  }, [dialogOpen, onOpenChange])

  useEffect(() => {
    if (dialogOpen) {
      loadData()
    }
  }, [dialogOpen])

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

  const handleSave = async () => {
    setError("")
    setMessage("")

    // Get and clean the form data
    const trimmedCode = formData.code.trim().toUpperCase()
    const trimmedName = formData.name.trim()
    
    // Validate that both fields are filled
    if (!trimmedCode) {
      setError("يجب ملء رقم الحساب")
      return
    }
    
    if (!trimmedName) {
      setError("يجب ملء اسم الحساب")
      return
    }

    // Adjust code if not already adjusted (ensure it's 8 characters)
    let finalCode = trimmedCode
    if (finalCode.length !== 8) {
      finalCode = adjustCode(finalCode)
    }

    // Validate account code length - must have 7 digit part (total 8 characters)
    const codeNumericPart = finalCode.match(/\d+$/)
    if (!codeNumericPart || codeNumericPart[0].length !== 7) {
      setError("طول رقم الحساب غير صحيح - يجب أن يكون الكود 8 أحرف (حرف واحد + 7 أرقام)")
      return
    }

    try {
      setSaving(true)
      const isEdit = currentAccount?.id != null
      const url = isEdit ? `/api/accounts/${currentAccount.id}` : "/api/accounts"
      const method = isEdit ? "PUT" : "POST"
      // prepare image base64 if available
      const imageBase64 = imagePreview && imagePreview.startsWith("data:") ? imagePreview.split(",")[1] : null

      const payload = {
        id: formData.id || 0,
        code: finalCode,
        name: formData.name.trim(),
        name_lang2: formData.name_lang2.trim() || null,
        type: formData.type ? Number(formData.type) : null,
        father_id: formData.father_id ? Number(formData.father_id) : null,
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
        return
      }

      const savedAccount = await response.json()
      const savedCode = savedAccount?.code || savedAccount?.account_code || finalCode
      const codeWasChanged = savedCode !== finalCode
      
      let messageText = isEdit ? "الحساب تم تحديثه بنجاح" : "الحساب تم إنشاؤه بنجاح"
      if (codeWasChanged && !isEdit) {
        messageText += ` (رقم الحساب: ${savedCode})`
      }
      
      // Show toast notification
      toast({
        title: "نجاح",
        description: messageText,
      })
      
      // If new account, reset form for next entry, otherwise close dialog
      if (!isEdit) {
        await handleNew()
      } else {
        setDialogOpen(false)
        await loadData()
      }
    } catch (err) {
      console.error(err)
      setError("خطأ في حفظ الحساب")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!currentAccount) return
    if (!window.confirm("Are you sure?")) return

    try {
      const response = await fetch(`/api/accounts/${currentAccount.id}`, { method: "DELETE" })
      if (!response.ok) {
        setError("فشل حذف الحساب")
        return
      }
      setMessage("الحساب تم حذفه بنجاح")
      setDialogOpen(false)
      await loadData()
    } catch (err) {
      console.error(err)
      setError("خطأ في حذف الحساب")
    }
  }

  const handleFirst = () => {
    if (accounts.length) {
      setCurrentIndex(0)
      loadAccountToForm(accounts[0])
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1
      setCurrentIndex(newIndex)
      loadAccountToForm(accounts[newIndex])
    }
  }

  const handleNext = () => {
    if (currentIndex < accounts.length - 1) {
      const newIndex = currentIndex + 1
      setCurrentIndex(newIndex)
      loadAccountToForm(accounts[newIndex])
    }
  }

  const handleLast = () => {
    if (accounts.length) {
      const lastIndex = accounts.length - 1
      setCurrentIndex(lastIndex)
      loadAccountToForm(accounts[lastIndex])
    }
  }

  const handleOpenDialog = () => {
    if (currentAccount) {
      loadAccountToForm(currentAccount)
    }
    setDialogOpen(true)
    setActiveTab("main")
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
                const status_id = statusMap[state_status] || 1
                
                // Preserve existing cost center selection from previous state
                const existingType = costCenterTypes.find((t: any) => t.id === type.id)
                
                return {
                  id: type.id,
                  name: type.name,
                  status: type.status,
                  state_status,
                  status_id,
                  cost_center_id: existingType?.cost_center_id || null,
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
            cost_center_id: center.id,
            cost_center_name: center.name,
            state_status: "اختياري", // Reset to default when new center selected
            status_id: 1 // Reset to default when new center selected
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

  if (loading) {
    return <div className="p-6 text-center">Loading...</div>
  }

  if (inWindowManager) {
    return (
      <div className="w-full h-full p-0 gap-0 flex flex-col overflow-hidden" dir="rtl">
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-blue-50 to-slate-50 px-6 py-4">
          <h2 className="text-xl font-semibold">اضافة حساب او تعديل حساب</h2>
          <Button variant="ghost" onClick={() => closeWindow && closeWindow()}>
            ✕
          </Button>
        </div>

        <div className="border-b bg-white/95 px-4 py-2">
          <UniversalToolbar
            currentRecord={accounts.length > 0 ? currentIndex + 1 : 0}
            totalRecords={accounts.length}
            onNew={handleNew}
            onSave={() => void handleSave()}
            onDelete={handleDelete}
            onFirst={handleFirst}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onLast={handleLast}
            canDelete={currentAccount?.id != null}
            isSaving={saving}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {message && (
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">{message}</AlertDescription>
            </Alert>
          )}


          <div className="space-y-4 border-b pb-4">
            <div className="grid gap-4 md:grid-cols-2 items-end">
              <div>
                <Label className="mb-2 block text-sm font-medium">رقم الحساب * (إنجليزي وأرقام فقط، حد أقصى 8 أحرف)</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    value={formData.code}
                    onChange={(e) => handleAccountCodeChange(e.target.value)}
                    onBlur={handleAccountCodeBlur}
                    placeholder=""
                    className="text-right flex-1 font-mono"
                    maxLength={8}
                    title="أدخل رقم الحساب بالحروف الإنجليزية والأرقام فقط"
                  />
                  <Button 
                    variant="default" 
                    onClick={() => handleOpenSearchModal("code")} 
                    className="px-4 flex items-center gap-2"
                    title="بحث عن حساب"
                  >
                    <Search className="w-4 h-4" />
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
                  className="text-right"
                />
              </div>
              <div>
                <Label className="mb-2 block text-sm font-medium">اسم الحساب (EN)</Label>
                <Input
                  value={formData.name_lang2}
                  onChange={(e) => setFormData({ ...formData, name_lang2: e.target.value })}
                  placeholder="Account name in English"
                  className="text-right"
                />
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList dir="rtl" className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-gradient-to-r from-slate-50 via-blue-50 to-slate-50 p-2 shadow-md border border-slate-200/60 backdrop-blur-sm">
              <TabsTrigger value="main" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">الرئيسية</TabsTrigger>
              <TabsTrigger value="additional-data" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">بيانات إضافية</TabsTrigger>
              <TabsTrigger value="cost-centers" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">مراكز التكلفة</TabsTrigger>
              <TabsTrigger value="classification" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-orange-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">تصنيفات الحساب</TabsTrigger>
              <TabsTrigger value="stop-transactions" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500 data-[state=active]:to-red-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">إيقاف الحركات</TabsTrigger>
              <TabsTrigger value="constraints" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">محددات الحساب</TabsTrigger>
              <TabsTrigger value="flags" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">إعدادات الحركة</TabsTrigger>
              <TabsTrigger value="extra" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-pink-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">بيانات إضافية أخرى</TabsTrigger>
            </TabsList>

            <TabsContent value="main" className="space-y-6">
              {/* Currency and Financial Settings */}
              <div className="space-y-4 border-b pb-6">
                <h4 className="font-semibold text-base">الإعدادات المالية</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="mb-2 block text-sm font-medium">الحساب الرئيسي (تابع ل)</Label>
                    <div className="flex gap-2 items-center">
                      <Input 
                        value={fatherAccountName} 
                        readOnly
                        placeholder="اختر الحساب الرئيسي" 
                        className="text-right flex-1" 
                      />
                      <Button 
                        variant="default" 
                        onClick={() => handleOpenSearchModal("father")}
                        className="px-4 flex items-center gap-2"
                        title="بحث عن الحساب الرئيسي"
                      >
                        <Search className="w-4 h-4" />
                      </Button>
                      {formData.father_id && (
                        <Button 
                          variant="destructive" 
                          onClick={() => {
                            setFormData({ ...formData, father_id: "" })
                            setFatherAccountName("")
                          }}
                          className="px-3 hover:bg-red-700 transition-colors duration-200 flex items-center gap-1"
                          title="مسح"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-medium">العملة</Label>
                    <PrimeDropdown
                      inputId="currency_id"
                      value={formData.currency_id ? Number(formData.currency_id) : null}
                      options={
                        currencies.map((c) => ({
                          label: c.currency_name || c.name || c.currency_code || "غير محدد",
                          value: c.currency_id ?? c.id,
                        }))
                      }
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
                    <span>الحساب يخضع لفرق العملة</span>
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold text-base">بيانات إضافية</h4>
                <div className="grid gap-4 md:grid-cols-1">
                  <div>
                    <Label className="mb-2 block text-sm font-medium">ملاحظات</Label>
                    <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="text-right" rows={4} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={formData.show_notes_in_transactions_soa}
                      onCheckedChange={(checked) => setFormData({ ...formData, show_notes_in_transactions_soa: checked as boolean })}
                    />
                    <span className="text-sm">إظهار ملاحظة الحساب في الحركات و طباعة كشف الحساب</span>
                  </div>
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
          accounts={accounts}
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
      </div>
    )
  }
}
