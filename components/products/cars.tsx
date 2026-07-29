"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Car as CarIcon } from "lucide-react"
import UnifiedCars, { type Car, type CarFormData } from "@/components/products/unified-cars"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"

const buildEmptyForm = (): CarFormData => ({
  id: 0,
  car_code: "",
  name: "",
  plate_number: "",
  model: "",
  licence_expiry: "",
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
  const [pendingAction, setPendingAction] = useState<"new" | "close" | null>(null)
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
    const search = searchTerm.trim().toLowerCase()
    return cars.filter((car) => {
      if (!search) return true
      return (
        car.name?.toLowerCase().includes(search) ||
        car.car_code?.toLowerCase().includes(search) ||
        (car.plate_number || "").toLowerCase().includes(search)
      )
    })
  }, [cars, searchTerm])

  const fetchCars = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) setLoading(true)
    if (!silent) setError(null)
    try {
      const res = await fetch("/api/cars")
      if (!res.ok) throw new Error("فشل في تحميل السيارات")
      const data: Car[] = await res.json()
      setCars(data)
      return data
    } catch (err: any) {
      if (!silent) setError(err.message || "حدث خطأ")
      return []
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchCars()
  }, [fetchCars])

  const initializeNewCarForm = useCallback(async () => {
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
  }, [syncInitialFormHash])

  const openNewCarDialog = useCallback(async () => {
    await initializeNewCarForm()
    setDialogOpen(true)
  }, [initializeNewCarForm])

  const carToForm = (car: Car): CarFormData => ({
    id: car.id,
    car_code: car.car_code,
    name: car.name,
    plate_number: car.plate_number || "",
    model: car.model || "",
    licence_expiry: car.licence_expiry || "",
    status: car.status || "نشط",
  })

  const openEditCarDialog = useCallback((car: Car, index: number) => {
    setDeleteError("")
    const nextForm = carToForm(car)
    setForm(nextForm)
    syncInitialFormHash(nextForm)
    setCurrentIndex(index)
    setIsNewMode(false)
    setDialogOpen(true)
  }, [syncInitialFormHash])

  const handleCarCodeBlur = useCallback(async (car_code: string) => {
    const normalized = normalizeCarCode(car_code)
    setForm((prev) => ({ ...prev, car_code: normalized }))

    if (!normalized) return

    try {
      const response = await fetch(`/api/cars?code=${encodeURIComponent(normalized)}`)
      if (!response.ok) return

      const existingCar = await response.json()
      if (!existingCar?.id) return

      const targetIndex = cars.findIndex((car) => car.id === existingCar.id)
      setForm(carToForm(existingCar))
      setCurrentIndex(targetIndex >= 0 ? targetIndex : 0)
      setIsNewMode(false)
      setDeleteError("")
    } catch (error) {
      console.error(error)
    }
  }, [cars])

  const normalizedCarCode = useMemo(() => normalizeCarCode(form.car_code), [form.car_code])

  const hasDuplicateCode = useMemo(() => {
    return cars.some((car) => car.id !== form.id && car.car_code.trim().toLowerCase() === normalizedCarCode.trim().toLowerCase() && normalizedCarCode.trim() !== "")
  }, [cars, form.id, normalizedCarCode])

  const normalizedCarName = useMemo(() => form.name.trim().toLowerCase(), [form.name])

  const hasDuplicateName = useMemo(() => {
    return normalizedCarName.length > 0 && cars.some((car) => car.id !== form.id && car.name.trim().toLowerCase() === normalizedCarName)
  }, [cars, form.id, normalizedCarName])

  const canSaveForm = !!form.name.trim() && !hasDuplicateName

  const saveCar = useCallback(async (options?: { afterSaveAction?: "new" | "close" }) => {
    if (!canSaveForm) {
      if (hasDuplicateName) {
        setValidationError("اسم السيارة مكرر لا يمكن الاستمرار")
      } else {
        setValidationError("يرجى إدخال اسم السيارة")
      }
      return
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
        let errorMessage = "فشل في حفظ السيارة"
        try {
          const errorPayload = await response.json()
          errorMessage = errorPayload?.error || errorPayload?.message || errorMessage
        } catch {
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }

      await fetchCars({ silent: true })
      if (options?.afterSaveAction === "close") {
        setDialogOpen(false)
        return
      }

      await initializeNewCarForm()
      setDialogOpen(true)
    } catch (error) {
      console.error(error)
      setValidationError(error instanceof Error ? error.message : "فشل في حفظ السيارة")
    } finally {
      setIsSaving(false)
    }
  }, [canSaveForm, fetchCars, form, hasDuplicateName, initializeNewCarForm, normalizedCarCode])

  const deleteCar = useCallback(async () => {
    if (!form.id) return
    try {
      const response = await fetch(`/api/cars/${form.id}`, { method: "DELETE" })
      if (!response.ok) {
        let errorMessage = "فشل في حذف السيارة"
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
      setDeleteConfirmMessage("هل تريد حذف هذه السيارة؟")
      setDeleteError("")
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "حدث خطأ أثناء الحذف"
      setDeleteConfirmMessage(message)
      setDeleteError(message)
      setShowDeleteConfirm(true)
    }
  }, [currentIndex, fetchCars, form.id, syncInitialFormHash])

  const handleNavigateRecord = useCallback((record: Car) => {
    const nextForm = carToForm(record)
    setForm(nextForm)
    syncInitialFormHash(nextForm)
    const targetIndex = filteredCars.findIndex((car) => car.id === record.id)
    setCurrentIndex(targetIndex >= 0 ? targetIndex : 0)
    setIsNewMode(false)
    setDialogOpen(true)
  }, [filteredCars, syncInitialFormHash])

  const handleRequestNew = useCallback(() => {
    if (dialogOpen && hasUnsavedChanges) {
      setPendingAction("new")
      setShowUnsavedConfirm(true)
      return
    }
    void openNewCarDialog()
  }, [dialogOpen, hasUnsavedChanges, openNewCarDialog])

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
    } else if (pendingAction === "close") {
      await saveCar({ afterSaveAction: "close" })
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
    }
  }, [fetchCars, openNewCarDialog, pendingAction])

  const handleCancelUnsaved = useCallback(() => {
    setShowUnsavedConfirm(false)
    setPendingAction(null)
  }, [])

  const handleFormChange = useCallback((field: string, value: string) => {
    setValidationError("")
    setForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleDelete = useCallback(() => {
    setDeleteConfirmMessage("هل تريد حذف هذه السيارة؟")
    setDeleteError("")
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => void deleteCar(), [deleteCar])
  const handleCancelDelete = useCallback(() => setShowDeleteConfirm(false), [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
          <p className="text-muted-foreground">جاري تحميل السيارات...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-destructive">خطأ: {error}</p>
          <Button onClick={() => void fetchCars()} variant="outline">إعادة المحاولة</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 p-6" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xl font-semibold">
            <CarIcon className="h-5 w-5 text-primary" />
            السيارات
          </div>
          <div className="text-sm text-muted-foreground">إدارة سيارات الشركة وبيانات تراخيصها</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Input
              placeholder="بحث برقم أو اسم السيارة أو رقم اللوحة"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="min-w-[260px]"
              disabled={loading}
            />
            <Button variant="outline" size="sm" disabled={loading}>
              <Search className="h-4 w-4" />
              بحث
            </Button>
          </div>
          <Button onClick={() => void handleRequestNew()} className="whitespace-nowrap" disabled={loading}>
            <Plus className="ml-2 h-4 w-4" /> إضافة سيارة جديدة
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-right font-semibold">رقم السيارة</th>
                  <th className="p-4 text-right font-semibold">اسم السيارة</th>
                  <th className="p-4 text-right font-semibold">رقم اللوحة</th>
                  <th className="p-4 text-right font-semibold">الموديل</th>
                  <th className="p-4 text-right font-semibold">تاريخ انتهاء الرخصة</th>
                  <th className="p-4 text-right font-semibold">الحالة</th>
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
                        <Badge className="bg-green-100 text-green-800">نشط</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800">غير نشط</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredCars.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد سيارات مسجلة</td>
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
        onSave={saveCar}
        onDelete={handleDelete}
        onNavigateRecord={handleNavigateRecord}
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
        message="تم تعديل السجل هل تريد الحفظ؟"
        onConfirm={handleUnsavedConfirm}
        onCancel={handleDiscardUnsaved}
        onBack={handleCancelUnsaved}
        showBack={true}
      />
    </div>
  )
}
