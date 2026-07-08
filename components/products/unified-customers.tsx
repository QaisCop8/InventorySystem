"use client"

import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import SearchAccountClassificationDialog from "@/components/customer/search-account-classification-dialog"
import CustomerSearchPopup from "./CustomerSearchPopup"
import SearchCostCenterDialog, { type CostCenterItem } from "@/components/customer/search-cost-center-dialog"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import Util from "../common/Util"
import { Toast } from 'primereact/toast'
import DataGridView from "../common/DataGridView"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus, AlertCircle, X } from "lucide-react"
import { MutableRefObject, RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"
import ProgressSpinner from "../ProgressSpinner/ProgressSpinner"
interface Classification {
  id: number
  name?: string
  group_name?: string
}

interface PriceCategory {
  id: number
  name: string
}

interface Salesman {
  id: number
  name: string
  department?: string
  is_active: boolean
}

interface VoucherItem {
  ser: number
  type_id: number
  type_name: string
  book_id: number
  book_name: string
  [key: string]: any
}

interface CostCenterTypeRow {
  id: number
  name: string
  state_status: string
  required_in_transactions: number
  cost_center_name?: string
  default_cost_center_id?: number | null
}

export interface UnifiedCustomerFormData {
  id: number
  customer_code: string
  name: string
  mobile1: string
  mobile2: string
  whatsapp1: string
  whatsapp2: string
  city: string
  address: string
  email: string
  status: string
  business_nature: string
  salesman: string
  classification: string
  registration_date: string
  web_username: string
  web_password: string
  transaction_notes: string
  general_notes: string
  tax_number: string
  commercial_registration: string
  credit_limit: string
  payment_terms: string
  discount_percentage: string
  pricecategory: number
  account_id?: number | null
  father_id?: string
  finanical_list_id?: string
  currency_id?: string
  allow_trans_with_diff_curr?: string
  iscalc_curr_diff_rates?: boolean
  voucherType?: VoucherItem[]
  cost_centers?: Array<{ id: number; name: string; state_status: string; required_in_transactions: number; cost_center_name?: string; default_cost_center_id?: number | null }>
  stop_transactions?: Array<{ voucher_types_id: number; voucher_type_name: string; is_stopped: boolean; stop_date: string }>
}

interface UnifiedCustomersProps {
  open?: boolean
  isSupplier?: boolean
  showCustomerSearch?: boolean
  setShowCustomerSearch?: (open: boolean) => void
  formData?: UnifiedCustomerFormData
  updateField?: <K extends keyof UnifiedCustomerFormData>(field: K, value: UnifiedCustomerFormData[K]) => void
  validationErrors?: Record<string, string>
  classifications?: Classification[]
  pricecategory?: PriceCategory[]
  salesmen?: Salesman[]
  customers?: any[]
  currentCustomerId?: number
  currentIndex?: number
  totalRecords?: number
  isSaving?: boolean
  loadDataRef?: MutableRefObject<((navigationType: "first" | "previous" | "next" | "last" | "ById" | "ByIdEdit", customerId?: number, isSupplier?: boolean, checkUnsaved?: boolean) => Promise<void>) | null>
  setCurrentIndex?: (index: number) => void
  setCurrentCustomerId?: (id: number) => void
  onNew?: () => void
  onReport?: () => void
  onExportExcel?: () => void
  onPrint?: () => void
  onCustomerSelect?: (customer: any) => void
  onCustomerCodeBlur?: (value: string) => Promise<void>
  onClassificationRowsChange?: (rows: Array<{ id: number; name: string; classification_id: number | null; classification_name: string }>) => void
  onCostCenterRowsChange?: (rows: Array<{ id: number; name: string; state_status: string; required_in_transactions: number; cost_center_name?: string; default_cost_center_id?: number | null }>) => void
  onStopTransactionRowsChange?: (rows: Array<{ voucher_types_id: number; voucher_type_name: string; is_stopped: boolean; stop_date: string }>) => void
  onSave?: () => void | Promise<void>
  onDelete?: () => void | Promise<void>
  onOpenChange?: (open: boolean) => void
  customerNameRef?: RefObject<HTMLInputElement>
}

const defaultFormData: UnifiedCustomerFormData = {
  id: 0,
  customer_code: "",
  name: "",
  mobile1: "",
  mobile2: "",
  whatsapp1: "",
  whatsapp2: "",
  city: "",
  address: "",
  email: "",
  status: "نشط",
  business_nature: "",
  salesman: "",
  classification: "",
  registration_date: "",
  web_username: "",
  web_password: "",
  transaction_notes: "",
  general_notes: "",
  tax_number: "",
  commercial_registration: "",
  credit_limit: "",
  payment_terms: "",
  discount_percentage: "",
  pricecategory: 0,
  father_id: "",
  finanical_list_id: "1",
  currency_id: "",
  allow_trans_with_diff_curr: "0",
  iscalc_curr_diff_rates: false,
  voucherType: [],
  cost_centers: [],
  stop_transactions: [],
}

interface ClassificationTypeRow {
  id: number
  name: string
  classification_id: number | null
  classification_name: string
}

export default function UnifiedCustomers({
  open = false,
  isSupplier = false,
  showCustomerSearch = false,
  setShowCustomerSearch = () => undefined,
  formData = defaultFormData,
  updateField = () => undefined,
  validationErrors = {},
  classifications = [],
  pricecategory = [],
  salesmen = [],
  currentCustomerId = 0,
  currentIndex = 0,
  totalRecords = 0,
  isSaving = false,
  customers = [],
  loadDataRef,
  setCurrentIndex = () => undefined,
  setCurrentCustomerId = () => undefined,
  onNew = () => undefined,
  onSave = () => undefined,
  onDelete,
  onOpenChange,
  onReport,
  onExportExcel,
  onPrint,
  onCustomerSelect,
  onCustomerCodeBlur,
  onClassificationRowsChange,
  onCostCenterRowsChange,
  onStopTransactionRowsChange,
  customerNameRef,
}: UnifiedCustomersProps) {
  const [activeTab, setActiveTab] = useState("address-location")
  const [costCenterTypes, setCostCenterTypes] = useState<CostCenterTypeRow[]>([])
  const [costCenters, setCostCenters] = useState<CostCenterItem[]>([])
  const [currencies, setCurrencies] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])
  const [voucherTypes, setVoucherTypes] = useState<any[]>([])
  const [voucherBooks, setVoucherBooks] = useState<any[]>([])
  const [stopTransactionRows, setStopTransactionRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const toast = useRef<Toast | null>(null)
  const [showUnsaved, setShowUnsaved] = useState(false)
  const [nextFunction, setNextFunction] = useState<(() => Promise<void> | void) | null>(null)
  const [classificationTypes, setClassificationTypes] = useState<any[]>([])
  const [allClassifications, setAllClassifications] = useState<any[]>([])
  const [classificationRows, setClassificationRows] = useState<ClassificationTypeRow[]>([])
  const [showClassificationTypeForm, setShowClassificationTypeForm] = useState(false)
  const [showClassificationForm, setShowClassificationForm] = useState(false)
  const initialHash = useRef(0)
  const formDataRef = useRef(formData)
  const isInitializingRef = useRef(false)
  const hashCode = (str: string) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i)
      hash = (hash << 5) - hash + chr
      hash |= 0
    }
    return hash
  }
  const getEditableFormSnapshot = useCallback((data: any = {}) => ({
    id: Number(data?.id ?? 0),
    customer_code: String(data?.customer_code ?? ""),
    name: String(data?.name ?? data?.customer_name ?? ""),
    mobile1: String(data?.mobile1 ?? ""),
    mobile2: String(data?.mobile2 ?? ""),
    whatsapp1: String(data?.whatsapp1 ?? ""),
    whatsapp2: String(data?.whatsapp2 ?? ""),
    city: String(data?.city ?? ""),
    address: String(data?.address ?? ""),
    email: String(data?.email ?? ""),
    status: String(data?.status ?? "نشط"),
    business_nature: String(data?.business_nature ?? ""),
    salesman: String(data?.salesman ?? ""),
    classification: String(data?.classification ?? ""),
    registration_date: String(data?.registration_date ?? data?.account_opening_date ?? ""),
    web_username: String(data?.web_username ?? ""),
    web_password: String(data?.web_password ?? ""),
    transaction_notes: String(data?.transaction_notes ?? ""),
    general_notes: String(data?.general_notes ?? ""),
    tax_number: String(data?.tax_number ?? ""),
    commercial_registration: String(data?.commercial_registration ?? ""),
    credit_limit: String(data?.credit_limit ?? ""),
    payment_terms: String(data?.payment_terms ?? ""),
    discount_percentage: String(data?.discount_percentage ?? ""),
    pricecategory: Number(data?.pricecategory ?? 0),
    father_id: String(data?.father_id ?? ""),
    allow_trans_with_diff_curr: String(data?.allow_trans_with_diff_curr ?? "0"),
    iscalc_curr_diff_rates: Boolean(data?.iscalc_curr_diff_rates),
  }), [])
  const getFormDataHash = useCallback((data: any) => {
    return hashCode(JSON.stringify(getEditableFormSnapshot(data)))
  }, [getEditableFormSnapshot])

  useEffect(() => {
    formDataRef.current = formData
  }, [formData])

  const [newClassificationTypeName, setNewClassificationTypeName] = useState("")
  const [newClassificationTypeId, setNewClassificationTypeId] = useState<string | null>(null)
  const [newClassificationName, setNewClassificationName] = useState("")
  const [classificationTypeError, setClassificationTypeError] = useState("")
  const [classificationTypeMessage, setClassificationTypeMessage] = useState("")

  const rowsMatch = (left: any[], right: any[]) => JSON.stringify(left) === JSON.stringify(right)
  const [classificationError, setClassificationError] = useState("")
  const [selectedClassificationType, setSelectedClassificationType] = useState<{ id: number; name: string } | null>(null)
  const [selectedClassificationTypeIndex, setSelectedClassificationTypeIndex] = useState(-1)
  const [searchAccountClassificationOpen, setSearchAccountClassificationOpen] = useState(false)
  const [showDeleteClassificationConfirm, setShowDeleteClassificationConfirm] = useState(false)
  const [deleteClassificationConfirmIndex, setDeleteClassificationConfirmIndex] = useState(-1)
  const [fatherAccountCode, setFatherAccountCode] = useState(String(formData.father_id ?? ""))
  const [fatherAccountName, setFatherAccountName] = useState("")
  const [allowTransWithDiffCurr, setAllowTransWithDiffCurr] = useState(String(formData.allow_trans_with_diff_curr ?? "0"))
  const [iscalcCurrDiffRates, setIscalcCurrDiffRates] = useState(Boolean(formData.iscalc_curr_diff_rates))
  const classificationGridRef = useRef<any>(null)
  const [costCenterTypeError, setCostCenterTypeError] = useState("")
  const [costCenterTypeMessage, setCostCenterTypeMessage] = useState("")
  const [searchCostCenterOpen, setSearchCostCenterOpen] = useState(false)
  const [selectedCostCenterType, setSelectedCostCenterType] = useState<CostCenterTypeRow | null>(null)
  const [selectedCostCenterTypeIndex, setSelectedCostCenterTypeIndex] = useState(-1)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState(-1)
  const [showCustomerDeleteConfirm, setShowCustomerDeleteConfirm] = useState(false)
  const [customerActionError, setCustomerActionError] = useState("")
  const [customerActionMessage, setCustomerActionMessage] = useState("")
  const costCenterTypeGridRef = useRef<any>(null)
  const savingRef = useRef(false)
  const dialogWasOpenRef = useRef(false)
  const lastClassificationRowsSentRef = useRef("[]")
  const lastCostCenterRowsSentRef = useRef("[]")
  const lastStopTransactionRowsSentRef = useRef("[]")
  const onClassificationRowsChangeRef = useRef(onClassificationRowsChange)
  const onCostCenterRowsChangeRef = useRef(onCostCenterRowsChange)
  const onStopTransactionRowsChangeRef = useRef(onStopTransactionRowsChange)

  const generateCustomerCode = useCallback(async () => {
    try {
      const response = await fetch(`/api/customers/generate-number?isSupplier=${isSupplier}`)
      if (!response.ok) {
        throw new Error(`Failed to generate customer code: ${response.status}`)
      }

      const data = await response.json()
      return String(data?.customerNumber ?? "")
    } catch (error) {
      console.error("Error generating customer code for unified customers:", error)
      return ""
    }
  }, [isSupplier])

  const focusCustomerName = useCallback(() => {
    globalThis.setTimeout(() => {
      customerNameRef?.current?.focus()
    }, 0)
  }, [customerNameRef])

  const adjustCustomerCode = useCallback((value: string, codeLen = 8) => {
    const trimmed = String(value ?? "").trim().toUpperCase()
    if (!trimmed) return ""

    const normalized = trimmed.replace(/[^A-Z0-9]/g, "")
    if (!normalized) return ""

    const match = normalized.match(/^([A-Z]*)(\d*)$/)
    if (!match) return normalized

    const [, prefix, numPart] = match
    const padLen = Math.max(codeLen - prefix.length, 0)
    const paddedNum = numPart.padStart(padLen, "0")

    return `${prefix}${paddedNum}`
  }, [])

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

  const buildCostCenterRows = useCallback((definitions: any[], assignments: any[] = [], centers: any[] = []) => {
    const assignmentByType = new Map<number, any>()

    assignments.forEach((row) => {
      const typeId = Number(row?.cost_center_type_id)
      if (!Number.isNaN(typeId) && typeId > 0) {
        assignmentByType.set(typeId, row)
      }
    })

    return definitions.map((type) => {
      const typeId = Number(type.id)
      const assignedRow = assignmentByType.get(typeId)
      const defaultCostCenterId = assignedRow?.default_cost_center_id != null ? Number(assignedRow.default_cost_center_id) : null
      const costCenterName =
        defaultCostCenterId != null
          ? centers.find((center) => Number(center.id) === defaultCostCenterId)?.name || assignedRow?.cost_center_name || ""
          : assignedRow?.cost_center_name || ""

      return {
        ...type,
        id: typeId,
        name: type.name ?? "",
        state_status: type.state_status ?? "اختياري",
        required_in_transactions: Number(assignedRow?.required_in_transactions ?? type.required_in_transactions ?? 1),
        cost_center_name: costCenterName,
        default_cost_center_id: defaultCostCenterId,
      }
    })
  }, [])

  const fetchDefinitions = useCallback(async () => {
    setLoading(true)
    try {
      const [voucherTypesResponse, voucherBooksResponse, currenciesResponse, citiesResponse, costCenterTypesResponse, costCentersResponse, classTypesResponse, classificationsResponse] = await Promise.all([
        fetch("/api/vouchers/voucher-types"),
        fetch("/api/vouchers/voucher-books"),
        fetch("/api/exchange-rates"),
        fetch("/api/cities"),
        fetch("/api/cost-center-types"),
        fetch("/api/cost-centers"),
        fetch("/api/account-classification-types"),
        fetch("/api/account-classifications"),
      ])

      const nextVoucherTypes = voucherTypesResponse.ok ? await voucherTypesResponse.json() : []
      const nextVoucherBooks = voucherBooksResponse.ok ? await voucherBooksResponse.json() : []
      const nextCurrencies = currenciesResponse.ok ? await currenciesResponse.json() : []
      const nextCities = citiesResponse.ok ? await citiesResponse.json() : []
      const nextCostCenterTypes = costCenterTypesResponse.ok ? await costCenterTypesResponse.json() : []
      const nextCostCenters = costCentersResponse.ok ? await costCentersResponse.json() : []
      const nextClassificationTypes = classTypesResponse.ok ? await classTypesResponse.json() : []
      const nextClassifications = classificationsResponse.ok ? await classificationsResponse.json() : []

      setVoucherTypes(Array.isArray(nextVoucherTypes) ? nextVoucherTypes : [])
      setVoucherBooks(Array.isArray(nextVoucherBooks) ? nextVoucherBooks : [])
      setCurrencies(Array.isArray(nextCurrencies?.rates) ? nextCurrencies.rates : [])
      setCities(Array.isArray(nextCities) ? nextCities : [])
      setCostCenters(Array.isArray(nextCostCenters) ? nextCostCenters : [])

      const statusMap: Record<string, number> = { "اختياري": 1, "اجباري": 2, "ممنوع": 3 }
      const mappedCostCenterTypes = Array.isArray(nextCostCenterTypes)
        ? nextCostCenterTypes.map((item: any) => ({
            ...item,
            state_status: item.state_status || (item.status === 2 ? "اجباري" : item.status === 3 ? "ممنوع" : "اختياري"),
            required_in_transactions: statusMap[item.state_status || "اختياري"] || (item.status === 2 ? 2 : item.status === 3 ? 3 : 1),
            cost_center_name: item.cost_center_name || "",
            default_cost_center_id: item.default_cost_center_id ?? null,
          }))
        : []
      mappedCostCenterTypes.sort((a: CostCenterTypeRow, b: CostCenterTypeRow) => (a.id || 0) - (b.id || 0))
      setCostCenterTypes(mappedCostCenterTypes)

      const sortedClassificationTypes = Array.isArray(nextClassificationTypes)
        ? [...nextClassificationTypes].sort((a, b) => (Number(a?.id) || 0) - (Number(b?.id) || 0))
        : []
      setClassificationTypes(sortedClassificationTypes)
      setAllClassifications(Array.isArray(nextClassifications) ? nextClassifications : [])

      return {
        voucherTypes: Array.isArray(nextVoucherTypes) ? nextVoucherTypes : [],
        sortedClassificationTypes,
        costCenterTypes: mappedCostCenterTypes,
        costCenters: Array.isArray(nextCostCenters) ? nextCostCenters : [],
      }
    } catch (error) {
      console.error("Error loading unified customer definitions:", error)
      setVoucherTypes([])
      setVoucherBooks([])
      setCurrencies([])
      setCities([])
      setCostCenterTypes([])
      setCostCenters([])
      setClassificationTypes([])
      setAllClassifications([])
      return {
        voucherTypes: [],
        sortedClassificationTypes: [],
        costCenterTypes: [],
        costCenters: [],
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const applyCustomerRecord = useCallback(
    (customer: any) => {
      const nextCostCenterAssignments = Array.isArray(customer?.cost_centers) ? customer.cost_centers : []
      const nextStopTransactions = Array.isArray(customer?.stop_transactions) ? customer.stop_transactions : []

      updateField("id" as keyof UnifiedCustomerFormData, Number(customer?.id || 0) as any)
      updateField("customer_code" as keyof UnifiedCustomerFormData, String(customer?.customer_code || "") as any)
      updateField("name" as keyof UnifiedCustomerFormData, String(customer?.name || customer?.customer_name || "") as any)
      updateField("mobile1" as keyof UnifiedCustomerFormData, String(customer?.mobile1 || "") as any)
      updateField("mobile2" as keyof UnifiedCustomerFormData, String(customer?.mobile2 || "") as any)
      updateField("whatsapp1" as keyof UnifiedCustomerFormData, String(customer?.whatsapp1 || "") as any)
      updateField("whatsapp2" as keyof UnifiedCustomerFormData, String(customer?.whatsapp2 || "") as any)
      updateField("city" as keyof UnifiedCustomerFormData, String(customer?.city || "") as any)
      updateField("address" as keyof UnifiedCustomerFormData, String(customer?.address || "") as any)
      updateField("email" as keyof UnifiedCustomerFormData, String(customer?.email || "") as any)
      updateField("status" as keyof UnifiedCustomerFormData, String(customer?.status || "نشط") as any)
      updateField("business_nature" as keyof UnifiedCustomerFormData, String(customer?.business_nature || "") as any)
      updateField("salesman" as keyof UnifiedCustomerFormData, String(customer?.salesman || "") as any)
      updateField("classification" as keyof UnifiedCustomerFormData, String(customer?.classification || "") as any)
      updateField("registration_date" as keyof UnifiedCustomerFormData, String(customer?.registration_date || customer?.account_opening_date || "") as any)
      updateField("web_username" as keyof UnifiedCustomerFormData, String(customer?.web_username || "") as any)
      updateField("web_password" as keyof UnifiedCustomerFormData, String(customer?.web_password || "") as any)
      updateField("transaction_notes" as keyof UnifiedCustomerFormData, String(customer?.transaction_notes || "") as any)
      updateField("general_notes" as keyof UnifiedCustomerFormData, String(customer?.general_notes || "") as any)
      updateField("tax_number" as keyof UnifiedCustomerFormData, String(customer?.tax_number || "") as any)
      updateField("commercial_registration" as keyof UnifiedCustomerFormData, String(customer?.commercial_registration || "") as any)
      updateField("credit_limit" as keyof UnifiedCustomerFormData, String(customer?.credit_limit || "") as any)
      updateField("payment_terms" as keyof UnifiedCustomerFormData, String(customer?.payment_terms || "") as any)
      updateField("discount_percentage" as keyof UnifiedCustomerFormData, String(customer?.discount_percentage || "") as any)
      updateField("pricecategory" as keyof UnifiedCustomerFormData, Number(customer?.pricecategory || 0) as any)
      updateField("account_id" as keyof UnifiedCustomerFormData, customer?.account_id ?? null as any)
      updateField("father_id" as keyof UnifiedCustomerFormData, String(customer?.father_id || "") as any)
      updateField("finanical_list_id" as keyof UnifiedCustomerFormData, String(customer?.finanical_list_id || "1") as any)
      updateField("currency_id" as keyof UnifiedCustomerFormData, String(customer?.currency_id || "") as any)
      updateField("allow_trans_with_diff_curr" as keyof UnifiedCustomerFormData, String(customer?.allow_trans_with_diff_curr ?? "0") as any)
      updateField("iscalc_curr_diff_rates" as keyof UnifiedCustomerFormData, Boolean(customer?.iscalc_curr_diff_rates) as any)
      updateField("voucherType" as keyof UnifiedCustomerFormData, Array.isArray(customer?.voucherType) ? customer.voucherType : [] as any)
      updateField("cost_centers" as keyof UnifiedCustomerFormData, nextCostCenterAssignments as any)
      updateField("stop_transactions" as keyof UnifiedCustomerFormData, nextStopTransactions as any)

      if (voucherTypes.length > 0) {
        setStopTransactionRows(buildStopTransactionRows(voucherTypes, nextStopTransactions))
      }

      if ((costCenterTypes.length > 0 || costCenters.length > 0) && Array.isArray(nextCostCenterAssignments)) {
        setCostCenterTypes(buildCostCenterRows(costCenterTypes, nextCostCenterAssignments, costCenters))
      }

      if (Array.isArray(customer?.account_classifications) && classificationTypes.length > 0) {
        const mappedRows = classificationTypes.map((type: any) => {
          const matched = (customer.account_classifications as any[]).find((item: any) => Number(item.classification_type_id) === Number(type.id))
          return {
            id: Number(type.id),
            name: type.name ?? "",
            classification_id: matched?.classification_id ?? null,
            classification_name: matched?.classification_name ?? "",
          }
        })
        setClassificationRows(mappedRows)
      }
    },
    [buildCostCenterRows, buildStopTransactionRows, costCenterTypes, costCenters, classificationTypes, updateField, voucherTypes],
  )

  const reset_fields = useCallback(
    async (
      definitions?: { voucherTypes: any[]; sortedClassificationTypes: any[]; costCenterTypes?: any[]; costCenters?: any[] },
      options?: { preserveCode?: string },
    ) => {
      const voucherTypesSource = definitions?.voucherTypes ?? voucherTypes
      const classificationTypesSource = definitions?.sortedClassificationTypes ?? classificationTypes
      const costCenterTypesSource = definitions?.costCenterTypes ?? costCenterTypes
      const costCentersSource = definitions?.costCenters ?? costCenters
      const preservedCode = options?.preserveCode ? adjustCustomerCode(options.preserveCode) : ""
      const nextCustomerCode = preservedCode || (await generateCustomerCode())
      const nextCostCenterRows = buildCostCenterRows(costCenterTypesSource, [], costCentersSource)

      isInitializingRef.current = true
      updateField("id" as keyof UnifiedCustomerFormData, 0 as any)
      updateField("customer_code" as keyof UnifiedCustomerFormData, nextCustomerCode as any)
      updateField("name" as keyof UnifiedCustomerFormData, "" as any)
      updateField("mobile1" as keyof UnifiedCustomerFormData, "" as any)
      updateField("mobile2" as keyof UnifiedCustomerFormData, "" as any)
      updateField("whatsapp1" as keyof UnifiedCustomerFormData, "" as any)
      updateField("whatsapp2" as keyof UnifiedCustomerFormData, "" as any)
      updateField("city" as keyof UnifiedCustomerFormData, "" as any)
      updateField("address" as keyof UnifiedCustomerFormData, "" as any)
      updateField("email" as keyof UnifiedCustomerFormData, "" as any)
      updateField("status" as keyof UnifiedCustomerFormData, "نشط" as any)
      updateField("business_nature" as keyof UnifiedCustomerFormData, "" as any)
      updateField("salesman" as keyof UnifiedCustomerFormData, "" as any)
      updateField("classification" as keyof UnifiedCustomerFormData, "" as any)
      updateField("registration_date" as keyof UnifiedCustomerFormData, "" as any)
      updateField("web_username" as keyof UnifiedCustomerFormData, "" as any)
      updateField("web_password" as keyof UnifiedCustomerFormData, "" as any)
      updateField("transaction_notes" as keyof UnifiedCustomerFormData, "" as any)
      updateField("general_notes" as keyof UnifiedCustomerFormData, "" as any)
      updateField("tax_number" as keyof UnifiedCustomerFormData, "" as any)
      updateField("commercial_registration" as keyof UnifiedCustomerFormData, "" as any)
      updateField("credit_limit" as keyof UnifiedCustomerFormData, "" as any)
      updateField("payment_terms" as keyof UnifiedCustomerFormData, "" as any)
      updateField("discount_percentage" as keyof UnifiedCustomerFormData, "" as any)
      updateField("pricecategory" as keyof UnifiedCustomerFormData, 0 as any)
      updateField("account_id" as keyof UnifiedCustomerFormData, null as any)
      updateField("father_id" as keyof UnifiedCustomerFormData, "" as any)
      updateField("finanical_list_id" as keyof UnifiedCustomerFormData, "1" as any)
      updateField("currency_id" as keyof UnifiedCustomerFormData, "" as any)
      updateField("allow_trans_with_diff_curr" as keyof UnifiedCustomerFormData, "0" as any)
      updateField("iscalc_curr_diff_rates" as keyof UnifiedCustomerFormData, false as any)
      updateField("voucherType" as keyof UnifiedCustomerFormData, [] as any)
      updateField("cost_centers" as keyof UnifiedCustomerFormData, [] as any)
      updateField("stop_transactions" as keyof UnifiedCustomerFormData, [] as any)

      setActiveTab("address-location")
      setFatherAccountCode("")
      setFatherAccountName("")
      setAllowTransWithDiffCurr("0")
      setIscalcCurrDiffRates(false)
      setStopTransactionRows(buildStopTransactionRows(voucherTypesSource, []))
      setClassificationRows(
        classificationTypesSource.map((type: any) => ({
          id: Number(type.id),
          name: type.name ?? "",
          classification_id: null,
          classification_name: "",
        })),
      )
      setCostCenterTypes(nextCostCenterRows)
      setNewClassificationTypeName("")
      setNewClassificationTypeId(null)
      setNewClassificationName("")
      setClassificationTypeError("")
      setClassificationTypeMessage("")
      setClassificationError("")
      setCostCenterTypeError("")
      setCostCenterTypeMessage("")
      setSelectedClassificationType(null)
      setSelectedClassificationTypeIndex(-1)
      setSearchAccountClassificationOpen(false)
      setShowDeleteClassificationConfirm(false)
      setDeleteClassificationConfirmIndex(-1)
      setSelectedCostCenterType(null)
      setSelectedCostCenterTypeIndex(-1)
      setSearchCostCenterOpen(false)
      setShowDeleteConfirm(false)
      setDeleteConfirmIndex(-1)
      setShowClassificationTypeForm(false)
      setShowClassificationForm(false)
      setShowCustomerSearch(false)
      setCurrentCustomerId(0)
      initialHash.current = 0
      formDataRef.current = getEditableFormSnapshot({
        ...defaultFormData,
        customer_code: nextCustomerCode,
        father_id: "",
        allow_trans_with_diff_curr: "0",
        iscalc_curr_diff_rates: false,
      })
      setTimeout(() => {
        focusCustomerName()
        isInitializingRef.current = false
      }, 0)
      onClassificationRowsChange?.(
        classificationTypesSource.map((type: any) => ({
          id: Number(type.id),
          name: type.name ?? "",
          classification_id: null,
          classification_name: "",
        })),
      )
    },
    [adjustCustomerCode, buildCostCenterRows, buildStopTransactionRows, classificationTypes, costCenterTypes, costCenters, focusCustomerName, formData, generateCustomerCode, onClassificationRowsChange, updateField, voucherTypes],
  )

  const handleCustomerSelect = useCallback(
    async (customer: any) => {
      if (!customer?.id) return
      applyCustomerRecord(customer)
      await onCustomerSelect?.(customer)
    },
    [applyCustomerRecord, onCustomerSelect],
  )

  const handleCustomerCodeBlur = useCallback(
    async (value: string) => {
      const adjustedCode = adjustCustomerCode(value)
      if (!adjustedCode) return

      updateField("customer_code" as keyof UnifiedCustomerFormData, adjustedCode as any)

      try {
        setLoading(true)
        const response = await fetch(`/api/customers/by-code/${encodeURIComponent(adjustedCode)}`)
        if (!response.ok) {
          await reset_fields(undefined, { preserveCode: adjustedCode })
        
          return
        }

        const data = await response.json()
        if (data?.found && data.customer) {
          applyCustomerRecord(data.customer)
          
        } else {
          await reset_fields(undefined, { preserveCode: adjustedCode })
        }
      } catch (error) {
        console.error("Error searching customer by code in UnifiedCustomers:", error)
        setCustomerActionError("حدث خطأ أثناء البحث عن الزبون")
      } finally {
        await onCustomerCodeBlur?.(adjustedCode)
        setLoading(false)
      }
    },
    [adjustCustomerCode, applyCustomerRecord, onCustomerCodeBlur, reset_fields, updateField],
  )

  useEffect(() => {
    const syncFatherAccount = async () => {
      const fatherId = String(formData.father_id ?? "").trim()

      setAllowTransWithDiffCurr(String(formData.allow_trans_with_diff_curr ?? "0"))
      setIscalcCurrDiffRates(Boolean(formData.iscalc_curr_diff_rates))

      if (!fatherId) {
        setFatherAccountCode("")
        setFatherAccountName("")
        return
      }

      try {
        const response = await fetch(`/api/accounts/${Number(fatherId)}`)
        if (!response.ok) return

        const account = await response.json()
        setFatherAccountCode(account?.code ? String(account.code) : fatherId)
        setFatherAccountName(account?.code && account?.name ? `${account.code} - ${account.name}` : "")
      } catch (error) {
        console.error("Error loading father account for unified customers:", error)
      }
    }

    void syncFatherAccount()
  }, [formData.father_id, formData.allow_trans_with_diff_curr, formData.iscalc_curr_diff_rates])

  useLayoutEffect(() => {
    if (!open) {
      dialogWasOpenRef.current = false
      return
    }

    if (dialogWasOpenRef.current) return
    dialogWasOpenRef.current = true

    const init = async () => {
      try {
        setLoading(true)
        const definitions = await fetchDefinitions()
        await reset_fields(definitions)
      } catch (error) {
        console.error("Failed to initialize unified customers popup:", error)
      } finally {
        setLoading(false)
      }
    }

    void init()
  }, [open, reset_fields, fetchDefinitions])

  const loadData = useCallback(
    async (
      navigationType: "first" | "previous" | "next" | "last" | "ById" | "ByIdEdit",
      customerId?: number,
      isSupplierArg: boolean = false,
      checkUnsaved: boolean = true,
    ) => {
      const currentHash = getFormDataHash(formData)

      if (isInitializingRef.current) {
        return
      }

      if (checkUnsaved && initialHash.current !== 0 && currentHash !== initialHash.current) {
        setShowUnsaved(true)
        setNextFunction(() => () => loadData(navigationType, customerId, isSupplierArg, false))
        return
      }

      const hasRealCurrentRecord = Number(currentCustomerId) > 0 || Number(formData.id) > 0
      if (!hasRealCurrentRecord && navigationType === "next") {
        await loadData("first", undefined, isSupplierArg, false)
        return
      }
      if (!hasRealCurrentRecord && navigationType === "previous" ) {
        await loadData("last", undefined, isSupplierArg, false)
        return
      }

      try {
        setLoading(true)
        let dont_check = false
        if (navigationType === "ByIdEdit") {
          dont_check = true
          navigationType = "ById"
        }

        const url = new URL(`/api/customer/navigations/${navigationType}`, location.origin)

        if (navigationType === "ById" && customerId) {
          url.searchParams.set("id", String(customerId))
        } else if (navigationType === "previous" || navigationType === "next") {
          url.searchParams.set("currentId", String(currentCustomerId))
        }

        url.searchParams.set("type", isSupplierArg ? "2" : "1")

        const res = await fetch(url.toString())
        console.log("Fetch response status:", res.status, "URL:", url.toString())
        const customer = await res.json()
        console.log("Loaded customer:", customer, "Navigation type:", navigationType, "Current ID:", currentCustomerId)
        if (!customer?.id) {
          const fallbackNavigation = navigationType === "next" ? "first" : "last"
          await loadData(fallbackNavigation, undefined, isSupplierArg, false)
          return
        }

        if (hasRealCurrentRecord && Number(customer.id) === Number(currentCustomerId) && !dont_check) {
          const msg = navigationType === "previous" || navigationType === "first" ? "بداية السجلات" : "نهاية السجلات"
          Util.showErrorToast(toast.current, msg)
          return
        }

        applyCustomerRecord(customer)

        const loadedSnapshot = getEditableFormSnapshot({
          ...customer,
          customer_code: customer?.customer_code ?? customer?.customerCode ?? "",
          name: customer?.name ?? customer?.customer_name ?? "",
          registration_date: customer?.registration_date ?? customer?.account_opening_date ?? "",
        })
        formDataRef.current = loadedSnapshot

        setTimeout(() => {
          focusCustomerName()
          initialHash.current = getFormDataHash(loadedSnapshot)
          const nextCustomerId = Number(customer.id) || 0
          setCurrentCustomerId(nextCustomerId)
          if (typeof setCurrentIndex === "function" && nextCustomerId > 0) {
            setCurrentIndex(Math.max(0, currentIndex))
          }
        }, 0)
      } catch (err) {
        console.error("Error loading customer:", err)
      }
      finally{
        setLoading(false)
      }
    },
    [applyCustomerRecord, currentCustomerId, focusCustomerName, formData, setCurrentCustomerId],
  )

  useEffect(() => {
    if (loadDataRef) {
      loadDataRef.current = loadData
      return () => {
        if (loadDataRef) loadDataRef.current = null
      }
    }
    return undefined
  }, [loadDataRef, loadData])

  const handleFirst = useCallback(async () => {
    await loadData("first", undefined, isSupplier)
  }, [isSupplier, loadData])

  const handlePrevious = useCallback(async () => {
    await loadData("previous", undefined, isSupplier)
  }, [isSupplier, loadData])

  const handleNext = useCallback(async () => {
    await loadData("next", undefined, isSupplier)
  }, [isSupplier, loadData])

  const handleLast = useCallback(async () => {
    console.log("handleLast called")
    await loadData("last", undefined, isSupplier)
  }, [isSupplier, loadData])

  useEffect(() => {
    if (!formData.id && !formData.currency_id && currencies.length > 0) {
      const firstCurrencyId = String(currencies[0].currency_id ?? currencies[0].id ?? "")
      if (firstCurrencyId) {
        updateField("currency_id" as keyof UnifiedCustomerFormData, firstCurrencyId as any)
      }
    }
    // Update stopTransactionRows when formData changes and we have voucherTypes
    if (voucherTypes.length > 0) {
      const stopTransData = formData.id ? ((formData as any).stop_transactions || []) : []
      const nextStopTransactionRows = buildStopTransactionRows(voucherTypes, stopTransData)
      if (!rowsMatch(nextStopTransactionRows, stopTransactionRows)) {
        setStopTransactionRows(nextStopTransactionRows)
      }
    }
  }, [currencies, formData.currency_id, formData.id, updateField, voucherTypes, buildStopTransactionRows, formData, stopTransactionRows])

  useEffect(() => {
    onClassificationRowsChangeRef.current = onClassificationRowsChange
  }, [onClassificationRowsChange])

  useEffect(() => {
    onCostCenterRowsChangeRef.current = onCostCenterRowsChange
  }, [onCostCenterRowsChange])

  useEffect(() => {
    onStopTransactionRowsChangeRef.current = onStopTransactionRowsChange
  }, [onStopTransactionRowsChange])

  useEffect(() => {
    const serializedRows = JSON.stringify(classificationRows)
    if (serializedRows === lastClassificationRowsSentRef.current) return
    lastClassificationRowsSentRef.current = serializedRows
    onClassificationRowsChangeRef.current?.(classificationRows)
  }, [classificationRows])

  useEffect(() => {
    const serializedRows = JSON.stringify(costCenterTypes)
    if (serializedRows === lastCostCenterRowsSentRef.current) return
    lastCostCenterRowsSentRef.current = serializedRows
    updateField("cost_centers" as keyof UnifiedCustomerFormData, costCenterTypes as any)
    onCostCenterRowsChangeRef.current?.(costCenterTypes)
  }, [costCenterTypes, updateField])

  useEffect(() => {
    const serializedRows = JSON.stringify(stopTransactionRows)
    if (serializedRows === lastStopTransactionRowsSentRef.current) return
    lastStopTransactionRowsSentRef.current = serializedRows
    updateField("stop_transactions" as keyof UnifiedCustomerFormData, stopTransactionRows as any)
    onStopTransactionRowsChangeRef.current?.(stopTransactionRows)
  }, [stopTransactionRows, updateField])

  const visibleStopTransactionRows = useMemo(() => {
    const hiddenNames = ["طلبية مبيعات", "طلبية مشتريات", "إرسالية مبيعات", "إرسالية مشتريات"]

    return stopTransactionRows.filter((row) => {
      const voucherTypeName = String(row?.voucher_type_name || "")
      return !hiddenNames.some((hiddenName) => voucherTypeName.includes(hiddenName))
    })
  }, [stopTransactionRows])

  const visibleStopTransactionRowIds = useMemo(
    () => new Set(visibleStopTransactionRows.map((row) => Number(row?.voucher_types_id))),
    [visibleStopTransactionRows],
  )

  const voucherTypeRows = useMemo(() => {
    return Array.isArray(formData.voucherType) ? formData.voucherType : []
  }, [formData.voucherType])

  const updateVoucherTypeRows = useCallback((rows: VoucherItem[]) => {
    updateField("voucherType" as keyof UnifiedCustomerFormData, rows as any)
  }, [updateField])

  const handleAddVoucherTypeRow = useCallback(() => {
    const nextRows = [...voucherTypeRows]
    const maxSer = nextRows.reduce((max, row) => (Number(row.ser) > max ? Number(row.ser) : max), 0)
    const firstType = voucherTypes[0] || { id: 0, name: "" }
    const firstBook = voucherBooks[0] || { id: 0, name: "" }

    nextRows.push({
      ser: maxSer + 1,
      type_id: Number(firstType.id) || 0,
      type_name: String(firstType.name || ""),
      book_id: Number(firstBook.id) || 0,
      book_name: String(firstBook.name || ""),
    } as VoucherItem)

    updateVoucherTypeRows(nextRows)
  }, [voucherTypeRows, voucherTypes, voucherBooks, updateVoucherTypeRows])

  const handleDeleteVoucherTypeRow = useCallback((index: number) => {
    const nextRows = [...voucherTypeRows]
    if (index >= 0 && index < nextRows.length) {
      nextRows.splice(index, 1)
    }
    updateVoucherTypeRows(nextRows)
  }, [voucherTypeRows, updateVoucherTypeRows])

  const handleUpdateVoucherTypeRow = useCallback((index: number, updates: Partial<VoucherItem>) => {
    const nextRows = [...voucherTypeRows]
    nextRows[index] = { ...nextRows[index], ...updates } as VoucherItem
    updateVoucherTypeRows(nextRows)
  }, [voucherTypeRows, updateVoucherTypeRows])

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

  const classificationTypeScheme = useMemo(
    () => ({
      name: "ClassificationTypeScheme",
      columns: [
        { header: "معرف نوع التصنيف", name: "id", width: 120, isReadOnly: true, visible: false },
        { header: "نوع التصنيف", name: "name", width: 200, isReadOnly: true, visible: true },
        { header: "معرف التصنيف", name: "classification_id", width: 120, isReadOnly: true, visible: false },
        { header: "التصنيف", name: "classification_name", width: "*", minWidth: 200, isReadOnly: true, visible: true },
        {
          name: "btnSearchClassification",
          header: " ",
          width: 65,
          buttonBody: "button",
          align: "center",
          title: "بحث",
          iconType: "search",
          className: "btn-search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            e.stopPropagation()
            const row = classificationRows[ctx.row.index]
            if (!row) return
            setSelectedClassificationType({ id: row.id, name: row.name })
            setSelectedClassificationTypeIndex(ctx.row.index)
            setSearchAccountClassificationOpen(true)
          },
          visible: true,
          visibleInColumnChooser: true,
        },
        {
          name: "btnDelete",
          header: " ",
          width: 65,
          buttonBody: "button",
          align: "center",
          title: "حذف",
          iconType: "delete",
          className: "btn-delete",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            e.stopPropagation()
            setDeleteClassificationConfirmIndex(ctx.row.index)
            setShowDeleteClassificationConfirm(true)
          },
          visible: true,
          visibleInColumnChooser: true,
        },
      ],
    }),
    [classificationRows],
  )

  const classificationRowsWithIndex = useMemo(
    () => classificationRows.map((item, index) => ({ ...item, __index__: index + 1 })),
    [classificationRows],
  )

  const handleAddClassificationType = useCallback(() => {
    setNewClassificationTypeName("")
    setClassificationTypeError("")
    setShowClassificationTypeForm(true)
  }, [])

  const handleSaveClassificationType = useCallback(async () => {
    const name = newClassificationTypeName.trim()
    if (!name) {
      setClassificationTypeError("اسم نوع التصنيف مطلوب")
      return
    }

    try {
      const response = await fetch("/api/account-classification-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })

      if (!response.ok) throw new Error("failed to save classification type")
      const saved = await response.json()
      const nextRow = {
        id: Number(saved.id ?? Date.now()),
        name: saved.name ?? name,
        classification_id: null,
        classification_name: "",
      }
      setClassificationRows((prev) => [...prev, nextRow])
      setClassificationTypeMessage("تمت إضافة نوع التصنيف بنجاح")
      setShowClassificationTypeForm(false)
      setNewClassificationTypeName("")
    } catch (error) {
      console.error(error)
      setClassificationTypeError("فشل في حفظ نوع التصنيف")
    }
  }, [newClassificationTypeName])

  const handleAddClassificationRow = useCallback(() => {
    setNewClassificationTypeId(null)
    setNewClassificationName("")
    setClassificationError("")
    setShowClassificationForm(true)
  }, [])

  const handleNew = useCallback(() => {
    onOpenChange?.(true)
    void reset_fields()
  }, [onOpenChange, reset_fields])

  const handleSaveCustomer = useCallback(async () => {
    if (savingRef.current) return false

    const trimmedCode = String(formData.customer_code || "").trim().toUpperCase()
    const trimmedName = String(formData.name || "").trim()
    if (!trimmedCode) {
      setCustomerActionError("يجب ملء رقم الزبون")
      return false
    }

    if (!trimmedName) {
      setCustomerActionError("يجب ملء اسم الزبون")
      return false
    }

    if (!/^[A-Z0-9]{8}$/.test(trimmedCode)) {
      setCustomerActionError("يجب أن يكون رقم الزبون 8 أحرف إنجليزية أو أرقام وبحروف كبيرة")
      return false
    }

    savingRef.current = true
    setSaving(true)
    setCustomerActionError("")
    setCustomerActionMessage("")
    setLoading(true)
    try {
      const url = Number(formData.id) > 0 ? `/api/customers/${formData.id}` : "/api/customers"
      const method = Number(formData.id) > 0 ? "PUT" : "POST"
      const voucher = Array.isArray(formData.voucherType)
        ? formData.voucherType.map((item) => ({ type_id: item.type_id, book_id: item.book_id, ser: item.ser }))
        : []
      const costCenters = Array.isArray(costCenterTypes)
        ? costCenterTypes
            .map((row) => {
              const defaultCostCenterId = Number(row?.default_cost_center_id ?? 0)

              if (!defaultCostCenterId || Number.isNaN(defaultCostCenterId)) return null

              return {
                cost_center_type_id: row.id || null,
                cost_center_id: defaultCostCenterId,
                required_in_transactions: row.required_in_transactions ?? 1,
                default_cost_center_id: defaultCostCenterId,
              }
            })
            .filter(Boolean)
        : []

      const stopTransactions = Array.isArray(stopTransactionRows)
        ? stopTransactionRows
            .filter((row) => row.is_stopped)
            .map((row) => ({ voucher_types_id: row.voucher_types_id, stop_date: row.stop_date || null }))
        : []

      const accountClassifications = Array.isArray(classificationRows)
        ? classificationRows
            .filter((row) => row.classification_id != null)
            .map((row) => ({ classification_id: row.classification_id }))
        : []

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Number(formData.id) || 0,
          customer_code: trimmedCode,
          customer_name: trimmedName,
          name: trimmedName,
          mobile1: formData.mobile1,
          mobile2: formData.mobile2,
          whatsapp1: formData.whatsapp1,
          whatsapp2: formData.whatsapp2,
          city: formData.city,
          address: formData.address,
          email: formData.email,
          status: formData.status,
          business_nature: formData.business_nature,
          salesman: formData.salesman,
          classifications: formData.classification,
          classification: formData.classification,
          account_opening_date: formData.registration_date,
          registration_date: formData.registration_date,
          movement_notes: formData.transaction_notes,
          transaction_notes: formData.transaction_notes,
          general_notes: formData.general_notes,
          tax_number: formData.tax_number,
          commercial_registration: formData.commercial_registration,
          credit_limit: formData.credit_limit,
          payment_terms: formData.payment_terms,
          discount_percentage: formData.discount_percentage,
          type: isSupplier ? 2 : 1,
          pricecategory: formData.pricecategory,
          account_id: formData.account_id,
          cost_centers: costCenters,
          stop_transactions: stopTransactions,
          currency_id: formData.currency_id,
          allow_trans_with_diff_curr: formData.allow_trans_with_diff_curr,
          iscalc_curr_diff_rates: formData.iscalc_curr_diff_rates,
          father_id: formData.father_id,
          level_no: formData.father_id ? undefined : 1,
          account_classifications: accountClassifications,
          voucher,
        }),
      })

      if (!response.ok) {
        let message = response.statusText || "فشل في حفظ بيانات الزبون"
        try {
          const errorData = await response.json()
          message = errorData?.error || errorData?.message || message
        } catch (_) {}
        setCustomerActionError(message)
        Util.showErrorToast(toast.current, message)
        return false
      }

      const savedCustomer = await response.json()
      const savedCustomerId = Number(savedCustomer?.id ?? savedCustomer?.data?.id ?? formData.id ?? 0)
      if (savedCustomerId > 0 && savedCustomerId !== Number(formData.id)) {
        updateField("id" as keyof UnifiedCustomerFormData, savedCustomerId as any)
      }

      setCustomerActionMessage(Number(formData.id) > 0 ? "تم تعديل الزبون بنجاح" : "تم حفظ الزبون بنجاح")
      Util.showSuccessToast(toast.current, Number(formData.id) > 0 ? "تم تعديل الزبون بنجاح" : "تم حفظ الزبون بنجاح")
      onOpenChange?.(true)
      await onSave?.()
      if (savedCustomerId > 0) {
        updateField("id" as keyof UnifiedCustomerFormData, savedCustomerId as any)
        setCurrentCustomerId(savedCustomerId)
      }

      const persistedSnapshot = getEditableFormSnapshot({
        ...formData,
        id: savedCustomerId || Number(formData.id) || 0,
        customer_code: trimmedCode,
        name: trimmedName,
        registration_date: formData.registration_date,
      })
      formDataRef.current = persistedSnapshot
      initialHash.current = getFormDataHash(persistedSnapshot)

      setTimeout(() => {
        focusCustomerName()
      }, 0)
      return { success: true, savedCustomerId }
    } catch (error) {
      console.error("Error saving customer in UnifiedCustomers:", error)
      setCustomerActionError("حدث خطأ أثناء حفظ بيانات الزبون")
      return { success: false, savedCustomerId: 0 }
    } finally {
      savingRef.current = false
      setSaving(false)
      setLoading(false)
    }
  }, [classificationRows, costCenterTypes, formData, isSupplier, onSave, reset_fields, setCurrentCustomerId, stopTransactionRows, updateField])

  const handleDeleteCustomerRequest = useCallback(() => {
    if (Number(formData.id) <= 0) return
    setShowCustomerDeleteConfirm(true)
  }, [formData.id])

  const handleDeleteCustomerConfirm = useCallback(async () => {
    if (Number(formData.id) <= 0) return

    setShowCustomerDeleteConfirm(false)
    setSaving(true)
    setCustomerActionError("")
    setCustomerActionMessage("")

    try {
      const response = await fetch(`/api/customers/${formData.id}`, { method: "DELETE" })
      if (!response.ok) {
        let message = "فشل في حذف السجل"
        try {
          const errorData = await response.json()
          message = errorData?.error || errorData?.message || message
        } catch (_) {}
        setCustomerActionError(message)
        return
      }

      setCustomerActionMessage("تم حذف السجل بنجاح")
      onOpenChange?.(true)
      await onDelete?.()
      setCurrentCustomerId(0)
      setTimeout(() => {
        focusCustomerName()
      }, 0)
    } catch (error) {
      console.error("Error deleting customer in UnifiedCustomers:", error)
      setCustomerActionError("حدث خطأ أثناء حذف السجل")
    } finally {
      setSaving(false)
    }
  }, [formData.id, onDelete, reset_fields])

  const handleSaveClassification = useCallback(async () => {
    if (!newClassificationTypeId) {
      setClassificationError("يجب اختيار نوع التصنيف")
      return
    }
    if (!newClassificationName.trim()) {
      setClassificationError("اسم التصنيف مطلوب")
      return
    }

    const selectedType = classificationTypes.find((item: any) => String(item.id) === String(newClassificationTypeId))
    if (!selectedType) {
      setClassificationError("نوع التصنيف غير صحيح")
      return
    }

    try {
      const response = await fetch("/api/account-classifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classification_type_id: Number(selectedType.id),
          name: newClassificationName.trim(),
        }),
      })

      if (!response.ok) throw new Error("failed to save classification")
      const saved = await response.json()
      setAllClassifications((prev) => [
        ...prev,
        {
          id: Number(saved.id ?? Date.now()),
          name: saved.name ?? newClassificationName.trim(),
          classification_type_id: Number(selectedType.id),
          classification_type_name: selectedType.name,
        },
      ])
      setClassificationRows((prev) =>
        prev.map((row) =>
          Number(row.id) === Number(selectedType.id)
            ? {
                ...row,
                classification_id: saved.id != null ? Number(saved.id) : row.classification_id,
                classification_name: saved.name ?? newClassificationName.trim(),
              }
            : row,
        ),
      )
      onClassificationRowsChange?.(
        classificationRows.map((row) =>
          Number(row.id) === Number(selectedType.id)
            ? {
                ...row,
                classification_id: saved.id != null ? Number(saved.id) : row.classification_id,
                classification_name: saved.name ?? newClassificationName.trim(),
              }
            : row,
        ),
      )
      setShowClassificationForm(false)
      setNewClassificationTypeId(null)
      setNewClassificationName("")
      setClassificationError("")
    } catch (error) {
      console.error(error)
      setClassificationError("فشل في حفظ التصنيف")
    }
  }, [classificationTypes, newClassificationName, newClassificationTypeId])

  const handleSelectAccountClassification = useCallback(
    (classification: any) => {
      if (selectedClassificationTypeIndex < 0) return
      setClassificationRows((prev) =>
        prev.map((row, index) =>
          index === selectedClassificationTypeIndex
            ? {
                ...row,
                classification_id: Number(classification.id),
                classification_name: classification.name || row.classification_name,
              }
            : row,
        ),
      )
      setSearchAccountClassificationOpen(false)
      setSelectedClassificationType(null)
      setSelectedClassificationTypeIndex(-1)
    },
    [selectedClassificationTypeIndex],
  )

  const handleConfirmDeleteClassification = useCallback(() => {
    if (deleteClassificationConfirmIndex >= 0) {
      setClassificationRows((prev) =>
        prev.map((row, index) =>
          index === deleteClassificationConfirmIndex
            ? { ...row, classification_id: null, classification_name: "" }
            : row,
        ),
      )
    }
    setShowDeleteClassificationConfirm(false)
    setDeleteClassificationConfirmIndex(-1)
  }, [deleteClassificationConfirmIndex])

  const handleCostCenterTypeSearchClick = useCallback((rowIndex: number) => {
    setSelectedCostCenterTypeIndex(rowIndex)
    setSelectedCostCenterType(costCenterTypes[rowIndex] || null)
    setSearchCostCenterOpen(true)
  }, [costCenterTypes])

  const handleCostCenterTypeDeleteClick = useCallback((rowIndex: number) => {
    setDeleteConfirmIndex(rowIndex)
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (deleteConfirmIndex >= 0 && deleteConfirmIndex < costCenterTypes.length) {
      const nextTypes = costCenterTypes.map((item, index) =>
        index === deleteConfirmIndex
          ? { ...item, default_cost_center_id: null, cost_center_name: "" }
          : item,
      )
      setCostCenterTypes(nextTypes)
      setCostCenterTypeMessage("تم حذف مركز التكلفة بنجاح")
    }
    setShowDeleteConfirm(false)
    setDeleteConfirmIndex(-1)
  }, [costCenterTypes, deleteConfirmIndex])

  const handleCostCenterTypeStatusChange = useCallback((rowIndex: number) => {
    setCostCenterTypes((prev) =>
      prev.map((item, index) => {
        if (index !== rowIndex) return item
        const nextStatus = item.state_status === "اختياري" ? "اجباري" : item.state_status === "اجباري" ? "ممنوع" : "اختياري"
        const requiredMap: Record<string, number> = { اختياري: 1, اجباري: 2, ممنوع: 3 }
        return {
          ...item,
          state_status: nextStatus,
          required_in_transactions: requiredMap[nextStatus],
        }
      }),
    )
  }, [])

  const handleSelectCostCenter = useCallback((center: CostCenterItem) => {
    if (selectedCostCenterTypeIndex < 0) return
    setCostCenterTypes((prev) =>
      prev.map((item, index) =>
        index === selectedCostCenterTypeIndex
          ? { ...item, cost_center_name: center.name, default_cost_center_id: center.id }
          : item,
      ),
    )
    setCostCenterTypeMessage(`تم ربط مركز التكلفة ${center.name}`)
  }, [selectedCostCenterTypeIndex])

  const costCenterTypeScheme = useMemo(
    () => ({
      name: "CostCenterTypeScheme",
      columns: [
        { header: "اسم نوع مركز الكلفة", name: "name", width: "*", minWidth: 250, isReadOnly: true },
        { header: "الحالة", name: "state_status", width: 150, isReadOnly: true },
        { header: "Required in Transactions", name: "required_in_transactions", width: 0, isReadOnly: true, visible: true },
        {
          name: "btnStatusChange",
          header: " ",
          width: 80,
          buttonBody: "button",
          align: "center",
          title: "تغيير الحالة",
          iconType: "edit",
          className: "btn-status",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            e.stopPropagation()
            handleCostCenterTypeStatusChange(ctx.row.index)
          },
          visible: true,
          visibleInColumnChooser: true,
        },
        { header: "مركز التكلفة", name: "cost_center_name", width: 200, isReadOnly: true },
        {
          name: "btnSearch",
          header: " ",
          width: 65,
          buttonBody: "button",
          align: "center",
          title: "بحث",
          iconType: "search",
          className: "btn-search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            e.stopPropagation()
            handleCostCenterTypeSearchClick(ctx.row.index)
          },
          visible: true,
          visibleInColumnChooser: true,
        },
        {
          name: "btnDelete",
          header: " ",
          width: 65,
          buttonBody: "button",
          align: "center",
          title: "حذف",
          iconType: "delete",
          className: "btn-delete",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            e.stopPropagation()
            handleCostCenterTypeDeleteClick(ctx.row.index)
          },
          visible: true,
          visibleInColumnChooser: true,
        },
      ],
    }),
    [handleCostCenterTypeDeleteClick, handleCostCenterTypeSearchClick, handleCostCenterTypeStatusChange],
  )

  return (
    <div className="w-full h-full p-0 gap-0 flex flex-col overflow-hidden text-base" dir="rtl">
      <div className="border-b bg-slate-50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="w-7" />
          <h2 className="text-2xl font-bold text-center flex-1">
            {formData.id === 0
              ? isSupplier
                ? "إضافة مورد جديد"
                : "إضافة زبون جديد"
              : isSupplier
                ? "تعديل مورد"
                : "تعديل زبون"}
          </h2>
          <div className="flex-shrink-0">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange?.(false)} className="h-7 w-7 p-0" aria-label="Close" title="إغلاق">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 py-2">
        <Card className="shadow-sm">
          <CardHeader className="py-2 px-4">
            <UniversalToolbar
              onFirst={handleFirst}
              onPrevious={handlePrevious}
              onNext={handleNext}
              onLast={handleLast}
              onNew={handleNew}
              onSave={handleSaveCustomer}
              onDelete={handleDeleteCustomerRequest}
              currentRecord={currentIndex + 1}
              totalRecords={totalRecords}
              isFirstRecord={currentIndex === 0}
              isLastRecord={currentIndex === Math.max(totalRecords - 1, 0)}
              isSaving={saving || isSaving}
              onExportExcel={onExportExcel}
              canSave={true}
              canDelete={Number(formData.id) > 0}
            />
          </CardHeader>
        </Card>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <ProgressSpinner loading={loading || saving} />
        <Toast ref={toast} position={'top-left'} className="erp-toast-host" style={{ top: 100, whiteSpace: 'pre-line' }} />
        {customerActionError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{customerActionError}</AlertDescription>
          </Alert>
        )}
        {customerActionMessage && (
          <Alert className="bg-green-50 border-green-200">
            <AlertDescription className="text-green-800">{customerActionMessage}</AlertDescription>
          </Alert>
        )}
        <CustomerSearchPopup
          visible={showCustomerSearch}
          type={isSupplier ? 2 : 1}
          vch_type={0}
          onClose={() => setShowCustomerSearch(false)}
          onSelect={handleCustomerSelect}
        />

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5 text-primary" />
            المعلومات الأساسية والتعريف
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="col-span-1">
              <Label htmlFor="customer_code" className="text-sm font-medium">
                {isSupplier ? "رقم المورد *" : "رقم الزبون *"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="customer_code"
                  value={formData.customer_code}
                  onChange={(e) => updateField("customer_code", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  onBlur={async (e) => {
                    await handleCustomerCodeBlur(e.target.value)
                  }}
                  className="text-right"
                  placeholder={isSupplier ? "رقم المورد" : "رقم الزبون"}
                  maxLength={8}
                />
                <Button type="button" onClick={() => setShowCustomerSearch(true)}>
                  🔍
                </Button>
              </div>
            </div>

            <div className="col-span-1 md:col-span-3">
              <Label htmlFor="customer_name" className="text-sm font-medium">
                {isSupplier ? "اسم المورد *" : "اسم الزبون *"}
              </Label>
              <Input
                id="customer_name"
                ref={customerNameRef}
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                className={`text-right ${validationErrors.name ? "border-red-500" : ""}`}
                placeholder=""
                required
              />
              {validationErrors.name && <p className="text-red-500 text-xs mt-1">{validationErrors.name}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="salesman" className="text-sm font-medium">المندوب</Label>
              <PrimeDropdown
                inputId="salesman"
                value={formData.salesman || null}
                options={salesmen.map((item) => ({ label: item.name, value: item.name }))}
                optionLabel="label"
                optionValue="value"
                placeholder="اختر المندوب"
                filter={true}
                className="invoice-currency-dropdown w-full"
                panelClassName="invoice-currency-dropdown-panel"
                appendTo="self"
                filterInputAutoFocus={true}
                onChange={(e: any) => updateField("salesman", e.value || "")}
              />
            </div>
            <div>
                  <Label htmlFor="classification" className="text-sm font-medium">تصنيف الزبون</Label>
                  <PrimeDropdown
                    inputId="classification"
                    value={formData.classification || null}
                    options={classifications.map((item) => ({ label: item.group_name || item.name || "", value: item.group_name || item.name || "" }))}
                    optionLabel="label"
                    optionValue="value"
                    placeholder={isSupplier ? "اختر تصنيف المورد" : "اختر تصنيف الزبون"}
                    filter={true}
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    filterInputAutoFocus={true}
                    onChange={(e: any) => updateField("classification", e.value || "")}
                  />
                </div>

          </div>


              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <div>
              <Label htmlFor="status" className="text-sm font-medium">
                الحالة
              </Label>
              <PrimeDropdown
                inputId="status"
                value={formData.status || "نشط"}
                options={[
                  { label: "نشط", value: "نشط" },
                  { label: "غير نشط", value: "غير نشط" },
                ]}
                optionLabel="label"
                optionValue="value"
                placeholder="اختر الحالة"
                filter={false}
                className="invoice-currency-dropdown w-full"
                panelClassName="invoice-currency-dropdown-panel"
                appendTo="self"
                onChange={(e: any) => updateField("status", e.value || "نشط")}
              />
            </div>

            <div>
              <Label htmlFor="registration_date" className="text-sm font-medium">
                تاريخ التسجيل
              </Label>
              <Input
                id="registration_date"
                type="date"
                disabled
                value={formData.registration_date}
                onChange={(e) => updateField("registration_date", e.target.value)}
                className="text-right"
              />
            </div>
                
              </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4" dir="rtl">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-gradient-to-r from-slate-50 via-blue-50 to-slate-50 p-2 shadow-md border border-slate-200/60 backdrop-blur-sm">
          <TabsTrigger value="address-location" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">العنوان والموقع</TabsTrigger>
          <TabsTrigger value="financial-tax" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500 data-[state=active]:to-red-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">المعلومات المالية والضريبية</TabsTrigger>
          <TabsTrigger value="default-voucher-books" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-amber-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">دفاتر السندات الافتراضية</TabsTrigger>
          <TabsTrigger value="cost-centers" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">مراكز التكلفة</TabsTrigger>
          <TabsTrigger value="stop-transactions" className="rounded-lg px-4 py-2 font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500 data-[state=active]:to-red-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-slate-200/40">إيقاف الحركات</TabsTrigger>
        </TabsList>

        <TabsContent value="address-location" className="space-y-4" dir="rtl">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">العنوان والموقع</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city" className="text-sm font-medium">المدينة</Label>
                  <PrimeDropdown
                    inputId="city"
                    value={formData.city || null}
                    options={cities.map((city: any) => ({ label: city.name || city.city_name || city.name_ar || city.name_en || "", value: city.name || city.city_name || city.name_ar || city.name_en || "" }))}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="اختر المدينة"
                    filter={true}
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    filterInputAutoFocus={true}
                    onChange={(e: any) => updateField("city", e.value || "")}
                  />
                </div>
                
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mobile1" className="text-sm font-medium">الجوال الأول</Label>
                  <Input id="mobile1" value={formData.mobile1} onChange={(e) => updateField("mobile1", e.target.value)} className="text-right" />
                </div>
                <div>
                  <Label htmlFor="mobile2" className="text-sm font-medium">الجوال الثاني</Label>
                  <Input id="mobile2" value={formData.mobile2} onChange={(e) => updateField("mobile2", e.target.value)} className="text-right" />
                </div>
                <div>
                  <Label htmlFor="whatsapp1" className="text-sm font-medium">واتساب الأول</Label>
                  <Input id="whatsapp1" value={formData.whatsapp1} onChange={(e) => updateField("whatsapp1", e.target.value)} className="text-right" />
                </div>
                <div>
                  <Label htmlFor="whatsapp2" className="text-sm font-medium">واتساب الثاني</Label>
                  <Input id="whatsapp2" value={formData.whatsapp2} onChange={(e) => updateField("whatsapp2", e.target.value)} className="text-right" />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="email" className="text-sm font-medium">البريد الإلكتروني</Label>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} className="text-right" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial-tax" className="space-y-4" dir="rtl">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">المعلومات المالية والضريبية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <AutoCompleteAccount
                    label="الحساب الرئيسي (تابع ل)"
                    value={fatherAccountCode}
                    placeholder="اختر الحساب الرئيسي"
                    showCostCenterButton={false}
                    onValueChange={(nextCode) => {
                      setFatherAccountCode(nextCode)
                      if (!nextCode) {
                        updateField("father_id" as keyof UnifiedCustomerFormData, "" as any)
                        setFatherAccountName("")
                      }
                    }}
                    onAccountSelect={(account) => {
                      setFatherAccountName(account ? `${account.code} - ${account.name}` : "")
                      setFatherAccountCode(account ? account.code : "")
                      updateField("father_id" as keyof UnifiedCustomerFormData, account ? String(account.id) : "" as any)
                    }}
                  />
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-medium">العملة</Label>
                  <PrimeDropdown
                    inputId="currency_id"
                    value={formData.currency_id ? Number(formData.currency_id) : null}
                    options={currencies.map((currency: any) => ({
                      label: currency.currency_name || currency.name || currency.currency_code || "غير محدد",
                      value: Number(currency.currency_id ?? currency.id ?? 0),
                    }))}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="اختر العملة"
                    filter={true}
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    filterInputAutoFocus={true}
                    onChange={(e: any) => updateField("currency_id" as keyof UnifiedCustomerFormData, e.value ? String(e.value) : "" as any)}
                  />
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-medium">السماح بعمل حركة على الحساب بغير عملته</Label>
                  <PrimeDropdown
                    inputId="allow_trans_with_diff_curr"
                    value={allowTransWithDiffCurr}
                    options={[
                      { label: "مسموح بدون تنبيه", value: "0" },
                      { label: "مسموح مع تنبيه", value: "1" },
                      { label: "ممنوع", value: "2" },
                    ]}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="اختر الخيار"
                    filter={false}
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    onChange={(e: any) => {
                      const nextValue = String(e.value ?? "0")
                      setAllowTransWithDiffCurr(nextValue)
                      updateField("allow_trans_with_diff_curr" as keyof UnifiedCustomerFormData, nextValue as any)
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="tax_number" className="text-sm font-medium">الرقم الضريبي</Label>
                  <Input id="tax_number" value={formData.tax_number} onChange={(e) => updateField("tax_number", e.target.value)} className="text-right" />
                </div>
                <div>
                  <Label htmlFor="commercial_registration" className="text-sm font-medium">السجل التجاري</Label>
                  <Input id="commercial_registration" value={formData.commercial_registration} onChange={(e) => updateField("commercial_registration", e.target.value)} className="text-right" />
                </div>
                <div>
                  <Label htmlFor="credit_limit" className="text-sm font-medium">حد الائتمان</Label>
                  <Input id="credit_limit" type="number" value={formData.credit_limit} onChange={(e) => updateField("credit_limit", e.target.value)} className="text-right" />
                </div>
                <div>
                  <Label htmlFor="payment_terms" className="text-sm font-medium">شروط الدفع</Label>
                  <PrimeDropdown
                    inputId="payment_terms"
                    value={formData.payment_terms || "نقدي"}
                    options={[
                      { label: "نقدي", value: "نقدي" },
                      { label: "آجل 7 أيام", value: "آجل 7 أيام" },
                      { label: "آجل 15 يوم", value: "آجل 15 يوم" },
                      { label: "آجل 30 يوم", value: "آجل 30 يوم" },
                      { label: "آجل 60 يوم", value: "آجل 60 يوم" },
                      { label: "آجل 90 يوم", value: "آجل 90 يوم" },
                    ]}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="اختر شروط الدفع"
                    filter={false}
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    onChange={(e: any) => updateField("payment_terms", e.value || "نقدي")}
                  />
                </div>
                <div>
                  <Label htmlFor="discount_percentage" className="text-sm font-medium">نسبة الخصم %</Label>
                  <Input id="discount_percentage" type="number" step="0.01" min="0" max="100" value={formData.discount_percentage} onChange={(e) => updateField("discount_percentage", e.target.value)} className="text-right" />
                </div>
              </div>
              <div className="pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={iscalcCurrDiffRates}
                    onCheckedChange={(checked) => {
                      const nextValue = Boolean(checked)
                      setIscalcCurrDiffRates(nextValue)
                      updateField("iscalc_curr_diff_rates" as keyof UnifiedCustomerFormData, nextValue as any)
                    }}
                  />
                  <span className="text-base font-medium">الحساب يخضع لفرق العملة</span>
                </label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="default-voucher-books" className="space-y-4" dir="rtl">
                      <Card>
                        <CardHeader className="pb-4">
                          <div className="flex items-center justify-between gap-4">
                            <CardTitle className="text-lg">دفاتر السندات الافتراضية</CardTitle>
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              onClick={handleAddVoucherTypeRow}
                              className="flex items-center gap-2 whitespace-nowrap bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white transition-all duration-200 shadow-md hover:shadow-lg"
                            >
                              <Plus className="w-4 h-4" />
                              اضافة سطر جديد
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {voucherTypeRows.length > 0 ? (
                              voucherTypeRows.map((row, index) => (
                                <div key={row.ser ?? index} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                  <div>
                                    <Label className="mb-2 block text-sm font-medium">نوع السند</Label>
                                    <PrimeDropdown
                                      value={row.type_id ? Number(row.type_id) : null}
                                      options={voucherTypes.map((item: any) => ({ label: item.name || "", value: Number(item.id) }))}
                                      optionLabel="label"
                                      optionValue="value"
                                      placeholder="اختر نوع السند"
                                      filter={true}
                                      className="invoice-currency-dropdown w-full"
                                      panelClassName="invoice-currency-dropdown-panel"
                                      appendTo="self"
                                      filterInputAutoFocus={true}
                                      onChange={(e: any) => {
                                        const selected = voucherTypes.find((item: any) => Number(item.id) === Number(e.value))
                                        handleUpdateVoucherTypeRow(index, {
                                          type_id: Number(e.value) || 0,
                                          type_name: selected?.name || "",
                                        })
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <Label className="mb-2 block text-sm font-medium">دفتر السند</Label>
                                    <PrimeDropdown
                                      value={row.book_id ? Number(row.book_id) : null}
                                      options={voucherBooks.map((item: any) => ({ label: item.name || "", value: Number(item.id) }))}
                                      optionLabel="label"
                                      optionValue="value"
                                      placeholder="اختر دفتر السند"
                                      filter={true}
                                      className="invoice-currency-dropdown w-full"
                                      panelClassName="invoice-currency-dropdown-panel"
                                      appendTo="self"
                                      filterInputAutoFocus={true}
                                      onChange={(e: any) => {
                                        const selected = voucherBooks.find((item: any) => Number(item.id) === Number(e.value))
                                        handleUpdateVoucherTypeRow(index, {
                                          book_id: Number(e.value) || 0,
                                          book_name: selected?.name || "",
                                        })
                                      }}
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => handleDeleteVoucherTypeRow(index)}
                                      className="w-full md:w-auto"
                                    >
                                      حذف
                                    </Button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                                لا توجد دفاتر سندات افتراضية. أضف سطراً جديداً للبدء.
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>


        <TabsContent value="cost-centers" className="space-y-4" dir="rtl">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-blue-50 to-slate-50 p-4 rounded-md border border-slate-200">
              <div className="flex-1">
                <h4 className="font-semibold text-base">مراكز التكلفة</h4>
              </div>
              <Button
                variant="default"
                size="sm"
                className="flex items-center gap-2 whitespace-nowrap bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <Plus className="w-4 h-4" />
                اضافة نوع مركز تكلفة جديد
              </Button>
            </div>

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

            <div className="rounded-md border border-slate-300 overflow-hidden" dir="rtl">
              {costCenterTypes.length > 0 ? (
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



        <TabsContent value="stop-transactions" className="space-y-4" dir="rtl">
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-red-50 to-white px-4 py-3">
              <Checkbox
                checked={visibleStopTransactionRows.length > 0 && visibleStopTransactionRows.every((row) => row.is_stopped)}
                className="size-3 rounded-[3px] border-slate-300 bg-white shadow-sm transition-all duration-150 hover:scale-105 hover:border-blue-500 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:shadow-blue-200 [&_svg]:size-2.5"
                onCheckedChange={(checked) => {
                  const nextValue = Boolean(checked)
                  setStopTransactionRows((prev) =>
                    prev.map((row) =>
                      visibleStopTransactionRowIds.has(Number(row?.voucher_types_id))
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
      </Tabs>

      <SearchCostCenterDialog
        open={searchCostCenterOpen}
        onOpenChange={setSearchCostCenterOpen}
        type={selectedCostCenterType ? { id: selectedCostCenterType.id, name: selectedCostCenterType.name } : undefined}
        costCenters={costCenters}
        onSelect={handleSelectCostCenter}
      />

      <SearchAccountClassificationDialog
        open={searchAccountClassificationOpen}
        onOpenChange={setSearchAccountClassificationOpen}
        type={selectedClassificationType || undefined}
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
        visible={showCustomerDeleteConfirm}
        message="هل أنت متأكد من حذف السجل؟ لا يمكن التراجع عن هذا الإجراء."
        onConfirm={handleDeleteCustomerConfirm}
        onCancel={() => setShowCustomerDeleteConfirm(false)}
        isCompact={true}
      />

      <ConfirmDialogYesNo
        visible={showUnsaved}
        message="هناك تغييرات غير محفوظة. هل ترغب في حفظ السجل؟"
        onConfirm={async () => {
          setShowUnsaved(false)
          const fn = nextFunction
          setNextFunction(null)
          const saveResult = await handleSaveCustomer()
          const didSave = saveResult !== false && saveResult?.success === true
          if (didSave && fn) {
            await fn()
          }
        }}
        onCancel={() => {
          setShowUnsaved(false)
          const fn = nextFunction
          setNextFunction(null)
          void fn?.()
        }}
        onBack={() => {
          setShowUnsaved(false)
          setNextFunction(null)
        }}
        showBack={true}
        isCompact={true}
      />

      <Dialog open={showClassificationTypeForm} onOpenChange={setShowClassificationTypeForm}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة نوع تصنيف جديد</DialogTitle>
            <DialogDescription>أدخل اسم نوع التصنيف الجديد</DialogDescription>
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
            <Button onClick={handleSaveClassificationType}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClassificationForm} onOpenChange={setShowClassificationForm}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة تصنيف جديد</DialogTitle>
            <DialogDescription>حدد نوع التصنيف واسم التصنيف</DialogDescription>
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
                options={classificationTypes.map((type: any) => ({ label: type.name, value: String(type.id) }))}
                optionLabel="label"
                optionValue="value"
                placeholder="اختر نوع التصنيف"
                filter={true}
                className="invoice-currency-dropdown w-full"
                panelClassName="invoice-currency-dropdown-panel"
                appendTo="self"
                filterInputAutoFocus={true}
                onChange={(e: any) => setNewClassificationTypeId(e.value)}
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
            <Button onClick={handleSaveClassification}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}
