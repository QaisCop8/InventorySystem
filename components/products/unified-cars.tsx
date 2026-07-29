"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import ProgressSpinner from "@/components/ProgressSpinner/ProgressSpinner"
import PrimeDropdown from "@/components/common/FocusDropdown"
import { useEffect, useRef, useState } from "react"

export interface Car {
  id: number
  car_code: string
  name: string
  plate_number?: string | null
  model?: string | null
  licence_expiry?: string | null
  status: "نشط" | "غير نشط"
}

export interface CarFormData {
  id: number
  car_code: string
  name: string
  plate_number: string
  model: string
  licence_expiry: string
  status: "نشط" | "غير نشط"
}

interface UnifiedCarsProps {
  dialogOpen: boolean
  currentIndex: number
  totalRecords: number
  form: CarFormData
  isSaving: boolean
  loading: boolean
  showDeleteConfirm: boolean
  onOpenChange: (open: boolean) => void
  onNew?: () => void
  onSave: (options?: { afterSaveAction?: "new" | "close" }) => void | Promise<void>
  onDelete?: () => void
  onNavigateRecord?: (record: Car) => void
  onFormChange: (field: string, value: string) => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onCodeBlur?: (car_code: string) => void
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

export default function UnifiedCars({
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
}: UnifiedCarsProps) {
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

      const response = await fetch(`/api/cars/navigation/${effectiveDirection}${query.toString() ? `?${query.toString()}` : ""}`)
      if (!response.ok) return

      const record = await response.json()
      if (record?.id) {
        onNavigateRecord?.(record)
      }
    } catch (error) {
      console.error("Failed to navigate cars", error)
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
          className="w-full max-w-3xl overflow-hidden p-0"
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
              <DialogTitle className="text-xl font-semibold">{form.id > 0 ? "تعديل بيانات سيارة" : "إضافة سيارة جديدة"}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {visibleValidationMessage && (
                <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-700" role="alert">
                  <AlertDescription>{visibleValidationMessage}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="car-code">رقم السيارة</Label>
                  <Input
                    id="car-code"
                    value={form.car_code}
                    onChange={(e) => onFormChange("car_code", e.target.value)}
                    onBlur={() => {
                      if (focusTimerRef.current) {
                        clearTimeout(focusTimerRef.current)
                        focusTimerRef.current = null
                      }
                      onCodeBlur?.(form.car_code)
                    }}
                    ref={codeInputRef}
                    maxLength={8}
                    className="text-right"
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="car-name">اسم السيارة *</Label>
                  <Input
                    id="car-name"
                    ref={nameInputRef}
                    value={form.name}
                    onChange={(e) => onFormChange("name", e.target.value.slice(0, 30))}
                    maxLength={30}
                    className={`text-right ${hasDuplicateName ? "border-red-500" : ""}`}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="car-plate">رقم اللوحة</Label>
                  <Input
                    id="car-plate"
                    value={form.plate_number}
                    onChange={(e) => onFormChange("plate_number", e.target.value)}
                    className="text-right"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="car-model">الموديل</Label>
                  <Input
                    id="car-model"
                    value={form.model}
                    onChange={(e) => onFormChange("model", e.target.value)}
                    className="text-right"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="car-licence-expiry">تاريخ انتهاء الرخصة</Label>
                  <Input
                    id="car-licence-expiry"
                    type="date"
                    value={form.licence_expiry}
                    onChange={(e) => onFormChange("licence_expiry", e.target.value)}
                    className="text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="car-status">الحالة</Label>
                  <PrimeDropdown
                    inputId="car-status"
                    value={form.status || "نشط"}
                    options={[
                      { label: "نشط", value: "نشط" },
                      { label: "غير نشط", value: "غير نشط" },
                    ]}
                    optionLabel="label"
                    optionValue="value"
                    filter={false}
                    className="invoice-currency-dropdown w-full"
                    panelClassName="invoice-currency-dropdown-panel"
                    appendTo="self"
                    onChange={(e: any) => onFormChange("status", e.value || "نشط")}
                  />
                </div>
              </div>

              {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message={deleteConfirmMessage || "هل تريد حذف هذه السيارة؟"}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    </>
  )
}
