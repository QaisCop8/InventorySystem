"use client"

import { tr, appDir } from "@/lib/i18n"
import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Car as CarIcon } from "lucide-react"
import UnifiedCars, { type Car, type CarFormData } from "@/components/products/unified-cars"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { useNavigationGuard } from "@/lib/navigation-guard"
import { useFileAccess } from "@/components/auth/use-file-access"

const buildEmptyForm = (): CarFormData => ({
  id: 0,
  car_code: "",
  name: "",
  plate_number: "",
  model: "",
  licence_expiry: "",
  salesman_id: null,
  warehouse_id: null,
  cash_account_id: null,
  insurance_account_id: null,
  fuel_account_id: null,
  maintenance_account_id: null,
  status: "نشط",
})

const normalizeCarCode = (code: string): string => {
  const cleaned = (code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!cleaned) return ""

  const letters = cleaned.replace(/\d/g, "")
  const digits = cleaned.replace(/\D/g, "")
  const prefix = (letters || "CR").slice(0, 8)

  if (!digits) return prefix.slice(0, 8)

  const paddingLength = Math.max(1, 8 - prefix.length)
  return `${prefix}${digits.padStart(paddingLength, "0")}`.slice(0, 8)
}

export default function Cars() {
  const can = useFileAccess("cars")
  const canView = can("view"), canCreate = can("create"), canUpdate = can("update"), canDelete = can("delete")
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [form, setForm] = useState<CarFormData>(buildEmptyForm())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isNewMode, setIsNewMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [deleteConfirmMessage, setDeleteConfirmMessage] = useState("هل تريد حذف هذه السيارة؟")
  const [validationError, setValidationError] = useState("")
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const [pendingAction, setPendingAction] = useState<"new" | "close" | "switch" | null>(null)
  const navigationContinuationRef = useRef<(() => void) | null>(null)
  const initialFormHashRef = useRef("")

  const getFormHash = useCallback((value: CarFormData) => JSON.stringify(value), [])

  const syncInitialFormHash = useCallback((value: CarFormData) => {
    initialFormHashRef.current = getFormHash(value)
  }, [getFormHash])

  const hasUnsavedChanges = useMemo(() => {
    if (!initialFormHashRef.current) return false
    return initialFormHashRef.current !== getFormHash(form)
  }, [form, getFormHash])

  const filteredCars = useMemo(() => {
    if (!canView) return []
    const search = searchTerm.trim().toLowerCase()
    return cars.filter((car) => {
      if (!search) return true
      return (
        car.name?.toLowerCase().includes(search) ||
        car.car_code?.toLowerCase().includes(search) ||
        (car.plate_number || "").toLowerCase().includes(search)
      )
    })
  }, [canView, cars, searchTerm])

  const fetchCars = useCallback(async (opts?: { silent?: boolean }) => {
    if (!canView) { setCars([]); setLoading(false); return [] }
    const silent = opts?.silent === true
    if (!silent) setLoading(true)
    if (!silent) setError(null)
    try {
      const res = await fetch("/api/cars")
      if (!res.ok) throw new Error(tr("فشل في تحميل السيارات"))
      const data: Car[] = await res.json()
      setCars(data)
      return data
    } catch (err: any) {
      if (!silent) setError(err.message || tr("حدث خطأ"))
      return []
    } finally {
      if (!silent) setLoading(false)
    }
  }, [canView])

  useEffect(() => {
    void fetchCars()
  }, [fetchCars])

  const initializeNewCarForm = useCallback(async () => {
    if (!canCreate) return buildEmptyForm()
    setDeleteError("")
    let nextForm = buildEmptyForm()
    try {
      const response = await fetch("/api/cars/generate-number")
      const data = await response.json()
      nextForm = { ...nextForm, car_code: normalizeCarCode(String(data.number || "")) }
    } catch (error) {
      console.error(error)
    }
    setForm(nextForm)
    syncInitialFormHash(nextForm)
    setCurrentIndex(0)
    setIsNewMode(true)
    setValidationError("")
    setShowDeleteConfirm(false)
    return nextForm
  }, [canCreate, syncInitialFormHash])

  const openNewCarDialog = useCallback(async () => {
    if (!canCreate) return
    await initializeNewCarForm()
    setDialogOpen(true)
  }, [canCreate, initializeNewCarForm])

  const carToForm = (car: Car): CarFormData => ({
    id: car.id,
    car_code: car.car_code,
    name: car.name,
    plate_number: car.plate_number || "",
    model: car.model || "",
    licence_expiry: car.licence_expiry || "",
    status: car.status || "نشط",
    salesman_id: car.salesman_id ?? null,
    warehouse_id: car.warehouse_id ?? null,
    cash_account_id: car.cash_account_id ?? null,
    insurance_account_id: car.insurance_account_id ?? null,
    fuel_account_id: car.fuel_account_id ?? null,
    maintenance_account_id: car.maintenance_account_id ?? null,
  })

  const openEditCarDialog = useCallback((car: Car, index: number) => {
    if (!canView) return
    setDeleteError("")
    const nextForm = carToForm(car)
    setForm(nextForm)
    syncInitialFormHash(nextForm)
    setCurrentIndex(index)
    setIsNewMode(false)
    setDialogOpen(true)
  }, [canView, syncInitialFormHash])

  // السجل كما حُمِّل (للمقارنة): تغيير رقم السيارة وحده لا يُعدّ تعديلاً عند الانتقال بالرقم
  const loadedForm = useCallback((): CarFormData | null => {
    try { return initialFormHashRef.current ? JSON.parse(initialFormHashRef.current) : null } catch { return null }
  }, [])
  const isDirtyExceptCode = useCallback(() => {
    const base = loadedForm()
    return Boolean(base) && JSON.stringify({ ...form, car_code: base!.car_code }) !== initialFormHashRef.current
  }, [form, loadedForm])

  // تبديل السجل (تنقل/رقم السيارة) بعد فحص التغييرات غير المحفوظة: حفظ ثم انتقال / انتقال بلا حفظ / رجوع
  const runGuarded = useCallback((action: () => void) => {
    if (dialogOpen && isDirtyExceptCode()) {
      navigationContinuationRef.current = action
      setPendingAction("switch")
      setShowUnsavedConfirm(true)
      return
    }
    action()
  }, [dialogOpen, isDirtyExceptCode])

  const loadRecord = useCallback((car: Car, index: number) => {
    const nextForm = carToForm(car)
    setForm(nextForm)
    syncInitialFormHash(nextForm)
    setCurrentIndex(index >= 0 ? index : 0)
    setIsNewMode(false)
    setDeleteError("")
    setValidationError("")
  }, [syncInitialFormHash])

  const handleCarCodeBlur = useCallback((car_code: string) => {
    const normalized = normalizeCarCode(car_code)
    const originalCode = loadedForm()?.car_code || ""
    if (!normalized || normalized === originalCode || !canView) {
      setForm((prev) => ({ ...prev, car_code: normalized || originalCode }))
      return
    }
    const match = cars.find((car) => car.car_code.trim().toUpperCase() === normalized)
    if (match) {
      if (match.id === form.id) return
      // يُعاد رقم السجل الحالي قبل السؤال حتى لا يُحفظ برقم سيارة أخرى
      setForm((prev) => ({ ...prev, car_code: originalCode }))
      runGuarded(() => loadRecord(match, filteredCars.findIndex((car) => car.id === match.id)))
      return
    }
    if (form.id > 0) {
      // رقم غير موجود أثناء عرض سيارة ⇐ سجل جديد بهذا الرقم (كشاشة البنوك)
      setForm((prev) => ({ ...prev, car_code: originalCode }))
      runGuarded(() => {
        const next = { ...buildEmptyForm(), car_code: normalized }
        setForm(next)
        syncInitialFormHash(next)
        setCurrentIndex(0)
        setIsNewMode(true)
        setDeleteError("")
        setValidationError("")
      })
      return
    }
    setForm((prev) => ({ ...prev, car_code: normalized }))
  }, [canView, cars, filteredCars, form.id, loadRecord, loadedForm, runGuarded, syncInitialFormHash])

  const normalizedCarCode = useMemo(() => normalizeCarCode(form.car_code), [form.car_code])

  const hasDuplicateCode = useMemo(() => {
    return cars.some((car) => car.id !== form.id && car.car_code.trim().toLowerCase() === normalizedCarCode.trim().toLowerCase() && normalizedCarCode.trim() !== "")
  }, [cars, form.id, normalizedCarCode])

  const normalizedCarName = useMemo(() => form.name.trim().toLowerCase(), [form.name])

  const hasDuplicateName = useMemo(() => {
    return normalizedCarName.length > 0 && cars.some((car) => car.id !== form.id && car.name.trim().toLowerCase() === normalizedCarName)
  }, [cars, form.id, normalizedCarName])

  const canSaveForm = !!form.name.trim() && !hasDuplicateName

  const saveCar = useCallback(async (options?: { afterSaveAction?: "new" | "close" | "stay" }) => {
    if (!(form.id > 0 ? canUpdate : canCreate)) return false
    if (!canSaveForm) {
      if (hasDuplicateName) {
        setValidationError(tr("اسم السيارة مكرر لا يمكن الاستمرار"))
      } else {
        setValidationError(tr("يرجى إدخال اسم السيارة"))
      }
      return false
    }

    setDeleteError("")
    setValidationError("")
    setIsSaving(true)
    try {
      const payload = {
        ...form,
        car_code: normalizedCarCode,
        name: form.name.trim(),
      }
      const method = form.id > 0 ? "PUT" : "POST"
      const response = await fetch(form.id > 0 ? `/api/cars/${form.id}` : "/api/cars", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        let errorMessage = tr("فشل في حفظ السيارة")
        try {
          const errorPayload = await response.json()
          errorMessage = errorPayload?.error || errorPayload?.message || errorMessage
        } catch {
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }

      await fetchCars({ silent: true })
      // "stay": حفظ قبل تبديل السجل (التنقل/رقم السيارة) — السجل التالي يحمّله الإجراء المؤجَّل
      if (options?.afterSaveAction === "stay") return true
      if (options?.afterSaveAction === "close" || !canCreate) {
        setDialogOpen(false)
        return true
      }

      await initializeNewCarForm()
      setDialogOpen(true)
      return true
    } catch (error) {
      console.error(error)
      setValidationError(error instanceof Error ? error.message : tr("فشل في حفظ السيارة"))
      return false
    } finally {
      setIsSaving(false)
    }
  }, [canCreate, canUpdate, canSaveForm, fetchCars, form, hasDuplicateName, initializeNewCarForm, normalizedCarCode])

  const deleteCar = useCallback(async () => {
    if (!canDelete || !form.id) return
    try {
      const response = await fetch(`/api/cars/${form.id}`, { method: "DELETE" })
      if (!response.ok) {
        let errorMessage = tr("فشل في حذف السيارة")
        try {
          const errorPayload = await response.json()
          errorMessage = errorPayload?.error || errorPayload?.message || errorMessage
        } catch {
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }
      const updatedCars = await fetchCars({ silent: true })
      if (updatedCars.length > 0) {
        const nextCar = updatedCars[Math.min(currentIndex, updatedCars.length - 1)]
        const nextForm = carToForm(nextCar)
        setForm(nextForm)
        syncInitialFormHash(nextForm)
        setCurrentIndex(Math.min(currentIndex, updatedCars.length - 1))
        setIsNewMode(false)
      } else {
        const emptyForm = buildEmptyForm()
        setForm(emptyForm)
        syncInitialFormHash(emptyForm)
        setIsNewMode(true)
      }
      setShowDeleteConfirm(false)
      setDeleteConfirmMessage(tr("هل تريد حذف هذه السيارة؟"))
      setDeleteError("")
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : tr("حدث خطأ أثناء الحذف")
      setDeleteConfirmMessage(message)
      setDeleteError(message)
      setShowDeleteConfirm(true)
    }
  }, [canDelete, currentIndex, fetchCars, form.id, syncInitialFormHash])

  // الأول/السابق/التالي/الأخير من قائمة السيارات المعروضة (نفس ترتيب الجدول والعداد) — سجل جديد: السابق ⇐ الأخير، التالي ⇐ الأول
  const handleNavigate = useCallback((direction: "first" | "previous" | "next" | "last") => {
    if (!canView || filteredCars.length === 0) return
    const last = filteredCars.length - 1
    const current = filteredCars.findIndex((car) => car.id === form.id)
    const target = current < 0
      ? (direction === "first" || direction === "next" ? 0 : last)
      : direction === "first" ? 0 : direction === "last" ? last : direction === "previous" ? Math.max(0, current - 1) : Math.min(last, current + 1)
    const record = filteredCars[target]
    if (!record || record.id === form.id) return
    runGuarded(() => loadRecord(record, target))
  }, [canView, filteredCars, form.id, loadRecord, runGuarded])

  const handleRequestNew = useCallback(() => {
    if (!canCreate) return
    if (dialogOpen && hasUnsavedChanges) {
      setPendingAction("new")
      setShowUnsavedConfirm(true)
      return
    }
    void openNewCarDialog()
  }, [canCreate, dialogOpen, hasUnsavedChanges, openNewCarDialog])

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && (showDeleteConfirm || showUnsavedConfirm)) return
    if (!open && hasUnsavedChanges) {
      setPendingAction("close")
      setShowUnsavedConfirm(true)
      return
    }

    if (!open) {
      void fetchCars()
    }

    setDialogOpen(open)
  }, [fetchCars, hasUnsavedChanges, showDeleteConfirm, showUnsavedConfirm])

  const handleUnsavedConfirm = useCallback(async () => {
    setShowUnsavedConfirm(false)
    if (pendingAction === "new") {
      await saveCar({ afterSaveAction: "new" })
    } else if (pendingAction === "close" || pendingAction === "switch") {
      const saved = await saveCar({ afterSaveAction: pendingAction === "switch" ? "stay" : "close" })
      const continuation = navigationContinuationRef.current
      navigationContinuationRef.current = null
      if (saved && continuation) continuation()
    }
    setPendingAction(null)
  }, [pendingAction, saveCar])

  const handleDiscardUnsaved = useCallback(() => {
    setShowUnsavedConfirm(false)
    setPendingAction(null)
    if (pendingAction === "new") {
      void openNewCarDialog()
    } else if (pendingAction === "close") {
      void fetchCars()
      setDialogOpen(false)
      const continuation = navigationContinuationRef.current
      navigationContinuationRef.current = null
      continuation?.()
    } else if (pendingAction === "switch") {
      const continuation = navigationContinuationRef.current
      navigationContinuationRef.current = null
      continuation?.()
    }
  }, [fetchCars, openNewCarDialog, pendingAction])

  // تبديل الشاشة من القائمة/إغلاق التبويب/رجوع المتصفح/تحديث الصفحة مع تغييرات غير محفوظة ⇐ نفس نافذة
  // التحقق (حفظ/عدم حفظ/إلغاء) — كما في كاشير نقطة البيع (lib/navigation-guard.ts)
  useNavigationGuard(
    () => dialogOpen && hasUnsavedChanges,
    (continueNavigation) => {
      navigationContinuationRef.current = continueNavigation
      setPendingAction("close")
      setShowUnsavedConfirm(true)
    },
  )

  const handleCancelUnsaved = useCallback(() => {
    setShowUnsavedConfirm(false)
    setPendingAction(null)
    navigationContinuationRef.current = null
  }, [])

  const handleFormChange = useCallback((field: string, value: string) => {
    if (!(form.id > 0 ? canUpdate : canCreate)) return
    setValidationError("")
    setForm((prev) => ({ ...prev, [field]: value }))
  }, [canCreate, canUpdate, form.id])

  const handleDelete = useCallback(() => {
    if (!canDelete) return
    setDeleteConfirmMessage(tr("هل تريد حذف هذه السيارة؟"))
    setDeleteError("")
    setShowDeleteConfirm(true)
  }, [canDelete])

  const handleConfirmDelete = useCallback(() => void deleteCar(), [deleteCar])
  const handleCancelDelete = useCallback(() => setShowDeleteConfirm(false), [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
          <p className="text-muted-foreground">{tr("جاري تحميل السيارات...")}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-destructive">{tr("خطأ: ")}{error}</p>
          <Button onClick={() => void fetchCars()} variant="outline">{tr("إعادة المحاولة")}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 p-6" dir={appDir()}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xl font-semibold">
            <CarIcon className="h-5 w-5 text-primary" />
            {tr("السيارات")}
          </div>
          <div className="text-sm text-muted-foreground">{tr("إدارة سيارات الشركة وبيانات تراخيصها")}</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Input
              placeholder={tr("بحث برقم أو اسم السيارة أو رقم اللوحة")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="min-w-[260px]"
              disabled={loading || !canView}
            />
            <Button variant="outline" size="sm" disabled={loading || !canView}>
              <Search className="h-4 w-4" />
              {tr("بحث")}
            </Button>
          </div>
          <Button onClick={() => void handleRequestNew()} className="whitespace-nowrap" disabled={loading || !canCreate}>
            <Plus className="me-2 h-4 w-4" />{tr(" إضافة سيارة جديدة")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-start font-semibold">{tr("رقم السيارة")}</th>
                  <th className="p-4 text-start font-semibold">{tr("اسم السيارة")}</th>
                  <th className="p-4 text-start font-semibold">{tr("رقم اللوحة")}</th>
                  <th className="p-4 text-start font-semibold">{tr("الموديل")}</th>
                  <th className="p-4 text-start font-semibold">{tr("تاريخ انتهاء الرخصة")}</th>
                  <th className="p-4 text-start font-semibold">{tr("الحالة")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredCars.map((car, index) => (
                  <tr key={car.id} className="cursor-pointer border-b transition hover:bg-slate-50" onClick={() => openEditCarDialog(car, index)}>
                    <td className="p-4 font-mono">{car.car_code}</td>
                    <td className="p-4 font-semibold">{car.name}</td>
                    <td className="p-4">{car.plate_number || "-"}</td>
                    <td className="p-4">{car.model || "-"}</td>
                    <td className="p-4">{car.licence_expiry || "-"}</td>
                    <td className="p-4">
                      {car.status === "نشط" ? (
                        <Badge className="bg-green-100 text-green-800">{tr("نشط")}</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800">{tr("غير نشط")}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredCars.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">{tr("لا توجد سيارات مسجلة")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <UnifiedCars
        dialogOpen={dialogOpen}
        currentIndex={currentIndex}
        totalRecords={filteredCars.length}
        form={form}
        isSaving={isSaving}
        loading={loading}
        showDeleteConfirm={showDeleteConfirm}
        onOpenChange={handleOpenChange}
        onNew={handleRequestNew}
        onSave={async (options) => { await saveCar(options) }}
        onDelete={handleDelete}
        onNavigate={handleNavigate}
        onFormChange={handleFormChange}
        onCodeBlur={handleCarCodeBlur}
        canSave={canSaveForm}
        hasDuplicateCode={hasDuplicateCode}
        hasDuplicateName={hasDuplicateName}
        deleteError={deleteError}
        deleteConfirmMessage={deleteConfirmMessage}
        validationError={validationError}
        isFirstRecord={currentIndex <= 0}
        isLastRecord={filteredCars.length === 0 ? true : currentIndex >= filteredCars.length - 1}
        isNewMode={isNewMode}
        onConfirmDelete={handleConfirmDelete}
        onCancelDelete={handleCancelDelete}
      />

      <ConfirmDialogYesNo
        visible={showUnsavedConfirm}
        message={tr("تم تعديل السجل هل تريد الحفظ؟")}
        onConfirm={handleUnsavedConfirm}
        onCancel={handleDiscardUnsaved}
        onBack={handleCancelUnsaved}
        showBack={true}
        useAppDialog
        onDismiss={handleCancelUnsaved}
      />
    </div>
  )
}
