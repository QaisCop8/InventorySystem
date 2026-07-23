"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { FileText, User, Percent, Users2, MessageSquare, Wallet } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import Messages from "@/components/common/Messages"
import ProgressSpinner from "@/components/ProgressSpinner/ProgressSpinner"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import type { JournalCostCenterSelection } from "@/components/customer/account-cost-centers"
import DateTimeControl from "@/components/common/date-time-control"
import PostVoucherDialog, { type PostVoucherAction } from "@/components/common/post-voucher-dialog"
import { useToast } from "@/hooks/use-toast"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"

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
  account_cost_centers?: JournalCostCenterSelection[]
  debit_account_id: number | null
  debit_account_cost_centers?: JournalCostCenterSelection[]
  vat_account_id: number | null
  vat_account_cost_centers?: JournalCostCenterSelection[]
  amount_journal_type_8: number | null
  vat_percent: number
  vat: number | null
  amount: number
  payment_classification_id: number | null
  salesman_id: number | null
  manual_voucher: string
  manual_date: string
  note: string
  status: number
  is_printed?: number
  account_code?: string
  account_name?: string
  debit_account_code?: string
  debit_account_name?: string
  vat_account_code?: string
  vat_account_name?: string
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

interface UnifiedCreditNoteProps {
  title: string
  dialogOpen: boolean
  currentIndex: number
  totalRecords: number
  currencies?: CurrencyOption[]
  voucherBooks?: LookupOption[]
  salesmen?: LookupOption[]
  paymentClassifications?: LookupOption[]
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

const blockNonNumericKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
  const controlKeys = ["Backspace", "Delete", "Tab", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]
  if (e.ctrlKey || e.metaKey || e.altKey || controlKeys.includes(e.key)) return
  if (e.key.length === 1 && !/[0-9.]/.test(e.key)) {
    e.preventDefault()
  }
}

export default function UnifiedCreditNote({
  title,
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
  onConfirmDelete = () => undefined,
  onCancelDelete = () => undefined,
  canSave,
  isFirstRecord,
  isLastRecord,
  isNewMode,
  errorMessages = [],
}: UnifiedCreditNoteProps) {
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const messagesRef = useRef<any>(null)
  const { toast } = useToast()
  const [navLoading, setNavLoading] = useState(false)
  const [postDialogOpen, setPostDialogOpen] = useState(false)

  const isCreditNote = form.vch_type === 10 // per credit-notes/_lib.ts: 10 = اشعار دائن, 11 = اشعار مدين
  // سند مُرحَّل (status=2): مقفل بالكامل، لا يُعدَّل إلا عبر إلغائه منطقياً (زر حذف).
  const isLocked = form.status === 2 || form.status === 3
  const statusBadge =
    form.status === 3 ? "ملغي منطقياً" : form.status === 2 ? (form.is_printed === 1 ? "مرحل - مطبوع" : "مرحل") : ""

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

  const handleCodeBlur = async () => {
    const raw = form.vch_code.trim()
    if (!raw) return
    try {
      const query = new URLSearchParams({ vch_type: String(form.vch_type), raw })
      if (form.vch_book_id) query.set("vch_book_id", String(form.vch_book_id))
      const response = await fetch(`/api/credit-notes/resolve-code?${query.toString()}`)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, isLocked, onDelete, onOpenChange, showDeleteConfirm, showUnsavedConfirm])

  const currencyOptions = useMemo(
    () =>
      currencies.map((c) => ({
        label: c.currency_name || c.currency_code || "غير محدد",
        value: Number(c.currency_id ?? c.id),
      })),
    [currencies],
  )

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

      const response = await fetch(`/api/credit-notes/navigation/${effectiveDirection}?${query.toString()}`)
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
    if (typeof window === "undefined" || !dialogOpen) return
    const t = setTimeout(() => dateInputRef.current?.focus(), 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, form.vch_code, isNewMode])

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

  // مطابق لـ doCalclation في CreditNote.js: المجموع = المبلغ / (1 + نسبة الضريبة%)، والضريبة =
  // المجموع - المبلغ. تُعاد الحسابات الثلاثة تبادلياً حسب الحقل الذي غادره المستخدم (blur).
  const doCalculation = (type: "amount" | "amount_journal_type_8" | "vat") => {
    const amount = Number(form.amount || 0)
    const amountNet = Number(form.amount_journal_type_8 || 0)
    const vat = Number(form.vat || 0)
    const vatPercent = Number(form.vat_percent || 0)

    switch (type) {
      case "amount": {
        let calcNet = 0
        let calcVat = 0
        if (amount > 0) {
          calcNet = amount / (1 + vatPercent / 100)
          calcVat = amount - calcNet
        }
        onFormChange("amount_journal_type_8", calcNet)
        onFormChange("vat", calcVat)
        break
      }
      case "amount_journal_type_8": {
        let calcVat = 0
        let calcAmount = 0
        if (amountNet > 0) {
          calcVat = amountNet * (vatPercent / 100)
          calcAmount = amountNet + calcVat
        }
        onFormChange("amount", calcAmount)
        onFormChange("vat", calcVat)
        break
      }
      case "vat": {
        if (!vatPercent) break
        let calcNet = 0
        let calcAmount = amount
        if (vat >= 0) {
          calcNet = vat / (vatPercent / 100)
          calcAmount = calcNet + vat
        }
        onFormChange("amount", calcAmount)
        onFormChange("amount_journal_type_8", calcNet)
        break
      }
    }
  }

  // Enter يتصرف كـ Tab عبر كل حقول النموذج، بدل إرسال الفورم أو أي سلوك افتراضي آخر — إذا كانت
  // قائمة Prime Dropdown مفتوحة فعلاً (تصفّح بالأسهم/اختيار بالـ Enter) نترك سلوكها الافتراضي.
  const handleFormEnterAsTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return
    const target = event.target as HTMLElement
    if (target.closest(".p-dropdown-panel")) return
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null)

    const currentIndex = focusable.indexOf(target)
    if (currentIndex === -1) return
    event.preventDefault()
    focusable[currentIndex + 1]?.focus()
  }

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? onOpenChange(open) : guardedAction(() => onOpenChange(false)))}>
        <DialogContent
          className="voucher-form w-[97vw] max-w-[1400px] p-0 overflow-hidden max-h-[92vh] overflow-y-auto"
          dir="rtl"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || postDialogOpen) event.preventDefault()
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

          <div className="relative rounded-b-3xl bg-slate-50/60 px-6 py-6" onKeyDown={handleFormEnterAsTab}>
            <ProgressSpinner loading={isSaving || navLoading} />

            <DialogHeader className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-l from-emerald-600 via-emerald-600 to-teal-600 px-5 py-4 shadow-lg">
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
              <div className="grid gap-4 lg:grid-cols-2">
                {/* تفاصيل السند */}
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
                          className="focus-visible:border-emerald-400 focus-visible:ring-emerald-100"
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
                          className="focus-visible:border-emerald-400 focus-visible:ring-emerald-100"
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
                          className="focus-visible:border-emerald-400 focus-visible:ring-emerald-100"
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

                {/* تفاصيل العميل */}
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
                        label="العميل *"
                        valueMode="id"
                        value={numberValue(form.account_id)}
                        onValueChange={(v) => onFormChange("account_id", v ? Number(v) : null)}
                        onAccountSelect={(account) => account && onFormChange("customer_name", account.name)}
                        costCenters={form.account_cost_centers}
                        onCostCentersChange={(selection) => onFormChange("account_cost_centers", selection)}
                        requiredTypeValues={[2, 3, 5]}
                        notFoundMessage="العميل المحدد غير موجود"
                        disabled={isLocked}
                      />
                      <div className="grid gap-1.5">
                        <Label>الرصيد</Label>
                        <Input value="0.000" readOnly disabled className="bg-slate-50" />
                      </div>
                    </div>
                    <div className="grid gap-3">
                      <AutoCompleteAccount
                        label={isCreditNote ? "الحساب المدين *" : "الحساب الدائن *"}
                        valueMode="id"
                        value={numberValue(form.debit_account_id)}
                        onValueChange={(v) => onFormChange("debit_account_id", v ? Number(v) : null)}
                        costCenters={form.debit_account_cost_centers}
                        onCostCentersChange={(selection) => onFormChange("debit_account_cost_centers", selection)}
                        requiredTypeValues={[1]}
                        notFoundMessage="الحساب غير موجود"
                        disabled={isLocked}
                      />
                      <div className="grid gap-1.5">
                        <Label htmlFor="vat-percent">نسبة الضريبة % *</Label>
                        <Input
                          id="vat-percent"
                          type="number"
                          value={numberValue(form.vat_percent)}
                          onKeyDown={blockNonNumericKey}
                          onChange={(e) => onFormChange("vat_percent", e.target.value ? Number(e.target.value) : 0)}
                          onFocus={(e) => e.target.select()}
                          onBlur={() => doCalculation("amount")}
                          className="focus-visible:border-blue-400 focus-visible:ring-blue-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* الضريبة والمبالغ */}
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-amber-700">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 ring-1 ring-amber-100">
                      <Percent className="h-3.5 w-3.5" />
                    </span>
                    المبالغ والضريبة
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="vch-amount-net">المبلغ *</Label>
                      <Input
                        id="vch-amount-net"
                        type="number"
                        value={numberValue(form.amount_journal_type_8)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onFormChange("amount_journal_type_8", e.target.value ? Number(e.target.value) : 0)}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => doCalculation("amount_journal_type_8")}
                        className="focus-visible:border-amber-400 focus-visible:ring-amber-100"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="vch-vat">الضريبة *</Label>
                      <Input
                        id="vch-vat"
                        type="number"
                        value={numberValue(form.vat)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onFormChange("vat", e.target.value ? Number(e.target.value) : 0)}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => doCalculation("vat")}
                        disabled={!form.vat_percent}
                        className="focus-visible:border-amber-400 focus-visible:ring-amber-100"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="vch-amount" className="font-bold text-slate-700">
                        المجموع *
                      </Label>
                      <Input
                        id="vch-amount"
                        type="number"
                        value={numberValue(form.amount)}
                        onKeyDown={blockNonNumericKey}
                        onChange={(e) => onFormChange("amount", e.target.value ? Number(e.target.value) : 0)}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => doCalculation("amount")}
                        className="border-emerald-200 bg-emerald-50/60 font-bold text-emerald-800 focus-visible:border-emerald-400 focus-visible:ring-emerald-100"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-amber-700">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 ring-1 ring-amber-100">
                      <Wallet className="h-3.5 w-3.5" />
                    </span>
                    حساب الضريبة
                  </div>
                  <AutoCompleteAccount
                    label="حساب الضريبة *"
                    valueMode="id"
                    value={numberValue(form.vat_account_id)}
                    onValueChange={(v) => onFormChange("vat_account_id", v ? Number(v) : null)}
                    costCenters={form.vat_account_cost_centers}
                    onCostCentersChange={(selection) => onFormChange("vat_account_cost_centers", selection)}
                    requiredTypeValues={[1]}
                    notFoundMessage="الحساب غير موجود"
                    disabled={isLocked}
                  />
                </div>
              </div>

              {/* بيانات إضافية */}
              <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-indigo-700">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 ring-1 ring-indigo-100">
                    <Users2 className="h-3.5 w-3.5" />
                  </span>
                  بيانات إضافية
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5 invoice-currency-dropdown-wrap">
                    <Label>مندوب المبيعات</Label>
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
                      disabled={isLocked}
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => onFormChange("payment_classification_id", e.value ?? null)}
                    />
                  </div>
                </div>
              </div>

              {/* ملاحظات */}
              <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 ring-1 ring-slate-200">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </span>
                  ملاحظة عامة للسند
                </div>
                <Textarea
                  id="vch-note"
                  value={form.note}
                  onChange={(e) => onFormChange("note", e.target.value)}
                  maxLength={200}
                  rows={3}
                  className="focus-visible:border-slate-400 focus-visible:ring-slate-100"
                />
              </div>
            </fieldset>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message={form.status === 2 ? "السند مرحل هل تريد الغاؤه منطقياً؟" : `هل تريد حذف هذا ${title}؟`}
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
