"use client"

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import AccountSearchDialog, { AccountItem } from "@/components/customer/account-search-dialog"
import SearchCostCenterDialog from "@/components/customer/search-cost-center-dialog"
import SearchAccountClassificationDialog from "@/components/customer/search-account-classification-dialog"
import MultiSelect from "@/components/common/MultiSelect"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ProgressSpinner from "../ProgressSpinner/ProgressSpinner"
import { attachEnterAsTab } from "@/components/common/enterAsTab"
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
import { Plus, AlertCircle, Search, X, BookOpen, Folder, FolderOpen, FolderTree, FileText, Minus } from "lucide-react"
import PrimeDropdown from "@/components/common/FocusDropdown"
import DataGridView from "../common/DataGridView"
import Messages from "../common/Messages"
import { isSameDay } from "date-fns"
import { useWorkspaceTabActive } from "@/contexts/workspace-tab-context"
import { useNavigationGuard } from "@/lib/navigation-guard"

interface AccountType {
  id: number
  name: string
}

interface AccountTreeNode extends AccountItem {
  children: AccountTreeNode[]
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
  // فروع تقييد ظهور الحساب بالبحث (اختياري) — مصفوفة فارغة = يظهر لكل الفروع (الافتراضي/الحالي)،
  // وإلا يظهر فقط لمستخدم فرعه أحد هذه المعرّفات (انظر account_branches بـapp/api/accounts/route.ts
  // وتصفية x-branch-id بـauth-context.tsx).
  branch_ids: number[]
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
  const workspaceTabActive = useWorkspaceTabActive()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("main")
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const loadDataPromiseRef = useRef<Promise<any[]> | null>(null)
  const [types, setTypes] = useState<AccountType[]>([])
  // خيارات حقل "الفروع" (تقييد ظهور الحساب بالبحث) — انظر branch_ids بـFormState.
  const [branches, setBranches] = useState<Array<{ id: number; branch_name: string }>>([])
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
  const [selectedTreeAccountId, setSelectedTreeAccountId] = useState<number | null>(null)
  const [focusedTreeAccountId, setFocusedTreeAccountId] = useState<number | null>(null)
  const [expandedTreeAccountIds, setExpandedTreeAccountIds] = useState<Set<number>>(() => new Set())
  const [accountTreeSearch, setAccountTreeSearch] = useState("")

  // Refs
  const costCenterTypeGridRef = useRef<any>(null)
  const classificationTypeGridRef = useRef<any>(null)
  const accountClassificationGridRef = useRef<any>(null)
  const treeAccountRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const accountCodeInputRef = useRef<HTMLInputElement>(null)
  const accountNameInputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<any>(null)
  const fetchingNextCodeRef = useRef(false)
  const dialogWasOpenRef = useRef(false)
  const dirtySnapshotRef = useRef("")
  const syncCleanSnapshotAfterRenderRef = useRef(false)

  const serializeAccountSnapshot = useCallback(
    (values: {
      formData: FormState
      financialListType: string
      fatherAccountName: string
      imagePreview: string | null
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
          branch_ids: [...(values.formData.branch_ids || [])].sort((a, b) => a - b),
        },
        financialListType: values.financialListType,
        fatherAccountName: values.fatherAccountName,
        imagePreview: values.imagePreview,
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
    branch_ids: [],
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
        imagePreview,
        stopTransactionRows,
        costCenterTypes,
        accountClassifications,
      }),
    [serializeAccountSnapshot, formData, financialListType, fatherAccountName, imagePreview, stopTransactionRows, costCenterTypes, accountClassifications],
  )

  useLayoutEffect(() => {
    if (syncCleanSnapshotAfterRenderRef.current) {
      dirtySnapshotRef.current = currentSnapshot
      syncCleanSnapshotAfterRenderRef.current = false
    }
    if (onDirtyChange) {
      onDirtyChange(currentSnapshot !== dirtySnapshotRef.current)
    }
  }, [currentSnapshot, onDirtyChange])

  const selectedParentAccount = useMemo(() => {
    const fatherId = Number(formData.father_id || 0)
    if (fatherId <= 0) return null
    return accounts.find((account) => Number(account.id) === fatherId) ?? null
  }, [accounts, formData.father_id])

  useEffect(() => {
    if (!selectedParentAccount || formData.id !== 0) return

    setFormData((prev) => ({
      ...prev,
      finanical_list_id: String(selectedParentAccount.finanical_list_id || 1),
      finanical_list_assests_id: selectedParentAccount.finanical_list_assests_id ? String(selectedParentAccount.finanical_list_assests_id) : "",
      finanical_list_liabilities_id: selectedParentAccount.finanical_list_liabilities_id ? String(selectedParentAccount.finanical_list_liabilities_id) : "",
      finanical_list_income_id: selectedParentAccount.finanical_list_income_id ? String(selectedParentAccount.finanical_list_income_id) : "",
    }))
    setFinancialListType(String(selectedParentAccount.finanical_list_id || 1))
  }, [selectedParentAccount, formData.id])

  useEffect(() => {
    loadData()
  }, [])

  const loadDataImpl = async () => {
    setError("")
    try {
      const optionalJson = async (url: string) => {
        try {
          const response = await fetch(url)
          return response.ok ? await response.json() : null
        } catch {
          return null
        }
      }
      const [typesRes, accountsRes, ratesJson, costCenterTypesJson, branchesJson, voucherTypesJson, costCentersJson, classificationsJson, assetsJson, liabilitiesJson, incomeJson] = await Promise.all([
        fetch("/api/account-classification-types"),
        fetch("/api/accounts"),
        optionalJson("/api/exchange-rates"),
        optionalJson("/api/cost-center-types"),
        optionalJson("/api/branches"),
        optionalJson("/api/vouchers/voucher-types"),
        optionalJson("/api/cost-centers"),
        optionalJson("/api/account-classifications"),
        optionalJson("/api/balance-sheet-assets-items"),
        optionalJson("/api/balance-sheet-liabilities-items"),
        optionalJson("/api/income-statement-items"),
      ])

      if (!typesRes.ok || !accountsRes.ok) {
        const statusMsg = !typesRes.ok ? `Types API (${typesRes.status})` : `Accounts API (${accountsRes.status})`
        setError(`Failed to load data: ${statusMsg}`)
        console.error(`API Error: ${statusMsg}`)
      }

      const typesData = await typesRes.json()
      const accountsData = await accountsRes.json()
      const currenciesData = Array.isArray(ratesJson?.rates)
        ? ratesJson.rates
        : (ratesJson == null ? await optionalJson("/api/currencies") : [])
      const companiesData: any[] = []
      const voucherTypesData = Array.isArray(voucherTypesJson) ? voucherTypesJson : []
      const costCenterTypesData = Array.isArray(costCenterTypesJson) ? costCenterTypesJson : []
      const costCentersData = Array.isArray(costCentersJson) ? costCentersJson.sort((a: any, b: any) => (a.id || 0) - (b.id || 0)) : []
      const classificationTypesData = Array.isArray(typesData) ? typesData : []
      const classificationsData = Array.isArray(classificationsJson) ? classificationsJson.sort((a: any, b: any) => (a.id || 0) - (b.id || 0)) : []
      const normalizeNames = (value: any) => Array.isArray(value)
        ? value.map((item: any) => ({ ...item, id: item.id != null ? Number(item.id) : item.id, name: item.name ?? item.asset_name ?? item.label ?? "" }))
        : []
      const balanceSheetAssetsData = normalizeNames(assetsJson)
      const balanceSheetLiabilitiesData = normalizeNames(liabilitiesJson)
      const incomeStatementData = normalizeNames(incomeJson)
      setBranches(Array.isArray(branchesJson) ? branchesJson : [])

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

      // Return voucher types data for immediate use
      return Array.isArray(voucherTypesData) ? voucherTypesData : []
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error("Error loading data:", err)
      setError(`Error loading data: ${errorMsg}`)
      return []
    }
  }

  const loadData = () => {
    if (loadDataPromiseRef.current) return loadDataPromiseRef.current
    const request = loadDataImpl().finally(() => {
      if (loadDataPromiseRef.current === request) loadDataPromiseRef.current = null
    })
    loadDataPromiseRef.current = request
    return request
  }

  const activeAccounts = useMemo(
    () => accounts.filter((account) => Number(account.status ?? 1) !== 3),
    [accounts],
  )

  const accountTree = useMemo(() => {
    const nodes = new Map<number, AccountTreeNode>()
    activeAccounts.forEach((account) => nodes.set(Number(account.id), { ...account, children: [] }))
    const roots: AccountTreeNode[] = []
    nodes.forEach((node) => {
      const parent = node.father_id ? nodes.get(Number(node.father_id)) : undefined
      if (parent) parent.children.push(node)
      else roots.push(node)
    })
    const sort = (items: AccountTreeNode[]) => {
      items.sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }))
      items.forEach((item) => sort(item.children))
    }
    sort(roots)
    return roots
  }, [activeAccounts])

  useEffect(() => {
    if (focusedTreeAccountId == null) return

    const frame = requestAnimationFrame(() => {
      const row = treeAccountRefs.current.get(focusedTreeAccountId)
      row?.scrollIntoView({ block: "nearest", inline: "nearest" })
      row?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusedTreeAccountId])

  const filteredAccountTree = useMemo(() => {
    const query = accountTreeSearch.trim().toLocaleLowerCase()
    if (!query) return accountTree
    const filterNodes = (nodes: AccountTreeNode[]): AccountTreeNode[] => nodes.flatMap((node) => {
      const children = filterNodes(node.children)
      const matches = `${node.code} ${node.name} ${node.name_lang2 || ""}`.toLocaleLowerCase().includes(query)
      return matches || children.length ? [{ ...node, children }] : []
    })
    return filterNodes(accountTree)
  }, [accountTree, accountTreeSearch])

  const selectedTreeAccount = useMemo(
    () => activeAccounts.find((account) => Number(account.id) === selectedTreeAccountId) ?? null,
    [activeAccounts, selectedTreeAccountId],
  )

  const renderAccountTreeNode = (node: AccountTreeNode, depth = 0): React.ReactNode => {
    const expanded = Boolean(accountTreeSearch.trim()) || expandedTreeAccountIds.has(Number(node.id))
    const selected = selectedTreeAccountId === Number(node.id)
    const focused = focusedTreeAccountId === Number(node.id)
    return (
      <div key={node.id}>
        <div className={`flex min-h-7 min-w-0 items-center gap-1 rounded-sm px-1 ${selected ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300" : focused ? "bg-sky-50 text-sky-900 ring-1 ring-sky-300" : "hover:bg-slate-100"}`} style={{ paddingLeft: `${depth * 13}px` }}>
          <button
            type="button"
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border border-slate-400 bg-white text-slate-700 ${node.children.length ? "visible" : "invisible"}`}
            aria-label={expanded ? "طي الحسابات الفرعية" : "توسيع الحسابات الفرعية"}
            onClick={() => setExpandedTreeAccountIds((previous) => {
              const next = new Set(previous)
              if (next.has(Number(node.id))) next.delete(Number(node.id))
              else next.add(Number(node.id))
              return next
            })}
          >
            {expanded ? <Minus className="h-2.5 w-2.5" strokeWidth={2.5} /> : <Plus className="h-2.5 w-2.5" strokeWidth={2.5} />}
          </button>
          {node.children.length ? (
            expanded ? <FolderOpen className="h-4 w-4 shrink-0 text-emerald-700" /> : <Folder className="h-4 w-4 shrink-0 text-emerald-700" />
          ) : <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
          <button
            type="button"
            ref={(element) => {
              if (element) treeAccountRefs.current.set(Number(node.id), element)
              else treeAccountRefs.current.delete(Number(node.id))
            }}
            onClick={() => {
              setSelectedTreeAccountId(Number(node.id))
              setFocusedTreeAccountId(Number(node.id))
            }}
            onDoubleClick={() => guardUnsaved(() => {
              const index = activeAccounts.findIndex((account) => Number(account.id) === Number(node.id))
              if (index >= 0) setCurrentIndex(index)
              loadAccountToForm(node)
              setSelectedTreeAccountId(Number(node.id))
              setFocusedTreeAccountId(Number(node.id))
            })}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-right text-xs"
            title={`${node.code} - ${node.name}`}
            dir="rtl"
          >
            <span className="min-w-0 flex-1 truncate text-right font-medium">{node.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-slate-500" dir="ltr">{node.code}</span>
          </button>
        </div>
        {expanded && node.children.length > 0 && (
          <div className="ml-[7px] border-l border-slate-300 pl-0.5">
            {node.children.map((child) => renderAccountTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const currentAccount = useMemo(() => activeAccounts[currentIndex] || null, [activeAccounts, currentIndex])
  const isNonLedgerAccount = formData.id !== 0 && Number(formData.type) !== 1

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

  const stopTransactionRowsMatch = useCallback((left: any[], right: any[]) => JSON.stringify(left) === JSON.stringify(right), [])

  useEffect(() => {
    if (!currentAccount) return
    const nextRows = buildStopTransactionRows(voucherTypes, (currentAccount as any).stop_transactions || [])
    setStopTransactionRows((prev) => (stopTransactionRowsMatch(prev, nextRows) ? prev : nextRows))
  }, [currentAccount, voucherTypes, buildStopTransactionRows, stopTransactionRowsMatch])

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
              disabled={true}
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
    setFocusedTreeAccountId(Number(account.id))
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
    const classificationByType = new Map<number, any>()
    nextAccountClassifications.forEach((row: any) => {
      const classificationId = Number(row?.classification_id)
      if (!classificationId) return
      const classification = allClassifications.find((item) => Number(item.id) === classificationId)
      if (classification && classification.classification_type_id != null) {
        classificationByType.set(Number(classification.classification_type_id), classification)
      }
    })
    const nextClassificationTypes = classificationTypesRef.current.map((type) => {
      const selectedClassification = classificationByType.get(Number(type.id))
      return {
        ...type,
        classification_id: selectedClassification?.id ?? null,
        classification_name: selectedClassification?.name ?? "",
      }
    })
    const nextFatherName = resolveFatherAccountLabel(account)
    const nextFatherAccount = account.father_id ? activeAccounts.find((item) => Number(item.id) === Number(account.father_id)) : null
    const nextFinancialListId = Number(account.finanical_list_id ?? (account as any).financial_list_id ?? 0)
    const safeFinancialListId = Number.isFinite(nextFinancialListId) && nextFinancialListId > 0 ? nextFinancialListId : 1
    const nextFinancialListAssetsId = account.finanical_list_assests_id ?? (account as any).financial_list_assests_id ?? ""
    const nextFinancialListLiabilitiesId = account.finanical_list_liabilities_id ?? (account as any).financial_list_liabilities_id ?? ""
    const nextFinancialListIncomeId = account.finanical_list_income_id ?? (account as any).financial_list_income_id ?? ""

    setFormData({
      id: account.id || 0,
      code: account.code || "",
      name: account.name || "",
      name_lang2: account.name_lang2 || "",
      type: String(account.type || ""),
      father_id: account.father_id ? String(account.father_id) : "",
      level_no: String(account.level_no || 1),
      finanical_list_id: String(safeFinancialListId),
      finanical_list_assests_id: nextFinancialListAssetsId ? String(nextFinancialListAssetsId) : "",
      finanical_list_liabilities_id: nextFinancialListLiabilitiesId ? String(nextFinancialListLiabilitiesId) : "",
      finanical_list_income_id: nextFinancialListIncomeId ? String(nextFinancialListIncomeId) : "",
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
      branch_ids: Array.isArray((account as any).branch_ids) ? (account as any).branch_ids.map(Number) : [],
    })
    setFinancialListType(String(safeFinancialListId))
    setCostCenterTypes(nextCostCenterTypes)
    setAccountClassifications(nextAccountClassifications)
    setClassificationTypes(nextClassificationTypes)
    // Set father account name
    setFatherAccountName(nextFatherName)
    setFatherAccountCode(nextFatherAccount?.code || "")
    // set preview if account has image url
    if ((account as any).image_url) {
      setImagePreview((account as any).image_url)
    } else {
      setImagePreview(null)
    }
    const nextStopRows = buildStopTransactionRows(voucherTypes, (account as any).stop_transactions || [])
    setStopTransactionRows((prev) => (stopTransactionRowsMatch(prev, nextStopRows) ? prev : nextStopRows))
    dirtySnapshotRef.current = serializeAccountSnapshot({
      formData: {
        id: account.id || 0,
        code: account.code || "",
        name: account.name || "",
        name_lang2: account.name_lang2 || "",
        type: String(account.type || ""),
        father_id: account.father_id ? String(account.father_id) : "",
        level_no: String(account.level_no || 1),
        finanical_list_id: String(safeFinancialListId),
        finanical_list_assests_id: nextFinancialListAssetsId ? String(nextFinancialListAssetsId) : "",
        finanical_list_liabilities_id: nextFinancialListLiabilitiesId ? String(nextFinancialListLiabilitiesId) : "",
        finanical_list_income_id: nextFinancialListIncomeId ? String(nextFinancialListIncomeId) : "",
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
        branch_ids: Array.isArray((account as any).branch_ids) ? (account as any).branch_ids.map(Number) : [],
      },
      financialListType: String(safeFinancialListId),
      fatherAccountName: nextFatherName,
      imagePreview: (account as any).image_url || null,
      stopTransactionRows: buildStopTransactionRows(voucherTypes, (account as any).stop_transactions || []),
      costCenterTypes: nextCostCenterTypes,
      accountClassifications: nextAccountClassifications,
    })
    syncCleanSnapshotAfterRenderRef.current = true
    // عرض حساب (فتح/تنقل): التركيز على اسم الحساب كما في الحساب الجديد
    setTimeout(() => { accountNameInputRef.current?.focus(); accountNameInputRef.current?.select() }, 120)
  }, [activeAccounts, resolveFatherAccountLabel, voucherTypes, buildStopTransactionRows, costCenters])

  const nextChildAccountCode = (parent: AccountItem, additionalChildCodes: string[] = []) => {
    const parentCode = String(parent.code || "").trim()
    if (!/^\d+$/.test(parentCode)) return ""
    let lastCode = Number(parentCode)
    if (!Number.isSafeInteger(lastCode)) return ""
    activeAccounts
      .filter((account) => Number(account.father_id || 0) === Number(parent.id))
      .forEach((account) => {
        const code = String(account.code || "").trim()
        const numericCode = Number(code)
        if (/^\d+$/.test(code) && code.length === parentCode.length && Number.isSafeInteger(numericCode) && numericCode > lastCode) lastCode = numericCode
      })
    additionalChildCodes.forEach((codeValue) => {
      const code = String(codeValue || "").trim()
      const numericCode = Number(code)
      if (/^\d+$/.test(code) && code.length === parentCode.length && Number.isSafeInteger(numericCode) && numericCode > lastCode) lastCode = numericCode
    })
    let nextValue = lastCode + 1
    while (Number.isSafeInteger(nextValue) && String(nextValue).length <= parentCode.length) {
      const candidate = String(nextValue).padStart(parentCode.length, "0")
      if (!activeAccounts.some((account) => String(account.code || "").trim() === candidate) && !additionalChildCodes.includes(candidate)) return candidate
      nextValue += 1
    }
    return ""
  }

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

  const handleNew = async () => {
    let parent = selectedTreeAccount
    if (parent && Number(parent.type) !== 1) {
      showValidationMessage("لا يمكن إضافة حساب فرعي؛ يجب أن يكون الحساب الأب من نوع حساب محاسبي")
      return
    }
    let childCode = parent ? nextChildAccountCode(parent) : undefined
    if (parent && !childCode) {
      parent = null
      childCode = undefined
      setSelectedTreeAccountId(null)
    }
    await reset_fields(childCode, parent)
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
      guardUnsaved(() => {
        const foundIndex = activeAccounts.findIndex((item) => item.id === account.id)
        if (foundIndex >= 0) setCurrentIndex(foundIndex)
        loadAccountToForm(account)
      })
    }
    setSearchModalOpen(false)
  }

  // Adjust account code to 10 characters using letters prefix + padded digits
  const adjustCode = (code: string, codeLen: number = 10): string => {
    if (!code || !code.trim()) return ''

    const cleaned = code.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    const match = cleaned.match(/^([A-Z]*)(\d*)$/)
    if (!match) {
      return cleaned.slice(0, codeLen).padEnd(codeLen, '0')
    }

    const [, prefix, numPart] = match
    const padLen = Math.max(codeLen - prefix.length, 0)
    const paddedNumber = numPart.padStart(padLen, '0')
    return `${prefix}${paddedNumber}`.slice(0, codeLen)
  }

  const handleAccountCodeKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const adjustedCode = adjustCode(formData.code)
      setFormData((prev) => ({ ...prev, code: adjustedCode }))
      const result = await searchAccountByCode(adjustedCode)
      if (result === 'found') {
        accountNameInputRef.current?.focus()
      }
      return
    }

    if (e.key === 'Tab') {
      const adjustedCode = adjustCode(formData.code)
      if (adjustedCode !== formData.code) {
        setFormData({ ...formData, code: adjustedCode })
      }
      return
    }
  }

  // Reset all fields to blank/default (for new account entry)
  const reset_fields = useCallback(async (codeOverride?: string, parentAccount?: AccountItem | null) => {
    const defaultCurrencyId = currencies && currencies.length > 0 ? String(currencies[0].currency_id ?? currencies[0].id ?? "") : "1"
    messagesRef.current?.clear?.()
    // Fetch next account code from API - prevent concurrent calls
    let nextCode = codeOverride || "A0000001"
    if (!codeOverride && !fetchingNextCodeRef.current) {
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
    const initialFormData: FormState = {
      id: 0,
      code: nextCode,
      name: "",
      name_lang2: "",
      type: types && types.length > 0 ? String(types[0].id) : "",
      father_id: parentAccount ? String(parentAccount.id) : "",
      level_no: parentAccount ? String(Number(parentAccount.level_no || 1) + 1) : "1",
      finanical_list_id: String(parentAccount?.finanical_list_id || 1),
      finanical_list_assests_id: parentAccount?.finanical_list_assests_id ? String(parentAccount.finanical_list_assests_id) : "",
      finanical_list_liabilities_id: parentAccount?.finanical_list_liabilities_id ? String(parentAccount.finanical_list_liabilities_id) : "",
      finanical_list_income_id: parentAccount?.finanical_list_income_id ? String(parentAccount.finanical_list_income_id) : "",
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
      branch_ids: [],
    }
    const nextFinancialListType = String(parentAccount?.finanical_list_id || 1)
    const nextFatherAccountName = parentAccount ? formatAccountLabel(parentAccount) : ""
    setFormData(initialFormData)
    setFinancialListType(nextFinancialListType)
    setFatherAccountCode(parentAccount?.code || "")
    setFatherAccountName(nextFatherAccountName)
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
      formData: initialFormData,
      financialListType: nextFinancialListType,
      fatherAccountName: nextFatherAccountName,
      imagePreview: null,
      stopTransactionRows: buildStopTransactionRows(voucherTypes, []),
      costCenterTypes: costCenterTypes.map((type) => ({
        ...type,
        cost_center_id: null,
        default_cost_center_id: null,
        cost_center_name: "",
      })),
      accountClassifications: classificationTypesRef.current || [],
    })
    syncCleanSnapshotAfterRenderRef.current = true

    setTimeout(() => {
      accountNameInputRef.current?.focus()
    }, 100)
  }, [currencies, types, voucherTypes, buildStopTransactionRows, formatAccountLabel])

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
      branch_ids: [],
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
        branch_ids: [],
      },
      financialListType: "1",
      fatherAccountName: "",
      imagePreview: null,
      stopTransactionRows: buildStopTransactionRows(voucherTypes, []),
      costCenterTypes: resetCostCenterTypes,
      accountClassifications: classificationTypesRef.current || [],
    })
    syncCleanSnapshotAfterRenderRef.current = true
  }

  // Search for account by code
  const searchAccountByCode = async (code: string): Promise<'deleted' | 'invalid-type' | 'found' | 'not-found' | 'error'> => {
    if (!code || code.length === 0) return 'not-found'

    try {
      setError("")

      const response = await fetch(`/api/accounts/search?code=${encodeURIComponent(code)}`)
      if (response.ok) {
        const account = await response.json()
        if (account && account.id) {
          if (Number(account.status ?? 1) === 3) {
            
            messagesRef.current?.clear?.()
            messagesRef.current?.show({
              severity: "error",
              summary: "",
              detail: "لا يمكن عرض حساب محذوف",
              sticky: false,
              life: 5000,
            })
            accountCodeInputRef.current?.focus()
            return 'deleted'
          }

          if (Number(account.type ?? 0) !== 1) {
            await resetFieldsWithCode(code)
            messagesRef.current?.clear?.()
            messagesRef.current?.show({
              severity: "error",
              summary: "",
              detail: "لا يمكن عرض الحساب يجب ان يكون من نوع حساب محاسبي فقط",
              sticky: false,
              life: 5000,
            })
            accountCodeInputRef.current?.focus()
            return 'invalid-type'
          }

          // A code typed into the code field is a lookup key. Exclude that temporary
          // value when checking other edits so it is never accidentally saved over
          // the account currently being edited.
          let originalCode = ""
          try {
            originalCode = JSON.parse(dirtySnapshotRef.current)?.formData?.code ?? ""
          } catch {
            originalCode = formData.code
          }
          const draftWithoutLookupCode = serializeAccountSnapshot({
            formData: { ...formData, code: originalCode },
            financialListType,
            fatherAccountName,
            imagePreview,
            stopTransactionRows,
            costCenterTypes,
            accountClassifications,
          })
          setFormData((previous) => ({ ...previous, code: originalCode }))
          const openFoundAccount = () => {
            const foundIndex = activeAccounts.findIndex((item) => Number(item.id) === Number(account.id))
            if (foundIndex >= 0) setCurrentIndex(foundIndex)
            loadAccountToForm(account)
          }
          if (draftWithoutLookupCode !== dirtySnapshotRef.current) guardUnsaved(openFoundAccount)
          else openFoundAccount()
          return 'found'
        }
      } else if (response.status === 404) {
        // Account not found - reset fields but keep code
        resetFieldsWithCode(code)
        return 'not-found'
      } else if (response.status === 403) {
        resetFieldsWithCode(code)
        
        accountNameInputRef.current?.focus()
        return 'not-found'
      }
    } catch (error) {
      console.error("Error searching for account:", error)
      setError("حدث خطأ أثناء البحث عن الحساب")
      return 'error'
    }
    return 'error'
  }

  // Handle account code input change - validate and clean
  const handleAccountCodeChange = (value: string) => {
    // Allow only English letters and digits, then force uppercase
    const cleanValue = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase()
    setFormData({ ...formData, code: cleanValue })
  }

  // Handle account code blur - adjust and search
  const handleAccountCodeBlur = async () => {
    const adjustedCode = adjustCode(formData.code)
    setFormData({ ...formData, code: adjustedCode })
    const result = await searchAccountByCode(adjustedCode)
    if (result === 'found') {
      accountNameInputRef.current?.focus()
    }
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

        // Wait for definitions to load and get voucher types
        const loadedVoucherTypes = await loadData()

        // Only reset the form when the dialog is opened for a new account.
        // When `accountId` is set, the dedicated accountId effect loads the row.
        if (accountId == null) {
          // New account entry
          await handleNew()
          // Populate stopTransactionRows with loaded voucher types immediately
          setStopTransactionRows(buildStopTransactionRows(loadedVoucherTypes, []))
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
  }, [dialogOpen, accountId, loadAccountToForm, handleNew, buildStopTransactionRows])

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
        } catch (_) { }
      }
    }
  }, [costCenterTypes])

  const handleSave = async (options?: { closeAfterSave?: boolean }): Promise<boolean> => {
    if (isNonLedgerAccount) {
      showValidationMessage("هذا الحساب تابع لتعريف عميل أو مورد أو مشترك أو موظف، ويتم تعديله من صفحته المخصصة")
      return false
    }
    setError("")
    setMessage("")
    messagesRef.current?.clear?.()

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

    if (!/^[A-Z0-9]{10}$/.test(trimmedCode)) {
      showValidationMessage("يجب أن يكون رقم الحساب 10 أحرف إنجليزية أو أرقام وبحروف كبيرة")
      return false
    }

    if (trimmedName.length > 100) {
      showValidationMessage("اسم الحساب يجب ألا يتجاوز 100 حرف")
      return false
    }

    const trimmedEnglishName = formData.name_lang2.trim()
    if (trimmedEnglishName.length > 150) {
      showValidationMessage("اسم الحساب بالإنجليزية يجب ألا يتجاوز 150 حرفاً")
      return false
    }

    if (!["1", "2", "3"].includes(financialListType)) {
      showValidationMessage("يرجى اختيار القائمة المالية")
      return false
    }

    const normalizedName = trimmedName.toLowerCase()
    const duplicateAccount = activeAccounts.find((account) => {
      if (Number(account.id) === Number(formData.id)) return false
      return String(account.name || "").trim().toLowerCase() === normalizedName
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
    if (finalCode.length !== 10) {
      finalCode = adjustCode(finalCode)
    }

    // Validate account code length - must be exactly 10 uppercase English alphanumeric characters
    if (!/^[A-Z0-9]{10}$/.test(finalCode)) {
      showValidationMessage("طول رقم الحساب غير صحيح - يجب أن يكون 10 أحرف إنجليزية أو أرقام وبحروف كبيرة")
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
      if (Number(fatherAccount.type) !== 1) {
        showValidationMessage("لا يمكن إضافة حساب فرعي؛ يجب أن يكون الحساب الأب من نوع حساب محاسبي")
        return false
      }
      const sameFatherId = Number(fatherAccount.id) === Number(formData.id) && Number(formData.id) !== 0
      const sameFatherCode = String(fatherAccount.code ?? "").toUpperCase() === finalCode

      if (sameFatherId || sameFatherCode) {
        showValidationMessage("لا يمكن ان يكون الحساب اب لنفسه")
        return false
      }
    }

    const finalNameLang2 = trimmedEnglishName || trimmedName
    if (!trimmedEnglishName) {
      setFormData((prev) => ({ ...prev, name_lang2: trimmedName }))
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
      const classificationsData: any[] = Array.isArray(classificationTypes)
        ? classificationTypes
            .filter((row) => row.classification_id != null)
            .map((row) => ({ classification_id: row.classification_id }))
        : []

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
        name_lang2: finalNameLang2,
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
        branch_ids: formData.branch_ids || [],
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
      const nextParent = isNewAccount ? fatherAccount : null
      const nextChildCode = nextParent ? nextChildAccountCode(nextParent, [String(savedCode)]) : undefined
      await reset_fields(nextChildCode, nextParent)
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
    if (Number(currentAccount.type) !== 1) {
      showValidationMessage("لا يمكن حذف هذا الحساب من دليل الحسابات؛ استخدم صفحة تعريفه المخصصة")
      return
    }

    const isParentAccount = accounts.some((account) => Number(account.father_id ?? 0) === Number(currentAccount.id))
    if (isParentAccount) {
      messagesRef.current?.clear?.()
      messagesRef.current?.show({
        severity: "error",
        summary: "",
        detail: "لا يمكن حذف الحساب لأنه أب لحساب آخر",
        sticky: false,
        life: 5000,
      })
      return
    }

    setShowAccountDeleteConfirm(true)
  }

  const handleConfirmDeleteAccount = useCallback(async () => {
    if (!currentAccount) return
    setShowAccountDeleteConfirm(false)
    setLoading(true)

    try {
      const response = await fetch(`/api/accounts/${currentAccount.id}`, { method: "DELETE" })
      if (!response.ok) {
        // سبب الرفض الواضح من الخادم (أب لحسابات، عليه سندات/طلبيات، مرتبط بعميل/مورد أو بسجلات أخرى…)
        const body = await response.json().catch(() => ({}))
        const reason = body?.error || "تعذر حذف الحساب"
        messagesRef.current?.clear?.()
        messagesRef.current?.show?.({ severity: "error", summary: "", detail: reason, sticky: true })
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

  const handleOpenDialog = async () => {
    setLoading(true)
    try {
      // Ensure data is loaded before opening dialog
      const loadedVoucherTypes = await loadData()
      if (currentAccount) {
        loadAccountToForm(currentAccount)
      } else {
        // For new accounts, populate stopTransactionRows with loaded voucherTypes
        setStopTransactionRows(buildStopTransactionRows(loadedVoucherTypes, []))
      }
    } catch (err) {
      console.error("Error loading data in handleOpenDialog:", err)
    } finally {
      setLoading(false)
    }
    setDialogOpen(true)
    setActiveTab("main")
  }

  // جديد / التنقل / الإغلاق: إن وُجدت تعديلات غير محفوظة يُسأل المستخدم أولاً، ويُنفَّذ الإجراء
  // المعلّق بعد الحفظ (نعم) أو بدونه (لا)، أو يُلغى (رجوع).
  const pendingUnsavedActionRef = useRef<(() => void | Promise<void>) | null>(null)
  const guardUnsaved = (action: () => void | Promise<void>) => {
    if (showUnsavedConfirm) return
    if (currentSnapshot !== dirtySnapshotRef.current) {
      pendingUnsavedActionRef.current = action
      setShowUnsavedConfirm(true)
      return
    }
    void action()
  }
  // تبديل الشاشة من القائمة/إغلاق التبويب/رجوع المتصفح/تحديث الصفحة مع تغييرات غير محفوظة ⇐ نفس نافذة
  // التحقق من التغييرات — كما في كاشير نقطة البيع (lib/navigation-guard.ts)
  useNavigationGuard(
    () => Boolean(dialogOpen && currentSnapshot !== dirtySnapshotRef.current),
    (continueNavigation) => guardUnsaved(continueNavigation),
  )


  const handleRequestClose = async () => {
    guardUnsaved(() => closeWindow?.())
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

    const updatedRows = classificationTypes.map((item) => {
      if (Number(item.id) === Number(selectedType.id)) {
        return {
          ...item,
          classification_id: null,
          classification_name: newClassificationName.trim(),
        }
      }
      return item
    })
    setClassificationTypes(updatedRows)
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

  // F3 حفظ / F4 حذف / F5 جديد — بلا أثر بينما نافذة فرعية مفتوحة (تصنيف/مركز تكلفة/بحث/تأكيد حذف)
  // فتمنح مفاتيحها الخاصة أولوية بلا تعارض، بنفس أسلوب compact-product-form.tsx.
  const nestedPopupOpen =
    showCostCenterTypeForm ||
    searchCostCenterOpen ||
    showDeleteConfirm ||
    showClassificationTypeForm ||
    showClassificationForm ||
    searchAccountClassificationOpen ||
    showDeleteClassificationConfirm ||
    showAccountDeleteConfirm ||
    showUnsavedConfirm ||
    searchModalOpen
  // F3 حفظ / F9 حذف / F4 نسخ / F5 جديد / Ctrl+P طباعة: يتولاها UniversalToolbar (lib/hotkeys.ts)

  const formRootRef = useRef<HTMLDivElement>(null)
  const enterAsTabEnabledRef = useRef(true)
  enterAsTabEnabledRef.current = !nestedPopupOpen
  useEffect(() => {
    if (!dialogOpen || !formRootRef.current) return
    return attachEnterAsTab(formRootRef.current, enterAsTabEnabledRef)
  }, [dialogOpen])

  /*if (loading) {
    return <div className="p-6 text-center">Loading...</div>
  }*/

  if (inWindowManager) {
    return (
      <div className="unified-customers-compact flex h-full min-h-0 min-w-0 flex-col overflow-hidden text-lg compact-product-form-root" dir="rtl">
      {/* Universal Toolbar - Fixed at top */}
      <div className="flex-shrink-0">
          <UniversalToolbar
            currentRecord={activeAccounts.length > 0 ? currentIndex + 1 : 0}
            totalRecords={activeAccounts.length}
            onNew={() => guardUnsaved(handleNew)}
            onSave={() => void handleSave()}
            onDelete={handleDelete}
            onFirst={() => guardUnsaved(handleFirst)}
            onPrevious={() => guardUnsaved(handlePrevious)}
            onNext={() => guardUnsaved(handleNext)}
            onLast={() => guardUnsaved(handleLast)}
            canSave={!isNonLedgerAccount}
            canDelete={formData.id !== 0 && !isNonLedgerAccount}
            isSaving={saving}
            showUtilityLabels
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

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-2 sm:px-5 lg:flex-row">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-600 via-emerald-600 to-teal-600 px-5 py-3 text-white shadow-lg">
            <BookOpen className="h-5 w-5" />
            <h2 className="text-lg font-extrabold tracking-tight sm:text-xl">{formData.id === 0 ? "حساب جديد" : "تعديل حساب"}</h2>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-mono text-xs font-semibold ring-1 ring-white/30">{formData.code || "—"}</span>
            {formData.id !== 0 && formData.name && <span className="truncate text-sm font-semibold text-emerald-50">{formData.name}</span>}
          </div>
        </div>

        {/* نفس التصميم الناعم لنموذج العملاء (globals.css: .unified-customers-compact / .customer-definition-form) */}
        <div ref={formRootRef} className="customer-definition-form min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-4 sm:px-5">
          {isNonLedgerAccount && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-950" role="status">
              <AlertDescription>هذا الحساب تابع لتعريف عميل أو مورد أو مشترك أو موظف. اعرضه وعدّله من صفحته المخصصة.</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {statusMessage && null}

          <ProgressSpinner loading={loading} />
          <fieldset disabled={isNonLedgerAccount} aria-disabled={isNonLedgerAccount} className={`m-0 min-w-0 border-0 p-0 ${isNonLedgerAccount ? "pointer-events-none" : ""}`}>
          <div className="space-y-4 border-b pb-4">
            <div className="grid gap-4 md:grid-cols-2 items-end">
              <div>
                <Label className="mb-2 block text-sm font-medium">رقم الحساب * </Label>
                <div className="flex gap-2 items-center">
                  <Input
                    ref={accountCodeInputRef}
                    value={formData.code}
                    onChange={(e) => handleAccountCodeChange(e.target.value)}
                    onBlur={handleAccountCodeBlur}
                    onKeyDown={handleAccountCodeKeyDown}
                    placeholder=""
                    className="text-right flex-1 font-mono text-lg font-semibold tracking-widest"
                    maxLength={10}
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
                  maxLength={100}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  // الاسم الإنجليزي فارغ ⇐ يُعبّأ بالاسم العربي عند مغادرة الحقل
                  onBlur={() => setFormData((prev) => (!prev.name_lang2.trim() && prev.name.trim() ? { ...prev, name_lang2: prev.name.trim() } : prev))}
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
          </fieldset>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList dir="rtl" className="customer-tabs">
              <TabsTrigger value="main" className="customer-tab">الرئيسية</TabsTrigger>
              <TabsTrigger value="cost-centers" className="customer-tab">مراكز التكلفة</TabsTrigger>
              <TabsTrigger value="classification" className="customer-tab">تصنيفات الحساب</TabsTrigger>
              <TabsTrigger value="stop-transactions" className="customer-tab">إيقاف الحركات</TabsTrigger>
              <TabsTrigger value="constraints" className="customer-tab">محددات الحساب</TabsTrigger>
            </TabsList>

            <TabsContent value="main" className="space-y-6">
              <fieldset disabled={isNonLedgerAccount} aria-disabled={isNonLedgerAccount} className={`m-0 min-w-0 border-0 p-0 ${isNonLedgerAccount ? "pointer-events-none" : ""}`}>
              {/* Currency and Financial Settings */}
              <div className="space-y-4 border-b pb-6">
                <h4 className="font-semibold text-base">الإعدادات المالية</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <AutoCompleteAccount
                      label="الحساب الرئيسي (تابع ل)"
                      leafOnly={false}
                      value={fatherAccountCode}
                      placeholder="اختر الحساب الرئيسي"
                      onValueChange={(nextCode) => {
                        setFatherAccountCode(nextCode)
                        if (!nextCode) {
                          setFormData({ ...formData, father_id: "" })
                          setFatherAccountName("")
                        }
                      }}
                      showCostCenterButton={false}
                      onAccountSelect={(account) => {
                        if (account && formData.id && Number(account.id) === Number(formData.id)) {
                          messagesRef.current?.clear?.()
                          messagesRef.current?.show({
                            severity: "error",
                            summary: "",
                            detail: "لا يمكن ان يكون الحساب اب لنفسه",
                            sticky: false,
                            life: 4000,
                          })
                          setFormData({ ...formData, father_id: "" })
                          setFatherAccountName("")
                          setFatherAccountCode("")
                          return
                        }

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
                      disabled={Number(formData.father_id || 0) > 0}
                      options={[
                        { label: "اختر", value: "" },
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
                          disabled={Number(formData.father_id || 0) > 0}
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
                          disabled={Number(formData.father_id || 0) > 0}
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
                        disabled={Number(formData.father_id || 0) > 0}
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
                          disabled={Number(formData.father_id || 0) > 0}
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

              </fieldset>
            </TabsContent>
            <TabsContent value="constraints" className="space-y-4" dir="rtl">
              <fieldset disabled={isNonLedgerAccount} aria-disabled={isNonLedgerAccount} className={`m-0 min-w-0 border-0 p-0 ${isNonLedgerAccount ? "pointer-events-none" : ""}`}>
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
              </fieldset>
            </TabsContent>
            <TabsContent value="stop-transactions" className="space-y-4" dir="rtl">
              <fieldset disabled={isNonLedgerAccount} aria-disabled={isNonLedgerAccount} className={`m-0 min-w-0 border-0 p-0 ${isNonLedgerAccount ? "pointer-events-none" : ""}`}>
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
              </fieldset>
            </TabsContent>
            <TabsContent value="cost-centers" className="space-y-4" dir="rtl">
              <fieldset disabled={isNonLedgerAccount} aria-disabled={isNonLedgerAccount} className={`m-0 min-w-0 border-0 p-0 ${isNonLedgerAccount ? "pointer-events-none" : ""}`}>
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
              </fieldset>
            </TabsContent>

            <TabsContent value="classification" className="space-y-4" dir="rtl">
              <fieldset disabled={isNonLedgerAccount} aria-disabled={isNonLedgerAccount} className={`m-0 min-w-0 border-0 p-0 ${isNonLedgerAccount ? "pointer-events-none" : ""}`}>
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
              </fieldset>
            </TabsContent>
          </Tabs>
        </div>
        </main>

        <aside className="flex h-[min(34vh,260px)] min-h-40 min-w-0 flex-col overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm lg:h-auto lg:min-h-0 lg:w-[360px] lg:shrink-0 xl:w-[400px]">
          <div className="border-b border-slate-200 bg-white p-2">
            <div className="mb-2 flex items-center gap-2 font-bold text-slate-800">
              <FolderTree className="h-4 w-4 text-emerald-700" />
              <span>شجرة الحسابات</span>
              <span className="mr-auto text-xs font-normal text-slate-500">{activeAccounts.length.toLocaleString("en-US")}</span>
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={accountTreeSearch}
                onChange={(event) => setAccountTreeSearch(event.target.value)}
                placeholder="ابحث برقم أو اسم الحساب"
                className="h-9 pr-9 text-sm"
              />
            </div>
            {selectedTreeAccount && (
              <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900">
                <span className="shrink-0">الحساب الأب:</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{selectedTreeAccount.code} - {selectedTreeAccount.name}</span>
                <button type="button" onClick={() => setSelectedTreeAccountId(null)} className="shrink-0 rounded p-0.5 hover:bg-emerald-100" aria-label="مسح اختيار الحساب الأب"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1 font-sans text-[11px]" dir="ltr">
            {filteredAccountTree.length ? filteredAccountTree.map((node) => renderAccountTreeNode(node)) : (
              <p className="px-2 py-6 text-center text-xs text-slate-500">لا توجد حسابات مطابقة</p>
            )}
          </div>
          <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
            اختر حساباً ثم اضغط «جديد» لإنشاء حساب فرعي.
          </div>
        </aside>
        </div>

        <AccountSearchDialog
          open={searchModalOpen}
          onOpenChange={setSearchModalOpen}
          accounts={activeAccounts}
          allowedTypeValues={[1]}
          // اختيار حساب الأب أو التنقل لحساب لتعديله — تُعرض الحسابات الرئيسية أيضاً
          leafOnly={false}
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
          useAppDialog
          visible={showDeleteConfirm}
          title="تأكيد الحذف"
          message="هل تريد حذف مركز التكلفة؟"
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setShowDeleteConfirm(false)
            setDeleteConfirmIndex(-1)
          }}
          isCompact={true}
        />

        <ConfirmDialogYesNo
          useAppDialog
          visible={showDeleteClassificationConfirm}
          title="تأكيد الحذف"
          message="هل تريد حذف التصنيف؟"
          onConfirm={handleConfirmDeleteClassification}
          onCancel={() => {
            setShowDeleteClassificationConfirm(false)
            setDeleteClassificationConfirmIndex(-1)
          }}
          isCompact={true}
        />

        <ConfirmDialogYesNo
          useAppDialog
          visible={showAccountDeleteConfirm}
          title="تأكيد الحذف"
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
          useAppDialog
          visible={showUnsavedConfirm}
          title="حفظ التعديلات"
          message="تم تعديل السجل هل تريد الحفظ؟"
          onConfirm={async () => {
            setShowUnsavedConfirm(false)
            const action = pendingUnsavedActionRef.current
            pendingUnsavedActionRef.current = null
            const saved = await handleSave()
            if (saved) await action?.()
          }}
          onCancel={() => {
            setShowUnsavedConfirm(false)
            const action = pendingUnsavedActionRef.current
            pendingUnsavedActionRef.current = null
            void action?.()
          }}
          onBack={() => {
            setShowUnsavedConfirm(false)
            pendingUnsavedActionRef.current = null
          }}
          showBack={true}
        />
      </div>
    )
  }
}
