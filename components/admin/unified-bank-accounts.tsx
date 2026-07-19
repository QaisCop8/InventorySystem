"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Search } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import Messages from "@/components/common/Messages"
import ProgressSpinner from "@/components/ProgressSpinner/ProgressSpinner"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import BankAccountsSearch from "@/components/admin/bank-accounts-search"
import { Dropdown as PrimeDropdown } from "primereact/dropdown"

export interface BankAccountRecord {
  id: number
  branch_id: number | null
  code: string
  actual_bank_code: string
  currency_id: number | null
  name: string
  name_lang2: string
  jary_account_id: number | null
  tahsil_account_id: number | null
  tahsil_commission_account_id: number | null
  payed_checks_account_id: number | null
  returned_checks_account_id: number | null
  returned_checks_commission: number | null
  add_returned_check_commision_on_customer: boolean
  tahsil_checks_commission: number | null
  returned_checks_commission_currency_id: number | null
  tahsil_checks_commission_currency_id: number | null
  check_value_period: number | null
  checks_deposit_period: number | null
  notes: string
  status: number
}

interface BranchOption {
  id: number
  branch_code: string
  branch_name: string
  bank_id: number | null
}

interface BankOption {
  id: number
  bank_code?: string
  bank_name: string
}

interface CurrencyOption {
  currency_id?: number
  id?: number
  currency_name?: string
  currency_code?: string
}

interface UnifiedBankAccountsProps {
  dialogOpen: boolean
  currentIndex: number
  totalRecords: number
  banks?: BankOption[]
  branches?: BranchOption[]
  currencies?: CurrencyOption[]
  form: BankAccountRecord
  isSaving: boolean
  showDeleteConfirm?: boolean
  onOpenChange: (open: boolean) => void
  onNew?: () => void
  onSave: () => void
  onDelete?: () => void
  onNavigateRecord?: (record: BankAccountRecord) => void
  onFormChange: (field: string, value: string | number | boolean | null) => void
  onConfirmDelete?: () => void
  onCancelDelete?: () => void
  onCodeBlur?: (code: string) => void
  canSave?: boolean
  isFirstRecord?: boolean
  isLastRecord?: boolean
  isNewMode?: boolean
  errorMessages?: string[]
  allBankAccounts?: BankAccountRecord[]
}

export default function UnifiedBankAccounts({
  dialogOpen,
  currentIndex,
  totalRecords,
  banks = [],
  branches = [],
  currencies = [],
  form,
  isSaving,
  showDeleteConfirm = false,
  onOpenChange,
  onNew,
  onSave,
  onDelete,
  onNavigateRecord,
  onFormChange,
  onConfirmDelete = () => undefined,
  onCancelDelete = () => undefined,
  onCodeBlur,
  canSave,
  isFirstRecord,
  isLastRecord,
  isNewMode,
  errorMessages = [],
  allBankAccounts = [],
}: UnifiedBankAccountsProps) {
  const codeInputRef = useRef<HTMLInputElement | null>(null)
  const messagesRef = useRef<any>(null)
  const [commissionsOpen, setCommissionsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [navLoading, setNavLoading] = useState(false)

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === form.branch_id) || null,
    [branches, form.branch_id],
  )
  const [bankFilterId, setBankFilterId] = useState<number | null>(null)

  useEffect(() => {
    setBankFilterId(selectedBranch?.bank_id ?? null)
  }, [selectedBranch])

  useEffect(() => {
    if (errorMessages.length > 0) {
      messagesRef.current?.clear?.()
      messagesRef.current?.show(
        errorMessages.map((detail) => ({ severity: "error", summary: "", detail, sticky: false, life: 5000 })),
      )
    }
  }, [errorMessages])

  const filteredBranches = useMemo(
    () => (bankFilterId ? branches.filter((b) => b.bank_id === bankFilterId) : []),
    [branches, bankFilterId],
  )

  // Unsaved-changes tracking: recapture the baseline whenever a (different) record is loaded.
  const initialSnapshotRef = useRef<string>(JSON.stringify(form))
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    initialSnapshotRef.current = JSON.stringify(form)
    // Baseline should only reset when a record is (re)loaded, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, isNewMode])

  const guardedAction = (action: () => void) => {
    // A confirm is already pending (e.g. a spurious dismiss triggered by the
    // ConfirmDialogYesNo overlay itself) — don't let it hijack the action the
    // user actually pressed.
    if (showUnsavedConfirm) return

    if (JSON.stringify(form) !== initialSnapshotRef.current) {
      pendingActionRef.current = action
      setShowUnsavedConfirm(true)
    } else {
      action()
    }
  }

  // F3 = save, F4 = delete (only for an already-saved record).
  // Skipped while a confirm dialog is open — those handle F3/Escape themselves.
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
        }
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

      const url = `/api/bank-accounts/navigation/${effectiveDirection}${query.toString() ? `?${query.toString()}` : ""}`
      const response = await fetch(url)
      if (!response.ok) return

      const record = await response.json()
      if (record?.id) {
        onNavigateRecord?.(record)
      }
    } catch (error) {
      console.error("Failed to navigate bank account", error)
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

  const numberValue = (value: number | null) => (value === null || value === undefined ? "" : String(value))

  const normalizeBankAccountCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9-]/g, "")

  return (
    <>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? onOpenChange(open) : guardedAction(() => onOpenChange(false)))}
      >
        <DialogContent
          className="w-full max-w-6xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto"
          dir="rtl"
          onPointerDownOutside={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || searchOpen) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || searchOpen) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || searchOpen) event.preventDefault()
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
                {form.id > 0 ? "تعديل حساب البنك" : "إضافة حساب بنك جديد"}
              </DialogTitle>
            </DialogHeader>

            <Messages innerRef={messagesRef} />

            <div className="space-y-4 border-b pb-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="bank-account-code">رقم الحساب *</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="bank-account-code"
                      ref={codeInputRef}
                      value={form.code}
                      onChange={(e) => onFormChange("code", normalizeBankAccountCode(e.target.value))}
                      onBlur={() => onCodeBlur?.(form.code)}
                      onKeyDown={(e) => {
                        if (e.key === "F10") {
                          e.preventDefault()
                          guardedAction(() => setSearchOpen(true))
                        }
                      }}
                      maxLength={20}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 shrink-0"
                      onClick={() => guardedAction(() => setSearchOpen(true))}
                      title="بحث عن حساب بنك (F10)"
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 invoice-currency-dropdown-wrap">
                  <Label>العملة</Label>
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
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bank-account-actual-code">رقم الحساب الفعلي</Label>
                <Input
                  id="bank-account-actual-code"
                  value={form.actual_bank_code}
                  onChange={(e) => onFormChange("actual_bank_code", e.target.value)}
                  maxLength={20}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="bank-account-name">اسم الحساب (ar) *</Label>
                  <Input
                    id="bank-account-name"
                    value={form.name}
                    onChange={(e) => onFormChange("name", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bank-account-name-en">اسم الحساب (en)</Label>
                  <Input
                    id="bank-account-name-en"
                    value={form.name_lang2}
                    onChange={(e) => onFormChange("name_lang2", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>البنك *</Label>
                  <select
                    value={bankFilterId != null ? String(bankFilterId) : ""}
                    onChange={(e) => {
                      const nextBankId = e.target.value ? Number(e.target.value) : null
                      setBankFilterId(nextBankId)
                      if (nextBankId !== selectedBranch?.bank_id) {
                        onFormChange("branch_id", null)
                      }
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">اختر البنك</option>
                    {banks.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.bank_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>الفرع *</Label>
                  <select
                    value={form.branch_id != null ? String(form.branch_id) : ""}
                    onChange={(e) => onFormChange("branch_id", e.target.value ? Number(e.target.value) : null)}
                    disabled={!bankFilterId}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">{bankFilterId ? "اختر الفرع" : "اختر البنك أولاً"}</option>
                    {filteredBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.branch_code} / {branch.branch_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bank-account-notes">ملاحظات</Label>
                <Input
                  id="bank-account-notes"
                  value={form.notes}
                  onChange={(e) => onFormChange("notes", e.target.value)}
                  maxLength={70}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>مدة الاستحقاق المسموحة لايداع الشيكات الآجلة - يوم</Label>
                  <Input
                    type="number"
                    value={numberValue(form.check_value_period)}
                    onChange={(e) => onFormChange("check_value_period", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>مدة ايداع الشيكات الآجلة - يوم</Label>
                  <Input
                    type="number"
                    value={numberValue(form.checks_deposit_period)}
                    onChange={(e) => onFormChange("checks_deposit_period", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 border-b py-6">
              <h4 className="font-semibold text-base">الحسابات المحاسبية</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <AutoCompleteAccount
                  label="الحساب المحاسبي *"
                  valueMode="id"
                  value={numberValue(form.jary_account_id)}
                  onValueChange={(v) => onFormChange("jary_account_id", v ? Number(v) : null)}
                  showCostCenterButton={false}
                />
                <AutoCompleteAccount
                  label="حساب شيكات برسم التحصيل *"
                  valueMode="id"
                  value={numberValue(form.tahsil_account_id)}
                  onValueChange={(v) => onFormChange("tahsil_account_id", v ? Number(v) : null)}
                  showCostCenterButton={false}
                />
                <AutoCompleteAccount
                  label="حساب عمولة التحصيل *"
                  valueMode="id"
                  value={numberValue(form.tahsil_commission_account_id)}
                  onValueChange={(v) => onFormChange("tahsil_commission_account_id", v ? Number(v) : null)}
                  showCostCenterButton={false}
                />
                <AutoCompleteAccount
                  label="حساب الشيكات الصادرة المؤجلة *"
                  valueMode="id"
                  value={numberValue(form.payed_checks_account_id)}
                  onValueChange={(v) => onFormChange("payed_checks_account_id", v ? Number(v) : null)}
                  showCostCenterButton={false}
                />
                <AutoCompleteAccount
                  label="حساب الشيكات المرتجعة *"
                  valueMode="id"
                  value={numberValue(form.returned_checks_account_id)}
                  onValueChange={(v) => onFormChange("returned_checks_account_id", v ? Number(v) : null)}
                  showCostCenterButton={false}
                />
              </div>
            </div>

            <Collapsible open={commissionsOpen} onOpenChange={setCommissionsOpen} className="py-4">
              <CollapsibleTrigger className="flex w-full items-center justify-between text-base font-semibold">
                <span>العمولات</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${commissionsOpen ? "-rotate-180" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2 invoice-currency-dropdown-wrap">
                    <Label>عملة الشيكات الراجعة</Label>
                    <PrimeDropdown
                      value={form.returned_checks_commission_currency_id}
                      options={currencyOptions}
                      optionLabel="label"
                      optionValue="value"
                      placeholder="اختر العملة"
                      filter
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => onFormChange("returned_checks_commission_currency_id", e.value ?? null)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>قيمة عمولة الشيكات الراجعة</Label>
                    <Input
                      type="number"
                      value={numberValue(form.returned_checks_commission)}
                      onChange={(e) =>
                        onFormChange("returned_checks_commission", e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2 invoice-currency-dropdown-wrap">
                    <Label>عملة شيكات التحصيل</Label>
                    <PrimeDropdown
                      value={form.tahsil_checks_commission_currency_id}
                      options={currencyOptions}
                      optionLabel="label"
                      optionValue="value"
                      placeholder="اختر العملة"
                      filter
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo="self"
                      panelStyle={{ zIndex: 10000 }}
                      onChange={(e: any) => onFormChange("tahsil_checks_commission_currency_id", e.value ?? null)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>قيمة عمولة شيكات التحصيل</Label>
                    <Input
                      type="number"
                      value={numberValue(form.tahsil_checks_commission)}
                      onChange={(e) =>
                        onFormChange("tahsil_checks_commission", e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.add_returned_check_commision_on_customer}
                    onCheckedChange={(checked) =>
                      onFormChange("add_returned_check_commision_on_customer", checked === true)
                    }
                  />
                  <span>إضافة عمولة الشيكات المرتجعة على العميل</span>
                </label>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </DialogContent>
      </Dialog>

      <BankAccountsSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        bankAccounts={allBankAccounts}
        onSelect={(record) => guardedAction(() => onNavigateRecord?.(record))}
      />

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message="هل تريد حذف حساب البنك هذا؟"
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
