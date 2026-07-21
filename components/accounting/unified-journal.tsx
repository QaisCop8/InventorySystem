"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, ListPlus, Paperclip } from "lucide-react"
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
import AccountSearchDialog, { type AccountItem } from "@/components/customer/account-search-dialog"
import AccountCostCenters, { type JournalCostCenterSelection } from "@/components/customer/account-cost-centers"
import Util from "@/components/common/Util"
import { CellRange, KeyAction } from "@grapecity/wijmo.grid"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"

const voucherTabTriggerClass =
  "data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md"

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
  onSave: () => void
  onDelete?: () => void
  onClone?: () => void
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
  if (!grid) return
  const colIndex = grid.columns.findIndex((c: any) => c.binding === colName)
  if (colIndex >= 0) grid.select(new CellRange(row, colIndex))
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

// السماح بالـ Enter للتنقّل كـ Tab بين حقول الرأس (خارج شبكة الحسابات، التي لها منطقها الخاص).
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
  onDelete,
  onClone,
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
  const [activeTab, setActiveTab] = useState("journal")
  const [navLoading, setNavLoading] = useState(false)
  const [accountsList, setAccountsList] = useState<AccountItem[]>([])
  const [journalSearchOpen, setJournalSearchOpen] = useState(false)
  const [journalSearchRow, setJournalSearchRow] = useState<number | null>(null)
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [costCenterAccount, setCostCenterAccount] = useState<AccountItem | null>(null)
  const [costCenterRow, setCostCenterRow] = useState<number | null>(null)
  const gridRef = useRef<any>(null)
  const accountsListRef = useRef<AccountItem[]>([])
  const accountsFetchRef = useRef<Promise<AccountItem[]> | null>(null)

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
        else guardedAction(() => onOpenChange(false))
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [dialogOpen, form.id, onSave, onDelete, onOpenChange, guardedAction, showDeleteConfirm, showUnsavedConfirm])

  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return
    const t = setTimeout(() => dateInputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [dialogOpen, form.id])

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

  const patchJournalRow = (index: number, patch: Partial<JournalEntryRow>) => {
    const next = journalRef.current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    journalRef.current = next
    onJournalChange(next)
  }
  const addJournalRow = () => {
    const next = [...journalRef.current, { ...emptyJournalRow }]
    journalRef.current = next
    onJournalChange(next)
    return next
  }
  const deleteJournalRow = (index: number) => {
    const filtered = journalRef.current.filter((_, i) => i !== index)
    const next = filtered.length > 0 ? filtered : [{ ...emptyJournalRow }]
    journalRef.current = next
    onJournalChange(next)
  }

  const resolveJournalAccountByCode = async (index: number, rawCode: string) => {
    const code = adjustAccountCode(rawCode)
    if (!code) {
      patchJournalRow(index, { account_id: null, account_code: "", account_name: "", cost_centers: [] })
      return
    }
    const list = await ensureAccountsLoaded()
    const match = list.find((a) => a.code.toUpperCase() === code)
    if (match) {
      patchJournalRow(index, { account_id: match.id, account_code: match.code, account_name: match.name, cost_centers: [] })
    } else {
      patchJournalRow(index, { account_id: null, account_code: code, account_name: "" })
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: `لا يوجد حساب بهذا الرقم: ${code}`, life: 3000 }])
    }
  }

  const openJournalCostCenter = (index: number) => {
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

  const validateRowForNewRow = (index: number): boolean => {
    const row = journalRef.current[index]
    if (!row?.account_id) {
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "يجب تحديد رقم الحساب قبل إضافة سطر جديد", life: 3000 }])
      return false
    }
    if (!(Number(row.debit || 0) > 0) && !(Number(row.credit || 0) > 0)) {
      messagesRef.current?.show?.([{ severity: "error", summary: "", detail: "يجب إدخال مبلغ مدين أو دائن قبل إضافة سطر جديد", life: 3000 }])
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
        { header: "رقم الحساب", name: "account_code", width: 130, minWidth: 110 },
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
          title: "حذف السطر",
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

    if (e.key === "Tab" || e.key === "Enter") {
      const isLastRow = row === journalRef.current.length - 1
      if (colName === "account_code") {
        e.preventDefault()
        const code = journalRef.current[row]?.account_code?.trim()
        if (code) selectCell(grid, row, "debit")
        else {
          setJournalSearchRow(row)
          setJournalSearchOpen(true)
        }
      } else if (colName === "debit") {
        e.preventDefault()
        selectCell(grid, row, "credit")
      } else if (colName === "credit") {
        e.preventDefault()
        selectCell(grid, row, "note")
      } else if (colName === "note") {
        e.preventDefault()
        if (isLastRow) {
          if (validateRowForNewRow(row)) {
            addJournalRow()
            setTimeout(() => {
              grid.focus()
              selectCell(grid, row + 1, "account_code")
            }, 0)
          }
        } else {
          selectCell(grid, row + 1, "account_code")
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
            if (showUnsavedConfirm || showDeleteConfirm || journalSearchOpen || costCenterOpen) event.preventDefault()
          }}
        >
          <UniversalToolbar
            currentRecord={currentIndex + 1}
            totalRecords={totalRecords}
            onNew={() => guardedAction(() => onNew?.())}
            onSave={onSave}
            onDelete={onDelete}
            onClone={onClone}
            onFirst={() => guardedAction(() => void handleNavigate("first"))}
            onPrevious={() => guardedAction(() => void handleNavigate("previous"))}
            onNext={() => guardedAction(() => void handleNavigate("next"))}
            onLast={() => guardedAction(() => void handleNavigate("last"))}
            isSaving={isSaving}
            canSave={canSave}
            canDelete={form.id > 0}
            canClone={form.id > 0}
            isFirstRecord={isFirstRecord}
            isLastRecord={isLastRecord}
          />

          <div className="relative rounded-b-3xl bg-background px-6 py-6" onKeyDown={handleFormEnterAsTab}>
            <ProgressSpinner loading={isSaving || navLoading} />

            <DialogHeader className="mb-4">
              <DialogTitle className="text-xl font-semibold">
                سند قيد {form.id > 0 ? "" : "(مسودة)"}
              </DialogTitle>
            </DialogHeader>

            <Messages innerRef={messagesRef} />

            <div className="grid gap-3 border-b pb-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-1.5">
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

              <div className="grid gap-4 md:grid-cols-3">
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
                  <Input
                    id="manual-date"
                    type="date"
                    value={form.manual_date ? form.manual_date.slice(0, 10) : ""}
                    onChange={(e) => onFormChange("manual_date", e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5 md:col-span-2">
                  <Label htmlFor="vch-note">الملاحظة</Label>
                  <Input id="vch-note" value={form.note} onChange={(e) => onFormChange("note", e.target.value)} maxLength={200} />
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

              <TabsContent value="journal" className="min-h-[420px] space-y-3 pt-4">
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
                    ref={gridRef}
                    style={{ height: "340px" }}
                    scheme={journalScheme}
                    dataSource={journalGridData}
                    idProperty="ser"
                    isReport={false}
                    showContextMenu={false}
                    cellEditEnded={handleJournalCellEditEnded}
                    onKeyDown={handleJournalKeyDown}
                    keyActionEnter={KeyAction.None}
                    dontConvertToCards={true}
                  />
                </div>
              </TabsContent>

              <TabsContent value="extra-data" className="min-h-[420px] space-y-4 pt-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                    <Label>المندوب</Label>
                    <PrimeDropdown
                      value={form.salesman_id}
                      options={salesmen}
                      optionLabel="name"
                      optionValue="id"
                      placeholder="اختر"
                      filter
                      showClear
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => onFormChange("salesman_id", e.value ?? null)}
                    />
                  </div>
                  <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                    <Label>تصنيف الدفعة</Label>
                    <PrimeDropdown
                      value={form.payment_classification_id}
                      options={paymentClassifications}
                      optionLabel="name"
                      optionValue="id"
                      placeholder="اختر"
                      filter
                      showClear
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => onFormChange("payment_classification_id", e.value ?? null)}
                    />
                  </div>
                </div>
              </TabsContent>

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
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeNoteRow(index)}>
                        ×
                      </Button>
                    </div>
                  ))}
                  {notes.length === 0 && <p className="py-4 text-center text-sm text-slate-400">لا توجد ملاحظات</p>}
                </div>
              </TabsContent>

              <TabsContent value="attachments" className="min-h-[420px] pt-4">
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-slate-400">
                  <Paperclip className="h-6 w-6" />
                  <p className="text-sm">رفع المرفقات غير متاح بعد في هذا الإصدار</p>
                </div>
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
            patchJournalRow(journalSearchRow, { account_id: account.id, account_code: account.code, account_name: account.name, cost_centers: [] })
          }
          setJournalSearchOpen(false)
        }}
      />

      <AccountCostCenters
        open={costCenterOpen}
        onOpenChange={setCostCenterOpen}
        account={costCenterAccount}
        value={costCenterRow !== null ? journal[costCenterRow]?.cost_centers : undefined}
        onChange={(selection) => {
          if (costCenterRow !== null) patchJournalRow(costCenterRow, { cost_centers: selection })
        }}
      />

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message="هل تريد حذف سند القيد هذا؟"
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
