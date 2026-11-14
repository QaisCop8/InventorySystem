"use client"

import { tr, appDir } from "@/lib/i18n"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { useEffect, useRef, useState } from "react"
import { useNavigationGuard } from "@/lib/navigation-guard"

interface Branch {
  id: number
  branch_code: string
  branch_name: string
  branch_symbol?: string
  bank_id: number | null
  bank_name?: string
  status: number
}

interface BankOption {
  id: number
  bank_name: string
}

interface UnifiedBranchesProps {
  dialogOpen: boolean
  currentIndex: number
  totalRecords: number
  banks?: BankOption[]
  form: {
    id: number
    branch_code: string
    branch_name: string
    branch_symbol: string
    bank_id: number | null
    status: number
  }
  usedSymbols?: string[]
  showSymbolValidationError?: boolean
  saveError?: string
  isSaving: boolean
  loading?: boolean
  showDeleteConfirm?: boolean
  onOpenChange: (open: boolean) => void
  onNew?: () => void
  onSave: () => void
  onDelete?: () => void
  onNavigateRecord?: (record: Branch) => void
  onFormChange: (field: string, value: string | number | null) => void
  onConfirmDelete?: () => void
  onCancelDelete?: () => void
  onCodeBlur?: (branch_code: string) => void
  canSave?: boolean
  showBankValidationError?: boolean
  showBranchCodeValidationError?: boolean
  hasDuplicateCode?: boolean
  hasDuplicateName?: boolean
  isFirstRecord?: boolean
  isLastRecord?: boolean
  isNewMode?: boolean
}

export default function UnifiedBranches({
  dialogOpen,
  currentIndex,
  totalRecords,
  banks = [],
  form,
  isSaving,
  loading,
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
  showBankValidationError = false,
  showBranchCodeValidationError = false,
  hasDuplicateCode,
  hasDuplicateName,
  usedSymbols = [],
  showSymbolValidationError = false,
  saveError = "",
  isFirstRecord,
  isLastRecord,
  isNewMode,
}: UnifiedBranchesProps) {
  const codeInputRef = useRef<HTMLInputElement | null>(null)

  // تغييرات غير محفوظة: الإغلاق/جديد/التنقل بين السجلات/مغادرة الشاشة يسأل «هل تريد الحفظ؟» (نفس حسابات البنوك)
  const initialSnapshotRef = useRef<string>(JSON.stringify(form))
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    initialSnapshotRef.current = JSON.stringify(form)
    // الأساس يُعاد عند تحميل سجل فقط لا مع كل حرف
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.id, isNewMode])
  const isDirty = () => JSON.stringify(form) !== initialSnapshotRef.current
  const guardedAction = (action: () => void) => {
    if (showUnsavedConfirm) return
    if (isDirty()) {
      pendingActionRef.current = action
      setShowUnsavedConfirm(true)
    } else {
      action()
    }
  }
  useNavigationGuard(() => dialogOpen && isDirty(), (continueNavigation) => guardedAction(continueNavigation))

  const handleNavigate = async (direction: "first" | "previous" | "next" | "last") => {
    try {
      const currentId = form.id > 0 ? form.id : 0
      const isNewRecord = form.id <= 0
      const effectiveDirection =
        direction === "previous" && isNewRecord
          ? "last"
          : direction === "next" && isNewRecord
            ? "first"
            : direction

      const query = new URLSearchParams()
      query.set("currentId", String(currentId))
      

      const url = `/api/branches/navigation/${effectiveDirection}${query.toString() ? `?${query.toString()}` : ""}`
      const response = await fetch(url)
      if (!response.ok) return

      const record = await response.json()
      if (record?.id) {
        onNavigateRecord?.({
          id: record.id,
          branch_code: record.branch_code,
          branch_name: record.branch_name,
          branch_symbol: record.branch_symbol,
          bank_id: record.bank_id ?? null,
          status: record.status,
        })
      }
    } catch (error) {
      console.error("Failed to navigate branch", error)
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    if (isNewMode && dialogOpen) {
      const t = setTimeout(() => codeInputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [isNewMode, dialogOpen])

  const missingBank = !form.bank_id || Number(form.bank_id) <= 0
  const shouldShowBankError = showBankValidationError && missingBank

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? onOpenChange(open) : guardedAction(() => onOpenChange(false)))}>
        <DialogContent
          className="w-full max-w-5xl p-0 overflow-hidden"
          dir={appDir()}
          onPointerDownOutside={(event) => { if (showUnsavedConfirm || showDeleteConfirm) event.preventDefault() }}
          onInteractOutside={(event) => { if (showUnsavedConfirm || showDeleteConfirm) event.preventDefault() }}
          onEscapeKeyDown={(event) => { if (showUnsavedConfirm || showDeleteConfirm) event.preventDefault() }}
        >
          <UniversalToolbar
            currentRecord={currentIndex + 1}
            totalRecords={totalRecords}
            onNew={onNew ? () => guardedAction(onNew) : undefined}
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

          <div className="rounded-b-3xl bg-background px-6 py-6">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-xl font-semibold">{form.id > 0 ? tr("تعديل الفرع") : tr("إضافة فرع جديد")}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="branch-code">{tr("رقم الفرع")}</Label>
                <Input
                  id="branch-code"
                  value={form.branch_code}
                  onChange={(e) => onFormChange("branch_code", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  // رقم الفرع 4 خانات: 1 ⇐ 0001
                  onBlur={(e) => { const code = e.target.value.replace(/\D/g, ""); if (code) onFormChange("branch_code", code.padStart(4, "0")) }}
                  placeholder={tr("4 خانات، مثل 0001")}
                  ref={codeInputRef}
                  maxLength={4}
                  inputMode="numeric"
                  pattern="[0-9]{1,4}"
                  autoComplete="off"
                />
                {showBranchCodeValidationError && (
                  <p className="text-sm text-destructive">{tr("رقم الفرع مطلوب ويجب أن يتكون من 1 إلى 4 أرقام فقط.")}</p>
                )}
                {hasDuplicateCode && (
                  <p className="text-sm text-destructive">{tr("هذا الرمز مستخدم بالفعل. الرجاء اختيار رمز آخر.")}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="branch-name">{tr("اسم الفرع")}</Label>
                <Input
                  id="branch-name"
                  value={form.branch_name}
                  onChange={(e) => onFormChange("branch_name", e.target.value)}
                />
                {hasDuplicateName && (
                  <p className="text-sm text-destructive">{tr("هذا الاسم مستخدم بالفعل. الرجاء اختيار اسم آخر.")}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="branch-bank">{tr("البنك")}</Label>
                <select
                  id="branch-bank"
                  value={form.bank_id != null ? String(form.bank_id) : ""}
                  onChange={(e) => onFormChange("bank_id", e.target.value ? Number(e.target.value) : null)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="" disabled>
                    {tr("اختر البنك")}
                  </option>
                  {banks.length > 0 ? (
                    // البنوك المتوقفة لا تُختار لفروع جديدة (يبقى البنك الحالي للفرع ظاهراً)
                    banks.filter((bank) => Number((bank as { status?: number }).status ?? 1) !== 2 || bank.id === form.bank_id).map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.bank_name}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      {tr("لا توجد بنوك متاحة")}
                    </option>
                  )}
                </select>
                {shouldShowBankError && (
                  <p className="text-sm text-destructive">{tr("يجب ادخال رقم البنك")}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="branch-status">{tr("الحالة")}</Label>
                <select
                  id="branch-status"
                  value={Number(form.status) === 2 ? 2 : 1}
                  onChange={(e) => onFormChange("status", Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value={1}>{tr("نشط")}</option>
                  <option value={2}>{tr("متوقف (لا يظهر في الحسابات البنكية والحركات الجديدة)")}</option>
                </select>
              </div>
              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialogYesNo useAppDialog
        visible={showUnsavedConfirm}
        message={tr("تم تعديل البيانات، هل تريد الحفظ؟")}
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

      <ConfirmDialogYesNo useAppDialog
        visible={showDeleteConfirm}
        message={tr("هل تريد حذف هذا الفرع؟")}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    </>
  )
}
