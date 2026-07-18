"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { useEffect, useRef } from "react"

interface Bank {
  id: number
  bank_code: string
  bank_name: string
  bank_name_en?: string
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
      <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-5xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{form.id > 0 ? "تعديل البنك" : "إضافة بنك جديد"}</DialogTitle>
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
              <Label htmlFor="bank-code">رمز البنك</Label>
              <Input
                id="bank-code"
                  value={form.bank_code}
                  onChange={(e) => onFormChange("bank_code", e.target.value)}
                  onBlur={() => onCodeBlur?.(form.bank_code)}
                  ref={codeInputRef}
                maxLength={4}
              />
              {hasDuplicateCode && (
                <p className="text-sm text-destructive">هذا الرمز مستخدم بالفعل. الرجاء اختيار رمز آخر.</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bank-name">اسم البنك</Label>
              <Input
                id="bank-name"
                value={form.bank_name}
                onChange={(e) => onFormChange("bank_name", e.target.value)}
              />
              {hasDuplicateName && (
                <p className="text-sm text-destructive">هذا الاسم مستخدم بالفعل. الرجاء اختيار اسم آخر.</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bank-name-en">اسم البنك انجليزي</Label>
              <Input
                id="bank-name-en"
                value={form.bank_name_en}
                onChange={(e) => onFormChange("bank_name_en", e.target.value)}
              />
            </div>
            {deleteError && (
              <p className="text-sm text-destructive">{deleteError}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message="هل تريد حذف هذا البنك؟"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    </>
  )
}

