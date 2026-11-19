"use client"

import { tr, appDir } from "@/lib/i18n"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import ProgressSpinner from "@/components/ProgressSpinner/ProgressSpinner"
import PrimeDropdown from "@/components/common/FocusDropdown"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useWorkspaceTabActive } from "@/contexts/workspace-tab-context"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { CarFront, Truck, Wallet } from "lucide-react"

export interface Car {
  id: number
  car_code: string
  name: string
  plate_number?: string | null
  model?: string | null
  licence_expiry?: string | null
  status: "نشط" | "غير نشط"
  salesman_id?: number | null
  driver_id?: number | null
  warehouse_id?: number | null
  cash_account_id?: number | null
  insurance_account_id?: number | null
  license_account_id?: number | null
  fuel_account_id?: number | null
  maintenance_account_id?: number | null
}

export interface CarFormData {
  id: number
  car_code: string
  name: string
  plate_number: string
  model: string
  licence_expiry: string
  status: "نشط" | "غير نشط"
  // البيع المتجول: مندوب ومستودع وصندوق السيارة + حسابات مصاريفها
  salesman_id: number | null
  driver_id: number | null
  warehouse_id: number | null
  cash_account_id: number | null
  insurance_account_id: number | null
  license_account_id: number | null
  fuel_account_id: number | null
  maintenance_account_id: number | null
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
  onNavigate?: (direction: "first" | "previous" | "next" | "last") => void
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
  onNavigate,
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
  const workspaceTabActive = useWorkspaceTabActive()
  const combinedLoading = Boolean(isSaving || loading)
  const codeInputRef = useRef<HTMLInputElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasDialogOpenRef = useRef(false)
  const visibleValidationMessage = validationError || ""

  // التنقل محلياً من قائمة السيارات المحمّلة (cars.tsx) مع فحص التغييرات غير المحفوظة قبل تبديل السجل
  const handleNavigate = (direction: "first" | "previous" | "next" | "last") => onNavigate?.(direction)

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

    const handleKeyDown = (event: KeyboardEvent) => { if (!workspaceTabActive.current) return;
      // F3 حفظ / F9 حذف / F4 نسخ / F5 جديد: UniversalToolbar (lib/hotkeys.ts)
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
          className="w-[calc(100vw-2rem)] max-w-5xl overflow-hidden p-0"
          dir={appDir()}
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

          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-b-3xl bg-muted/30 px-6 py-5">
            <DialogHeader className="mb-3">
              <DialogTitle className="text-xl font-semibold">{form.id > 0 ? tr("تعديل بيانات سيارة") : tr("إضافة سيارة جديدة")}</DialogTitle>
            </DialogHeader>

            <div className="fa-field grid gap-4 py-2">
              {visibleValidationMessage && (
                <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-700" role="alert">
                  <AlertDescription>{visibleValidationMessage}</AlertDescription>
                </Alert>
              )}

              <FormSection icon={<CarFront className="h-4 w-4" />} title={tr("بيانات السيارة")}>
                <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-4">
                  <Field label={tr("رقم السيارة")} htmlFor="car-code">
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
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); nameInputRef.current?.focus() } }}
                      ref={codeInputRef}
                      maxLength={8}
                      dir="ltr"
                      className={`text-start font-mono ${hasDuplicateCode ? "border-red-500" : ""}`}
                    />
                  </Field>
                  <Field label={tr("اسم السيارة")} required htmlFor="car-name" className="md:col-span-2">
                    <Input
                      id="car-name"
                      ref={nameInputRef}
                      value={form.name}
                      onChange={(e) => onFormChange("name", e.target.value.slice(0, 30))}
                      maxLength={30}
                      className={`text-start ${hasDuplicateName ? "border-red-500" : ""}`}
                      required
                    />
                  </Field>
                  <Field label={tr("الحالة")} htmlFor="car-status">
                    <PrimeDropdown
                      inputId="car-status"
                      value={form.status || "نشط"}
                      options={[
                        { label: tr("نشط"), value: "نشط" },
                        { label: tr("غير نشط"), value: "غير نشط" },
                      ]}
                      optionLabel="label"
                      optionValue="value"
                      filter={false}
                      className="invoice-currency-dropdown w-full"
                      panelClassName="invoice-currency-dropdown-panel"
                      appendTo={() => document.body}
                      onChange={(e: any) => onFormChange("status", e.value || "نشط")}
                    />
                  </Field>
                  <Field label={tr("رقم اللوحة")} htmlFor="car-plate">
                    <Input id="car-plate" value={form.plate_number} onChange={(e) => onFormChange("plate_number", e.target.value)} dir="ltr" className="text-start" />
                  </Field>
                  <Field label={tr("الموديل")} htmlFor="car-model">
                    <Input id="car-model" value={form.model} onChange={(e) => onFormChange("model", e.target.value)} className="text-start" />
                  </Field>
                  <Field label={tr("تاريخ انتهاء الرخصة")} htmlFor="car-licence-expiry">
                    <Input id="car-licence-expiry" type="date" value={form.licence_expiry} onChange={(e) => onFormChange("licence_expiry", e.target.value)} className="text-start" />
                  </Field>
                </div>
              </FormSection>

              <CarVanSection form={form} onFormChange={onFormChange as any} />

              {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialogYesNo
        visible={showDeleteConfirm}
        message={deleteConfirmMessage || tr("هل تريد حذف هذه السيارة؟")}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    </>
  )
}


function FormSection({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 border-b border-border/70 pb-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{icon}</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </div>
      {children}
    </section>
  )
}

function Field({ label, htmlFor, required, className = "", children }: { label: string; htmlFor?: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={`grid min-w-0 content-start gap-1.5 ${className}`}>
      <Label htmlFor={htmlFor} className="truncate text-xs font-medium text-muted-foreground">
        {label}{required && <span className="ms-0.5 text-red-500">*</span>}
      </Label>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** البيع المتجول (2026-11-18): مندوب السيارة ومستودعها وصندوقها وحسابات مصاريفها. */
function CarVanSection({ form, onFormChange }: { form: CarFormData; onFormChange: (field: keyof CarFormData, value: any) => void }) {
  const [salesmen, setSalesmen] = useState<{ label: string; value: number }[]>([])
  const [warehouses, setWarehouses] = useState<{ label: string; value: number }[]>([])
  const [drivers, setDrivers] = useState<{ label: string; value: number }[]>([])
  useEffect(() => {
    let cancelled = false
    fetch("/api/salesmen", { cache: "no-store" }).then((r) => r.ok ? r.json() : { data: [] }).then((body) => {
      if (!cancelled) setSalesmen((body?.data || []).map((row: any) => ({ label: `${row.code ? row.code + " — " : ""}${row.name}`, value: Number(row.id) })))
    }).catch(() => undefined)
    fetch("/api/warehouses", { cache: "no-store" }).then((r) => r.ok ? r.json() : []).then((rows) => {
      if (!cancelled) setWarehouses((Array.isArray(rows) ? rows : []).map((row: any) => ({ label: row.warehouse_name || row.name, value: Number(row.id) })))
    }).catch(() => undefined)
    fetch("/api/drivers", { cache: "no-store" }).then((r) => r.ok ? r.json() : []).then((body) => {
      const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []
      if (!cancelled) setDrivers(rows.map((row: any) => ({ label: [row.driver_code, row.name].filter(Boolean).join(" - "), value: Number(row.id) })))
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])
  const account = (field: keyof CarFormData, label: string) => (
    <Field label={label}>
      <AutoCompleteAccount label="" value={form[field] ? String(form[field]) : ""} valueMode="id"
        onValueChange={(value: any) => onFormChange(field, value ? Number(value) : null)}
        onAccountSelect={(selected: any) => onFormChange(field, selected ? Number(selected.id) : null)}
        showCostCenterButton={false} showCostCenterDialog={false} placeholder={tr("رقم الحساب أو البحث")} />
    </Field>
  )
  const dropdown = (field: "salesman_id" | "driver_id" | "warehouse_id", label: string, options: { label: string; value: number }[]) => (
    <Field label={label}>
      <PrimeDropdown value={form[field] ?? null} options={[{ label: tr("بلا"), value: null }, ...options]} optionLabel="label" optionValue="value" filter
        className="invoice-currency-dropdown w-full" panelClassName="invoice-currency-dropdown-panel" appendTo={() => document.body}
        onChange={(e: any) => onFormChange(field, e.value ?? null)} />
    </Field>
  )
  return (
    <>
      <FormSection icon={<Truck className="h-4 w-4" />} title={tr("البيع المتجول")} hint={tr("مندوب السيارة ومستودعها وصندوقها — تُستخدم في شاشة البيع المتجول")}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
          {dropdown("salesman_id", tr("المندوب"), salesmen)}
          {dropdown("driver_id", tr("السائق"), drivers)}
          {dropdown("warehouse_id", tr("مستودع السيارة"), warehouses)}
          {account("cash_account_id", tr("صندوق السيارة"))}
        </div>
      </FormSection>
      <FormSection icon={<Wallet className="h-4 w-4" />} title={tr("حسابات مصاريف السيارة")}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
          {account("insurance_account_id", tr("حساب مصروف التأمين (سنوي)"))}
          {account("license_account_id", tr("حساب مصروف الترخيص (سنوي)"))}
          {account("fuel_account_id", tr("حساب مصروف المحروقات"))}
          {account("maintenance_account_id", tr("حساب مصروف صيانة"))}
        </div>
      </FormSection>
    </>
  )
}
