"use client"

import { tr, appDir } from "@/lib/i18n"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { useEffect, useRef, useState } from "react"
import { useNavigationGuard } from "@/lib/navigation-guard"

interface Bank {
  id: number
  bank_code: string
  bank_name: string
  bank_name_en?: string
  swift_code?: string | null
  status: number
}

interface UnifiedBanksProps {
  dialogOpen: boolean
  currentIndex: number
  totalRecords: number
  form: {
    id: number
    bank_code: string
    bank_name: string
    bank_name_en: string
    swift_code: string
    status: number
  }
  isSaving: boolean
  loading: boolean
  showDeleteConfirm: boolean
  onOpenChange: (open: boolean) => void
  onNew?: () => void
  onSave: () => void
  onDelete?: () => void
  onNavigateRecord?: (record: Bank) => void
  onFormChange: (field: string, value: string | number) => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onCodeBlur?: (bank_code: string) => void
  canSave?: boolean
  hasDuplicateCode?: boolean
  hasDuplicateName?: boolean
  deleteError?: string
  isFirstRecord?: boolean
  isLastRecord?: boolean
  isNewMode?: boolean
}

export default function UnifiedBanks({
  dialogOpen,
  currentIndex,
  totalRecords,
  form,
  isSaving,
  loading,
  showDeleteConfirm,
  onOpenChange,
  onNew,
  onSave,
  onDelete,
  onNavigateRecord,
  onFormChange,
  onConfirmDelete,
  onCancelDelete,
  onCodeBlur,
  canSave,
  hasDuplicateCode,
  hasDuplicateName,
  deleteError,
  isFirstRecord,
  isLastRecord,
  isNewMode,
}: UnifiedBanksProps) {
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
      if (effectiveDirection === "previous" || effectiveDirection === "next") {
        query.set("currentId", String(currentId))
      }

      const url = `/api/banks/navigation/${effectiveDirection}${query.toString() ? `?${query.toString()}` : ""}`
      const response = await fetch(url)
      if (!response.ok) return

      const record = await response.json()
      if (record?.id) {
        onNavigateRecord?.({
          id: record.id,
          bank_code: record.bank_code,
          bank_name: record.bank_name,
          bank_name_en: record.bank_name_en || "",
          swift_code: record.swift_code || "",
          status: record.status,
        })
      }
    } catch (error) {
      console.error("Failed to navigate bank", error)
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    // focus code input when dialog opens in new mode or when form is new
    if (isNewMode && dialogOpen) {
      // schedule focus after the dialog mounts and paints
      const t = setTimeout(() => codeInputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [isNewMode, dialogOpen])
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
              <DialogTitle className="text-xl font-semibold">{form.id > 0 ? tr("تعديل البنك") : tr("إضافة بنك جديد")}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="bank-code">{tr("رقم البنك")}</Label>
                <Input
                  id="bank-code"
                  value={form.bank_code}
                  onChange={(e) => onFormChange("bank_code", e.target.value)}
                  // رقم البنك 4 خانات: الأرقام تُكمَّل بأصفار (1 ⇐ 0001)
                  onBlur={() => {
                    const code = String(form.bank_code || "").trim()
                    const padded = /^\d{1,3}$/.test(code) ? code.padStart(4, "0") : code
                    if (padded !== form.bank_code) onFormChange("bank_code", padded)
                    onCodeBlur?.(padded)
                  }}
                  ref={codeInputRef}
                  maxLength={4}
                />
                {hasDuplicateCode && (
                  <p className="text-sm text-destructive">{tr("هذا الرقم مستخدم بالفعل. الرجاء اختيار رقم آخر.")}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bank-name">{tr("اسم البنك")}</Label>
                <Input
                  id="bank-name"
                  value={form.bank_name}
                  onChange={(e) => onFormChange("bank_name", e.target.value)}
                />
                {hasDuplicateName && (
                  <p className="text-sm text-destructive">{tr("هذا الاسم مستخدم بالفعل. الرجاء اختيار اسم آخر.")}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bank-name-en">{tr("اسم البنك انجليزي")}</Label>
                <Input
                  id="bank-name-en"
                  value={form.bank_name_en}
                  onChange={(e) => onFormChange("bank_name_en", e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="bank-swift">{tr("رمز السويفت (Swift Code)")}</Label>
                  <Input
                    id="bank-swift"
                    dir="ltr"
                    maxLength={11}
                    placeholder="ARABJOAX"
                    value={form.swift_code || ""}
                    onChange={(e) => onFormChange("swift_code", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  />
                  {form.swift_code && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(form.swift_code) && <p className="text-sm text-destructive">{tr("رمز السويفت يجب أن يكون 8 أو 11 حرفاً/رقماً")}</p>}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bank-status">{tr("الحالة")}</Label>
                  <select
                    id="bank-status"
                    value={Number(form.status) === 2 ? 2 : 1}
                    onChange={(e) => onFormChange("status", Number(e.target.value))}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value={1}>{tr("نشط")}</option>
                    <option value={2}>{tr("متوقف (لا يظهر في الحسابات البنكية والحركات الجديدة)")}</option>
                  </select>
                </div>
              </div>
              {deleteError && (
                <p className="text-sm text-destructive">{deleteError}</p>
              )}
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
        message={tr("هل تريد حذف هذا البنك؟")}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    </>
  )
}
