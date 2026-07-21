"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, Trash2, Paperclip, ListPlus } from "lucide-react"
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
import DatePickerDialog from "@/components/common/date-picker-dialog"
import DataGridView from "@/components/common/DataGridView"
import { CellRange, KeyAction } from "@grapecity/wijmo.grid"
import Util from "@/components/common/Util"
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
  cheq_num: string
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
  customer_account_id: number | null
  customer_name: string
  to_account_id: number | null
  cash_amount: number | null
  cash_account_id: number | null
  check_amount: number | null
  check_account_id: number | null
  credit_card_amount: number | null
  credit_card_account_id: number | null
  amount: number
  payment_classification_id: number | null
  salesman_id: number | null
  manual_voucher: string
  manual_date: string
  note: string
  status: number
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
  salesmen?: LookupOption[]
  paymentClassifications?: LookupOption[]
  cardTypes?: CardTypeOption[]
  form: VoucherRecord
  isSaving: boolean
  showDeleteConfirm?: boolean
  onOpenChange: (open: boolean) => void
  onNew?: () => void
  onSave: () => void
  onDelete?: () => void
  onNavigateRecord?: (record: VoucherRecord) => void
  onFormChange: (field: string, value: string | number | null) => void
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

const normalizeVoucherCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9-]/g, "")
const numberValue = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value))

// FlexGrid.select(rng, show) expects a CellRange (or a row-only number) — NOT (row, columnName).
// Resolve the column's numeric index first, matching the pattern used in unified-sales-order.tsx.
const selectCell = (grid: any, row: number, colName: string) => {
  if (!grid) return
  const colIndex = grid.columns.findIndex((c: any) => c.binding === colName)
  if (colIndex >= 0) {
    grid.select(new CellRange(row, colIndex))
  }
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
  cheq_num: "",
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
  salesmen = [],
  paymentClassifications = [],
  cardTypes = [],
  form,
  isSaving,
  showDeleteConfirm = false,
  onOpenChange,
  onNew,
  onSave,
  onDelete,
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
  const [activeTab, setActiveTab] = useState("main")
  const [navLoading, setNavLoading] = useState(false)
  const [accountsList, setAccountsList] = useState<AccountItem[]>([])
  const [journalSearchOpen, setJournalSearchOpen] = useState(false)
  const [journalSearchRow, setJournalSearchRow] = useState<number | null>(null)
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [costCenterAccount, setCostCenterAccount] = useState<AccountItem | null>(null)
  const [bankSearchOpen, setBankSearchOpen] = useState(false)
  const [branchSearchOpen, setBranchSearchOpen] = useState(false)
  const [chequeSearchRow, setChequeSearchRow] = useState<number | null>(null)
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false)
  const [dueDateRow, setDueDateRow] = useState<number | null>(null)
  const chequeGridRef = useRef<any>(null)

  const isReceipt = form.vch_type === 8 // per voucher_types_tbl: 8 = سند قبض, 9 = سند صرف
  const customerLabel = isReceipt ? "المقبوض منه" : "المدفوع له"
  const customerNameLabel = isReceipt ? "اسم المقبوض منه" : "اسم المدفوع له"

  useEffect(() => {
    if (!dialogOpen || accountsList.length > 0) return
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAccountsList(Array.isArray(data) ? data.map(mapAccount) : []))
      .catch(() => setAccountsList([]))
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
    setActiveTab("main")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, isNewMode])

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

  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return
    if (showDeleteConfirm || showUnsavedConfirm) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F3") {
        event.preventDefault()
        onSave()
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
  }, [dialogOpen, form.id, onSave, onDelete, onOpenChange, guardedAction, showDeleteConfirm, showUnsavedConfirm])

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
  }, [dialogOpen, form.id])

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

  const patchJournalRow = (index: number, patch: Partial<VoucherJournalRow>) => {
    const next = journalRef.current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    journalRef.current = next
    onJournalChange(next)
  }
  const addJournalRow = () => {
    const next = [...journalRef.current, { ...emptyJournalRow }]
    journalRef.current = next
    onJournalChange(next)
  }
  const removeJournalRow = (index: number) => {
    const filtered = journalRef.current.filter((_, i) => i !== index)
    const next = filtered.length > 0 ? filtered : [{ ...emptyJournalRow }]
    journalRef.current = next
    onJournalChange(next)
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
      patchJournalRow(index, { account_id: match.id, account_code: match.code, account_name: match.name })
      if (index === 0) onFormChange("to_account_id", match.id)
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
  }

  const openJournalCostCenter = (index: number) => {
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
            setJournalSearchRow(ctx.row.index)
            setJournalSearchOpen(true)
          },
          visible: true,
        },
        { header: "اسم الحساب", name: "account_name", width: "*", minWidth: 180, isReadOnly: true },
        { header: "المبلغ", name: "amount", width: 110, dataType: "Number" },
        { header: "ملاحظات", name: "note", width: 150 },
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
          iconType: "delete",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => removeJournalRow(ctx.row.index),
          visible: true,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [journal, accountsList],
  )

  const journalGridData = useMemo(() => journal.map((row, i) => ({ ...row, ser: i + 1 })), [journal])

  const handleJournalCellEditEnded = (grid: any, e: any) => {
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

    if (e.keyCode === Util.keyboardKeys.Tab || e.keyCode === Util.keyboardKeys.Enter) {
      e.preventDefault()
      // Force the in-progress cell edit to commit (fires cellEditEnded synchronously) before we
      // read row data or move the selection — otherwise a fast Tab/Enter can move focus away
      // before the typed value round-trips into state, and it appears to "clear" on navigation.
      grid.finishEditing?.()
      grid.focus()
      if (colName === "account_code") {
        const currentRow = journal[row]
        if (currentRow?.account_id) {
          selectCell(grid, row, "amount")
        } else {
          setJournalSearchRow(row)
          setJournalSearchOpen(true)
        }
      } else if (colName === "amount") {
        selectCell(grid, row, "note")
      } else if (colName === "note" && row < journal.length - 1) {
        selectCell(grid, row + 1, "account_code")
      }
    }
  }

  // ---- الشيكات grid ----
  const cheques = form.cheques || []
  const chequesTotal = cheques.reduce((sum, row) => sum + Number(row.amount || 0), 0)

  // See journalRef above: keeps back-to-back cell commits from clobbering each other.
  const chequesRef = useRef(cheques)
  chequesRef.current = cheques

  const patchChequeRow = (index: number, patch: Partial<VoucherChequeRow>) => {
    const next = chequesRef.current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    chequesRef.current = next
    onChequesChange(next)
  }
  const addChequeRow = () => {
    const next = [...chequesRef.current, { ...emptyChequeRow }]
    chequesRef.current = next
    onChequesChange(next)
  }
  const removeChequeRow = (index: number) => {
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
        { header: "رقم الحساب", name: "bank_account", width: 120 },
        { header: "رقم الشيك", name: "cheq_num", width: 120 },
        { header: "البنك", name: "bank_no", width: 90, maxLength: 4 },
        {
          name: "btnSearchBank",
          header: " ",
          width: 45,
          buttonBody: "button",
          align: "center",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setChequeSearchRow(ctx.row.index)
            setBankSearchOpen(true)
          },
          visible: true,
        },
        { header: "اسم البنك", name: "bank_name", width: 150, isReadOnly: true },
        { header: "الفرع", name: "branch_no", width: 90, maxLength: 4 },
        {
          name: "btnSearchBranch",
          header: " ",
          width: 45,
          buttonBody: "button",
          align: "center",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setChequeSearchRow(ctx.row.index)
            setBranchSearchOpen(true)
          },
          visible: true,
        },
        { header: "اسم الفرع", name: "branch_name", width: 140, isReadOnly: true },
        { header: "يستحق في", name: "due_date", width: 110, dataType: "Date", format: "MM/dd/yyyy", isReadOnly: true },
        {
          name: "btnDueDate",
          header: " ",
          width: 45,
          buttonBody: "button",
          align: "center",
          iconType: "calendar",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setDueDateRow(ctx.row.index)
            setDueDatePickerOpen(true)
          },
          visible: true,
        },
        { header: "المبلغ", name: "amount", width: 100, dataType: "Number" },
        { header: "اسم صاحب الشيك", name: "cheq_owner_name", width: "*", minWidth: 150 },
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
    [cheques, banks, branches],
  )

  const chequeGridData = useMemo(
    () =>
      cheques.map((row, i) => ({
        ...row,
        ser: i + 1,
        due_date: row.due_date ? new Date(row.due_date) : null,
      })),
    [cheques],
  )

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
      const currentRow = cheques[row]
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
    } else if (["bank_account", "cheq_num", "cheq_owner_name"].includes(colName)) {
      patchChequeRow(row, { [colName]: value } as any)
    }
  }

  // مطابق لـ onKeyDownGridChecks في QabdVoucher.js: أرقام فقط في المبلغ، منع الأحرف العربية
  // في حقول الأكواد، وTab/Enter تنقل حسب الترتيب المنطقي وتضيف سطراً جديداً من آخر حقل.
  const handleChequeKeyDown = (grid: any, e: any) => {
    chequeGridRef.current = grid
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

    // لا يمكن تحديد الفرع قبل تحديد البنك — أي مفتاح (كتابة، F10، Tab/Enter...) يُمنع ويُنبَّه المستخدم.
    if (colName === "branch_no" && !cheques[row]?.bank_id) {
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

    if (e.keyCode === Util.keyboardKeys.Tab || e.keyCode === Util.keyboardKeys.Enter) {
      e.preventDefault()
      // Force the in-progress cell edit to commit (fires cellEditEnded synchronously) before we
      // read row data or move the selection — otherwise a fast Tab/Enter can move focus away
      // before the typed value round-trips into state, and it appears to "clear" on navigation.
      grid.finishEditing?.()
      grid.focus()
      const currentRow = cheques[row]

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
        addChequeRow()
        setTimeout(() => {
          selectCell(grid, row + 1, "bank_account")
          grid.focus()
        }, 0)
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
          className="voucher-form w-[97vw] max-w-[1850px] p-0 overflow-hidden max-h-[92vh] overflow-y-auto"
          dir="rtl"
          onPointerDownOutside={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || journalSearchOpen || costCenterOpen) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || journalSearchOpen || costCenterOpen) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || journalSearchOpen || costCenterOpen) event.preventDefault()
          }}
        >
          <UniversalToolbar
            currentRecord={currentIndex + 1}
            totalRecords={totalRecords}
            onNew={() => guardedAction(() => onNew?.())}
            onSave={onSave}
            onDelete={onDelete}
            onFirst={() => guardedAction(() => void handleNavigate("first"))}
            onPrevious={() => guardedAction(() => void handleNavigate("previous"))}
            onNext={() => guardedAction(() => void handleNavigate("next"))}
            onLast={() => guardedAction(() => void handleNavigate("last"))}
            isSaving={isSaving}
            canSave={canSave}
            canDelete={form.id > 0}
            isFirstRecord={isFirstRecord}
            isLastRecord={isLastRecord}
          />

          <div className="relative rounded-b-3xl bg-background px-6 py-6" onKeyDown={handleFormEnterAsTab}>
            <ProgressSpinner loading={isSaving || navLoading} />

            <DialogHeader className="mb-4">
              <DialogTitle className="text-xl font-semibold">
                {title} {form.id > 0 ? "" : "(مسودة)"}
              </DialogTitle>
            </DialogHeader>

            <Messages innerRef={messagesRef} />

            {/* تفاصيل السند + تفاصيل العميل */}
            <div className="grid gap-6 border-b pb-6 lg:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-500">تفاصيل السند</h4>
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
                      <Input
                        id="vch-date"
                        ref={dateInputRef}
                        type="date"
                        value={form.vch_date ? form.vch_date.slice(0, 10) : ""}
                        onChange={(e) => onFormChange("vch_date", e.target.value)}
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
                      <Input
                        id="vch-manual-date"
                        type="date"
                        value={form.manual_date ? form.manual_date.slice(0, 10) : ""}
                        onChange={(e) => onFormChange("manual_date", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-500">تفاصيل العميل</h4>
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <AutoCompleteAccount
                      label={`${customerLabel} *`}
                      valueMode="id"
                      value={numberValue(form.customer_account_id)}
                      onValueChange={(v) => onFormChange("customer_account_id", v ? Number(v) : null)}
                      onAccountSelect={(account) => {
                        if (!account) return
                        onFormChange("customer_name", account.name)
                        // مطابق لـ setAccount('customer_account') في QabdVoucher.js: يعبّئ to_account
                        // والسطر الأول في شبكة الحسابات بنفس الحساب المختار.
                        onFormChange("to_account_id", account.id)
                        setJournalFirstRowAccount({ id: account.id, code: account.code, name: account.name })
                      }}
                      searchAllowedTypeValues={[2, 3, 4, 5]}
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
                      showCostCenterButton={false}
                    />
                    <div className="grid gap-1.5">
                      <Label>الرصيد</Label>
                      <Input value="0.000" readOnly disabled />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="grid gap-1.5">
                      <Label>المبلغ *</Label>
                      <Input
                        type="number"
                        value={numberValue(form.amount)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onFormChange("amount", e.target.value ? Number(e.target.value) : 0)}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => doCalculation("amount")}
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
                            setTimeout(() => {
                              const grid = chequeGridRef.current
                              if (grid) {
                                selectCell(grid, 0, "bank_account")
                                grid.focus()
                              }
                            }, 100)
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-1.5 border-b py-4">
              <Label htmlFor="vch-note">الملاحظة</Label>
              <Input id="vch-note" value={form.note} onChange={(e) => onFormChange("note", e.target.value)} maxLength={200} />
            </div>

            {/* Tabs: الرئيسية, الشيكات, تفاصيل البطاقة, الحسابات, ملاحظات, المرفقات, الحقول الإضافية */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="pt-4">
              <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
                <TabsTrigger value="main">الرئيسية</TabsTrigger>
                <TabsTrigger value="cheques">الشيكات</TabsTrigger>
                <TabsTrigger value="card">تفاصيل البطاقة</TabsTrigger>
                <TabsTrigger value="journal">الحسابات</TabsTrigger>
                <TabsTrigger value="notes">ملاحظات</TabsTrigger>
                <TabsTrigger value="attachments">المرفقات</TabsTrigger>
                <TabsTrigger value="extra">الحقول الإضافية</TabsTrigger>
              </TabsList>

              {/* الرئيسية */}
              <TabsContent value="main" className="min-h-[420px] space-y-4 pt-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <AutoCompleteAccount
                    label="حساب الصندوق"
                    valueMode="id"
                    value={numberValue(form.cash_account_id)}
                    onValueChange={(v) => onFormChange("cash_account_id", v ? Number(v) : null)}
                    showCostCenterButton={false}
                  />
                  <AutoCompleteAccount
                    label="حساب صندوق الشيكات"
                    valueMode="id"
                    value={numberValue(form.check_account_id)}
                    onValueChange={(v) => onFormChange("check_account_id", v ? Number(v) : null)}
                    showCostCenterButton={false}
                  />
                  <AutoCompleteAccount
                    label="حساب البطاقات"
                    valueMode="id"
                    value={numberValue(form.credit_card_account_id)}
                    onValueChange={(v) => onFormChange("credit_card_account_id", v ? Number(v) : null)}
                    showCostCenterButton={false}
                  />
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
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => onFormChange("salesman_id", e.value ?? null)}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* الشيكات */}
              <TabsContent value="cheques" className="min-h-[420px] space-y-3 pt-4">
                <div className="flex items-center justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={addChequeRow}>
                    <Plus className="ml-1 h-4 w-4" />
                    إضافة شيك
                  </Button>
                </div>
                <div className="w-full max-w-full overflow-x-auto">
                  <DataGridView
                    innerRef={chequeGridRef}
                    style={{ height: "300px" }}
                    scheme={chequeScheme}
                    dataSource={chequeGridData}
                    idProperty="ser"
                    isReport={false}
                    showContextMenu={false}
                    cellEditEnded={handleChequeCellEditEnded}
                    onKeyDown={handleChequeKeyDown}
                    keyActionEnter={KeyAction.None}
                    keyActionTab={KeyAction.None}
                    dontConvertToCards={true}
                  />
                </div>
                <div className={`text-sm font-semibold ${chequesTotal === Number(form.check_amount || 0) ? "text-emerald-700" : "text-rose-600"}`}>
                  إجمالي الشيكات: {chequesTotal.toLocaleString()}
                </div>
              </TabsContent>

              {/* تفاصيل البطاقة */}
              <TabsContent value="card" className="min-h-[420px] space-y-4 pt-4">
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

              {/* الحسابات */}
              <TabsContent value="journal" className="min-h-[420px] space-y-3 pt-4">
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
                    style={{ height: "300px" }}
                    scheme={journalScheme}
                    dataSource={journalGridData}
                    idProperty="ser"
                    isReport={false}
                    showContextMenu={false}
                    cellEditEnded={handleJournalCellEditEnded}
                    onKeyDown={handleJournalKeyDown}
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
              <TabsContent value="notes" className="min-h-[420px] space-y-4 pt-4">
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
              <TabsContent value="attachments" className="min-h-[420px] pt-4">
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-slate-400">
                  <Paperclip className="h-6 w-6" />
                  <p className="text-sm">رفع المرفقات غير متاح بعد في هذا الإصدار</p>
                </div>
              </TabsContent>

              {/* الحقول الإضافية */}
              <TabsContent value="extra" className="min-h-[420px] pt-4">
                <p className="py-4 text-center text-sm text-slate-400">لا توجد حقول إضافية معرّفة لهذا النوع من السندات</p>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <AccountSearchDialog
        open={journalSearchOpen}
        onOpenChange={setJournalSearchOpen}
        accounts={accountsList}
        onSelect={(account) => {
          if (journalSearchRow !== null) {
            patchJournalRow(journalSearchRow, { account_id: account.id, account_code: account.code, account_name: account.name })
            if (journalSearchRow === 0) onFormChange("to_account_id", account.id)
          }
          setJournalSearchOpen(false)
        }}
      />

      <AccountCostCenters
        open={costCenterOpen}
        onOpenChange={setCostCenterOpen}
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
            patchChequeRow(chequeSearchRow, {
              bank_id: bank.id,
              bank_no: bank.bank_code || "",
              bank_name: bank.bank_name,
              branch_id: null,
              branch_no: "",
              branch_name: "",
            } as any)
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
            patchChequeRow(chequeSearchRow, {
              branch_id: branch.id,
              branch_no: branch.branch_code || "",
              branch_name: branch.branch_name,
            } as any)
          }
          setBranchSearchOpen(false)
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
            setTimeout(() => {
              const grid = chequeGridRef.current
              if (grid) {
                selectCell(grid, row, "amount")
                grid.focus()
              }
            }, 0)
          }
        }}
      />

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message={`هل تريد حذف هذا ${title}؟`}
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
          onSave()
        }}
        onCancel={() => {
          setShowUnsavedConfirm(false)
          const action = pendingActionRef.current
          pendingActionRef.current = null
          action?.()
        }}
        onBack={() => setShowUnsavedConfirm(false)}
      />
    </>
  )
}
