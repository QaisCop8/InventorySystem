"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Loader2, Search, Settings, Wand2 } from "lucide-react"
import BankAccountsAutoSettings from "@/components/admin/bank-accounts-auto-settings"
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
import PrimeDropdown from "@/components/common/FocusDropdown"
import { useWorkspaceTabActive } from "@/contexts/workspace-tab-context"
import { useNavigationGuard } from "@/lib/navigation-guard"

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
  /** انشاء آلي: الحسابات المحاسبية تُنشأ عند الحفظ تحت الحسابات الاب المحددة في "اعدادات" */
  auto_generate?: boolean
}

type AutoPlanItem = { kind: string; label: string; father?: { code: string; name: string; exists: boolean }; account: { code: string; name: string; exists: boolean } }
type AutoRow = { key: string; bankId: number; bankCode: string; bankName: string; branchId: number; branchCode: string; branchName: string; currencyId: number; currencyName: string }

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
  const workspaceTabActive = useWorkspaceTabActive()
  const codeInputRef = useRef<HTMLInputElement | null>(null)
  const messagesRef = useRef<any>(null)
  const [commissionsOpen, setCommissionsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [navLoading, setNavLoading] = useState(false)
  // انشاء آلي (كما في الشامل): بنك + فرع + عملات ← "اختيار" يملأ جدول الحسابات ← "تنفيذ" يعبّئ النموذج
  const [autoMode, setAutoMode] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [autoBankId, setAutoBankId] = useState<number | null>(null)
  const [autoBranchId, setAutoBranchId] = useState<number | null>(null)
  const [autoCurrencyIds, setAutoCurrencyIds] = useState<number[]>([])
  const [autoRows, setAutoRows] = useState<AutoRow[]>([])
  const [autoError, setAutoError] = useState("")
  const [autoPlan, setAutoPlan] = useState<AutoPlanItem[]>([])
  const [autoPlanError, setAutoPlanError] = useState("")
  const [autoPlanLoading, setAutoPlanLoading] = useState(false)

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
  // تبديل الشاشة من القائمة/إغلاق التبويب/رجوع المتصفح/تحديث الصفحة مع تغييرات غير محفوظة ⇐ نفس نافذة
  // التحقق من التغييرات (حفظ/عدم حفظ/إلغاء) — كما في كاشير نقطة البيع (lib/navigation-guard.ts)
  useNavigationGuard(
    () => dialogOpen && JSON.stringify(form) !== initialSnapshotRef.current,
    (continueNavigation) => guardedAction(continueNavigation),
  )


  // F3 = save, F4 = delete (only for an already-saved record).
  // Skipped while a confirm dialog is open — those handle F3/Escape themselves.
  // F3 حفظ / F9 حذف / F4 نسخ / F5 جديد / Ctrl+P طباعة: يتولاها UniversalToolbar (lib/hotkeys.ts)

  const currencyOptions = useMemo(
    () =>
      currencies.map((c) => ({
        label: c.currency_name || c.currency_code || "غير محدد",
        value: Number(c.currency_id ?? c.id),
      })),
    [currencies],
  )

  // الانشاء الآلي متاح للسجل الجديد فقط
  useEffect(() => {
    if (form.id > 0 || !dialogOpen) setAutoMode(false)
  }, [form.id, dialogOpen])

  const autoBranches = useMemo(() => (autoBankId ? branches.filter((b) => b.bank_id === autoBankId) : []), [branches, autoBankId])

  const chooseAutoRows = () => {
    const bank = banks.find((b) => b.id === autoBankId)
    const branch = branches.find((b) => b.id === autoBranchId)
    if (!bank) return setAutoError("يجب اختيار البنك")
    if (!branch) return setAutoError("يجب اختيار الفرع")
    if (!autoCurrencyIds.length) return setAutoError("يجب اختيار عملة واحدة على الأقل")
    setAutoError("")
    setAutoRows(autoCurrencyIds.map((currencyId) => {
      const currency = currencies.find((c) => Number(c.currency_id ?? c.id) === currencyId)
      return {
        key: `${branch.id}-${currencyId}`, bankId: bank.id, bankCode: bank.bank_code || "", bankName: bank.bank_name,
        branchId: branch.id, branchCode: branch.branch_code, branchName: branch.branch_name,
        currencyId, currencyName: currency?.currency_name || currency?.currency_code || "",
      }
    }))
  }

  const executeAutoRow = (row: AutoRow) => {
    onFormChange("branch_id", row.branchId)
    onFormChange("currency_id", row.currencyId)
    onFormChange("returned_checks_commission_currency_id", row.currencyId)
    onFormChange("tahsil_checks_commission_currency_id", row.currencyId)
    for (const field of ["jary_account_id", "tahsil_account_id", "tahsil_commission_account_id", "payed_checks_account_id", "returned_checks_account_id"]) onFormChange(field, null)
    if (!form.name.trim()) onFormChange("name", `جاري ${row.bankName} ${row.currencyName}`.trim())
    if (!form.name_lang2.trim()) {
      const bank = banks.find((b) => b.id === row.bankId) as (BankOption & { bank_name_en?: string }) | undefined
      const currency = currencies.find((c) => Number(c.currency_id ?? c.id) === row.currencyId)
      onFormChange("name_lang2", `Current ${bank?.bank_name_en || row.bankName} ${currency?.currency_code || ""}`.trim())
    }
    onFormChange("auto_generate", true)
  }

  // عرض الحسابات التي ستُنشأ — يتحدّث مع الفرع/العملة/رقم الحساب الفعلي (نفس منطق الحفظ في الخادم)
  useEffect(() => {
    if (!form.auto_generate || form.id > 0) { setAutoPlan([]); setAutoPlanError(""); return }
    if (!form.branch_id || !form.currency_id) { setAutoPlan([]); setAutoPlanError("اختر البنك والفرع والعملة"); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      setAutoPlanLoading(true)
      try {
        const query = new URLSearchParams({ preview: "1", branch_id: String(form.branch_id), currency_id: String(form.currency_id), actual_bank_code: form.actual_bank_code || "" })
        const response = await fetch(`/api/bank-accounts/auto-generate?${query}`, { cache: "no-store" })
        const data = await response.json().catch(() => ({}))
        if (cancelled) return
        if (!response.ok) { setAutoPlan([]); setAutoPlanError(data?.error || "تعذر تجهيز الحسابات"); return }
        setAutoPlan(Array.isArray(data.items) ? data.items : [])
        setAutoPlanError("")
      } catch {
        if (!cancelled) { setAutoPlan([]); setAutoPlanError("تعذر تجهيز الحسابات") }
      } finally {
        if (!cancelled) setAutoPlanLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [form.auto_generate, form.id, form.branch_id, form.currency_id, form.actual_bank_code, settingsOpen])

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
          className={`w-full ${autoMode ? "max-w-[96vw] 2xl:max-w-[1500px]" : "max-w-6xl"} p-0 overflow-hidden max-h-[90vh] overflow-y-auto`}
          dir="rtl"
          onPointerDownOutside={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || searchOpen || settingsOpen) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || searchOpen || settingsOpen) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (showUnsavedConfirm || showDeleteConfirm || searchOpen || settingsOpen) event.preventDefault()
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

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-muted/40 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {form.id > 0 ? "اعدادات الحسابات الاب المستخدمة في الانشاء الآلي للحسابات البنكية" : "سيتم استخدام الحسابات الاب المحددة في الاعدادات لانشاء الحسابات المحاسبية للحساب البنكي آلياً"}
              </p>
              <div className="flex gap-2">
                {form.id <= 0 && (
                  <Button type="button" size="sm" variant={autoMode ? "secondary" : "default"} onClick={() => setAutoMode((value) => !value)}>
                    <Wand2 className="ml-1 h-4 w-4" />{autoMode ? "إخفاء الانشاء الآلي" : "انشاء آلي"}
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
                  <Settings className="ml-1 h-4 w-4" />اعدادات
                </Button>
              </div>
            </div>

            <div className={autoMode ? "grid items-start gap-5 xl:grid-cols-2" : ""}>
            <div>
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
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-base">الحسابات المحاسبية</h4>
                {form.auto_generate && form.id <= 0 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => onFormChange("auto_generate", false)}>اختيار الحسابات يدوياً</Button>
                )}
              </div>
              {form.auto_generate && form.id <= 0 ? (
                <div className="space-y-2 rounded-xl border bg-emerald-50/60 p-3 dark:bg-emerald-950/20">
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">انشاء آلي — تُنشأ الحسابات التالية عند الحفظ:</p>
                  {autoPlanLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />جاري تجهيز الحسابات...</div>}
                  {autoPlanError && !autoPlanLoading && <p className="text-sm text-red-600 dark:text-red-400">{autoPlanError}</p>}
                  {!autoPlanError && autoPlan.map((item) => (
                    <div key={item.kind} className="rounded-lg border bg-background px-3 py-2 text-sm">
                      <div className="font-semibold">{item.label}</div>
                      {item.father && <div className="text-xs text-muted-foreground">تحت: <span className="font-mono">{item.father.code}</span> {item.father.name} {item.father.exists ? "(موجود)" : "(جديد)"}</div>}
                      <div><span className="font-mono">{item.account.code}</span> — {item.account.name} <span className={item.account.exists ? "text-sky-700 dark:text-sky-300" : "text-emerald-700 dark:text-emerald-300"}>{item.account.exists ? "(موجود)" : "(جديد)"}</span></div>
                    </div>
                  ))}
                </div>
              ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <AutoCompleteAccount
                  label="الحساب المحاسبي *"
                  valueMode="id"
                  value={numberValue(form.jary_account_id)}
                  onValueChange={(v) => onFormChange("jary_account_id", v ? Number(v) : null)}
                  showCostCenterButton={false}
                  searchAllowedTypeValues={[1]}
                />
                <AutoCompleteAccount
                  label="حساب شيكات برسم التحصيل *"
                  valueMode="id"
                  value={numberValue(form.tahsil_account_id)}
                  onValueChange={(v) => onFormChange("tahsil_account_id", v ? Number(v) : null)}
                  showCostCenterButton={false}
                  searchAllowedTypeValues={[1]}
                />
                <AutoCompleteAccount
                  label="حساب عمولة التحصيل *"
                  valueMode="id"
                  value={numberValue(form.tahsil_commission_account_id)}
                  onValueChange={(v) => onFormChange("tahsil_commission_account_id", v ? Number(v) : null)}
                  showCostCenterButton={false}
                  searchAllowedTypeValues={[1]}
                />
                <AutoCompleteAccount
                  label="حساب الشيكات الصادرة المؤجلة *"
                  valueMode="id"
                  value={numberValue(form.payed_checks_account_id)}
                  onValueChange={(v) => onFormChange("payed_checks_account_id", v ? Number(v) : null)}
                  showCostCenterButton={false}
                  searchAllowedTypeValues={[1]}
                />
                <AutoCompleteAccount
                  label="حساب الشيكات المرتجعة *"
                  valueMode="id"
                  value={numberValue(form.returned_checks_account_id)}
                  onValueChange={(v) => onFormChange("returned_checks_account_id", v ? Number(v) : null)}
                  showCostCenterButton={false}
                  searchAllowedTypeValues={[1]}
                />
              </div>
              )}
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

            {autoMode && (
              <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
                <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <div className="grid gap-1.5">
                      <Label>البنك *</Label>
                      <select
                        value={autoBankId != null ? String(autoBankId) : ""}
                        onChange={(e) => { setAutoBankId(e.target.value ? Number(e.target.value) : null); setAutoBranchId(null) }}
                        className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">اختر البنك</option>
                        {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.bank_name}</option>)}
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>الفرع *</Label>
                      <select
                        value={autoBranchId != null ? String(autoBranchId) : ""}
                        onChange={(e) => setAutoBranchId(e.target.value ? Number(e.target.value) : null)}
                        disabled={!autoBankId}
                        className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="">{autoBankId ? "اختر الفرع" : "اختر البنك أولاً"}</option>
                        {autoBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_code} / {branch.branch_name}</option>)}
                      </select>
                    </div>
                    <Button type="button" className="w-full" onClick={chooseAutoRows}>اختيار</Button>
                    {autoError && <p className="text-sm text-red-600 dark:text-red-400">{autoError}</p>}
                  </div>
                  <div className="max-h-56 overflow-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted text-xs">
                        <tr>
                          <th className="w-10 px-2 py-2 text-center">
                            <Checkbox
                              checked={currencies.length > 0 && autoCurrencyIds.length === currencies.length}
                              onCheckedChange={(checked) => setAutoCurrencyIds(checked === true ? currencies.map((c) => Number(c.currency_id ?? c.id)) : [])}
                            />
                          </th>
                          <th className="px-2 py-2 text-right">رمز العملة</th>
                          <th className="px-2 py-2 text-right">اسم العملة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currencies.map((currency) => {
                          const id = Number(currency.currency_id ?? currency.id)
                          const checked = autoCurrencyIds.includes(id)
                          return (
                            <tr key={id} className="cursor-pointer border-t hover:bg-muted/50" onClick={() => setAutoCurrencyIds((ids) => checked ? ids.filter((value) => value !== id) : [...ids, id])}>
                              <td className="px-2 py-1.5 text-center"><Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" /></td>
                              <td className="px-2 py-1.5 font-mono">{currency.currency_code}</td>
                              <td className="px-2 py-1.5">{currency.currency_name}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-muted text-xs">
                      <tr>
                        <th className="w-10 px-2 py-2 text-center">#</th>
                        <th className="w-24 px-2 py-2 text-center">تنفيذ</th>
                        <th className="px-2 py-2 text-right">رقم البنك</th>
                        <th className="px-2 py-2 text-right">اسم البنك</th>
                        <th className="px-2 py-2 text-right">رقم الفرع</th>
                        <th className="px-2 py-2 text-right">اسم الفرع</th>
                        <th className="px-2 py-2 text-right">العملة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {autoRows.length === 0 && (
                        <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">اختر البنك والفرع والعملات ثم اضغط "اختيار"</td></tr>
                      )}
                      {autoRows.map((row, index) => {
                        const active = form.auto_generate && form.branch_id === row.branchId && form.currency_id === row.currencyId
                        const exists = allBankAccounts.some((account) => account.status !== 3 && account.branch_id === row.branchId && Number(account.currency_id) === row.currencyId)
                        return (
                          <tr key={row.key} className={`border-t ${active ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
                            <td className="px-2 py-1.5 text-center">{index + 1}</td>
                            <td className="px-2 py-1.5 text-center">
                              <Button type="button" size="sm" variant={active ? "secondary" : "default"} className="h-7 px-3" onClick={() => executeAutoRow(row)}>تنفيذ</Button>
                            </td>
                            <td className="px-2 py-1.5 font-mono">{row.bankCode}</td>
                            <td className="px-2 py-1.5">{row.bankName}</td>
                            <td className="px-2 py-1.5 font-mono">{row.branchCode}</td>
                            <td className="px-2 py-1.5">{row.branchName}</td>
                            <td className="px-2 py-1.5">{row.currencyName}{exists && <span className="mr-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">يوجد حساب بنكي</span>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">"تنفيذ" يعبّئ الفرع والعملة والاسم في النموذج؛ أدخل رقم الحساب ورقم الحساب الفعلي ثم احفظ — تُنشأ الحسابات المحاسبية مع الحفظ.</p>
              </div>
            )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BankAccountsAutoSettings open={settingsOpen} onOpenChange={setSettingsOpen} />

      <BankAccountsSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        bankAccounts={allBankAccounts}
        onSelect={(record) => guardedAction(() => onNavigateRecord?.(record))}
      />

      <ConfirmDialogYesNo useAppDialog
        visible={showDeleteConfirm}
        message="هل تريد حذف حساب البنك هذا؟"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />

      <ConfirmDialogYesNo useAppDialog
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
