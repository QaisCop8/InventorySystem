"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import ProgressSpinner from "@/components/ProgressSpinner/ProgressSpinner"
import { useEffect, useRef, useState } from "react"

interface ItemGroup {
  id: number
  group_code: string
  group_name: string
  description?: string | null
  product_count?: number | null
  status: "نشط" | "غير نشط" | "متوقف"
}

interface UnifiedProductGroupsProps {
  dialogOpen: boolean
  currentIndex: number
  totalRecords: number
  form: {
    id: number
    group_code: string
    group_name: string
    description: string
    status: "نشط" | "غير نشط"
  }
  isSaving: boolean
  loading: boolean
  showDeleteConfirm: boolean
  onOpenChange: (open: boolean) => void
  onNew?: () => void
  onSave: (options?: { afterSaveAction?: "new" | "close" }) => void | Promise<void>
  onDelete?: () => void
  onNavigateRecord?: (record: ItemGroup) => void
  onFormChange: (field: string, value: string) => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onCodeBlur?: (group_code: string) => void
  canSave?: boolean
  hasDuplicateCode?: boolean
  hasDuplicateName?: boolean
  deleteError?: string
  deleteConfirmMessage?: string
  validationError?: string
  isFirstRecord?: boolean
  isLastRecord?: boolean
  isNewMode?: boolean
}

export default function UnifiedProductGroups({
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
  deleteConfirmMessage,
  validationError,
  isFirstRecord,
  isLastRecord,
  isNewMode,
}: UnifiedProductGroupsProps) {
  const [navLoading, setNavLoading] = useState(false)
  const combinedLoading = Boolean(isSaving || loading || navLoading)
  const codeInputRef = useRef<HTMLInputElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasDialogOpenRef = useRef(false)
  const visibleValidationMessage = validationError || ""

  const handleNavigate = async (direction: "first" | "previous" | "next" | "last") => {
    setNavLoading(true)
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

      const response = await fetch(`/api/item-groups/navigation/${effectiveDirection}${query.toString() ? `?${query.toString()}` : ""}`)
      if (!response.ok) return

      const record = await response.json()
      if (record?.id) {
        onNavigateRecord?.({
          id: record.id,
          group_code: record.group_code,
          group_name: record.group_name,
          description: record.description || "",
          product_count: record.product_count || 0,
          status: record.status || "نشط",
        })
      }
    } catch (error) {
      console.error("Failed to navigate item group", error)
    } finally {
      setNavLoading(false)
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return

    if (!dialogOpen) {
      wasDialogOpenRef.current = false
      return
    }

    if (wasDialogOpenRef.current) return
    wasDialogOpenRef.current = true

    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current)
      focusTimerRef.current = null
    }

    focusTimerRef.current = setTimeout(() => {
      nameInputRef.current?.focus()
      focusTimerRef.current = null
    }, 120)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F3") {
        event.preventDefault()
        void onSave()
        return
      }

      if (event.key === "F4") {
        event.preventDefault()
        if (form.id > 0) {
          onDelete?.()
        }
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        if (!combinedLoading) {
          onOpenChange(false)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current)
        focusTimerRef.current = null
      }
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [dialogOpen, isNewMode, onDelete, onOpenChange, onSave, combinedLoading])

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && combinedLoading) return
    onOpenChange(open)
  }

  return (
    <>
      <ProgressSpinner loading={combinedLoading} />
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="w-full max-w-5xl overflow-hidden p-0"
          dir="rtl"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
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
            canDelete={form.id > 0 && !isSaving}
            isFirstRecord={isFirstRecord}
            isLastRecord={isLastRecord}
          />

          <div className="rounded-b-3xl bg-background px-6 py-6">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-xl font-semibold">{form.id > 0 ? "تعديل مجموعة الأصناف" : "إضافة مجموعة جديدة"}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {visibleValidationMessage && (
                <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-700" role="alert">
                  <AlertDescription>{visibleValidationMessage}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-2">
                <Label htmlFor="group-code">رقم المجموعة</Label>
                <Input
                  id="group-code"
                  value={form.group_code}
                  onChange={(e) => onFormChange("group_code", e.target.value)}
                  onBlur={() => {
                    if (focusTimerRef.current) {
                      clearTimeout(focusTimerRef.current)
                      focusTimerRef.current = null
                    }
                    onCodeBlur?.(form.group_code)
                  }}
                  ref={codeInputRef}
                  maxLength={10}
                />
                
              </div>
              <div className="grid gap-2">
                <Label htmlFor="group-name">اسم المجموعة</Label>
                <Input
                  id="group-name"
                  ref={nameInputRef}
                  value={form.group_name}
                  onChange={(e) => onFormChange("group_name", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="group-description">الوصف</Label>
                <Input
                  id="group-description"
                  value={form.description}
                  onChange={(e) => onFormChange("description", e.target.value)}
                />
              </div>
              {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message={deleteConfirmMessage || "هل تريد حذف هذه المجموعة؟"}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    </>
  )
}
