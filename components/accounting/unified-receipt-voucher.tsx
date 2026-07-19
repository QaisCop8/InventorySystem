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
  cardTypes?: LookupOption[]
  form: VoucherRecord
  isSaving: boolean
  showDeleteConfirm?: boolean
  onOpenChange: (open: boolean) => void
  onNew?: () => void
  onSave: () => void
  onDelete?: () => void
  onNavigateRecord?: (record: VoucherRecord) => void
  onFormChange: (field: string, value: string | number | null) => void
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
}

const CHEQUE_FIELD_ORDER = ["bank_account", "cheq_num", "bank_no", "branch_no", "due_date", "amount", "cheq_owner_name"]
const CARD_FIELD_ORDER = ["card_type_name", "card_no", "account_code", "expire_date", "amount", "bank_amount"]

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
  const codeInputRef = useRef<HTMLInputElement | null>(null)
  const messagesRef = useRef<any>(null)
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
  const [cardSearchOpen, setCardSearchOpen] = useState(false)
  const [cardSearchRow, setCardSearchRow] = useState<number | null>(null)
  const [cardExpireDatePickerOpen, setCardExpireDatePickerOpen] = useState(false)
  const [cardExpireDateRow, setCardExpireDateRow] = useState<number | null>(null)
  const cardGridRef = useRef<any>(null)

  const isReceipt = form.vch_type === 1
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
        if (form.id > 0) onDelete?.()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [dialogOpen, form.id, onSave, onDelete, showDeleteConfirm, showUnsavedConfirm])

  const currencyOptions = useMemo(
    () =>
      currencies.map((c) => ({
        label: c.currency_name || c.currency_code || "غير محدد",
        value: Number(c.currency_id ?? c.id),
      })),
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

  useEffect(() => {
    if (typeof window === "undefined") return
    if (isNewMode && dialogOpen) {
      const t = setTimeout(() => codeInputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [isNewMode, dialogOpen])

  const totalAmount = Number(form.amount || 0)

  // ---- الحسابات (journal / counter-account) grid ----
  const journal = form.journal || []
  const journalTotal = journal.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const journalDiff = Math.round((totalAmount - journalTotal) * 100) / 100

  const patchJournalRow = (index: number, patch: Partial<VoucherJournalRow>) => {
    onJournalChange(journal.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  const addJournalRow = () => onJournalChange([...journal, { ...emptyJournalRow }])
  const removeJournalRow = (index: number) => {
    const next = journal.filter((_, i) => i !== index)
    onJournalChange(next.length > 0 ? next : [{ ...emptyJournalRow }])
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
    const next = journal.length > 0 ? [...journal] : [{ ...emptyJournalRow }]
    next[0] = { ...next[0], account_id: account.id, account_code: account.code, account_name: account.name }
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

  const patchChequeRow = (index: number, patch: Partial<VoucherChequeRow>) => {
    onChequesChange(cheques.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  const addChequeRow = () => onChequesChange([...cheques, { ...emptyChequeRow }])
  const removeChequeRow = (index: number) => {
    const next = cheques.filter((_, i) => i !== index)
    onChequesChange(next.length > 0 ? next : [{ ...emptyChequeRow }])
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
        { header: "البنك", name: "bank_no", width: 90 },
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
        { header: "الفرع", name: "branch_no", width: 90 },
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
        { header: "اسم صاحب الشيك", name: "cheq_owner_name", width: 150 },
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
      const code = String(value ?? "").trim()
      const bank = banks.find((b) => String(b.bank_code || "").trim() === code)
      patchChequeRow(row, { bank_no: code, bank_id: bank?.id ?? null, bank_name: bank?.bank_name || "", branch_id: null, branch_no: "", branch_name: "" } as any)
      if (code && !bank) {
        setChequeSearchRow(row)
        setBankSearchOpen(true)
      }
    } else if (colName === "branch_no") {
      const code = String(value ?? "").trim()
      const currentRow = cheques[row]
      const branch = branches.find((b) => String(b.branch_code || "").trim() === code && (!currentRow?.bank_id || b.bank_id === (currentRow as any).bank_id))
      patchChequeRow(row, { branch_no: code, branch_id: branch?.id ?? null, branch_name: branch?.branch_name || "" } as any)
      if (code && !branch) {
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

    if (["bank_account", "cheq_num", "bank_no", "branch_no"].includes(colName)) {
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

  // ---- تفاصيل البطاقة ----
  const cards = form.cards || []
  const cardsTotal = cards.reduce((sum, row) => sum + Number(row.amount || 0), 0)

  const patchCardRow = (index: number, patch: Partial<VoucherCardRow>) => {
    onCardsChange(cards.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  const addCardRow = () => onCardsChange([...cards, { ...emptyCardRow }])
  const removeCardRow = (index: number) => {
    const next = cards.filter((_, i) => i !== index)
    onCardsChange(next.length > 0 ? next : [{ ...emptyCardRow }])
  }

  const resolveCardType = (index: number, rawName: string) => {
    const name = rawName.trim()
    if (!name) {
      patchCardRow(index, { card_type_id: null, card_type_name: "" })
      return
    }
    const match = cardTypes.find((t) => t.name.trim() === name)
    if (match) {
      patchCardRow(index, { card_type_id: match.id, card_type_name: match.name })
    } else {
      patchCardRow(index, { card_type_id: null, card_type_name: name })
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: `لا يوجد نوع بطاقة بهذا الاسم: ${name}`, life: 3000 }])
    }
  }

  const resolveCardAccountByCode = (index: number, rawCode: string) => {
    const code = rawCode.trim().toUpperCase()
    if (!code) {
      patchCardRow(index, { account_id: null, account_code: "", account_name: "" })
      return
    }
    const match = accountsList.find((a) => a.code.toUpperCase() === code)
    if (match) {
      patchCardRow(index, { account_id: match.id, account_code: match.code, account_name: match.name })
    } else {
      patchCardRow(index, { account_id: null, account_code: code, account_name: "" })
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: `لا يوجد حساب بهذا الرقم: ${code}`, life: 3000 }])
    }
  }

  const cardScheme = useMemo(
    () => ({
      name: "VoucherCardScheme",
      filter: false,
      showFooter: false,
      sortable: false,
      columns: [
        { header: "#", name: "ser", width: 50, isReadOnly: true },
        { header: "نوع البطاقة", name: "card_type_name", width: 130 },
        { header: "رقم البطاقة", name: "card_no", width: 150 },
        { header: "رقم الحساب", name: "account_code", width: 120 },
        {
          name: "btnSearchAccount",
          header: " ",
          width: 45,
          buttonBody: "button",
          align: "center",
          iconType: "search",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setCardSearchRow(ctx.row.index)
            setCardSearchOpen(true)
          },
          visible: true,
        },
        { header: "اسم الحساب", name: "account_name", width: 160, isReadOnly: true },
        { header: "تاريخ الانتهاء", name: "expire_date", width: 110, dataType: "Date", format: "MM/dd/yyyy", isReadOnly: true },
        {
          name: "btnExpireDate",
          header: " ",
          width: 45,
          buttonBody: "button",
          align: "center",
          iconType: "calendar",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => {
            setCardExpireDateRow(ctx.row.index)
            setCardExpireDatePickerOpen(true)
          },
          visible: true,
        },
        { header: "المبلغ", name: "amount", width: 100, dataType: "Number" },
        { header: "عمولة البنك", name: "bank_amount", width: 100, dataType: "Number" },
        {
          name: "btnDelete",
          header: " ",
          width: 50,
          buttonBody: "button",
          align: "center",
          iconType: "delete",
          isReadOnly: true,
          onClick: (e: any, ctx: any) => removeCardRow(ctx.row.index),
          visible: true,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, cardTypes, accountsList],
  )

  const cardGridData = useMemo(
    () =>
      cards.map((row, i) => ({
        ...row,
        ser: i + 1,
        expire_date: row.expire_date ? new Date(row.expire_date) : null,
      })),
    [cards],
  )

  const handleCardCellEditEnded = (grid: any, e: any) => {
    cardGridRef.current = grid
    const row = e.row
    const colName = grid?.columns?.[e.col]?.binding
    const value = grid.getCellData(row, e.col, false)

    if (colName === "card_type_name") {
      resolveCardType(row, String(value ?? ""))
    } else if (colName === "account_code") {
      resolveCardAccountByCode(row, String(value ?? ""))
    } else if (colName === "amount" || colName === "bank_amount") {
      patchCardRow(row, { [colName]: value === "" || value === null ? null : Number(value) } as any)
    } else if (colName === "card_no") {
      patchCardRow(row, { card_no: String(value ?? "") })
    }
  }

  const handleCardKeyDown = (grid: any, e: any) => {
    cardGridRef.current = grid
    if (!grid || !grid.selection) return
    const row = grid.selection.row
    const col = grid.selection.col
    if (row < 0 || col < 0) return
    const colName = grid.columns[col]?.binding

    if ((colName === "amount" || colName === "bank_amount") && e.key && e.key.length === 1 && !/[0-9.]/.test(e.key)) {
      e.preventDefault()
      return
    }

    if (e.keyCode === Util.keyboardKeys.F10) {
      if (colName === "account_code") {
        e.preventDefault()
        setCardSearchRow(row)
        setCardSearchOpen(true)
        return
      }
      if (colName === "expire_date") {
        e.preventDefault()
        setCardExpireDateRow(row)
        setCardExpireDatePickerOpen(true)
        return
      }
    }

    if (e.keyCode === Util.keyboardKeys.Tab || e.keyCode === Util.keyboardKeys.Enter) {
      e.preventDefault()
      grid.focus()
      const currentRow = cards[row]

      if (colName === "account_code") {
        if (!currentRow?.account_id) {
          setCardSearchRow(row)
          setCardSearchOpen(true)
          return
        }
        selectCell(grid, row, "expire_date")
        return
      }
      if (colName === "expire_date") {
        if (!currentRow?.expire_date) {
          setCardExpireDateRow(row)
          setCardExpireDatePickerOpen(true)
          return
        }
        selectCell(grid, row, "amount")
        return
      }

      if (colName === "bank_amount") {
        addCardRow()
        setTimeout(() => {
          selectCell(grid, row + 1, "card_type_name")
          grid.focus()
        }, 0)
        return
      }

      const idx = CARD_FIELD_ORDER.indexOf(colName)
      if (idx >= 0 && idx < CARD_FIELD_ORDER.length - 1) {
        selectCell(grid, row, CARD_FIELD_ORDER[idx + 1])
      }
    }
  }

  // ---- ملاحظات ----
  const notes = form.notes || []
  const updateNoteRow = (index: number, value: string) => onNotesChange(notes.map((row, i) => (i === index ? { note: value } : row)))
  const addNoteRow = () => onNotesChange([...notes, { note: "" }])
  const removeNoteRow = (index: number) => onNotesChange(notes.filter((_, i) => i !== index))

  const gridStyle = { maxHeight: "260px" }

  return (
    <>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? onOpenChange(open) : guardedAction(() => onOpenChange(false)))}
      >
        <DialogContent
          className="w-[97vw] max-w-[1850px] p-0 overflow-hidden max-h-[92vh] overflow-y-auto"
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

          <div className="relative rounded-b-3xl bg-background px-6 py-6">
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>دفتر السندات *</Label>
                    <select
                      value={form.vch_book_id ?? ""}
                      onChange={(e) => onFormChange("vch_book_id", e.target.value ? Number(e.target.value) : null)}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">اختر</option>
                      {voucherBooks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="vch-code">رقم السند *</Label>
                    <Input
                      id="vch-code"
                      ref={codeInputRef}
                      value={form.vch_code}
                      onChange={(e) => onFormChange("vch_code", normalizeVoucherCode(e.target.value))}
                      maxLength={20}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="vch-date">تاريخ السند *</Label>
                    <Input
                      id="vch-date"
                      type="date"
                      value={form.vch_date ? form.vch_date.slice(0, 10) : ""}
                      onChange={(e) => onFormChange("vch_date", e.target.value)}
                    />
                  </div>
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
                      onChange={(e: any) => onFormChange("currency_id", e.value ?? null)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="vch-rate">سعر الصرف *</Label>
                    <Input
                      id="vch-rate"
                      type="number"
                      value={numberValue(form.rate)}
                      onChange={(e) => onFormChange("rate", e.target.value ? Number(e.target.value) : 1)}
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
                  <div className="col-span-2 grid gap-1.5">
                    <Label htmlFor="vch-manual-code">سند يدوي</Label>
                    <Input
                      id="vch-manual-code"
                      value={form.manual_voucher}
                      onChange={(e) => onFormChange("manual_voucher", e.target.value)}
                      maxLength={30}
                    />
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
                  <div className="grid grid-cols-4 gap-2">
                    <div className="grid gap-1.5">
                      <Label>المبلغ *</Label>
                      <Input
                        type="number"
                        value={numberValue(form.amount)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onFormChange("amount", e.target.value ? Number(e.target.value) : 0)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>نقدي</Label>
                      <Input
                        type="number"
                        value={numberValue(form.cash_amount)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onFormChange("cash_amount", e.target.value ? Number(e.target.value) : null)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>بطاقات</Label>
                      <Input
                        type="number"
                        value={numberValue(form.credit_card_amount)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onFormChange("credit_card_amount", e.target.value ? Number(e.target.value) : null)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>شيكات</Label>
                      <Input
                        type="number"
                        value={numberValue(form.check_amount)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onFormChange("check_amount", e.target.value ? Number(e.target.value) : null)}
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
            <Tabs defaultValue="main" className="pt-4">
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
              <TabsContent value="main" className="space-y-4 pt-4">
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
                  <div className="grid gap-1.5">
                    <Label>تصنيف الدفعة</Label>
                    <select
                      value={form.payment_classification_id ?? ""}
                      onChange={(e) => onFormChange("payment_classification_id", e.target.value ? Number(e.target.value) : null)}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">اختر</option>
                      {paymentClassifications.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>مندوب المبيعات</Label>
                    <select
                      value={form.salesman_id ?? ""}
                      onChange={(e) => onFormChange("salesman_id", e.target.value ? Number(e.target.value) : null)}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">اختر</option>
                      {salesmen.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </TabsContent>

              {/* الشيكات */}
              <TabsContent value="cheques" className="space-y-3 pt-4">
                <div className="flex items-center justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={addChequeRow}>
                    <Plus className="ml-1 h-4 w-4" />
                    إضافة شيك
                  </Button>
                </div>
                <div dir="rtl" className="modernVoucherGrid w-full max-w-full overflow-x-auto rounded-lg border border-slate-200" style={{ maxHeight: 300 }}>
                  <div dir="rtl" style={{ minWidth: 1700, maxHeight: 260, overflowY: "auto" }}>
                    <DataGridView
                      dir="rtl"
                      style={{ ...gridStyle, width: 1700 }}
                      scheme={chequeScheme}
                      dataSource={chequeGridData}
                      idProperty="ser"
                      theme="default-light"
                      isReport={false}
                      showContextMenu={false}
                      cellEditEnded={handleChequeCellEditEnded}
                      onKeyDown={handleChequeKeyDown}
                      keyActionEnter={KeyAction.None}
                      keyActionTab={KeyAction.None}
                      columnHeaderHeight={42}
                      defaultRowHeight={38}
                      dontConvertToCards={true}
                    />
                  </div>
                </div>
                <div className={`text-sm font-semibold ${chequesTotal === Number(form.check_amount || 0) ? "text-emerald-700" : "text-rose-600"}`}>
                  إجمالي الشيكات: {chequesTotal.toLocaleString()}
                </div>
              </TabsContent>

              {/* تفاصيل البطاقة */}
              <TabsContent value="card" className="space-y-3 pt-4">
                <div className="flex items-center justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={addCardRow}>
                    <Plus className="ml-1 h-4 w-4" />
                    إضافة بطاقة
                  </Button>
                </div>
                <div dir="rtl" className="modernVoucherGrid w-full max-w-full overflow-x-auto rounded-lg border border-slate-200" style={{ maxHeight: 300 }}>
                  <div dir="rtl" style={{ minWidth: 1150, maxHeight: 260, overflowY: "auto" }}>
                    <DataGridView
                      dir="rtl"
                      style={{ ...gridStyle, width: 1150 }}
                      scheme={cardScheme}
                      dataSource={cardGridData}
                      idProperty="ser"
                      theme="default-light"
                      isReport={false}
                      showContextMenu={false}
                      cellEditEnded={handleCardCellEditEnded}
                      onKeyDown={handleCardKeyDown}
                      keyActionEnter={KeyAction.None}
                      keyActionTab={KeyAction.None}
                      columnHeaderHeight={42}
                      defaultRowHeight={38}
                      dontConvertToCards={true}
                    />
                  </div>
                </div>
                <div className={`text-sm font-semibold ${cardsTotal === Number(form.credit_card_amount || 0) ? "text-emerald-700" : "text-rose-600"}`}>
                  إجمالي البطاقات: {cardsTotal.toLocaleString()}
                </div>
              </TabsContent>

              {/* الحسابات */}
              <TabsContent value="journal" className="space-y-3 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    تُستخدم عند توزيع مبلغ السند على أكثر من حساب مقابل بدلاً من حقل "على حساب" وحده. اختيار حساب يفعّل زر مراكز التكلفة الخاص به.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={addJournalRow}>
                    <Plus className="ml-1 h-4 w-4" />
                    إضافة سطر
                  </Button>
                </div>
                <div dir="rtl" className="modernVoucherGrid w-full max-w-full overflow-x-auto rounded-lg border border-slate-200" style={{ maxHeight: 300 }}>
                  <div dir="rtl" style={{ minWidth: 950, maxHeight: 260, overflowY: "auto" }}>
                    <DataGridView
                      dir="rtl"
                      style={{ ...gridStyle, width: 950 }}
                      scheme={journalScheme}
                      dataSource={journalGridData}
                      idProperty="ser"
                      theme="default-light"
                      isReport={false}
                      showContextMenu={false}
                      cellEditEnded={handleJournalCellEditEnded}
                      onKeyDown={handleJournalKeyDown}
                      keyActionEnter={KeyAction.None}
                      keyActionTab={KeyAction.None}
                      columnHeaderHeight={42}
                      defaultRowHeight={38}
                      dontConvertToCards={true}
                    />
                  </div>
                </div>
                <div className={`text-sm font-semibold ${journalDiff === 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  إجمالي الحسابات: {journalTotal.toLocaleString()}
                  {journalDiff !== 0 && journalTotal > 0 && ` — الفرق عن المبلغ الإجمالي: ${journalDiff.toLocaleString()}`}
                </div>
              </TabsContent>

              {/* ملاحظات */}
              <TabsContent value="notes" className="space-y-4 pt-4">
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
              <TabsContent value="attachments" className="pt-4">
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-slate-400">
                  <Paperclip className="h-6 w-6" />
                  <p className="text-sm">رفع المرفقات غير متاح بعد في هذا الإصدار</p>
                </div>
              </TabsContent>

              {/* الحقول الإضافية */}
              <TabsContent value="extra" className="pt-4">
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

      <AccountSearchDialog
        open={cardSearchOpen}
        onOpenChange={setCardSearchOpen}
        accounts={accountsList}
        onSelect={(account) => {
          if (cardSearchRow !== null) {
            patchCardRow(cardSearchRow, { account_id: account.id, account_code: account.code, account_name: account.name })
          }
          setCardSearchOpen(false)
        }}
      />

      <DatePickerDialog
        open={cardExpireDatePickerOpen}
        onOpenChange={setCardExpireDatePickerOpen}
        value={cardExpireDateRow !== null ? cards[cardExpireDateRow]?.expire_date : null}
        title="تاريخ انتهاء البطاقة"
        onSelect={(isoDate) => {
          if (cardExpireDateRow !== null) {
            const row = cardExpireDateRow
            patchCardRow(row, { expire_date: isoDate })
            setTimeout(() => {
              const grid = cardGridRef.current
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
