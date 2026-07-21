"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronLeft } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import Messages from "@/components/common/Messages"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"

export interface CreditCardRecord {
  id: number
  main_type: number | null
  name: string
  name_lang2: string
  currency_id: number | null
  bank_id: number | null
  holidays: number[]
  financial_account_id: number | null
  waseet_account_id: number | null
  commission_account_id: number | null
  commission_type_id: number | null
  commission_value: number | null
  commission_max_amount: number | null
  notes: string
  status: number
  link_bank_machine: boolean
  machine_type_id: number | null
}

interface LookupOption {
  id: number
  name: string
}

interface CurrencyOption {
  currency_id?: number
  id?: number
  currency_name?: string
  currency_code?: string
}

interface BankOption {
  id: number
  bank_name: string
}

interface UnifiedCreditCardsProps {
  dialogOpen: boolean
  currentIndex: number
  totalRecords: number
  form: CreditCardRecord
  isSaving: boolean
  showDeleteConfirm: boolean
  currencies: CurrencyOption[]
  banks: BankOption[]
  mainTypes: LookupOption[]
  commissionTypes: LookupOption[]
  onOpenChange: (open: boolean) => void
  onNew?: () => void
  onSave: () => void
  onDelete?: () => void
  onNavigateRecord?: (record: CreditCardRecord) => void
  onFormChange: (field: string, value: string | number | boolean | number[] | null) => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  canSave?: boolean
  isFirstRecord?: boolean
  isLastRecord?: boolean
  isNewMode?: boolean
  errorMessages?: string[]
}

const numberValue = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value))

const WEEK_DAYS = [
  { day_no: 1, label: "الأحد" },
  { day_no: 2, label: "الاثنين" },
  { day_no: 3, label: "الثلاثاء" },
  { day_no: 4, label: "الأربعاء" },
  { day_no: 5, label: "الخميس" },
  { day_no: 6, label: "الجمعة" },
  { day_no: 7, label: "السبت" },
]

const MACHINE_TYPE_NEO_CASH = 0

function Section({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-bold text-blue-600 hover:text-blue-700"
      >
        <span>{title}</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
      {open && <div className="pt-3">{children}</div>}
    </div>
  )
}

export default function UnifiedCreditCards({
  dialogOpen,
  currentIndex,
  totalRecords,
  form,
  isSaving,
  showDeleteConfirm,
  currencies,
  banks,
  mainTypes,
  commissionTypes,
  onOpenChange,
  onNew,
  onSave,
  onDelete,
  onNavigateRecord,
  onFormChange,
  onConfirmDelete,
  onCancelDelete,
  canSave,
  isFirstRecord,
  isLastRecord,
  isNewMode,
  errorMessages = [],
}: UnifiedCreditCardsProps) {
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const messagesRef = useRef<any>(null)

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

  useEffect(() => {
    if (typeof window === "undefined" || !dialogOpen) return
    const t = setTimeout(() => nameInputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [dialogOpen, form.id])

  const handleNavigate = async (direction: "first" | "previous" | "next" | "last") => {
    try {
      const currentId = form.id > 0 ? form.id : 0
      const isNewRecord = form.id <= 0
      const effectiveDirection =
        direction === "previous" && isNewRecord ? "last" : direction === "next" && isNewRecord ? "first" : direction

      const query = new URLSearchParams()
      if (effectiveDirection === "previous" || effectiveDirection === "next") query.set("currentId", String(currentId))

      const response = await fetch(`/api/credit-cards/navigation/${effectiveDirection}?${query.toString()}`)
      if (!response.ok) return

      const record = await response.json()
      if (record?.id) onNavigateRecord?.(record)
    } catch (error) {
      console.error("Failed to navigate credit card type", error)
    }
  }

  const handleFormEnterAsTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return
    const target = event.target as HTMLElement
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

  const currencyOptions = currencies.map((c) => ({
    label: c.currency_name || c.currency_code || "غير محدد",
    value: Number(c.currency_id ?? c.id),
  }))

  const holidays = form.holidays || []
  const toggleHoliday = (dayNo: number) => {
    const next = holidays.includes(dayNo) ? holidays.filter((d) => d !== dayNo) : [...holidays, dayNo]
    onFormChange("holidays", next)
  }

  const machineTypeOptions = [
    ...banks.map((b) => ({ id: b.id, name: b.bank_name })),
    { id: MACHINE_TYPE_NEO_CASH, name: "neo_cash" },
  ]

  return (
    <>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? onOpenChange(open) : guardedAction(() => onOpenChange(false)))}
      >
        <DialogContent
          className="w-[95vw] max-w-[1200px] p-0 overflow-hidden max-h-[92vh] overflow-y-auto"
          dir="rtl"
          onPointerDownOutside={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm) event.preventDefault()
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

          <div className="rounded-b-3xl bg-background px-6 py-6" onKeyDown={handleFormEnterAsTab}>
            <DialogHeader className="mb-4">
              <DialogTitle className="text-xl font-semibold">
                بطاقات الائتمان {form.id > 0 ? "" : "(إضافة)"}
              </DialogTitle>
            </DialogHeader>

            <Messages innerRef={messagesRef} />

            <div className="grid gap-6 border-b pb-6 lg:grid-cols-2">
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label>نوع البطاقة *</Label>
                  <select
                    value={form.main_type ?? ""}
                    onChange={(e) => onFormChange("main_type", e.target.value ? Number(e.target.value) : null)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">اختر</option>
                    {mainTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label>العملة *</Label>
                  <select
                    value={form.currency_id ?? ""}
                    onChange={(e) => onFormChange("currency_id", e.target.value ? Number(e.target.value) : null)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">اختر</option>
                    {currencyOptions.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label>البنك *</Label>
                  <select
                    value={form.bank_id ?? ""}
                    onChange={(e) => onFormChange("bank_id", e.target.value ? Number(e.target.value) : null)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">اختر</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label>أيام عطل البطاقة</Label>
                  <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    {WEEK_DAYS.map((d) => (
                      <label key={d.day_no} className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={holidays.includes(d.day_no)}
                          onChange={() => toggleHoliday(d.day_no)}
                        />
                        {d.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="cc-name">اسم البطاقة (ar) *</Label>
                  <Input
                    id="cc-name"
                    ref={nameInputRef}
                    value={form.name}
                    onChange={(e) => onFormChange("name", e.target.value)}
                    maxLength={70}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cc-name-en">اسم البطاقة (en) *</Label>
                  <Input
                    id="cc-name-en"
                    value={form.name_lang2}
                    onChange={(e) => onFormChange("name_lang2", e.target.value)}
                    maxLength={70}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cc-notes">ملاحظات</Label>
                  <Input
                    id="cc-notes"
                    value={form.notes}
                    onChange={(e) => onFormChange("notes", e.target.value)}
                    maxLength={70}
                  />
                </div>
              </div>
            </div>

            <Section title="الحساب محاسبي" defaultOpen={true}>
              <div className="grid gap-4">
                <AutoCompleteAccount
                  label="الحساب محاسبي *"
                  valueMode="id"
                  value={numberValue(form.financial_account_id)}
                  onValueChange={(v) => onFormChange("financial_account_id", v ? Number(v) : null)}
                />
                <AutoCompleteAccount
                  label="حساب الوسيط *"
                  valueMode="id"
                  value={numberValue(form.waseet_account_id)}
                  onValueChange={(v) => onFormChange("waseet_account_id", v ? Number(v) : null)}
                />
                <AutoCompleteAccount
                  label="حساب العمولة"
                  valueMode="id"
                  value={numberValue(form.commission_account_id)}
                  onValueChange={(v) => onFormChange("commission_account_id", v ? Number(v) : null)}
                />
              </div>
            </Section>

            <Section title="العمولة" defaultOpen={false}>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label>نوع العمولة *</Label>
                  <select
                    value={form.commission_type_id ?? ""}
                    onChange={(e) => onFormChange("commission_type_id", e.target.value ? Number(e.target.value) : null)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">اختر</option>
                    {commissionTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label>قيمة العمولة {form.commission_type_id === 1 ? "(%)" : ""}</Label>
                  <Input
                    type="number"
                    value={numberValue(form.commission_value)}
                    onChange={(e) => onFormChange("commission_value", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>الحد الأعلى للعمولة</Label>
                  <Input
                    type="number"
                    value={numberValue(form.commission_max_amount)}
                    onChange={(e) => onFormChange("commission_max_amount", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
              </div>
            </Section>

            <Section title="الربط مع ماكينات البنوك" defaultOpen={false}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.link_bank_machine}
                    onChange={(e) => {
                      onFormChange("link_bank_machine", e.target.checked)
                      if (!e.target.checked) onFormChange("machine_type_id", null)
                    }}
                  />
                  الربط مع ماكينات البنوك
                </label>
                {form.link_bank_machine && (
                  <div className="grid gap-1.5">
                    <Label>نوع الماكينة *</Label>
                    <select
                      value={form.machine_type_id ?? ""}
                      onChange={(e) => onFormChange("machine_type_id", e.target.value === "" ? null : Number(e.target.value))}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">اختر</option>
                      {machineTypeOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </Section>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message="هل تريد حذف بطاقة الائتمان هذه؟"
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
