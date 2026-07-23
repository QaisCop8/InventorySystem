"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, Trash2, Paperclip, ListPlus, FileText, User, Wallet, MessageSquare, Landmark, CreditCard, BookOpen } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import Messages from "@/components/common/Messages"
import ProgressSpinner from "@/components/ProgressSpinner/ProgressSpinner"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import AccountSearchDialog, { type AccountItem } from "@/components/customer/account-search-dialog"
import AccountCostCenters, { type JournalCostCenterSelection } from "@/components/customer/account-cost-centers"
import BanksSearch, { type BankSearchRecord } from "@/components/admin/banks-search"
import BranchesSearch, { type BranchSearchRecord } from "@/components/admin/branches-search"
import BankAccountsSearch from "@/components/admin/bank-accounts-search"
import type { BankAccountRecord } from "@/components/admin/unified-bank-accounts"
import ChequeBookLeafSearch, { type ChequeBookLeafRecord } from "@/components/admin/cheque-book-leaf-search"
import DatePickerDialog from "@/components/common/date-picker-dialog"
import DateTimeControl from "@/components/common/date-time-control"
import PostVoucherDialog, { type PostVoucherAction } from "@/components/common/post-voucher-dialog"
import DataGridView from "@/components/common/DataGridView"
import { CellRange, KeyAction } from "@grapecity/wijmo.grid"
import * as wjcCore from "@grapecity/wijmo"
import Util from "@/components/common/Util"
import { useToast } from "@/hooks/use-toast"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"
import { useAuth } from "@/components/auth/auth-context"

export interface VoucherJournalRow {
  account_id: number | null
  account_code: string
  account_name: string
  amount: number | null
  note: string
  cost_centers: JournalCostCenterSelection[]
}

export interface VoucherChequeRow {
  bank_account: string
  bank_account_id: number | null
  // حساب الجاري (bank_accounts.jary_account_id) للحساب البنكي المختار — يُستخدم بدل حساب صندوق
  // الشيكات اليدوي (المعطَّل في سند الصرف) كحساب مقابل فعلي لسطر قيد "شيكات".
  jary_account_id: number | null
  cheq_num: string
  cheque_book_cheque_id: number | null
  bank_no: string
  bank_id: number | null
  bank_name: string
  branch_no: string
  branch_id: number | null
  branch_name: string
  due_date: string
  amount: number | null
  cheq_owner_name: string
}

export interface VoucherCardRow {
  card_type_id: number | null
  card_type_name: string
  card_no: string
  expire_date: string
  account_id: number | null
  account_code: string
  account_name: string
  amount: number | null
  bank_amount: number | null
  currency_id: number | null
}

export interface VoucherNoteRow {
  note: string
}

export interface VoucherRecord {
  id: number
  vch_type: number
  vch_code: string
  vch_date: string
  vch_book_id: number | null
  currency_id: number | null
  rate: number
  account_id: number | null
  customer_name: string
  to_account_id: number | null
  cash_amount: number | null
  cash_account_id: number | null
  cash_account_cost_centers?: JournalCostCenterSelection[]
  check_amount: number | null
  check_account_id: number | null
  check_account_cost_centers?: JournalCostCenterSelection[]
  credit_card_amount: number | null
  credit_card_account_id: number | null
  credit_card_account_cost_centers?: JournalCostCenterSelection[]
  amount: number
  payment_classification_id: number | null
  salesman_id: number | null
  manual_voucher: string
  manual_date: string
  note: string
  status: number
  is_printed?: number
  journal: VoucherJournalRow[]
  cheques: VoucherChequeRow[]
  cards: VoucherCardRow[]
  notes: VoucherNoteRow[]
}

interface CurrencyOption {
  currency_id?: number
  id?: number
  currency_name?: string
  currency_code?: string
}

interface LookupOption {
  id: number
  name: string
}

interface CardTypeOption {
  id: number
  name: string
  currency_id: number | null
  financial_account_id: number | null
}

interface BankOption {
  id: number
  bank_code?: string
  bank_name: string
}

interface BranchOption {
  id: number
  branch_code?: string
  branch_name: string
  bank_id: number | null
}

interface UnifiedReceiptVoucherProps {
  title: string
  dialogOpen: boolean
  currentIndex: number
  totalRecords: number
  currencies?: CurrencyOption[]
  voucherBooks?: LookupOption[]
  banks?: BankOption[]
  branches?: BranchOption[]
  bankAccounts?: BankAccountRecord[]
  disallowManualChequeEntryInPayment?: boolean
  salesmen?: LookupOption[]
  paymentClassifications?: LookupOption[]
  cardTypes?: CardTypeOption[]
  form: VoucherRecord
  isSaving: boolean
  showDeleteConfirm?: boolean
  onOpenChange: (open: boolean) => void
  onNew?: () => void
  onSave: (action?: PostVoucherAction) => void
  onValidateSave?: () => string | null
  onDelete?: () => void
  onClone?: () => void
  onPrint?: () => void
  onNavigateRecord?: (record: VoucherRecord) => void
  onFormChange: (field: string, value: string | number | null | JournalCostCenterSelection[]) => void
  onBookChange?: (bookId: number | null) => void
  onCodeResolved?: (id: number) => void
  onCodeNotFound?: (code: string) => void
  onJournalChange: (journal: VoucherJournalRow[]) => void
  onChequesChange: (cheques: VoucherChequeRow[]) => void
  onCardsChange: (cards: VoucherCardRow[]) => void
  onNotesChange: (notes: VoucherNoteRow[]) => void
  onConfirmDelete?: () => void
  onCancelDelete?: () => void
  canSave?: boolean
  isFirstRecord?: boolean
  isLastRecord?: boolean
  isNewMode?: boolean
  errorMessages?: string[]
}

const voucherTabTriggerClass =
  "data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-md"

const normalizeVoucherCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9-]/g, "")
const numberValue = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value))

// FlexGrid.select(rng, show) expects a CellRange (or a row-only number) — NOT (row, columnName).
// Resolve the column's numeric index first, matching the pattern used in unified-sales-order.tsx.
// مرجع innerRef المُمرَّر لـ DataGridView (ref={this.props.innerRef} على <FlexGrid> نفسها) يخزّن
// أحياناً كائن غلاف React (@grapecity/wijmo.react.grid) بدل عنصر التحكم wjGrid.FlexGrid الفعلي —
// خصوصاً قبل أول onKeyDown/cellEditEnded يحدث على الشبكة منذ آخر mount/remount لها (مثلاً بعد
// فتح نافذة بحث بنقرة زر وليس بلوحة المفاتيح). غلاف React هذا يملك خاصية .control (عنصر التحكم
// الحقيقي بكل توابعه: select/focus...) لكنه لا يُعيد توجيهها بنفسه، فاستدعاء .focus() مباشرة
// عليه يفشل بـ "grid.focus is not a function". حلّها هنا مركزياً بدل تكرار الفحص بكل موقع استخدام.
const resolveFlexControl = (grid: any): any => {
  if (!grid) return null
  if (grid.columns) return grid
  return grid.control || null
}

const selectCell = (rawGrid: any, row: number, colName: string) => {
  const grid = resolveFlexControl(rawGrid)
  if (!grid || !grid.columns) return
  const colIndex = grid.columns.findIndex((c: any) => c.binding === colName)
  if (colIndex >= 0) {
    grid.select(new CellRange(row, colIndex))
  }
}

// بعد التبديل إلى تبويب "الحسابات" قد يُعاد إنشاء الشبكة (Radix يُلغي تركيب التبويبات غير
// النشطة)، فيتأخر جاهزية الـ ref قليلاً — نعيد المحاولة بدل الاعتماد على مهلة ثابتة قد تسبق
// اكتمال إعادة التركيب فتترك grid كائناً قديماً بلا columns. minRows: عند استهداف سطر جديد أُضيف
// للتو (مثلاً بعد addChequeRow/addJournalRow)، تحديد الصف قبل أن يستقبل الـ grid فعلياً الصف
// الجديد ضمن itemsSource المُعاد ربطه يفشل بصمت (index خارج الحدود) — فننتظر حتى يتوفر العدد
// الفعلي من الصفوف بدل الاكتفاء بفحص وجود columns فقط (وهو يصبح جاهزاً فوراً بغض النظر عن الصفوف).
const waitForGridReady = (getGrid: () => any, onReady: (grid: any) => void, attempts = 10, minRows = 0) => {
  const grid = resolveFlexControl(getGrid())
  if (grid && grid.columns && (!minRows || (grid.rows && grid.rows.length >= minRows))) {
    onReady(grid)
    return
  }
  if (attempts <= 0) return
  setTimeout(() => waitForGridReady(getGrid, onReady, attempts - 1, minRows), 50)
}

// أرقام فقط (وفاصلة عشرية)، بنفس أسلوب التحقق من الأعمدة الرقمية في QabdVoucher.js.
const blockNonNumericKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
  const controlKeys = ["Backspace", "Delete", "Tab", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]
  if (e.ctrlKey || e.metaKey || e.altKey || controlKeys.includes(e.key)) return
  if (e.key.length === 1 && !/[0-9.]/.test(e.key)) {
    e.preventDefault()
  }
}
const emptyJournalRow: VoucherJournalRow = { account_id: null, account_code: "", account_name: "", amount: null, note: "", cost_centers: [] }
const emptyChequeRow: VoucherChequeRow = {
  bank_account: "",
  bank_account_id: null,
  jary_account_id: null,
  cheq_num: "",
  cheque_book_cheque_id: null,
  bank_no: "",
  bank_id: null,
  bank_name: "",
  branch_no: "",
  branch_id: null,
  branch_name: "",
  due_date: "",
  amount: null,
  cheq_owner_name: "",
}
const emptyCardRow: VoucherCardRow = {
  card_type_id: null,
  card_type_name: "",
  card_no: "",
  expire_date: "",
  account_id: null,
  account_code: "",
  account_name: "",
  amount: null,
  bank_amount: null,
  currency_id: null,
}

const CHEQUE_FIELD_ORDER = ["bank_account", "cheq_num", "bank_no", "branch_no", "due_date", "amount", "cheq_owner_name"]

// مطابق لـ validateCheck في QabdVoucher.js: لا يسمح بإضافة سطر جديد إلا إذا كان السطر الحالي مكتملاً.
const validateChequeRow = (row: VoucherChequeRow | undefined): string | null => {
  if (!row) return "بيانات الشيك غير مكتملة"
  if (!row.bank_account?.trim() && !row.bank_no?.trim()) return "يجب إدخال رقم الحساب أو البنك"
  if (!row.cheq_num?.trim()) return "يجب إدخال رقم الشيك"
  if (!row.amount || Number(row.amount) <= 0) return "يجب إدخال مبلغ الشيك"
  return null
}

const mapAccount = (item: any): AccountItem => ({
  id: Number(item.id),
  code: String(item.code || item.account_code || ""),
  name: String(item.name || item.account_name || ""),
  name_lang2: item.name_lang2 ?? null,
  level_no: Number(item.level_no || 1),
  finanical_list_id: Number(item.finanical_list_id || 1),
  currency_id: item.currency_id != null ? Number(item.currency_id) : null,
  allow_trans_with_diff_curr: Number(item.allow_trans_with_diff_curr || 0),
  iscalc_curr_diff_rates: Boolean(item.iscalc_curr_diff_rates),
  transaction_type: Number(item.transaction_type || 0),
  transaction_type_action: Number(item.transaction_type_action || 0),
  max_transaction_amount: Number(item.max_transaction_amount || 0),
  max_transaction_amount_action: Number(item.max_transaction_amount_action || 0),
  max_balance_amount: Number(item.max_balance_amount || 0),
  show_notes_in_transactions_soa: Boolean(item.show_notes_in_transactions_soa),
  status: item.status || "نشط",
  cost_centers: Array.isArray(item.cost_centers) ? item.cost_centers : [],
})

export default function UnifiedReceiptVoucher({
  title,
  dialogOpen,
  currentIndex,
  totalRecords,
  currencies = [],
  voucherBooks = [],
  banks = [],
  branches = [],
  bankAccounts = [],
  disallowManualChequeEntryInPayment = false,
  salesmen = [],
  paymentClassifications = [],
  cardTypes = [],
  form,
  isSaving,
  showDeleteConfirm = false,
  onOpenChange,
  onNew,
  onSave,
  onValidateSave,
  onDelete,
  onClone,
  onPrint,
  onNavigateRecord,
  onFormChange,
  onBookChange,
  onCodeResolved,
  onCodeNotFound,
  onJournalChange,
  onChequesChange,
  onCardsChange,
  onNotesChange,
  onConfirmDelete = () => undefined,
  onCancelDelete = () => undefined,
  canSave,
  isFirstRecord,
  isLastRecord,
  isNewMode,
  errorMessages = [],
}: UnifiedReceiptVoucherProps) {
  const { user } = useAuth()
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const messagesRef = useRef<any>(null)
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("main")
  const [navLoading, setNavLoading] = useState(false)
  const [accountsList, setAccountsList] = useState<AccountItem[]>([])
  const [journalSearchOpen, setJournalSearchOpen] = useState(false)
  const [journalSearchRow, setJournalSearchRow] = useState<number | null>(null)
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [costCenterAccount, setCostCenterAccount] = useState<AccountItem | null>(null)
  const [bankSearchOpen, setBankSearchOpen] = useState(false)
  const [branchSearchOpen, setBranchSearchOpen] = useState(false)
  const [bankAccountSearchOpen, setBankAccountSearchOpen] = useState(false)
  const [chequeLeafSearchOpen, setChequeLeafSearchOpen] = useState(false)
  const [chequeSearchRow, setChequeSearchRow] = useState<number | null>(null)
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false)
  const [dueDateRow, setDueDateRow] = useState<number | null>(null)
  const chequeGridRef = useRef<any>(null)
  const journalGridRef = useRef<any>(null)
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const doHotKeys = useRef(true)
  const isReceipt = form.vch_type === 8 // per voucher_types_tbl: 8 = سند قبض, 9 = سند صرف
  const isPayment = form.vch_type === 9
  // إعداد "عدم السماح بادخال شيكات يدويا في سند الصرف" (vouchers-general-settings.tsx) — عند
  // تفعيله يُصبح رقم الشيك للقراءة فقط ولا يُختار إلا من دفتر شيكات الحساب البنكي المحدد.
  const forceChequeBookLeaf = isPayment && disallowManualChequeEntryInPayment
  const customerLabel = isReceipt ? "المقبوض منه" : "المدفوع له"
  const customerNameLabel = isReceipt ? "اسم المقبوض منه" : "اسم المدفوع له"
  // سند مُرحَّل (status=2): مقفل بالكامل، لا يُعدَّل إلا عبر إلغائه منطقياً (زر حذف).
  const isPosted = form.status === 2
  // مقفل بالكامل (نموذج + شبكة الحسابات للقراءة فقط) لكلا الحالتين: مُرحَّل (2) أو ملغي منطقياً
  // (3) — لا فرق بينهما من ناحية إمكانية التعديل، الفرق فقط في نص رسالة تأكيد الحذف أدناه.
  const isLocked = form.status === 2 || form.status === 3
  // شارة الحالة في عنوان النافذة: ملغي منطقياً (status=3) تطغى على أي شيء آخر؛ خلاف ذلك
  // "مرحل" وحدها إن لم تُطبع بعد، أو "مرحل - مطبوع" إن طُبعت (is_printed=1) بعد الترحيل.
  const statusBadge =
    form.status === 3 ? "ملغي منطقياً" : form.status === 2 ? (form.is_printed === 1 ? "مرحل - مطبوع" : "مرحل") : ""

  useEffect(() => {
    if (!dialogOpen || accountsList.length > 0) return
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAccountsList(Array.isArray(data) ? data.map(mapAccount) : []))
      .catch(() => setAccountsList([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen])

  // حساب صندوق الشيكات لا يُستخدم إطلاقاً في سند الصرف (معطَّل في الواجهة) — أي قيمة قديمة له
  // (سند مُحمَّل كان محفوظاً قبل هذا التغيير مثلاً) تُفرَّغ فعلياً لا شكلياً فقط، حتى لا تُحفظ
  // خطأً مع السند رغم إخفائها في الحقل.
  useEffect(() => {
    if (isPayment && form.check_account_id != null) {
      onFormChange("check_account_id", null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPayment, form.check_account_id])

  // البطاقات (المبلغ + الحساب + تبويب تفاصيلها) غير متاحة إطلاقاً في سند الصرف — أي قيمة قديمة
  // (سند مُحمَّل كان محفوظاً قبل هذا التغيير) تُفرَّغ فعلياً حتى لا تدخل في حساب الإجمالي رغم
  // إخفاء حقولها.
  useEffect(() => {
    if (!isPayment) return
    if (form.credit_card_amount != null) onFormChange("credit_card_amount", null)
    if (form.credit_card_account_id != null) onFormChange("credit_card_account_id", null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPayment, form.credit_card_amount, form.credit_card_account_id])

  useEffect(() => {
    if (errorMessages.length > 0) {
      messagesRef.current?.clear?.()
      messagesRef.current?.show(
        errorMessages.map((detail) => ({ severity: "error", summary: "", detail, sticky: false, life: 5000 })),
      )
    }
  }, [errorMessages])

  const initialSnapshotRef = useRef<string>(JSON.stringify(form))
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    initialSnapshotRef.current = JSON.stringify(form)
    setActiveTab("main")
    // form.vch_code يتغيّر أيضاً عند إعادة تصفير النموذج لمسودة جديدة بعد حفظ ناجح (id يبقى 0 في
    // الحالتين) — بدونه تبقى initialSnapshotRef محتفظة بلقطة المسودة القديمة (قبل الحفظ)، فتُقارَن
    // المسودة الجديدة الفارغة بها وتظهر "تم تعديل البيانات، هل تريد الحفظ؟" رغم عدم لمس المستخدم لها.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.vch_code, isNewMode])

  const guardedAction = (action: () => void) => {
    if (showUnsavedConfirm) return
    if (JSON.stringify(form) !== initialSnapshotRef.current) {
      pendingActionRef.current = action
      setShowUnsavedConfirm(true)
    } else {
      action()
    }
  }

  // كتابة يدوية في رقم السند (مثال R1 أو 1 فقط) تُعاد صياغتها دائماً كـ {بادئة}{رمز الدفتر}
  // {تسلسل مبطّن} عبر /resolve-code، ثم يُعرض السند إن كان موجوداً بهذا الرقم (بعد التأكد من عدم
  // وجود تعديلات غير محفوظة في السند الحالي)، أو تُصفَّر كل الحقول والشبكات لسند جديد بهذا الرقم.
  const handleCodeBlur = async () => {
    const raw = form.vch_code.trim()
    if (!raw) return
    try {
      const query = new URLSearchParams({ vch_type: String(form.vch_type), raw })
      if (form.vch_book_id) query.set("vch_book_id", String(form.vch_book_id))
      const response = await fetch(`/api/receipts/resolve-code?${query.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        messagesRef.current?.show?.([{ severity: "error", summary: "", detail: data.error || "تعذر تحديد رقم السند", life: 3000 }])
        return
      }
      if (data.code && data.code !== form.vch_code) {
        onFormChange("vch_code", data.code)
      }
      if (data.exists && data.id) {
        if (data.id === form.id) return
        guardedAction(() => onCodeResolved?.(data.id))
      } else if (!data.exists && data.code) {
        guardedAction(() => onCodeNotFound?.(data.code))
      }
    } catch (error) {
      console.error("Failed to resolve voucher code", error)
    }
  }

  // يتحقق من صحة السند قبل عرض نافذة "كيف تريد الحفظ؟" — لا فائدة من تخيير المستخدم بين حفظ/ترحيل/طباعة
  // لسند غير صالح أصلاً (رقم ناقص، مبالغ غير متطابقة...)؛ رسالة الخطأ تظهر مباشرة بدل فتح النافذة.
  const handleRequestSave = () => {
    if (isLocked) return
    const error = onValidateSave?.()
    if (error) {
      messagesRef.current?.clear?.()
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: error, sticky: false, life: 4000 }])
      return
    }
    setPostDialogOpen(true)
  }

  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return
    if (showDeleteConfirm || showUnsavedConfirm) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F3") {
        event.preventDefault()
        handleRequestSave()
        return
      }
      if (event.key === "F4") {
        event.preventDefault()
        if (form.id > 0) {
          onDelete?.()
        } else {
          guardedAction(() => onOpenChange(false))
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [dialogOpen, form.id, isLocked, onDelete, onOpenChange, guardedAction, showDeleteConfirm, showUnsavedConfirm])

  const currencyOptions = useMemo(
    () =>
      currencies.map((c) => ({
        label: c.currency_name || c.currency_code || "غير محدد",
        value: Number(c.currency_id ?? c.id),
      })),
    [currencies],
  )

  // عملة الأساس في النظام = أصغر معرّف عملة، وسعر صرفها دائماً 1 (نفس قاعدة إنشاء العملات).
  const baseCurrencyId = useMemo(
    () =>
      currencies.reduce<number | null>((min, c) => {
        const id = Number(c.currency_id ?? c.id)
        if (!Number.isFinite(id)) return min
        return min === null || id < min ? id : min
      }, null),
    [currencies],
  )

  const handleNavigate = async (direction: "first" | "previous" | "next" | "last") => {
    setNavLoading(true)
    try {
      const currentId = form.id > 0 ? form.id : 0
      const isNewRecord = form.id <= 0
      const effectiveDirection =
        direction === "previous" && isNewRecord ? "last" : direction === "next" && isNewRecord ? "first" : direction

      const query = new URLSearchParams()
      query.set("currentId", String(currentId))
      query.set("vch_type", String(form.vch_type))

      const response = await fetch(`/api/receipts/navigation/${effectiveDirection}?${query.toString()}`)
      if (!response.ok) return

      const record = await response.json()
      if (record?.id) onNavigateRecord?.(record)
    } catch (error) {
      console.error("Failed to navigate voucher", error)
    } finally {
      setNavLoading(false)
    }
  }

  // Cursor lands on تاريخ السند whenever the dialog opens or a different record is shown
  // (new record, navigated-to record, or a freshly opened popup) — matches QabdVoucher.js.
  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return
    const t = setTimeout(() => dateInputRef.current?.focus(), 120)
    return () => clearTimeout(t)
    // form.vch_code يتغيّر أيضاً عند الضغط على "جديد" مرتين متتاليتين قبل الحفظ (id يبقى 0 في
    // الحالتين)، لذا نعتمد عليه أيضاً حتى تعمل إعادة تركيز التاريخ في هذه الحالة أيضاً.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.vch_code, isNewMode])

  const totalAmount = Number(form.amount || 0)

  // ---- الحسابات (journal / counter-account) grid ----
  const journal = form.journal || []
  const journalTotal = journal.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const journalDiff = Math.round((totalAmount - journalTotal) * 100) / 100

  // Wijmo commits a cell edit and our onKeyDown-driven navigation can both fire in the same
  // tick, before React re-renders — patching off the `journal` prop directly would let a
  // second rapid edit compute from the same pre-first-edit array and silently drop it. This
  // ref is updated synchronously on every patch so back-to-back edits always compose.
  const journalRef = useRef(journal)
  journalRef.current = journal

  // كائن CollectionView ثابت لا يُستبدَل أبداً (يُنشأ مرة واحدة فقط) — يُزامَن محتواه عبر إعادة
  // تعيين sourceCollection + refresh() أدناه بدل تمرير مصفوفة جديدة كل مرة كـ itemsSource، وهو ما
  // كان يجعل Wijmo يُعيد ربط itemsSource من الصفر ويُصفّر التحديد عند كل تعديل حرف واحد. مطابق
  // لنمط unified-sales-order.tsx المُثبَت (انظر تعليق مشابه عند chequesCollectionView أدناه).
  const [journalCollectionView] = useState(() => new wjcCore.CollectionView<any>([]))

  const patchJournalRow = (index: number, patch: Partial<VoucherJournalRow>) => {
    if (isLocked) return
    const next = journalRef.current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    journalRef.current = next
    onJournalChange(next)
  }
  const addJournalRow = () => {
    if (isLocked) return
    const next = [...journalRef.current, { ...emptyJournalRow }]
    journalRef.current = next
    onJournalChange(next)
  }
  // يعيد تركيز الشبكة (وتحديد خلية بعينها) بعد إغلاق نافذة منبثقة فُتحت من سطر في الشبكة (بحث
  // حساب، مراكز تكلفة) أو بعد حذف/اختيار سطر — دون هذا يبقى التركيز عالقاً على الزر الذي فتح
  // النافذة. هناك سباقان منفصلان يجب تجاوزهما معاً، وليس أحدهما فقط:
  // (١) مصيدة تركيز Radix (FocusScope) الخاصة بالنافذة المُغلقة قد لا تكون أُزيلت من الـ DOM بعد
  //     لحظة استدعاء onOpenChange(false)، فتسحب grid.focus() الفوري إلى داخلها بدل الشبكة.
  // (٢) تغيّر مصفوفة journal (بعد اختيار حساب مثلاً) يُعيد ربط itemsSource في Wijmo بمصفوفة
  //     جديدة، وWijmo يُصفّر التحديد إلى الخلية (0,0) عند إعادة الربط — وقد يحدث هذا التصفير في
  //     دورة رسم لاحقة وليس بالضرورة بشكل متزامن مع تحديث React، فيتغلب على أي selectCell سابق.
  // لذا: انتظار دورتي رسم (لتجاوز الأول)، ثم إعادة فرض التحديد مرة أخرى بعد مهلة أطول قليلاً
  // (لتجاوز الثاني إن حدث متأخراً) بدل الاكتفاء بمحاولة واحدة قد يسبقها كلا السباقين.
  const focusGridCell = (row: number, colName: string) => {
    const applyFocus = () => {
      waitForGridReady(
        () => journalGridRef.current,
        (grid) => {
          selectCell(grid, row, colName)
          grid.focus()
        },
        10,
        row + 1,
      )
    }
    requestAnimationFrame(() => requestAnimationFrame(applyFocus))
    setTimeout(applyFocus, 120)
  }

  const removeJournalRow = (index: number) => {
    if (isLocked) return
    const filtered = journalRef.current.filter((_, i) => i !== index)
    const next = filtered.length > 0 ? filtered : [{ ...emptyJournalRow }]
    journalRef.current = next
    onJournalChange(next)
    focusGridCell(Math.min(index, next.length - 1), "account_code")
  }

  // يوازن مبلغ السطر الأول ليكمّل الفرق بين المبلغ الإجمالي ومجموع بقية أسطر تبويب الحسابات
  // (نفس فكرة doCalculation لكن لتبويب الحسابات بدل نقدي/شيكات/بطاقات) — يُستدعى عند تغيير
  // المبلغ الإجمالي أو عند تحديد/تغيير حساب السطر الأول.
  const applyRemainingToFirstRow = () => {
    const rows = journalRef.current
    if (rows.length === 0) return
    const othersSum = rows.slice(1).reduce((sum, r) => sum + Number(r.amount || 0), 0)
    const remaining = Math.round((totalAmount - othersSum) * 100) / 100
    patchJournalRow(0, { amount: remaining })
  }

  // فحص توافق عملة الحساب مع عملة السند عند اختيار حساب في شبكة "الحسابات" — لا علاقة له بحسابات
  // أخرى في السند (كحساب النقدي/الشيك مثلاً). allow_trans_with_diff_curr (إعداد الحساب "السماح
  // بعمل حركة على الحساب بغير عملته"): 0 = مسموح بدون تنبيه، 1 = مسموح مع تنبيه (Toast تحذيري لكن
  // يُقبل الاختيار)، 2 = ممنوع (يُرفض الاختيار تماماً).
  const checkAccountCurrencyCompatibility = (account: AccountItem): boolean => {
    if (account.currency_id == null || form.currency_id == null || account.currency_id === form.currency_id) {
      return true
    }
    const diffCurrMode = Number(account.allow_trans_with_diff_curr)
    if (diffCurrMode === 2) {
      toast({
        title: "تعذر اختيار الحساب",
        description: "عملة السند تختلف عن عملة الحساب لا يمكن اختياره",
        variant: "destructive",
      })
      return false
    }
    if (diffCurrMode === 1) {
      toast({ title: "تنبيه", description: "عملة السند تختلف عن عملة الحساب" })
    }
    return true
  }

  const resolveJournalAccountByCode = (index: number, rawCode: string) => {
    const code = rawCode.trim().toUpperCase()
    if (!code) {
      patchJournalRow(index, { account_id: null, account_code: "", account_name: "" })
      if (index === 0) onFormChange("to_account_id", null)
      return
    }
    const match = accountsList.find((a) => a.code.toUpperCase() === code)
    if (match) {
      if (!checkAccountCurrencyCompatibility(match)) {
        patchJournalRow(index, { account_id: null, account_code: "", account_name: "" })
        return
      }
      patchJournalRow(index, { account_id: match.id, account_code: match.code, account_name: match.name })
      if (index === 0) {
        onFormChange("to_account_id", match.id)
        applyRemainingToFirstRow()
      }
    } else {
      patchJournalRow(index, { account_id: null, account_code: code, account_name: "" })
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: `لا يوجد حساب بهذا الرقم: ${code}`, life: 3000 }])
    }
  }

  // "المقبوض منه"/"على حساب" وأول سطر في تبويب الحسابات مرتبطة ببعضها، تماماً كما في QabdVoucher.js
  // (customer_account -> to_account -> dataAccounts[0])
  const setJournalFirstRowAccount = (account: { id: number; code: string; name: string }) => {
    const next = journalRef.current.length > 0 ? [...journalRef.current] : [{ ...emptyJournalRow }]
    next[0] = { ...next[0], account_id: account.id, account_code: account.code, account_name: account.name }
    journalRef.current = next
    onJournalChange(next)
    applyRemainingToFirstRow()
  }

  const openJournalCostCenter = (index: number) => {
    if (isLocked) return
    const row = journal[index]
    if (!row?.account_id) return
    const account = accountsList.find((a) => a.id === row.account_id) || null
    setCostCenterAccount(account)
    setCostCenterOpen(true)
    setJournalSearchRow(index)
  }

  const journalScheme = useMemo(
    () => ({
      name: "VoucherJournalScheme",
      filter: false,
      showFooter: false,
      sortable: false,
      columns: [
        { header: "#", name: "ser", width: 50, isReadOnly: true },
        { header: "رقم الحساب", name: "account_code", width: 130, minWidth: 110 },
        {
          name: "btnSearch",
          header: " ",
          width: 50,
          buttonBody: "button",
          align: "center",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked) return
            setJournalSearchRow(ctx.row.index)
            setJournalSearchOpen(true)
          },
          visible: true,
        },
        { header: "اسم الحساب", name: "account_name", width: "*", minWidth: 180, isReadOnly: true },
        { header: "المبلغ", name: "amount", width: 110, dataType: "Number" },
        { header: "ملاحظات", name: "note", width: 260, minWidth: 200 },
        {
          name: "btnCostCenter",
          header: "مراكز التكلفة",
          width: 90,
          buttonBody: "button",
          align: "center",
          iconType: "money",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => openJournalCostCenter(ctx.row.index),
          visible: true,
        },
        {
          name: "btnDelete",
          header: " ",
          width: 50,
          buttonBody: "button",
          align: "center",
          title: "حذف السطر (F7)",
          iconType: "delete",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => removeJournalRow(ctx.row.index),
          visible: true,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [journal, accountsList, isLocked],
  )

  // إعادة تعيين sourceCollection وrefresh() على نفس كائن journalCollectionView (لا إنشاء جديد ولا
  // تمرير مصفوفة كـ dataSource مباشرة) — لكن إعادة التعيين نفسها تُصفّر currentPosition لأول عنصر
  // رغم ثبات كائن CollectionView، فيُحفَظ التحديد الحالي هنا ويُعاد فرضه فوراً بعد المزامنة.
  useEffect(() => {
    const gridBeforeSync = resolveFlexControl(journalGridRef.current)
    const prevSelection = gridBeforeSync?.selection
      ? { row: gridBeforeSync.selection.row, col: gridBeforeSync.selection.col }
      : null

    journalCollectionView.sourceCollection = journal.map((row, i) => ({ ...row, ser: i + 1 }))
    journalCollectionView.refresh()

    if (prevSelection) {
      const grid = resolveFlexControl(journalGridRef.current)
      if (grid && grid.rows && grid.rows.length > prevSelection.row) {
        grid.select(new CellRange(prevSelection.row, prevSelection.col))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journal])

  const handleJournalCellEditEnded = (grid: any, e: any) => {
    journalGridRef.current = grid
    const row = e.row
    const colName = grid?.columns?.[e.col]?.binding
    if (colName === "account_code") {
      const value = String(grid.getCellData(row, e.col, false) ?? "")
      if (Util.isSpaceOrSymbols(value) || Util.isArabic(value) || !Util.isCodeFormat(value)) {
        messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "رقم الحساب يجب أن يكون أحرف/أرقام إنجليزية فقط بدون مسافات", life: 3000 }])
        return
      }
      resolveJournalAccountByCode(row, value)
    } else if (colName === "amount") {
      const value = grid.getCellData(row, e.col, false)
      patchJournalRow(row, { amount: value === "" || value === null ? null : Number(value) })
    } else if (colName === "note") {
      const value = grid.getCellData(row, e.col, false)
      patchJournalRow(row, { note: String(value ?? "") })
    }
  }

  // مطابق لـ onKeyDownGridAccounts في QabdVoucher.js: أرقام فقط في المبلغ، وTab/Enter تنقل
  // إلى العمود المنطقي التالي (account_code -> amount أو بحث، amount -> note).
  const handleJournalKeyDown = (grid: any, e: any) => {
    journalGridRef.current = grid
    if (!grid || !grid.selection) return
    const row = grid.selection.row
    const col = grid.selection.col
    if (row < 0 || col < 0) return
    const colName = grid.columns[col]?.binding

    if (colName === "amount") {
      if (e.key && e.key.length === 1 && !/[0-9.]/.test(e.key)) {
        e.preventDefault()
        return
      }
    }

    if (e.keyCode === Util.keyboardKeys.F10 && colName === "account_code") {
      e.preventDefault()
      setJournalSearchRow(row)
      setJournalSearchOpen(true)
      return
    }

    // F7 يحذف السطر الحالي — يُتاح فقط لسند فعال غير مرحّل (status=1) أو مسودة جديدة لم تُحفظ
    // بعد (id=0)؛ removeJournalRow نفسها تمنع الحذف أصلاً إن كان السند مقفلاً (isLocked).
    if (e.keyCode === Util.keyboardKeys.F7) {
      e.preventDefault()
      if (form.status === 1 || form.id === 0) removeJournalRow(row)
      return
    }

    if (e.keyCode === Util.keyboardKeys.Tab || e.keyCode === Util.keyboardKeys.Enter) {
      e.preventDefault()
      // Force the in-progress cell edit to commit (fires cellEditEnded synchronously) before we
      // read row data or move the selection — otherwise a fast Tab/Enter can move focus away
      // before the typed value round-trips into state, and it appears to "clear" on navigation.
      grid.finishEditing?.()
      grid.focus()
      if (colName === "account_code") {
        // لا يوجد تعديل معلَّق هنا (الحساب مُحلَّل مسبقاً)، فلا سباق مع Wijmo — التنقّل المتزامن آمن.
        const currentRow = journal[row]
        if (currentRow?.account_id) {
          selectCell(grid, row, "amount")
        } else {
          setJournalSearchRow(row)
          setJournalSearchOpen(true)
        }
      } else if (colName === "amount" || (colName === "note" && row < journal.length - 1)) {
        // مغادرة amount/note عبر Tab/Enter تُنهي تحرير الخلية (finishEditing أعلاه) فتُشغّل
        // cellEditEnded -> patchJournalRow -> مصفوفة journal جديدة -> إعادة ربط itemsSource في
        // Wijmo -> تصفير تحديده إلى (0,0)، وقد يحدث هذا بعد selectCell المتزامن فيُبطله. لذا
        // focusGridCell (بتكرارها المُقاوم للتوقيت) بدل selectCell المباشر هنا.
        if (colName === "amount") focusGridCell(row, "note")
        else focusGridCell(row + 1, "account_code")
      }
    }
  }

  // ---- الشيكات grid ----
  const cheques = form.cheques || []
  const chequesTotal = cheques.reduce((sum, row) => sum + Number(row.amount || 0), 0)

  // See journalRef above: keeps back-to-back cell commits from clobbering each other.
  const chequesRef = useRef(cheques)
  chequesRef.current = cheques

  // كائن CollectionView ثابت لا يُستبدَل أبداً — انظر شرح journalCollectionView أعلاه. هذا هو ما
  // يحلّ فعلياً سباقات فقدان/قفز التركيز بعد كل تعديل أو إضافة سطر، بدل الاعتماد فقط على تخمين
  // التوقيت عبر RAF/setTimeout (كانت تلك مسكّنات لعرض المشكلة الحقيقية: تبديل مرجع itemsSource).
  const [chequesCollectionView] = useState(() => new wjcCore.CollectionView<any>([]))

  // خاص بحالة "أُضيف سطر جديد لتوّه" (Insert أو Enter من آخر عمود): يُخزَّن الهدف هنا، ويُطبَّق داخل
  // نفس useEffect الذي يُزامن chequesCollectionView أدناه — بعد sourceCollection/refresh() مباشرة،
  // بما يضمن وجود السطر الجديد فعلاً في الشبكة قبل محاولة تحديده (بخلاف تطبيقه في تأثير منفصل قد
  // يسبق أو يعقب المزامنة بلا ترتيب مضمون).
  const pendingChequeFocusRef = useRef<{ row: number; col: string } | null>(null)

  // مطابق تماماً لـ focusGridCell أعلاه (نفس السباقين: مصيدة تركيز Radix للنافذة المغلقة، وتصفير
  // Wijmo لتحديده عند إعادة ربط itemsSource بعد تغيّر cheques) — وaitForGridReady تُطبَّع أيضاً
  // غلاف React المخزَّن أحياناً في chequeGridRef (عندما لم يحدث onKeyDown/cellEditEnded على هذه
  // الشبكة بعد منذ آخر mount، كحال فتح نافذة بحث بنقرة زر لا بلوحة مفاتيح) إلى عنصر التحكم الفعلي.
  const focusChequeGridCell = (row: number, colName: string) => {
    const applyFocus = () => {
      waitForGridReady(
        () => chequeGridRef.current,
        (grid) => {
          selectCell(grid, row, colName)
          grid.focus()
        },
        10,
        row + 1,
      )
    }
    requestAnimationFrame(() => requestAnimationFrame(applyFocus))
    setTimeout(applyFocus, 120)
  }

  const patchChequeRow = (index: number, patch: Partial<VoucherChequeRow>) => {
    if (isLocked) return
    const next = chequesRef.current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    chequesRef.current = next
    onChequesChange(next)
  }
  const addChequeRow = () => {
    if (isLocked) return
    // تاريخ الاستحقاق يبدأ بتاريخ اليوم دائماً بدل فارغ — المستخدم يعدّله يدوياً إن أراد.
    const next = [...chequesRef.current, { ...emptyChequeRow, due_date: new Date().toISOString().slice(0, 10) }]
    chequesRef.current = next
    onChequesChange(next)
  }
  const removeChequeRow = (index: number) => {
    if (isLocked) return
    const filtered = chequesRef.current.filter((_, i) => i !== index)
    const next = filtered.length > 0 ? filtered : [{ ...emptyChequeRow }]
    chequesRef.current = next
    onChequesChange(next)
  }

  const chequeScheme = useMemo(
    () => ({
      name: "VoucherChequesScheme",
      filter: false,
      showFooter: false,
      sortable: false,
      columns: [
        { header: "#", name: "ser", width: 50, isReadOnly: true },
        { header: "رقم الحساب", name: "bank_account", width: 160 },
        {
          name: "btnSearchBankAccount",
          header: " ",
          width: 40,
          buttonBody: "button",
          align: "center",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked) return
            setChequeSearchRow(ctx.row.index)
            setBankAccountSearchOpen(true)
          },
          // بحث الحساب البنكي/دفتر الشيكات خاص بسند الصرف فقط (شيكات صادرة من حساباتنا)؛ سند
          // القبض يستقبل شيكات من بنوك/فروع عملاء خارجية فيبقى على بحث البنك/الفرع اليدوي أدناه.
          visible: isPayment,
        },
        { header: "رقم الشيك", name: "cheq_num", width: 160, isReadOnly: forceChequeBookLeaf },
        {
          name: "btnSearchChequeLeaf",
          header: " ",
          width: 40,
          buttonBody: "button",
          align: "center",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked) return
            if (!cheques[ctx.row.index]?.bank_account_id) {
              messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "يجب تحديد رقم الحساب اولا", life: 3000 }])
              return
            }
            setChequeSearchRow(ctx.row.index)
            setChequeLeafSearchOpen(true)
          },
          visible: isPayment,
        },
        { header: "البنك", name: "bank_no", width: 80, maxLength: 4 },
        {
          name: "btnSearchBank",
          header: " ",
          width: 45,
          buttonBody: "button",
          align: "center",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked) return
            setChequeSearchRow(ctx.row.index)
            setBankSearchOpen(true)
          },
          // بحث البنك/الفرع اليدوي خاص بسند القبض فقط — سند الصرف يعبّئهما آلياً من الحساب
          // البنكي المختار (resolveBankBranchFromAccount).
          visible: isReceipt,
        },
        { header: "اسم البنك", name: "bank_name", width: 120, isReadOnly: true },
        { header: "الفرع", name: "branch_no", width: 80, maxLength: 4 },
        {
          name: "btnSearchBranch",
          header: " ",
          width: 45,
          buttonBody: "button",
          align: "center",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked) return
            setChequeSearchRow(ctx.row.index)
            setBranchSearchOpen(true)
          },
          visible: isReceipt,
        },
        { header: "اسم الفرع", name: "branch_name", width: 110, isReadOnly: true },
        { header: "يستحق في", name: "due_date", width: 130, dataType: "Date", format: "MM/dd/yyyy" },
        {
          name: "btnDueDate",
          header: " ",
          width: 45,
          buttonBody: "button",
          align: "center",
          iconType: "calendar",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            if (isLocked) return
            setDueDateRow(ctx.row.index)
            setDueDatePickerOpen(true)
          },
          visible: true,
        },
        { header: "المبلغ", name: "amount", width: 90, dataType: "Number" },
        { header: "اسم صاحب الشيك", name: "cheq_owner_name", width: "*", minWidth: 110 },
        {
          name: "btnDelete",
          header: " ",
          width: 50,
          buttonBody: "button",
          align: "center",
          iconType: "delete",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => removeChequeRow(ctx.row.index),
          visible: true,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cheques, banks, branches, bankAccounts, isLocked, forceChequeBookLeaf],
  )

  useEffect(() => {
    // إعادة تعيين sourceCollection تُصفّر currentPosition الخاص بـ CollectionView إلى أول عنصر حتى
    // مع بقاء كائن CollectionView نفسه ثابتاً (الأمر مختلف عن تحرير عنصر موجود مكانه أو addNew/
    // commitNew — reassignment كامل لـ sourceCollection يُعامَل داخلياً كبيانات جديدة تماماً). لذا
    // يُحفَظ تحديد الشبكة الحالي هنا صراحة قبل المزامنة، ويُعاد فرضه فوراً بعدها (ما لم يوجد هدف
    // تركيز مُعلَّق لسطر أُضيف لتوّه، فيُطبَّق ذلك بدلاً منه).
    const gridBeforeSync = resolveFlexControl(chequeGridRef.current)
    const prevSelection = gridBeforeSync?.selection
      ? { row: gridBeforeSync.selection.row, col: gridBeforeSync.selection.col }
      : null

    chequesCollectionView.sourceCollection = cheques.map((row, i) => ({
      ...row,
      ser: i + 1,
      due_date: row.due_date ? new Date(row.due_date) : null,
    }))
    chequesCollectionView.refresh()

    // يُطبَّق بعد المزامنة مباشرة (لا قبلها) — السطر المستهدف بات موجوداً فعلاً في الشبكة الآن.
    const pending = pendingChequeFocusRef.current
    if (pending) {
      pendingChequeFocusRef.current = null
      waitForGridReady(
        () => chequeGridRef.current,
        (grid) => {
          selectCell(grid, pending.row, pending.col)
          grid.focus()
        },
        20,
        pending.row + 1,
      )
    } else if (prevSelection) {
      const grid = resolveFlexControl(chequeGridRef.current)
      if (grid && grid.rows && grid.rows.length > prevSelection.row) {
        grid.select(new CellRange(prevSelection.row, prevSelection.col))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cheques])

  // بنك/فرع الحساب البنكي المختار (سند الصرف) يُعبَّآن آلياً من ربط bank_accounts.branch_id
  // بجدول الفروع ثم بنكها، بدل اختيارهما يدوياً كما في سند القبض (شيك وارد من بنك عميل خارجي).
  // jary_account_id يُلتقط أيضاً ليكون الحساب المقابل الفعلي لسطر قيد "شيكات" بدل حساب صندوق
  // الشيكات اليدوي (المعطَّل والفارغ في سند الصرف).
  const resolveBankBranchFromAccount = (account: BankAccountRecord) => {
    const branch = branches.find((b) => b.id === account.branch_id)
    const bank = branch ? banks.find((b) => b.id === branch.bank_id) : undefined
    if (!branch) {
      messagesRef.current?.show?.([
        {
          severity: "warn",
          summary: "",
          detail: "الحساب البنكي المختار لا يملك فرعاً معرَّفاً في تعريف الحسابات البنكية — يرجى تحديد الفرع هناك أولاً",
          life: 4000,
        },
      ])
    } else if (!bank) {
      messagesRef.current?.show?.([
        {
          severity: "warn",
          summary: "",
          detail: "تعذّر تحديد بنك الفرع المرتبط بهذا الحساب البنكي",
          life: 4000,
        },
      ])
    }
    return {
      bank_id: bank?.id ?? null,
      bank_no: bank?.bank_code || "",
      bank_name: bank?.bank_name || "",
      branch_id: branch?.id ?? null,
      branch_no: branch?.branch_code || "",
      branch_name: branch?.branch_name || "",
      jary_account_id: account.jary_account_id ?? null,
    }
  }

  const handleChequeCellEditEnded = (grid: any, e: any) => {
    chequeGridRef.current = grid
    const row = e.row
    const colName = grid?.columns?.[e.col]?.binding
    const value = grid.getCellData(row, e.col, false)

    if (colName === "bank_account" || colName === "cheq_num") {
      const text = String(value ?? "")
      if (text && (Util.isSpaceOrSymbols(text) || Util.isArabic(text) || !Util.isCodeFormat(text))) {
        messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "الحقل يجب أن يحتوي أحرف/أرقام إنجليزية فقط بدون مسافات", life: 3000 }])
        return
      }
    }

    if (colName === "bank_account") {
      const raw = String(value ?? "").trim()
      // سند القبض: رقم الحساب هنا نص حر (رقم حساب العميل البنكي لدى بنكه الخاص) — لا علاقة له
      // بجدول bank_accounts (حساباتنا نحن)، فلا يُبحث عنه أو يُرفض. ذلك مخصص لسند الصرف فقط
      // (حيث الشيك صادر فعلاً من أحد حساباتنا البنكية المعرَّفة).
      if (!isPayment) {
        patchChequeRow(row, { bank_account: raw } as any)
        return
      }
      if (!raw) {
        patchChequeRow(row, { bank_account: "", bank_account_id: null, cheq_num: "", cheque_book_cheque_id: null } as any)
        return
      }
      const account = bankAccounts.find((a) => String(a.code || "").trim() === raw)
      if (account) {
        const currentRow = chequesRef.current[row]
        // تغيير الحساب البنكي يُبطل ورقة الشيك المحجوزة سابقاً (كانت تابعة لحساب مختلف).
        const changedAccount = currentRow?.bank_account_id !== account.id
        patchChequeRow(row, {
          bank_account: account.code,
          bank_account_id: account.id,
          ...resolveBankBranchFromAccount(account),
          ...(changedAccount ? { cheq_num: "", cheque_book_cheque_id: null } : {}),
        } as any)
      } else {
        // مطابق لطلب المستخدم: إبقاء التركيز على الخلية دون فتح نافذة البحث تلقائياً، مع مسح
        // القيمة المدخلة وعرض رسالة الخطأ (بخلاف نمط البنك/الفرع اللذين يفتحان البحث تلقائياً).
        patchChequeRow(row, { bank_account: "", bank_account_id: null } as any)
        messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "الحساب البنكي المدخل غير موجود", life: 3000 }])
      }
      return
    }

    if (colName === "cheq_num" && !forceChequeBookLeaf) {
      patchChequeRow(row, { cheq_num: value, cheque_book_cheque_id: null } as any)
      return
    }

    if (colName === "bank_no") {
      const raw = String(value ?? "").trim()
      if (!raw) {
        patchChequeRow(row, { bank_no: "", bank_id: null, bank_name: "", branch_id: null, branch_no: "", branch_name: "" } as any)
        return
      }
      // رقم البنك 4 خانات دائماً (1 -> 0001)، بنفس الأسلوب الذي ينتج عن اختياره من نافذة البحث.
      const code = /^\d+$/.test(raw) ? raw.padStart(4, "0") : raw
      const bank = banks.find((b) => String(b.bank_code || "").trim() === code)
      if (bank) {
        patchChequeRow(row, { bank_no: code, bank_id: bank.id, bank_name: bank.bank_name || "", branch_id: null, branch_no: "", branch_name: "" } as any)
      } else {
        patchChequeRow(row, { bank_no: "", bank_id: null, bank_name: "", branch_id: null, branch_no: "", branch_name: "" } as any)
        setChequeSearchRow(row)
        setBankSearchOpen(true)
      }
    } else if (colName === "branch_no") {
      const raw = String(value ?? "").trim()
      if (!raw) {
        patchChequeRow(row, { branch_no: "", branch_id: null, branch_name: "" } as any)
        return
      }
      const code = /^\d+$/.test(raw) ? raw.padStart(4, "0") : raw
      const currentRow = chequesRef.current[row]
      const branch = branches.find((b) => String(b.branch_code || "").trim() === code && (!currentRow?.bank_id || b.bank_id === (currentRow as any).bank_id))
      if (branch) {
        patchChequeRow(row, { branch_no: code, branch_id: branch.id, branch_name: branch.branch_name || "" } as any)
      } else {
        patchChequeRow(row, { branch_no: "", branch_id: null, branch_name: "" } as any)
        setChequeSearchRow(row)
        setBranchSearchOpen(true)
      }
    } else if (colName === "amount") {
      patchChequeRow(row, { amount: value === "" || value === null ? null : Number(value) })
    } else if (colName === "cheq_owner_name") {
      patchChequeRow(row, { cheq_owner_name: value } as any)
    } else if (colName === "due_date") {
      // العمود أصبح قابلاً للتحرير المباشر (وليس عبر زر التقويم فقط) — يُتحقَّق من صحة التاريخ
      // المُدخَل يدوياً هنا، وأي قيمة غير صالحة تُرفض ويُعاد الحقل لقيمته السابقة.
      if (value === null || value === "") {
        patchChequeRow(row, { due_date: "" } as any)
        return
      }
      const parsed = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(parsed.getTime())) {
        messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "تاريخ الاستحقاق غير صحيح", life: 3000 }])
        patchChequeRow(row, { due_date: chequesRef.current[row]?.due_date || "" } as any)
        return
      }
      patchChequeRow(row, { due_date: parsed.toISOString().slice(0, 10) } as any)
    }
  }

  // مطابق لـ onKeyDownGridChecks في QabdVoucher.js: أرقام فقط في المبلغ، منع الأحرف العربية
  // في حقول الأكواد، وTab/Enter تنقل حسب الترتيب المنطقي وتضيف سطراً جديداً من آخر حقل.
  const handleChequeKeyDown = (grid: any, e: any) => {
    chequeGridRef.current = grid
    if (!grid || !grid.selection) return
    if (doHotKeys.current === false) return;
    if (e.keyCode === 113) {
      e.preventDefault(); // Prevent FlexGrid from opening the editor
      return;
    }
    const row = grid.selection.row
    const col = grid.selection.col
    if (row < 0 || col < 0) return
    const colName = grid.columns[col]?.binding

    if (colName === "amount") {
      if (e.key && e.key.length === 1 && !/[0-9.]/.test(e.key)) {
        e.preventDefault()
        return
      }
    }

    // لا يمكن تحديد الفرع قبل تحديد البنك — أي مفتاح (كتابة، F10، Tab/Enter...) يُمنع ويُنبَّه المستخدم.
    if (colName === "branch_no" && !chequesRef.current[row]?.bank_id) {
      e.preventDefault()
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "يجب تحديد البنك اولا", life: 3000 }])
      return
    }

    if (colName === "bank_no" || colName === "branch_no") {
      if (e.key && e.key.length === 1 && !/[0-9]/.test(e.key)) {
        e.preventDefault()
        return
      }
    } else if (colName === "bank_account" || colName === "cheq_num") {
      if (e.key && e.key.length === 1 && Util.isArabic(e.key)) {
        e.preventDefault()
        return
      }
    }

    if (e.keyCode === Util.keyboardKeys.F10) {
      if (colName === "bank_no") {
        e.preventDefault()
        setChequeSearchRow(row)
        setBankSearchOpen(true)
        return
      }
      if (colName === "branch_no") {
        e.preventDefault()
        setChequeSearchRow(row)
        setBranchSearchOpen(true)
        return
      }
      if (colName === "due_date") {
        e.preventDefault()
        setDueDateRow(row)
        setDueDatePickerOpen(true)
        return
      }
    }

    // F7 يحذف السطر الحالي — يُتاح فقط لسند فعال غير مرحّل (status=1) أو مسودة جديدة لم تُحفظ
    // بعد (id=0)؛ removeChequeRow نفسها تمنع الحذف أصلاً إن كان السند مقفلاً (isLocked).
    if (e.keyCode === Util.keyboardKeys.F7) {
      e.preventDefault()
      if (form.status === 1 || form.id === 0) removeChequeRow(row)
      return
    }

    // مطابق لـ Util.keyboardKeys.Insert -> onAddCheckClick في QabdVoucher.js: يضيف سطراً جديداً
    // دائماً وبلا أي تحقق (رسائل validateChequeRow مخصصة لمسار الإضافة عبر Tab/Enter من آخر حقل
    // فقط)، وينسخ حساب/بنك/فرع السطر الحالي كما هي (حتى لو فارغة) تماماً كما يفعل lastRow هناك،
    // مع اقتراح رقم الشيك التالي وتاريخ استحقاق = تاريخ السطر الحالي + شهر، ومبلغ = الفرق المتبقي
    // بين مبلغ الشيكات الإجمالي وما أُدخل فعلاً في الشبكة (مطابق لـ amountDiff المرجعي).
    // مطابق لـ onAddCheckClick في QabdVoucher.js: Insert يعتمد دائماً على آخر سطر في الشبكة
    // (lastRow/lastRowIndex هناك) لا على سطر التأشير الحالي — فيضيف دائماً بعد آخر سطر فعلي، بغضّ
    // النظر عن مكان المؤشر وقت الضغط (تجنّباً لالتباس الإضافة "في المنتصف" حين يوجد سطر فارغ بينهما).
    if (e.keyCode === Util.keyboardKeys.Insert) {
      e.preventDefault()
      grid.finishEditing?.()
      const lastIndex = chequesRef.current.length - 1
      const lastRow = chequesRef.current[lastIndex]

      const isLastRowEmpty =
        !lastRow?.bank_account?.trim() &&
        !lastRow?.bank_no?.trim() &&
        !lastRow?.cheq_num?.trim() &&
        !lastRow?.amount &&
        !lastRow?.cheq_owner_name?.trim()
        
      if (isLastRowEmpty) {
        setTimeout(() => {
          selectCell(grid, lastIndex, "bank_account")
          grid.focus()
        }, 0)
        return
      }

      // مجموع الشيكات المُدخلة يساوي أو يتجاوز مبلغ الشيكات الإجمالي فعلاً — لا يوجد مبلغ متبقٍ
      // يستحق سطراً جديداً (مطابق لـ amountDiff === 0 -> openAccordion فقط بلا إضافة في المرجع).
      const enteredTotalSoFar = chequesRef.current.reduce((sum, r) => sum + Number(r.amount || 0), 0)
      const remainingSoFar = Math.round((Number(form.check_amount || 0) - enteredTotalSoFar) * 100) / 100
      if (remainingSoFar <= 0) {
        messagesRef.current?.show?.([
          { severity: "info", summary: "", detail: "تم إدخال كامل مبلغ الشيكات، لا حاجة لسطر إضافي", life: 3000 },
        ])
        return
      }

      void (async () => {
        let nextChequeNum = ""
        let nextLeafId: number | null = null
        if (lastRow?.bank_account_id) {
          if (isPayment && forceChequeBookLeaf) {
            try {
              const res = await fetch(`/api/cheques-books/leaves?bank_account_id=${lastRow.bank_account_id}`)
              const leaves = res.ok ? await res.json() : []
              // الأداة تُعيد كل الحالات الآن (متوفر/تالف/غير متوفر) — الاقتراح التلقائي هنا يقتصر
              // على المتوفر (status=1) فقط، ولا يقترح ورقة مستخدمة أصلاً في سطر آخر بنفس السند.
              const usedCodes = new Set(chequesRef.current.map((r) => r.cheq_num).filter(Boolean))
              const currentLeafIndex = leaves.findIndex((l: any) => l.cheque_code === lastRow.cheq_num)
              const candidates = currentLeafIndex >= 0 ? leaves.slice(currentLeafIndex + 1) : leaves
              const nextLeaf = candidates.find((l: any) => Number(l.status) === 1 && !usedCodes.has(l.cheque_code))
              if (nextLeaf) {
                nextChequeNum = nextLeaf.cheque_code
                nextLeafId = nextLeaf.id
              }
            } catch (error) {
              console.error("Failed to fetch next cheque leaf", error)
            }
          } else if (lastRow.cheq_num && /^\d+$/.test(lastRow.cheq_num)) {
            nextChequeNum = String(Number(lastRow.cheq_num) + 1).padStart(lastRow.cheq_num.length, "0")
          }
        }

        const baseDate = lastRow?.due_date ? new Date(lastRow.due_date) : new Date()
        baseDate.setMonth(baseDate.getMonth() + 1)

        const enteredTotal = chequesRef.current.reduce((sum, r) => sum + Number(r.amount || 0), 0)
        const remaining = Math.round((Number(form.check_amount || 0) - enteredTotal) * 100) / 100
        const nextAmount = remaining > 0 ? remaining : null

        const newRow: VoucherChequeRow = {
          ...emptyChequeRow,
          bank_account: lastRow?.bank_account || "",
          bank_account_id: lastRow?.bank_account_id ?? null,
          jary_account_id: lastRow?.jary_account_id ?? null,
          bank_no: lastRow?.bank_no || "",
          bank_id: lastRow?.bank_id ?? null,
          bank_name: lastRow?.bank_name || "",
          branch_no: lastRow?.branch_no || "",
          branch_id: lastRow?.branch_id ?? null,
          branch_name: lastRow?.branch_name || "",
          cheq_num: nextChequeNum,
          cheque_book_cheque_id: nextLeafId,
          due_date: baseDate.toISOString().slice(0, 10),
          amount: nextAmount,
        }
        const next = [...chequesRef.current, newRow]
        chequesRef.current = next
        pendingChequeFocusRef.current = { row: next.length - 1, col: lastRow?.bank_account_id ? "amount" : "bank_account" }
        onChequesChange(next)
      })()
      return
    }

    if (e.keyCode === Util.keyboardKeys.Tab || e.keyCode === Util.keyboardKeys.Enter) {
      e.preventDefault()
      // Force the in-progress cell edit to commit (fires cellEditEnded synchronously) before we
      // read row data or move the selection — otherwise a fast Tab/Enter can move focus away
      // before the typed value round-trips into state, and it appears to "clear" on navigation.
      grid.finishEditing?.()
      grid.focus()
      // chequesRef.current لا cheques (state) — finishEditing أعلاه يُشغّل cellEditEnded بشكل
      // متزامن، الذي يُحدّث chequesRef.current فوراً عبر patchChequeRow، لكن state React نفسها
      // (ومنها cheques هنا) لا تتحدّث إلا في الـ render التالي — فقراءة cheques[row] هنا كانت
      // تعطي القيمة القديمة قبل هذا التعديل مباشرة، مسبّبة قرارات خاطئة (فتح بحث غير لازم، حلقة
      // على نفس العمود...) بالذات عند الانتقال فوراً بعد كتابة القيمة دون blur سابق.
      const currentRow = chequesRef.current[row]
      // رقم الحساب فارغ -> افتح نافذة بحث الحسابات البنكية بدلاً من الانتقال (سند الصرف فقط —
      // بحث الحسابات البنكية يخص حساباتنا نحن، وسند القبض يستخدم رقم حساب حر لبنك العميل).
      if (colName === "bank_account") {
        if (isPayment && !currentRow?.bank_account?.trim()) {
          setChequeSearchRow(row)
          setBankAccountSearchOpen(true)
          return
        }
        selectCell(grid, row, "cheq_num")
        return
      }
      // رقم الشيك فارغ وإعداد "عدم السماح بادخال شيكات يدويا" مفعّل -> افتح نافذة بحث دفتر
      // الشيكات (بعد التأكد من اختيار رقم الحساب أولاً) بدلاً من السماح بالكتابة اليدوية.
      if (colName === "cheq_num" && forceChequeBookLeaf) {
        if (!currentRow?.cheq_num?.trim()) {
          if (!currentRow?.bank_account_id) {
            messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "يجب تحديد رقم الحساب اولا", life: 3000 }])
            return
          }
          setChequeSearchRow(row)
          setChequeLeafSearchOpen(true)
          return
        }
        selectCell(grid, row, "bank_no")
        return
      }

      // البنك/الفرع فارغين -> افتح نافذة البحث بدلاً من الانتقال، تماماً كما في onKeyDownGridChecks
      if (colName === "bank_no") {
        if (!currentRow?.bank_no?.trim()) {
          setChequeSearchRow(row)
          setBankSearchOpen(true)
          return
        }
        selectCell(grid, row, "branch_no")
        return
      }
      if (colName === "branch_no") {
        if (!currentRow?.branch_no?.trim()) {
          setChequeSearchRow(row)
          setBranchSearchOpen(true)
          return
        }
        selectCell(grid, row, "due_date")
        return
      }
      // تاريخ الاستحقاق للقراءة فقط ويُضبط عبر زر التقويم فقط
      if (colName === "due_date") {
        if (!currentRow?.due_date) {
          setDueDateRow(row)
          setDueDatePickerOpen(true)
          return
        }
        selectCell(grid, row, "amount")
        return
      }

      // لا تضف سطراً جديداً إلا إذا كان السطر الحالي صالحاً (بحساب/بنك ورقم شيك ومبلغ)
      if (colName === "cheq_owner_name") {
        const validationError = validateChequeRow(currentRow)
        if (validationError) {
          messagesRef.current?.show?.([{ severity: "error", summary: "", detail: validationError, life: 3000 }])
          return
        }
        // يوجد أصلاً سطر فارغ تحت هذا السطر (مثلاً أُضيف سابقاً ولم يُعبَّأ) — الانتقال إليه بدل
        // إضافة سطر فارغ آخر جديد فوقه.
        const nextRow = chequesRef.current[row + 1]
        const nextRowEmpty =
          nextRow &&
          !nextRow.bank_account?.trim() &&
          !nextRow.bank_no?.trim() &&
          !nextRow.cheq_num?.trim() &&
          !nextRow.amount &&
          !nextRow.cheq_owner_name?.trim()
        
        if (nextRowEmpty) {
          selectCell(grid, row + 1, "bank_account")
          return
        }
        pendingChequeFocusRef.current = { row: row + 1, col: "bank_account" }
        addChequeRow()
        return
      }

      const idx = CHEQUE_FIELD_ORDER.indexOf(colName)
      if (idx >= 0 && idx < CHEQUE_FIELD_ORDER.length - 1) {
        selectCell(grid, row, CHEQUE_FIELD_ORDER[idx + 1])
      }
    }
  }

  // ---- تفاصيل البطاقة (بطاقة واحدة فقط لكل سند، بمبلغها = بطاقات في الرئيسية) ----
  const card = form.cards?.[0] || emptyCardRow

  const patchCard = (patch: Partial<VoucherCardRow>) => {
    onCardsChange([{ ...card, ...patch }])
  }

  // نوع البطاقة يُحمّل فقط من الأنواع التي تطابق عملة السند (form.currency_id)، وليس عملة
  // البطاقة نفسها — عملة البطاقة تابعة (disabled) لنوع البطاقة المختار، وليست مصدر التصفية.
  const cardTypeOptions = useMemo(
    () => cardTypes.filter((t) => form.currency_id == null || Number(t.currency_id) === Number(form.currency_id)),
    [cardTypes, form.currency_id],
  )

  const handleCardTypeChange = (value: number | null) => {
    if (!value) {
      patchCard({ card_type_id: null, card_type_name: "", account_id: null, account_code: "", account_name: "", currency_id: null })
      return
    }
    const match = cardTypes.find((t) => t.id === value)
    if (!match) return
    patchCard({
      card_type_id: match.id,
      card_type_name: match.name,
      account_id: match.financial_account_id ?? null,
      currency_id: match.currency_id ?? null,
    })
  }

  // عند تغيير عملة السند: تفريغ نوع البطاقة إن لم يعد يطابق العملة الجديدة (القائمة تُصفّى
  // بـ credit_cards_types_tbl.currency_id)، ضبط سعر الصرف (1 لعملة الأساس، وإلا آخر سعر بتاريخ
  // <= تاريخ السند من exchange_rates)، وتحميل الحسابات الافتراضية للمستخدم الحالي لهذه العملة
  // من users_currencies_default_account_tbl.
  const handleCurrencyChange = async (newCurrencyId: number | null) => {
    onFormChange("currency_id", newCurrencyId)

    if (card.card_type_id && !cardTypes.some((t) => t.id === card.card_type_id && Number(t.currency_id) === newCurrencyId)) {
      patchCard({ card_type_id: null, card_type_name: "", account_id: null, account_code: "", account_name: "", currency_id: null })
    }

    if (!newCurrencyId) return

    if (newCurrencyId === baseCurrencyId) {
      onFormChange("rate", 1)
    } else {
      try {
        const query = new URLSearchParams({
          currency_id: String(newCurrencyId),
          date: form.vch_date ? form.vch_date.slice(0, 10) : "",
        })
        const response = await fetch(`/api/exchange-rates/lookup?${query.toString()}`)
        const data = response.ok ? await response.json() : null
        onFormChange("rate", data?.rate ?? 1)
      } catch (error) {
        console.error("Failed to fetch exchange rate", error)
        onFormChange("rate", 1)
      }
    }

    if (user?.id) {
      try {
        const response = await fetch(`/api/settings/users-currencies-default?user_id=${encodeURIComponent(user.id)}`)
        const data = response.ok ? await response.json() : null
        const row = Array.isArray(data?.rows) ? data.rows.find((r: any) => Number(r.currency_id) === newCurrencyId) : null
        onFormChange("cash_account_id", row?.cash_account_id ?? null)
        onFormChange("check_account_id", row?.incoming_checks_account_id ?? null)
        onFormChange("credit_card_account_id", row?.card_account_id ?? null)
      } catch (error) {
        console.error("Failed to fetch default accounts for currency", error)
      }
    }
  }

  // ---- ملاحظات ----
  const notes = form.notes || []
  const updateNoteRow = (index: number, value: string) => onNotesChange(notes.map((row, i) => (i === index ? { note: value } : row)))
  const addNoteRow = () => onNotesChange([...notes, { note: "" }])
  const removeNoteRow = (index: number) => onNotesChange(notes.filter((_, i) => i !== index))

  // Ported from QabdVoucher.js's doCalclation: reconciles المبلغ (total) against
  // نقدي/شيكات/بطاقات whenever one of the four is blurred, instead of just leaving them
  // to disagree until save-time validation catches it.
  const doCalculation = (type: "amount" | "cash" | "check" | "credit_card") => {
    const amount = Number(form.amount || 0)
    const amountCash = Number(form.cash_amount || 0)
    const amountCheck = Number(form.check_amount || 0)
    const amountCreditCard = Number(form.credit_card_amount || 0)

    switch (type) {
      case "amount": {
        const sum = amountCash + amountCheck + amountCreditCard
        if (amount > sum) {
          // Total grew beyond the split — the difference defaults to نقدي.
          const nextCash = amount - amountCheck - amountCreditCard
          onFormChange("cash_amount", nextCash === 0 ? null : nextCash)
        } else if (amount < sum) {
          // Total shrank below the split — absorb the shortfall from نقدي first, then
          // شيكات, then بطاقات (same priority order as the reference implementation).
          let minus = amount - sum + amountCash
          let nextCash = amount - amountCheck - amountCreditCard
          let nextCheck = amountCheck
          let nextCard = amountCreditCard
          if (minus < 0 && nextCash < 0) nextCash = 0
          if (minus < 0) {
            const before = minus
            minus += amountCheck
            nextCheck = amountCheck + before
            if (nextCheck < 0) nextCheck = 0
          }
          if (minus < 0) {
            nextCard = amountCreditCard + minus
            if (nextCard < 0) nextCard = 0
          }
          onFormChange("cash_amount", nextCash === 0 ? null : nextCash)
          onFormChange("check_amount", nextCheck === 0 ? null : nextCheck)
          onFormChange("credit_card_amount", nextCard === 0 ? null : nextCard)
        }
        break
      }
      case "cash": {
        if (amountCash < amount) {
          // نقدي covers only part of the total — the remainder defaults to شيكات.
          const cheqs = Math.max(0, amount - amountCash - amountCreditCard)
          onFormChange("check_amount", cheqs === 0 ? null : cheqs)
        } else if (amountCash + amountCheck + amountCreditCard !== amount) {
          onFormChange("amount", amountCash + amountCheck + amountCreditCard)
        }
        break
      }
      case "check": {
        const sum = amountCash + amountCheck + amountCreditCard
        if (sum !== amount) {
          if (sum <= amount) {
            // Still room under the total — the remainder defaults to بطاقات.
            onFormChange("credit_card_amount", amount - amountCash - amountCheck)
          } else {
            // شيكات pushed the split over the total — grow the total to match.
            onFormChange("amount", sum)
          }
        }
        break
      }
      case "credit_card": {
        const sum = amountCash + amountCheck + amountCreditCard
        if (sum !== amount) onFormChange("amount", sum)
        break
      }
    }
  }

  // Enter behaves like Tab across the plain form fields (not the grids or tab buttons,
  // which handle their own Enter logic — see handleJournalKeyDown/handleChequeKeyDown,
  // and AutoCompleteAccount's own Enter-resolves-then-bubbles handling).
  const handleFormEnterAsTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return
    const target = event.target as HTMLElement
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return
    if (target.closest(".wj-flexgrid")) return

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null && !el.closest(".wj-flexgrid"))

    const currentIndex = focusable.indexOf(target)
    if (currentIndex === -1) return
    event.preventDefault()
    focusable[currentIndex + 1]?.focus()
  }

  return (
    <>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? onOpenChange(open) : guardedAction(() => onOpenChange(false)))}
      >
        <DialogContent
          className="voucher-form flex h-[96vh] w-[97vw] max-w-[1850px] max-h-[96vh] flex-col overflow-hidden p-0"
          dir="rtl"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || journalSearchOpen || costCenterOpen || postDialogOpen)
              event.preventDefault()
          }}
        >
          <UniversalToolbar
            currentRecord={currentIndex + 1}
            totalRecords={totalRecords}
            onNew={() => guardedAction(() => onNew?.())}
            onSave={handleRequestSave}
            onDelete={onDelete}
            onClone={onClone}
            onPrint={onPrint}
            onFirst={() => guardedAction(() => void handleNavigate("first"))}
            onPrevious={() => guardedAction(() => void handleNavigate("previous"))}
            onNext={() => guardedAction(() => void handleNavigate("next"))}
            onLast={() => guardedAction(() => void handleNavigate("last"))}
            isSaving={isSaving}
            canSave={canSave && form.status !== 2 && form.status !== 3}
            canDelete={form.id > 0 && form.status !== 3}
            canClone={form.id > 0}
            canPrint={form.id > 0 && form.status !== 3}
            isFirstRecord={isFirstRecord}
            isLastRecord={isLastRecord}
          />

          <div
            className="relative min-h-0 flex-1 overflow-y-auto rounded-b-3xl bg-slate-50/60 px-6 py-4"
            onKeyDown={handleFormEnterAsTab}
          >
            <ProgressSpinner loading={isSaving || navLoading} />

            <DialogHeader className="mb-3 overflow-hidden rounded-2xl bg-gradient-to-l from-emerald-600 via-emerald-600 to-teal-600 px-5 py-3 shadow-lg">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight text-white sm:text-xl">
                <FileText className="h-5 w-5" />
                {title}
                {form.id > 0 ? (
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/30">{form.vch_code}</span>
                ) : (
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/30">مسودة</span>
                )}
                {statusBadge && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                      form.status === 3 ? "bg-rose-500/20 text-rose-50 ring-rose-200/40" : "bg-amber-400/20 text-amber-50 ring-amber-200/40"
                    }`}
                  >
                    {statusBadge}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            <Messages innerRef={messagesRef} />

            <fieldset disabled={isLocked} className="contents">
            {/* تفاصيل السند + تفاصيل العميل */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-emerald-100">
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                  تفاصيل السند
                </div>
                <div className="grid gap-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                      <Label>دفتر السندات *</Label>
                      <PrimeDropdown
                        value={form.vch_book_id}
                        options={voucherBooks}
                        optionLabel="name"
                        optionValue="id"
                        placeholder="اختر"
                        filter
                        disabled={isLocked}
                        className="invoice-currency-dropdown w-full"
                        panelClassName="invoice-currency-dropdown-panel"
                        appendTo="self"
                        panelStyle={{ zIndex: 10000 }}
                        onChange={(e: any) => (onBookChange ? onBookChange(e.value ?? null) : onFormChange("vch_book_id", e.value ?? null))}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="vch-code">رقم السند *</Label>
                      <Input
                        id="vch-code"
                        value={form.vch_code}
                        onChange={(e) => onFormChange("vch_code", normalizeVoucherCode(e.target.value))}
                        onBlur={handleCodeBlur}
                        maxLength={20}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="vch-date">تاريخ السند *</Label>
                      <DateTimeControl
                        id="vch-date"
                        ref={dateInputRef}
                        value={form.vch_date ? form.vch_date.slice(0, 10) : ""}
                        disabled={isLocked}
                        onChange={(value) => {
                          onFormChange("vch_date", value)
                          if (!form.manual_date) onFormChange("manual_date", value)
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                      <Label>العملة *</Label>
                      <PrimeDropdown
                        value={form.currency_id}
                        options={currencyOptions}
                        optionLabel="label"
                        optionValue="value"
                        placeholder="اختر العملة"
                        filter
                        disabled={isLocked}
                        className="invoice-currency-dropdown w-full"
                        panelClassName="invoice-currency-dropdown-panel"
                        appendTo="self"
                        panelStyle={{ zIndex: 10000 }}
                        onChange={(e: any) => void handleCurrencyChange(e.value ?? null)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="vch-rate">سعر الصرف *</Label>
                      <Input
                        id="vch-rate"
                        type="number"
                        value={numberValue(form.rate)}
                        onChange={(e) => onFormChange("rate", e.target.value ? Number(e.target.value) : 1)}
                        disabled={form.currency_id != null && form.currency_id === baseCurrencyId}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="vch-manual-code">سند يدوي</Label>
                      <Input
                        id="vch-manual-code"
                        value={form.manual_voucher}
                        onChange={(e) => onFormChange("manual_voucher", e.target.value)}
                        maxLength={30}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="vch-manual-date">تاريخ السند اليدوي</Label>
                      <DateTimeControl
                        id="vch-manual-date"
                        value={form.manual_date ? form.manual_date.slice(0, 10) : ""}
                        disabled={isLocked}
                        onChange={(value) => onFormChange("manual_date", value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-blue-700">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 ring-1 ring-blue-100">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  تفاصيل العميل
                </div>
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <AutoCompleteAccount
                      label={`${customerLabel} *`}
                      valueMode="id"
                      value={numberValue(form.account_id)}
                      onValueChange={(v) => onFormChange("account_id", v ? Number(v) : null)}
                      onAccountSelect={(account) => {
                        if (!account) return
                        onFormChange("customer_name", account.name)
                        // مطابق لـ setAccount('customer_account') في QabdVoucher.js: يعبّئ to_account
                        // والسطر الأول في شبكة الحسابات بنفس الحساب المختار.
                        onFormChange("to_account_id", account.id)
                        setJournalFirstRowAccount({ id: account.id, code: account.code, name: account.name })
                      }}
                      searchAllowedTypeValues={[2, 3, 4, 5]}
                      showCostCenterButton={false}
                      disabled={isLocked}
                    />
                    <div className="grid gap-1.5">
                      <Label>{customerNameLabel}</Label>
                      <Input
                        value={form.customer_name}
                        onChange={(e) => onFormChange("customer_name", e.target.value)}
                        maxLength={150}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <AutoCompleteAccount
                      label="على حساب"
                      valueMode="id"
                      value={numberValue(form.to_account_id)}
                      onValueChange={(v) => onFormChange("to_account_id", v ? Number(v) : null)}
                      onAccountSelect={(account) => account && setJournalFirstRowAccount({ id: account.id, code: account.code, name: account.name })}
                      costCenters={journal[0]?.cost_centers}
                      onCostCentersChange={(selection) => patchJournalRow(0, { cost_centers: selection })}
                      disabled={isLocked}
                    />
                    <div className="grid gap-1.5">
                      <Label>الرصيد</Label>
                      <Input value="0.000" readOnly disabled />
                    </div>
                  </div>
                  <div className={isPayment ? "grid grid-cols-3 gap-2" : "grid grid-cols-4 gap-2"}>
                    <div className="grid gap-1.5">
                      <Label>المبلغ *</Label>
                      <Input
                        type="number"
                        value={numberValue(form.amount)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onFormChange("amount", e.target.value ? Number(e.target.value) : 0)}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => {
                          doCalculation("amount")
                          applyRemainingToFirstRow()
                        }}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>نقدي</Label>
                      <Input
                        type="number"
                        value={numberValue(form.cash_amount)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onFormChange("cash_amount", e.target.value ? Number(e.target.value) : null)}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => doCalculation("cash")}
                      />
                    </div>
                    {!isPayment && (
                      <div className="grid gap-1.5">
                        <Label>بطاقات</Label>
                        <Input
                          type="number"
                          value={numberValue(form.credit_card_amount)}
                          onKeyDown={blockNonNumericKey}
                          onChange={(e) => onFormChange("credit_card_amount", e.target.value ? Number(e.target.value) : null)}
                          onFocus={(e) => e.target.select()}
                          onBlur={() => doCalculation("credit_card")}
                        />
                      </div>
                    )}
                    <div className="grid gap-1.5">
                      <Label>شيكات</Label>
                      <Input
                        type="number"
                        value={numberValue(form.check_amount)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onFormChange("check_amount", e.target.value ? Number(e.target.value) : null)}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => {
                          doCalculation("check")
                          if (Number(form.check_amount || 0) > 0) {
                            setActiveTab("cheques")
                            focusChequeGridCell(0, "bank_account")
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-1.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 ring-1 ring-slate-200">
                  <MessageSquare className="h-3.5 w-3.5" />
                </span>
                الملاحظة
              </div>
              <Input
                id="vch-note"
                value={form.note}
                onChange={(e) => onFormChange("note", e.target.value)}
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key !== "Tab" && e.key !== "Enter") return
                  e.preventDefault()
                  setActiveTab("journal")
                  waitForGridReady(
                    () => journalGridRef.current,
                    (grid) => {
                      selectCell(grid, 0, "account_code")
                      grid.focus()
                    },
                  )
                }}
              />
            </div>

            {/* Tabs: الرئيسية, الشيكات, تفاصيل البطاقة, الحسابات, ملاحظات, المرفقات, الحقول الإضافية */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="pt-4">
              <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
                <TabsTrigger value="main" className={voucherTabTriggerClass}>الرئيسية</TabsTrigger>
                <TabsTrigger value="cheques" className={voucherTabTriggerClass}>الشيكات</TabsTrigger>
                {!isPayment && (
                  <TabsTrigger value="card" className={voucherTabTriggerClass}>تفاصيل البطاقة</TabsTrigger>
                )}
                <TabsTrigger value="journal" className={voucherTabTriggerClass}>الحسابات</TabsTrigger>
                <TabsTrigger value="notes" className={voucherTabTriggerClass}>ملاحظات</TabsTrigger>
                <TabsTrigger value="attachments" className={voucherTabTriggerClass}>المرفقات</TabsTrigger>
                <TabsTrigger value="extra" className={voucherTabTriggerClass}>الحقول الإضافية</TabsTrigger>
              </TabsList>

              {/* الرئيسية */}
              <TabsContent value="main" className="min-h-[360px] space-y-4 pt-4">
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-amber-700">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 ring-1 ring-amber-100">
                      <Wallet className="h-3.5 w-3.5" />
                    </span>
                    الحسابات الافتراضية
                  </div>
                <div className={isPayment ? "grid gap-4 md:grid-cols-2" : "grid gap-4 md:grid-cols-3"}>
                  <AutoCompleteAccount
                    label="حساب الصندوق"
                    valueMode="id"
                    value={numberValue(form.cash_account_id)}
                    onValueChange={(v) => onFormChange("cash_account_id", v ? Number(v) : null)}
                    costCenters={form.cash_account_cost_centers}
                    onCostCentersChange={(selection) => onFormChange("cash_account_cost_centers", selection)}
                    disabled={isLocked}
                  />
                  <AutoCompleteAccount
                    label="حساب صندوق الشيكات"
                    valueMode="id"
                    // سند الصرف: يُعطَّل ويُفرَّغ — الحساب المقابل الفعلي لسطر قيد "شيكات" يصير
                    // jary_account_id الخاص بالحساب البنكي المختار في شبكة الشيكات بدلاً منه.
                    value={isPayment ? "" : numberValue(form.check_account_id)}
                    onValueChange={(v) => onFormChange("check_account_id", v ? Number(v) : null)}
                    costCenters={form.check_account_cost_centers}
                    onCostCentersChange={(selection) => onFormChange("check_account_cost_centers", selection)}
                    disabled={isLocked || isPayment}
                  />
                  {!isPayment && (
                    <AutoCompleteAccount
                      label="حساب البطاقات"
                      valueMode="id"
                      value={numberValue(form.credit_card_account_id)}
                      onValueChange={(v) => onFormChange("credit_card_account_id", v ? Number(v) : null)}
                      costCenters={form.credit_card_account_cost_centers}
                      onCostCentersChange={(selection) => onFormChange("credit_card_account_cost_centers", selection)}
                      disabled={isLocked}
                    />
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                    <Label>تصنيف الدفعة</Label>
                    <PrimeDropdown
                      value={form.payment_classification_id}
                      options={paymentClassifications}
                      optionLabel="name"
                      optionValue="id"
                      placeholder="اختر"
                      filter
                      disabled={isLocked}
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => onFormChange("payment_classification_id", e.value ?? null)}
                    />
                  </div>
                  <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                    <Label>مندوب المبيعات</Label>
                    <PrimeDropdown
                      value={form.salesman_id}
                      options={salesmen}
                      optionLabel="name"
                      optionValue="id"
                      placeholder="اختر"
                      filter
                      disabled={isLocked}
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => onFormChange("salesman_id", e.value ?? null)}
                    />
                  </div>
                </div>
                </div>
              </TabsContent>

              {/* الشيكات */}
              <TabsContent value="cheques" className="mt-4 min-h-[360px] space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={addChequeRow}>
                    <Plus className="ml-1 h-4 w-4" />
                    إضافة شيك
                  </Button>
                </div>
                <div className="w-full max-w-full overflow-x-auto">
                  <DataGridView
                    innerRef={chequeGridRef}
                    style={{ height: "240px" }}
                    scheme={chequeScheme}
                    dataSource={chequesCollectionView}
                    idProperty="ser"
                    isReport={isLocked}
                    showContextMenu={false}
                    cellEditEnded={(s: any, e: any) => handleChequeCellEditEnded(s, e)}
                    onKeyDown={(s: any, e: any) => handleChequeKeyDown(s, e)}
                    keyActionEnter="None"
                    dontConvertToCards={true}
                  />
                </div>
                <div className={`text-sm font-semibold ${chequesTotal === Number(form.check_amount || 0) ? "text-emerald-700" : "text-rose-600"}`}>
                  إجمالي الشيكات: {chequesTotal.toLocaleString()}
                </div>
              </TabsContent>

              {/* تفاصيل البطاقة — غير متاحة إطلاقاً في سند الصرف */}
              {!isPayment && (
              <TabsContent value="card" className="mt-4 min-h-[360px] space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                    <Label>نوع البطاقة</Label>
                    <PrimeDropdown
                      value={card.card_type_id}
                      options={cardTypeOptions}
                      optionLabel="name"
                      optionValue="id"
                      placeholder="اختر"
                      filter
                      disabled={isLocked}
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => handleCardTypeChange(e.value ?? null)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>رقم البطاقة</Label>
                    <Input value={card.card_no} onChange={(e) => patchCard({ card_no: e.target.value })} maxLength={50} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>تاريخ انتهاء البطاقة</Label>
                    <Input
                      type="date"
                      value={card.expire_date ? card.expire_date.slice(0, 10) : ""}
                      onChange={(e) => patchCard({ expire_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>المبلغ</Label>
                    <Input value={numberValue(form.credit_card_amount)} readOnly disabled />
                  </div>
                  <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                    <Label>العملة</Label>
                    <PrimeDropdown
                      value={card.currency_id}
                      options={currencyOptions}
                      optionLabel="label"
                      optionValue="value"
                      placeholder="اختر"
                      disabled
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                    />
                  </div>
                </div>
              </TabsContent>
              )}

              {/* الحسابات */}
              <TabsContent value="journal" className="mt-4 min-h-[360px] space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    تُستخدم عند توزيع مبلغ السند على أكثر من حساب مقابل بدلاً من حقل "على حساب" وحده. اختيار حساب يفعّل زر مراكز التكلفة الخاص به.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={addJournalRow}>
                    <Plus className="ml-1 h-4 w-4" />
                    إضافة سطر
                  </Button>
                </div>
                <div className="w-full max-w-full overflow-x-auto">
                  <DataGridView
                    innerRef={journalGridRef}
                    style={{ height: "240px" }}
                    scheme={journalScheme}
                    dataSource={journalCollectionView}
                    idProperty="ser"
                    isReport={isLocked}
                    showContextMenu={false}
                    cellEditEnded={(s: any, e: any) => handleJournalCellEditEnded(s, e)}
                    onKeyDown={(s: any, e: any) => handleJournalKeyDown(s, e)}
                    keyActionEnter={KeyAction.None}
                    keyActionTab={KeyAction.None}
                    dontConvertToCards={true}
                  />
                </div>
                <div className={`text-sm font-semibold ${journalDiff === 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  إجمالي الحسابات: {journalTotal.toLocaleString()}
                  {journalDiff !== 0 && journalTotal > 0 && ` — الفرق عن المبلغ الإجمالي: ${journalDiff.toLocaleString()}`}
                </div>
              </TabsContent>

              {/* ملاحظات */}
              <TabsContent value="notes" className="mt-4 min-h-[360px] space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={addNoteRow}>
                    <ListPlus className="ml-1 h-4 w-4" />
                    إضافة ملاحظة
                  </Button>
                </div>
                <div className="space-y-2">
                  {notes.map((row, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <span className="mt-2 w-5 shrink-0 text-center text-xs text-slate-400">{index + 1}</span>
                      <Textarea
                        value={row.note}
                        onChange={(e) => updateNoteRow(index, e.target.value)}
                        maxLength={150}
                        rows={2}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 shrink-0 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => removeNoteRow(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {notes.length === 0 && <p className="py-4 text-center text-sm text-slate-400">لا توجد ملاحظات</p>}
                </div>
              </TabsContent>

              {/* المرفقات */}
              <TabsContent value="attachments" className="mt-4 min-h-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-slate-400">
                  <Paperclip className="h-6 w-6" />
                  <p className="text-sm">رفع المرفقات غير متاح بعد في هذا الإصدار</p>
                </div>
              </TabsContent>

              {/* الحقول الإضافية */}
              <TabsContent value="extra" className="mt-4 min-h-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="py-4 text-center text-sm text-slate-400">لا توجد حقول إضافية معرّفة لهذا النوع من السندات</p>
              </TabsContent>
            </Tabs>
            </fieldset>
          </div>
        </DialogContent>
      </Dialog>

      <AccountSearchDialog
        open={journalSearchOpen}
        onOpenChange={(open) => {
          setJournalSearchOpen(open)
          if (!open && journalSearchRow !== null) focusGridCell(journalSearchRow, "account_code")
        }}
        accounts={accountsList}
        onSelect={(account) => {
          if (journalSearchRow !== null && checkAccountCurrencyCompatibility(account)) {
            patchJournalRow(journalSearchRow, { account_id: account.id, account_code: account.code, account_name: account.name })
            if (journalSearchRow === 0) onFormChange("to_account_id", account.id)
          }
        }}
      />

      <AccountCostCenters
        open={costCenterOpen}
        onOpenChange={(open) => {
          setCostCenterOpen(open)
          if (!open && journalSearchRow !== null) focusGridCell(journalSearchRow, "account_code")
        }}
        account={costCenterAccount}
        value={journalSearchRow !== null ? journal[journalSearchRow]?.cost_centers : undefined}
        onChange={(selection) => {
          if (journalSearchRow !== null) patchJournalRow(journalSearchRow, { cost_centers: selection })
        }}
      />

      <BanksSearch
        open={bankSearchOpen}
        onOpenChange={setBankSearchOpen}
        banks={banks as BankSearchRecord[]}
        onSelect={(bank) => {
          if (chequeSearchRow !== null) {
            const row = chequeSearchRow
            patchChequeRow(row, {
              bank_id: bank.id,
              bank_no: bank.bank_code || "",
              bank_name: bank.bank_name,
              branch_id: null,
              branch_no: "",
              branch_name: "",
            } as any)
            pendingChequeFocusRef.current = { row, col: "branch_no" }
          }
          setBankSearchOpen(false)
        }}
      />

      <BranchesSearch
        open={branchSearchOpen}
        onOpenChange={setBranchSearchOpen}
        branches={branches as BranchSearchRecord[]}
        bankId={chequeSearchRow !== null ? cheques[chequeSearchRow]?.bank_id : null}
        onSelect={(branch) => {
          if (chequeSearchRow !== null) {
            const row = chequeSearchRow
            patchChequeRow(row, {
              branch_id: branch.id,
              branch_no: branch.branch_code || "",
              branch_name: branch.branch_name,
            } as any)
            pendingChequeFocusRef.current = { row, col: "due_date" }
          }
          setBranchSearchOpen(false)
        }}
      />

      <BankAccountsSearch
        open={bankAccountSearchOpen}
        onOpenChange={setBankAccountSearchOpen}
        bankAccounts={bankAccounts}
        currencyId={form.currency_id}
        onSelect={(account) => {
          if (chequeSearchRow !== null) {
            const row = chequeSearchRow
            const currentRow = chequesRef.current[row]
            const changedAccount = currentRow?.bank_account_id !== account.id
            patchChequeRow(row, {
              bank_account: account.code,
              bank_account_id: account.id,
              ...resolveBankBranchFromAccount(account),
              ...(changedAccount ? { cheq_num: "", cheque_book_cheque_id: null } : {}),
            } as any)
            pendingChequeFocusRef.current = { row, col: "cheq_num" }
          }
          setBankAccountSearchOpen(false)
        }}
      />

      <ChequeBookLeafSearch
        open={chequeLeafSearchOpen}
        onOpenChange={setChequeLeafSearchOpen}
        bankAccountId={chequeSearchRow !== null ? cheques[chequeSearchRow]?.bank_account_id ?? null : null}
        excludeCodes={cheques
          .filter((_, i) => i !== chequeSearchRow)
          .map((r) => r.cheq_num)
          .filter(Boolean)}
        onSelect={(leaf) => {
          if (chequeSearchRow !== null) {
            const row = chequeSearchRow
            patchChequeRow(row, { cheq_num: leaf.cheque_code, cheque_book_cheque_id: leaf.id } as any)
            pendingChequeFocusRef.current = { row, col: "bank_no" }
          }
          setChequeLeafSearchOpen(false)
        }}
      />

      <DatePickerDialog
        open={dueDatePickerOpen}
        onOpenChange={setDueDatePickerOpen}
        value={dueDateRow !== null ? cheques[dueDateRow]?.due_date : null}
        title="تاريخ استحقاق الشيك"
        onSelect={(isoDate) => {
          if (dueDateRow !== null) {
            const row = dueDateRow
            patchChequeRow(row, { due_date: isoDate })
            pendingChequeFocusRef.current = { row, col: "amount" }
          }
        }}
      />

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message={isPosted ? "السند مرحل هل تريد الغاؤه منطقياً؟" : `هل تريد حذف هذا ${title}؟`}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />

      <ConfirmDialogYesNo
        visible={showUnsavedConfirm}
        message="تم تعديل البيانات، هل تريد الحفظ؟"
        showBack
        onConfirm={() => {
          setShowUnsavedConfirm(false)
          pendingActionRef.current = null
          onSave("save")
        }}
        onCancel={() => {
          setShowUnsavedConfirm(false)
          const action = pendingActionRef.current
          pendingActionRef.current = null
          action?.()
        }}
        onBack={() => setShowUnsavedConfirm(false)}
      />

      <PostVoucherDialog
        visible={postDialogOpen}
        isSaving={isSaving}
        onSelect={(action) => {
          setPostDialogOpen(false)
          onSave(action)
        }}
        onCancel={() => setPostDialogOpen(false)}
      />
    </>
  )
}
