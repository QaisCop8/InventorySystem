"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, ListPlus, Paperclip, FileText } from "lucide-react"
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
import DataGridView from "@/components/common/DataGridView"
import DateTimeControl from "@/components/common/date-time-control"
import PostVoucherDialog, { type PostVoucherAction } from "@/components/common/post-voucher-dialog"
import AccountSearchDialog, { type AccountItem } from "@/components/customer/account-search-dialog"
import AccountCostCenters, { type JournalCostCenterSelection } from "@/components/customer/account-cost-centers"
import Util from "@/components/common/Util"
import { useToast } from "@/hooks/use-toast"
import { CellRange, KeyAction } from "@grapecity/wijmo.grid"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"

const voucherTabTriggerClass =
  "data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-md"

export interface JournalEntryRow {
  account_id: number | null
  account_code: string
  account_name: string
  debit: number | null
  credit: number | null
  note: string
  cost_centers: JournalCostCenterSelection[]
}

export interface JournalNoteRow {
  note: string
}

export interface JournalVoucherRecord {
  id: number
  vch_code: string
  vch_date: string
  vch_book_id: number | null
  currency_id: number | null
  rate: number
  amount?: number
  manual_voucher: string
  manual_date: string
  payment_classification_id: number | null
  salesman_id: number | null
  note: string
  status: number
  is_printed?: number
  journal: JournalEntryRow[]
  notes: JournalNoteRow[]
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

interface UnifiedJournalProps {
  dialogOpen: boolean
  currentIndex: number
  totalRecords: number
  currencies?: CurrencyOption[]
  voucherBooks?: LookupOption[]
  salesmen?: LookupOption[]
  paymentClassifications?: LookupOption[]
  form: JournalVoucherRecord
  isSaving: boolean
  showDeleteConfirm?: boolean
  onOpenChange: (open: boolean) => void
  onNew?: () => void
  onSave: (action?: PostVoucherAction) => void
  onValidateSave?: () => string | null
  onDelete?: () => void
  onClone?: () => void
  onPrint?: () => void
  onNavigateRecord?: (record: JournalVoucherRecord) => void
  onFormChange: (field: string, value: string | number | null) => void
  onBookChange?: (bookId: number | null) => void
  onCodeResolved?: (id: number) => void
  onCodeNotFound?: (code: string) => void
  onJournalChange: (journal: JournalEntryRow[]) => void
  onNotesChange: (notes: JournalNoteRow[]) => void
  onConfirmDelete?: () => void
  onCancelDelete?: () => void
  canSave?: boolean
  isFirstRecord?: boolean
  isLastRecord?: boolean
  isNewMode?: boolean
  errorMessages?: string[]
}

const emptyJournalRow: JournalEntryRow = {
  account_id: null,
  account_code: "",
  account_name: "",
  debit: null,
  credit: null,
  note: "",
  cost_centers: [],
}

const normalizeVoucherCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9-]/g, "")
const numberValue = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value))

const selectCell = (grid: any, row: number, colName: string) => {
  if (!grid || !grid.columns) return
  const colIndex = grid.columns.findIndex((c: any) => c.binding === colName)
  if (colIndex >= 0) grid.select(new CellRange(row, colIndex))
}

// بعد التبديل إلى تبويب "الحسابات" قد يُعاد إنشاء الشبكة (Radix يُلغي تركيب التبويبات غير
// النشطة)، فيتأخر جاهزية gridRef.current قليلاً — نعيد المحاولة بدل الاعتماد على مهلة ثابتة
// قد تسبق اكتمال إعادة التركيب فتترك grid كائناً قديماً بلا columns.
const waitForGridReady = (getGrid: () => any, onReady: (grid: any) => void, attempts = 10) => {
  const grid = getGrid()
  if (grid && grid.columns) {
    onReady(grid)
    return
  }
  if (attempts <= 0) return
  setTimeout(() => waitForGridReady(getGrid, onReady, attempts - 1), 50)
}

const blockNonNumericKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
  const controlKeys = ["Backspace", "Delete", "Tab", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]
  if (e.ctrlKey || e.metaKey || e.altKey || controlKeys.includes(e.key)) return
  if (e.key.length === 1 && !/[0-9.]/.test(e.key)) e.preventDefault()
}

const ACCOUNT_CODE_LENGTH = 8

// "c1" -> "C0000001", "1" -> "00000001" — يُكمَّل الجزء الرقمي بأصفار حتى الطول القياسي لرقم
// الحساب (مطابق لـ Util.adjustCode في النظام المرجعي)، دون تقصير رمز مكتمل الطول أصلاً.
const adjustAccountCode = (raw: string): string => {
  const upper = raw.trim().toUpperCase()
  const match = upper.match(/^([A-Z]*)(\d+)$/)
  if (!match) return upper
  const [, prefix, digits] = match
  const digitsLength = Math.max(1, ACCOUNT_CODE_LENGTH - prefix.length)
  if (digits.length >= digitsLength) return upper
  return prefix + digits.padStart(digitsLength, "0")
}

const FOCUSABLE_SELECTOR =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const focusNextInContainer = (container: HTMLElement, current: HTMLElement) => {
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null && !el.closest(".wj-flexgrid"),
  )
  const currentIndex = focusable.indexOf(current)
  if (currentIndex === -1) return
  focusable[currentIndex + 1]?.focus()
}

// السماح بالـ Enter للتنقّل كـ Tab بين حقول الرأس (خارج شبكة الحسابات وقوائم الاختيار، التي
// لها منطقها الخاص أدناه).
const handleFormEnterAsTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
  if (event.key !== "Enter") return
  const target = event.target as HTMLElement
  if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return
  if (target.closest(".wj-flexgrid")) return
  event.preventDefault()
  focusNextInContainer(event.currentTarget, target)
}

// تنقّل بالأسهم في قوائم الاختيار (PrimeDropdown) دون فتح لوحة الخيارات — يغيّر القيمة مباشرة
// كأنه <select> عادي، ويمنع فتح اللوحة عند Enter (يتصرف بدلاً منها كـ Tab للحقل التالي).
// يُلتقط في مرحلة الالتقاط (capture) ليسبق معالجة PrimeReact الداخلية للسهمين/Enter.
const createDropdownKeyHandler = (
  options: any[],
  optionValueKey: string,
  currentValue: any,
  onSelect: (value: any) => void,
) => (event: React.KeyboardEvent<HTMLDivElement>) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault()
    event.stopPropagation()
    if (!options.length) return
    const currentIndex = options.findIndex((opt) => opt[optionValueKey] === currentValue)
    const nextIndex =
      event.key === "ArrowDown"
        ? currentIndex < 0
          ? 0
          : Math.min(currentIndex + 1, options.length - 1)
        : currentIndex < 0
          ? options.length - 1
          : Math.max(currentIndex - 1, 0)
    onSelect(options[nextIndex][optionValueKey])
  } else if (event.key === "Enter") {
    event.preventDefault()
    event.stopPropagation()
    const target = event.target as HTMLElement
    const container = target.closest<HTMLElement>('[data-enter-tab-root="true"]')
    if (container) focusNextInContainer(container, target)
  }
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

export default function UnifiedJournal({
  dialogOpen,
  currentIndex,
  totalRecords,
  currencies = [],
  voucherBooks = [],
  salesmen = [],
  paymentClassifications = [],
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
  onNotesChange,
  onConfirmDelete = () => undefined,
  onCancelDelete = () => undefined,
  canSave,
  isFirstRecord,
  isLastRecord,
  isNewMode,
  errorMessages = [],
}: UnifiedJournalProps) {
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const messagesRef = useRef<any>(null)
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("journal")
  const [navLoading, setNavLoading] = useState(false)
  const [accountsList, setAccountsList] = useState<AccountItem[]>([])
  const [journalSearchOpen, setJournalSearchOpen] = useState(false)
  const [journalSearchRow, setJournalSearchRow] = useState<number | null>(null)
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [costCenterAccount, setCostCenterAccount] = useState<AccountItem | null>(null)
  const [costCenterRow, setCostCenterRow] = useState<number | null>(null)
  const gridRef = useRef<any>(null)
  // يميّز نافذة بحث الحساب بين "تم الاختيار" (ينتقل التركيز إلى مدين) و"إلغاء/إغلاق دون اختيار"
  // (يعود التركيز إلى رقم الحساب) — كلا المسارين يُغلقان النافذة عبر onOpenChange نفسه.
  const accountJustSelectedRef = useRef(false)
  const accountsListRef = useRef<AccountItem[]>([])
  const accountsFetchRef = useRef<Promise<AccountItem[]> | null>(null)
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  // سند مُرحَّل (status=2): مقفل بالكامل، لا يُعدَّل إلا عبر إلغائه منطقياً (زر حذف).
  const isPosted = form.status === 2
  // مقفل بالكامل (نموذج + شبكة الحسابات للقراءة فقط) لكلا الحالتين: مُرحَّل (2) أو ملغي منطقياً
  // (3) — لا فرق بينهما من ناحية إمكانية التعديل، الفرق فقط في نص رسالة تأكيد الحذف أدناه.
  const isLocked = form.status === 2 || form.status === 3
  // شارة الحالة في عنوان النافذة: ملغي منطقياً (status=3) تطغى على أي شيء آخر؛ خلاف ذلك
  // "مرحل" وحدها إن لم تُطبع بعد، أو "مرحل - مطبوع" إن طُبعت (is_printed=1) بعد الترحيل.
  const statusBadge =
    form.status === 3 ? "ملغي منطقياً" : form.status === 2 ? (form.is_printed === 1 ? "مرحل - مطبوع" : "مرحل") : ""

  // يضمن اكتمال جلب الحسابات قبل أي محاولة مطابقة رقم حساب — بدونه، الضغط على Enter بسرعة
  // فور فتح النافذة (قبل اكتمال fetch الأولي) يُظهر "لا يوجد حساب بهذا الرقم" رغم وجوده فعلياً.
  const ensureAccountsLoaded = (): Promise<AccountItem[]> => {
    if (accountsListRef.current.length > 0) return Promise.resolve(accountsListRef.current)
    if (!accountsFetchRef.current) {
      accountsFetchRef.current = fetch("/api/accounts")
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          const mapped = Array.isArray(data) ? data.map(mapAccount) : []
          accountsListRef.current = mapped
          setAccountsList(mapped)
          return mapped
        })
        .catch(() => {
          accountsListRef.current = []
          setAccountsList([])
          return []
        })
    }
    return accountsFetchRef.current
  }

  useEffect(() => {
    if (!dialogOpen) return
    void ensureAccountsLoaded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen])

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
    setActiveTab("journal")
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

  // يتحقق من صحة السند قبل عرض نافذة "كيف تريد الحفظ؟" — لا فائدة من تخيير المستخدم بين حفظ/ترحيل/طباعة
  // لسند غير صالح أصلاً (رقم ناقص، قيد غير متوازن...)؛ رسالة الخطأ تظهر مباشرة بدل فتح النافذة.
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
        if (form.id > 0) onDelete?.()
        else guardedAction(() => onOpenChange(false))
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [dialogOpen, form.id, isLocked, onDelete, onOpenChange, guardedAction, showDeleteConfirm, showUnsavedConfirm])

  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return
    const t = setTimeout(() => dateInputRef.current?.focus(), 120)
    return () => clearTimeout(t)
    // form.vch_code يتغيّر أيضاً عند الضغط على "جديد" مرتين متتاليتين قبل الحفظ (id يبقى 0 في
    // الحالتين)، لذا نعتمد عليه أيضاً حتى تعمل إعادة تركيز التاريخ في هذه الحالة أيضاً.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.vch_code, isNewMode])

  const handleNavigate = async (direction: "first" | "previous" | "next" | "last") => {
    setNavLoading(true)
    try {
      const currentId = form.id > 0 ? form.id : 0
      const isNewRecord = form.id <= 0
      const effectiveDirection =
        direction === "previous" && isNewRecord ? "last" : direction === "next" && isNewRecord ? "first" : direction

      const query = new URLSearchParams()
      if (effectiveDirection === "previous" || effectiveDirection === "next") query.set("currentId", String(currentId))

      const response = await fetch(`/api/journal-vouchers/navigation/${effectiveDirection}?${query.toString()}`)
      if (!response.ok) return

      const record = await response.json()
      if (record?.id) onNavigateRecord?.(record)
    } catch (error) {
      console.error("Failed to navigate journal voucher", error)
    } finally {
      setNavLoading(false)
    }
  }

  // كتابة يدوية في رقم السند تُعاد صياغتها دائماً كـ {بادئة}{رمز الدفتر}{تسلسل مبطّن} عبر
  // /resolve-code، ثم يُعرض السند إن كان موجوداً بهذا الرقم، أو تُصفَّر الحقول لسند جديد بهذا الرقم.
  const handleCodeBlur = async () => {
    const raw = form.vch_code.trim()
    if (!raw) return
    try {
      const query = new URLSearchParams({ raw })
      if (form.vch_book_id) query.set("vch_book_id", String(form.vch_book_id))
      const response = await fetch(`/api/journal-vouchers/resolve-code?${query.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        messagesRef.current?.show?.([{ severity: "error", summary: "", detail: data.error || "تعذر تحديد رقم السند", life: 3000 }])
        return
      }
      if (data.code && data.code !== form.vch_code) onFormChange("vch_code", data.code)
      if (data.exists && data.id) {
        if (data.id === form.id) return
        guardedAction(() => onCodeResolved?.(data.id))
      } else if (!data.exists && data.code) {
        guardedAction(() => onCodeNotFound?.(data.code))
      }
    } catch (error) {
      console.error("Failed to resolve journal voucher code", error)
    }
  }

  // ---- الحسابات (مدين/دائن) ----
  const journal = form.journal || []
  const totalDebit = journal.reduce((sum, row) => sum + Number(row.debit || 0), 0)
  const totalCredit = journal.reduce((sum, row) => sum + Number(row.credit || 0), 0)
  const journalDiff = Math.round((totalDebit - totalCredit) * 100) / 100

  const journalRef = useRef(journal)
  journalRef.current = journal

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
        () => gridRef.current,
        (grid) => {
          selectCell(grid, row, colName)
          grid.focus()
        },
      )
    }
    requestAnimationFrame(() => requestAnimationFrame(applyFocus))
    setTimeout(applyFocus, 120)
  }

  const patchJournalRow = (index: number, patch: Partial<JournalEntryRow>) => {
    if (isLocked) return
    const next = journalRef.current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    journalRef.current = next
    onJournalChange(next)
  }
  const addJournalRow = () => {
    if (isLocked) return journalRef.current
    const next = [...journalRef.current, { ...emptyJournalRow }]
    journalRef.current = next
    onJournalChange(next)
    return next
  }
  const deleteJournalRow = (index: number) => {
    if (isLocked) return
    const filtered = journalRef.current.filter((_, i) => i !== index)
    const next = filtered.length > 0 ? filtered : [{ ...emptyJournalRow }]
    journalRef.current = next
    onJournalChange(next)
    focusGridCell(Math.min(index, next.length - 1), "account_code")
  }

  // فحص توافق عملة الحساب مع عملة السند عند اختيار حساب في شبكة "الحسابات" — لا علاقة له بحسابات
  // أخرى في السند (كحساب المندوب مثلاً). allow_trans_with_diff_curr (إعداد الحساب "السماح بعمل
  // حركة على الحساب بغير عملته"): 0 = مسموح بدون تنبيه، 1 = مسموح مع تنبيه (Toast تحذيري لكن
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

  // async (تنتظر ensureAccountsLoaded) — أي selectCell متزامن يُنفَّذ فور استدعائها (كما في معالج
  // Tab/Enter) يسبق فعلياً تحديث journal هنا، فيصل تصفير Wijmo لتحديد الشبكة (بعد إعادة ربط
  // itemsSource) لاحقاً ويُبطل ذلك التحديد. لذا focusGridCell تُستدعى هنا صراحة بعد أن تُعرف
  // النتيجة الفعلية، لا يُكتفى بالتنقّل المتزامن في معالج المفاتيح.
  const resolveJournalAccountByCode = async (index: number, rawCode: string) => {
    const code = adjustAccountCode(rawCode)
    if (!code) {
      patchJournalRow(index, { account_id: null, account_code: "", account_name: "", cost_centers: [] })
      return
    }
    const list = await ensureAccountsLoaded()
    const match = list.find((a) => a.code.toUpperCase() === code)
    if (match) {
      if (!checkAccountCurrencyCompatibility(match)) {
        patchJournalRow(index, { account_id: null, account_code: "", account_name: "", cost_centers: [] })
        focusGridCell(index, "account_code")
        return
      }
      patchJournalRow(index, { account_id: match.id, account_code: match.code, account_name: match.name, cost_centers: [] })
      focusGridCell(index, "debit")
    } else {
      patchJournalRow(index, { account_id: null, account_code: code, account_name: "" })
      focusGridCell(index, "account_code")
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: `لا يوجد حساب بهذا الرقم: ${code}`, life: 3000 }])
    }
  }

  const openJournalCostCenter = (index: number) => {
    if (isLocked) return
    const row = journal[index]
    if (!row?.account_id) {
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "يجب تحديد الحساب أولاً", life: 3000 }])
      return
    }
    const account = accountsListRef.current.find((a) => a.id === row.account_id) || null
    setCostCenterAccount(account)
    setCostCenterOpen(true)
    setCostCenterRow(index)
  }

  // يوازن السطر الحالي ليكمّل الفرق بين مجموع المدين ومجموع الدائن (مطابق لاختصار "=" في
  // النظام المرجعي: يملأ الخانة تلقائياً بالفرق المتبقي لموازنة القيد).
  const applyBalanceShortcut = (index: number, side: "debit" | "credit") => {
    const rows = journalRef.current
    let debitSum = 0
    let creditSum = 0
    rows.forEach((row, i) => {
      if (i === index) return
      debitSum += Number(row.debit || 0)
      creditSum += Number(row.credit || 0)
    })
    const remaining = side === "debit" ? Math.max(0, creditSum - debitSum) : Math.max(0, debitSum - creditSum)
    if (side === "debit") patchJournalRow(index, { debit: remaining, credit: null })
    else patchJournalRow(index, { credit: remaining, debit: null })
  }

  // يتحقق من اكتمال السطر (حساب + مبلغ) قبل مغادرته عبر Enter/Tab من عمود "ملاحظات" — سواء
  // كانت المغادرة للانتقال لسطر تالٍ موجود أو لإضافة سطر جديد.
  const validateRowComplete = (index: number): boolean => {
    const row = journalRef.current[index]
    if (!row?.account_id) {
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "يجب تحديد رقم الحساب أولاً", life: 3000 }])
      return false
    }
    if (!(Number(row.debit || 0) > 0) && !(Number(row.credit || 0) > 0)) {
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "يجب إدخال مبلغ مدين أو دائن أولاً", life: 3000 }])
      return false
    }
    return true
  }

  const journalScheme = useMemo(
    () => ({
      name: "JournalEntryScheme",
      filter: false,
      showFooter: false,
      sortable: false,
      columns: [
        { header: "#", name: "ser", width: 50, isReadOnly: true },
        { header: "رقم الحساب", name: "account_code", width: 130, minWidth: 110, maxLength: ACCOUNT_CODE_LENGTH },
        {
          name: "btnSearch",
          header: " ",
          width: 50,
          buttonBody: "button",
          align: "center",
          title: "بحث عن حساب (F10)",
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
        { header: "مدين", name: "debit", width: 120, minWidth: 110, dataType: "Number", maxLength: 30 },
        { header: "دائن", name: "credit", width: 120, minWidth: 110, dataType: "Number", maxLength: 30 },
        { header: "ملاحظات", name: "note", width: 220, minWidth: 180, maxLength: 100 },
        {
          name: "btnCostCenter",
          header: "مراكز التكلفة",
          width: 100,
          buttonBody: "button",
          align: "center",
          title: "مراكز التكلفة",
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
          onClick: (e: any, ctx: any) => deleteJournalRow(ctx.row.index),
          visible: true,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [journal, accountsList],
  )

  const journalGridData = useMemo(() => journal.map((row, i) => ({ ...row, ser: i + 1 })), [journal])

  const handleJournalCellEditEnded = (grid: any, e: any) => {
    gridRef.current = grid
    const row = e.row
    const colName = grid?.columns?.[e.col]?.binding
    if (colName === "account_code") {
      const value = String(grid.getCellData(row, e.col, false) ?? "")
      if (Util.isSpaceOrSymbols(value) || Util.isArabic(value) || !Util.isCodeFormat(value)) {
        messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "رقم الحساب يجب أن يكون أحرف/أرقام إنجليزية فقط بدون مسافات", life: 3000 }])
        return
      }
      resolveJournalAccountByCode(row, value)
    } else if (colName === "debit") {
      const value = grid.getCellData(row, e.col, false)
      const debit = value === "" || value === null ? null : Number(value)
      patchJournalRow(row, { debit, credit: debit && debit > 0 ? null : journalRef.current[row]?.credit ?? null })
    } else if (colName === "credit") {
      const value = grid.getCellData(row, e.col, false)
      const credit = value === "" || value === null ? null : Number(value)
      patchJournalRow(row, { credit, debit: credit && credit > 0 ? null : journalRef.current[row]?.debit ?? null })
    } else if (colName === "note") {
      const value = grid.getCellData(row, e.col, false)
      patchJournalRow(row, { note: String(value ?? "") })
    }
  }

  const handleJournalKeyDown = (grid: any, e: any) => {
    gridRef.current = grid
    if (!grid || !grid.selection) return
    const row = grid.selection.row
    const col = grid.selection.col
    if (row < 0 || col < 0) return
    const colName = grid.columns[col]?.binding

    if (colName === "debit" || colName === "credit") {
      if (e.key === "=") {
        e.preventDefault()
        applyBalanceShortcut(row, colName as "debit" | "credit")
        return
      }
      if (e.key && e.key.length === 1 && !/[0-9.]/.test(e.key)) {
        e.preventDefault()
        return
      }
    }

    if (col === grid.columns.findIndex((c: any) => c.binding === "account_code") && e.key === "F10") {
      e.preventDefault()
      setJournalSearchRow(row)
      setJournalSearchOpen(true)
      return
    }

    // F7 يحذف السطر الحالي — يُتاح فقط لسند فعال غير مرحّل (status=1) أو مسودة جديدة لم تُحفظ
    // بعد (id=0)؛ deleteJournalRow نفسها تمنع الحذف أصلاً إن كان السند مقفلاً (isLocked).
    if (e.key === "F7") {
      e.preventDefault()
      if (form.status === 1 || form.id === 0) deleteJournalRow(row)
      return
    }

    // F8 يفتح مراكز التكلفة للسطر الحالي — openJournalCostCenter نفسها تمنع الفتح إن لم يكن
    // للسطر حساب محدد بعد (account_id فارغ) أو كان السند مقفلاً.
    if (e.key === "F8") {
      e.preventDefault()
      openJournalCostCenter(row)
      return
    }

    if (e.key === "Tab" || e.key === "Enter") {
      const isLastRow = row === journalRef.current.length - 1
      if (colName === "account_code") {
        e.preventDefault()
        const code = journalRef.current[row]?.account_code?.trim()
        // لا يوجد تعديل معلَّق هنا (الكود مُحلَّل مسبقاً)، فلا سباق مع Wijmo — التنقّل المتزامن
        // آمن. الحالة الجديدة (تحليل كود لم يُحلَّل بعد) تُدار عبر resolveJournalAccountByCode
        // نفسها + focusGridCell بعد معرفة النتيجة الفعلية (انظر تعليقها أعلاه).
        if (code) selectCell(grid, row, "debit")
        else {
          setJournalSearchRow(row)
          setJournalSearchOpen(true)
        }
      } else if (colName === "debit" || colName === "credit" || colName === "note") {
        // خلاف account_code: مغادرة أي من هذه الأعمدة عبر Tab/Enter تُنهي تحرير الخلية أولاً،
        // مما يُشغّل cellEditEnded -> patchJournalRow -> مصفوفة journal جديدة -> إعادة ربط
        // itemsSource في Wijmo -> تصفير تحديده إلى (0,0) — وقد يحدث هذا بعد selectCell المتزامن
        // هنا فيُبطله (نفس سباق resolveJournalAccountByCode). لذا focusGridCell (بتكرارها
        // المُقاوم للتوقيت) بدل selectCell المباشر لكل تنقّل يتبع تعديل خلية.
        e.preventDefault()
        if (colName === "debit") {
          focusGridCell(row, "credit")
        } else if (colName === "credit") {
          focusGridCell(row, "note")
        } else if (colName === "note") {
          if (!validateRowComplete(row)) return
          if (isLastRow) {
            addJournalRow()
            focusGridCell(row + 1, "account_code")
          } else {
            focusGridCell(row + 1, "account_code")
          }
        }
      }
    }
  }

  // ---- ملاحظات ----
  const notes = form.notes || []
  const addNoteRow = () => onNotesChange([...(notes || []), { note: "" }])
  const updateNoteRow = (index: number, value: string) => {
    const next = notes.map((row, i) => (i === index ? { ...row, note: value } : row))
    onNotesChange(next)
  }
  const removeNoteRow = (index: number) => onNotesChange(notes.filter((_, i) => i !== index))

  const currencyOptions = useMemo(
    () =>
      currencies.map((c) => ({
        label: c.currency_name || c.currency_code || "غير محدد",
        value: Number(c.currency_id ?? c.id),
      })),
    [currencies],
  )

  // عملة الأساس في النظام = أصغر معرّف عملة، وسعر صرفها دائماً 1 (نفس قاعدة سند القبض/الصرف).
  const baseCurrencyId = useMemo(
    () =>
      currencies.reduce<number | null>((min, c) => {
        const id = Number(c.currency_id ?? c.id)
        if (!Number.isFinite(id)) return min
        return min === null || id < min ? id : min
      }, null),
    [currencies],
  )

  const handleCurrencyChange = async (newCurrencyId: number | null) => {
    onFormChange("currency_id", newCurrencyId)
    if (!newCurrencyId) return

    if (newCurrencyId === baseCurrencyId) {
      onFormChange("rate", 1)
      return
    }
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

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? onOpenChange(open) : guardedAction(() => onOpenChange(false)))}>
        <DialogContent
          className="voucher-form w-[97vw] max-w-[1500px] p-0 overflow-hidden max-h-[92vh] overflow-y-auto"
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
            className="relative rounded-b-3xl bg-slate-50/60 px-6 py-6"
            onKeyDown={handleFormEnterAsTab}
            data-enter-tab-root="true"
          >
            <ProgressSpinner loading={isSaving || navLoading} />

            <DialogHeader className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-l from-emerald-600 via-emerald-600 to-teal-600 px-5 py-4 shadow-lg">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight text-white sm:text-xl">
                <FileText className="h-5 w-5" />
                سند قيد
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
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-emerald-100">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                تفاصيل السند
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div
                  className="grid gap-1.5"
                  onKeyDownCapture={createDropdownKeyHandler(voucherBooks, "id", form.vch_book_id, (value) =>
                    onBookChange ? onBookChange(value) : onFormChange("vch_book_id", value),
                  )}
                >
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

              <div className="grid gap-4 md:grid-cols-3">
                <div
                  className="grid gap-1.5 invoice-currency-dropdown-wrap"
                  onKeyDownCapture={createDropdownKeyHandler(currencyOptions, "value", form.currency_id, (value) =>
                    void handleCurrencyChange(value),
                  )}
                >
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
                    onKeyDown={blockNonNumericKey}
                    onChange={(e) => onFormChange("rate", e.target.value ? Number(e.target.value) : 1)}
                    disabled={form.currency_id != null && form.currency_id === baseCurrencyId}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="manual-voucher">سند يدوي</Label>
                  <Input
                    id="manual-voucher"
                    value={form.manual_voucher}
                    onChange={(e) => onFormChange("manual_voucher", e.target.value)}
                    maxLength={30}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="manual-date">تاريخ السند اليدوي</Label>
                  <DateTimeControl
                    id="manual-date"
                    value={form.manual_date ? form.manual_date.slice(0, 10) : ""}
                    disabled={isLocked}
                    onChange={(value) => onFormChange("manual_date", value)}
                  />
                </div>
                <div className="grid gap-1.5 md:col-span-2">
                  <Label htmlFor="vch-note">الملاحظة</Label>
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
                        () => gridRef.current,
                        (grid) => {
                          selectCell(grid, 0, "account_code")
                          grid.focus()
                        },
                      )
                    }}
                  />
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="pt-4">
              <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
                <TabsTrigger value="journal" className={voucherTabTriggerClass}>الحسابات</TabsTrigger>
                <TabsTrigger value="extra-data" className={voucherTabTriggerClass}>بيانات اضافية</TabsTrigger>
                <TabsTrigger value="notes" className={voucherTabTriggerClass}>ملاحظات</TabsTrigger>
                <TabsTrigger value="attachments" className={voucherTabTriggerClass}>المرفقات</TabsTrigger>
              </TabsList>

              <TabsContent value="journal" className="mt-4 min-h-[420px] space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-between">
                  <div
                    className={`text-sm font-semibold ${journalDiff === 0 ? "text-emerald-700" : "text-rose-600"}`}
                  >
                    إجمالي المدين: {totalDebit.toLocaleString()} — إجمالي الدائن: {totalCredit.toLocaleString()}
                    {journalDiff !== 0 && ` — الفرق: ${journalDiff.toLocaleString()}`}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => addJournalRow()}>
                    <Plus className="ml-1 h-4 w-4" />
                    إضافة سطر
                  </Button>
                </div>
                <div className="w-full overflow-x-auto">
                  <DataGridView
                    innerRef={gridRef}
                    style={{ height: "340px" }}
                    scheme={journalScheme}
                    dataSource={journalGridData}
                    idProperty="ser"
                    isReport={isLocked}
                    showContextMenu={false}
                    cellEditEnded={handleJournalCellEditEnded}
                    onKeyDown={handleJournalKeyDown}
                    keyActionEnter={KeyAction.None}
                    keyActionTab={KeyAction.None}
                    dontConvertToCards={true}

                  />
                </div>
              </TabsContent>

              <TabsContent value="extra-data" className="mt-4 min-h-[420px] space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div
                    className="grid gap-1.5 invoice-currency-dropdown-wrap"
                    onKeyDownCapture={createDropdownKeyHandler(salesmen, "id", form.salesman_id, (value) =>
                      onFormChange("salesman_id", value),
                    )}
                  >
                    <Label>المندوب</Label>
                    <PrimeDropdown
                      value={form.salesman_id}
                      options={salesmen}
                      optionLabel="name"
                      optionValue="id"
                      placeholder="اختر"
                      filter
                      showClear
                      disabled={isLocked}
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => onFormChange("salesman_id", e.value ?? null)}
                    />
                  </div>
                  <div
                    className="grid gap-1.5 invoice-currency-dropdown-wrap"
                    onKeyDownCapture={createDropdownKeyHandler(
                      paymentClassifications,
                      "id",
                      form.payment_classification_id,
                      (value) => onFormChange("payment_classification_id", value),
                    )}
                  >
                    <Label>تصنيف الدفعة</Label>
                    <PrimeDropdown
                      value={form.payment_classification_id}
                      options={paymentClassifications}
                      optionLabel="name"
                      optionValue="id"
                      placeholder="اختر"
                      filter
                      showClear
                      disabled={isLocked}
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => onFormChange("payment_classification_id", e.value ?? null)}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="notes" className="mt-4 min-h-[420px] space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeNoteRow(index)}>
                        ×
                      </Button>
                    </div>
                  ))}
                  {notes.length === 0 && <p className="py-4 text-center text-sm text-slate-400">لا توجد ملاحظات</p>}
                </div>
              </TabsContent>

              <TabsContent value="attachments" className="mt-4 min-h-[420px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-slate-400">
                  <Paperclip className="h-6 w-6" />
                  <p className="text-sm">رفع المرفقات غير متاح بعد في هذا الإصدار</p>
                </div>
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
          if (!open && journalSearchRow !== null) {
            focusGridCell(journalSearchRow, accountJustSelectedRef.current ? "debit" : "account_code")
            accountJustSelectedRef.current = false
          }
        }}
        accounts={accountsList}
        onSelect={(account) => {
          if (journalSearchRow !== null && checkAccountCurrencyCompatibility(account)) {
            patchJournalRow(journalSearchRow, { account_id: account.id, account_code: account.code, account_name: account.name, cost_centers: [] })
            accountJustSelectedRef.current = true
          }
        }}
      />

      <AccountCostCenters
        open={costCenterOpen}
        onOpenChange={(open) => {
          setCostCenterOpen(open)
          if (!open && costCenterRow !== null) focusGridCell(costCenterRow, "btnCostCenter")
        }}
        account={costCenterAccount}
        value={costCenterRow !== null ? journal[costCenterRow]?.cost_centers : undefined}
        onChange={(selection) => {
          if (costCenterRow !== null) patchJournalRow(costCenterRow, { cost_centers: selection })
        }}
      />

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message={isPosted ? "السند مرحل هل تريد الغاؤه منطقياً؟" : "هل تريد حذف سند القيد هذا؟"}
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
