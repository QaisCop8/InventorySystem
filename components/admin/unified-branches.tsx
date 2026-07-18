"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { useEffect, useRef } from "react"

interface Branch {
  id: number
  branch_code: string
  branch_name: string
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
    bank_id: number | null
    status: number
  }
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
  isFirstRecord,
  isLastRecord,
  isNewMode,
}: UnifiedBranchesProps) {
  const codeInputRef = useRef<HTMLInputElement | null>(null)

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
      <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-5xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{form.id > 0 ? "تعديل الفرع" : "إضافة فرع جديد"}</DialogTitle>
          </DialogHeader>

          <div className="mb-4">
            <UniversalToolbar
              currentRecord={currentIndex + 1}
              totalRecords={totalRecords}
              onNew={onNew}
              onSave={onSave}
              onDelete={onDelete}
              onFirst={() => handleNavigate("first")}
              onPrevious={() => handleNavigate("previous")}
              onNext={() => handleNavigate("next")}
              onLast={() => handleNavigate("last")}
              isSaving={isSaving}
              canSave={canSave}
              canDelete={form.id > 0}
              isFirstRecord={isFirstRecord}
              isLastRecord={isLastRecord}
            />
          </div>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="branch-code">رمز الفرع</Label>
              <Input
                id="branch-code"
                value={form.branch_code}
                onChange={(e) => onFormChange("branch_code", e.target.value)}
                onBlur={() => onCodeBlur?.(form.branch_code)}
                ref={codeInputRef}
                maxLength={4}
              />
              {showBranchCodeValidationError && (
                <p className="text-sm text-destructive">يجب إدخال رمز فرع رقمي فقط.</p>
              )}
              {hasDuplicateCode && (
                <p className="text-sm text-destructive">هذا الرمز مستخدم بالفعل. الرجاء اختيار رمز آخر.</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="branch-name">اسم الفرع</Label>
              <Input
                id="branch-name"
                value={form.branch_name}
                onChange={(e) => onFormChange("branch_name", e.target.value)}
              />
              {hasDuplicateName && (
                <p className="text-sm text-destructive">هذا الاسم مستخدم بالفعل. الرجاء اختيار اسم آخر.</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="branch-bank">البنك</Label>
              <select
                id="branch-bank"
                value={form.bank_id != null ? String(form.bank_id) : ""}
                onChange={(e) => onFormChange("bank_id", e.target.value ? Number(e.target.value) : null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                {banks.length > 0 ? (
                  banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.bank_name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    لا توجد بنوك متاحة
                  </option>
                )}
              </select>
              {shouldShowBankError && (
                <p className="text-sm text-destructive">يجب ادخال رقم البنك</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message="هل تريد حذف هذا الفرع؟"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    </>
  )
}
