"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, UserCog } from "lucide-react"
import UnifiedDrivers, { type Driver, type DriverFormData, type LicenseType } from "@/components/products/unified-drivers"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"

const buildEmptyForm = (): DriverFormData => ({
  id: 0,
  driver_code: "",
  name: "",
  phone: "",
  licence_expiry: "",
  license_type_id: null,
  status: "نشط",
})

const normalizeDriverCode = (code: string): string => {
  const cleaned = (code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!cleaned) return ""

  const letters = cleaned.replace(/\d/g, "")
  const digits = cleaned.replace(/\D/g, "")
  const prefix = (letters || "DR").slice(0, 8)

  if (!digits) return prefix.slice(0, 8)

  const paddingLength = Math.max(1, 8 - prefix.length)
  return `${prefix}${digits.padStart(paddingLength, "0")}`.slice(0, 8)
}

export default function Drivers() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [licenseTypes, setLicenseTypes] = useState<LicenseType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [form, setForm] = useState<DriverFormData>(buildEmptyForm())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isNewMode, setIsNewMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [deleteConfirmMessage, setDeleteConfirmMessage] = useState("هل تريد حذف هذا السائق؟")
  const [validationError, setValidationError] = useState("")
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const [pendingAction, setPendingAction] = useState<"new" | "close" | null>(null)
  const initialFormHashRef = useRef("")

  const getFormHash = useCallback((value: DriverFormData) => JSON.stringify(value), [])

  const syncInitialFormHash = useCallback((value: DriverFormData) => {
    initialFormHashRef.current = getFormHash(value)
  }, [getFormHash])

  const hasUnsavedChanges = useMemo(() => {
    if (!initialFormHashRef.current) return false
    return initialFormHashRef.current !== getFormHash(form)
  }, [form, getFormHash])

  const filteredDrivers = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    return drivers.filter((driver) => {
      if (!search) return true
      return (
        driver.name?.toLowerCase().includes(search) ||
        driver.driver_code?.toLowerCase().includes(search) ||
        (driver.phone || "").toLowerCase().includes(search)
      )
    })
  }, [drivers, searchTerm])

  const fetchLicenseTypes = useCallback(async () => {
    try {
      const response = await fetch("/api/license-types")
      if (response.ok) {
        const data = await response.json()
        setLicenseTypes(Array.isArray(data.categories) ? data.categories : [])
      }
    } catch (error) {
      console.error("Error fetching license types:", error)
    }
  }, [])

  const fetchDrivers = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) setLoading(true)
    if (!silent) setError(null)
    try {
      const res = await fetch("/api/drivers")
      if (!res.ok) throw new Error("فشل في تحميل السائقين")
      const data: Driver[] = await res.json()
      setDrivers(data)
      return data
    } catch (err: any) {
      if (!silent) setError(err.message || "حدث خطأ")
      return []
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchDrivers()
    void fetchLicenseTypes()
  }, [fetchDrivers, fetchLicenseTypes])

  const initializeNewDriverForm = useCallback(async () => {
    setDeleteError("")
    let nextForm = buildEmptyForm()
    try {
      const response = await fetch("/api/drivers/generate-number")
      const data = await response.json()
      nextForm = { ...nextForm, driver_code: normalizeDriverCode(String(data.number || "")) }
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

  const openNewDriverDialog = useCallback(async () => {
    await initializeNewDriverForm()
    setDialogOpen(true)
  }, [initializeNewDriverForm])

  const driverToForm = (driver: Driver): DriverFormData => ({
    id: driver.id,
    driver_code: driver.driver_code,
    name: driver.name,
    phone: driver.phone || "",
    licence_expiry: driver.licence_expiry || "",
    license_type_id: driver.license_type_id ?? null,
    status: driver.status || "نشط",
  })

  const openEditDriverDialog = useCallback((driver: Driver, index: number) => {
    setDeleteError("")
    const nextForm = driverToForm(driver)
    setForm(nextForm)
    syncInitialFormHash(nextForm)
    setCurrentIndex(index)
    setIsNewMode(false)
    setDialogOpen(true)
  }, [syncInitialFormHash])

  const handleDriverCodeBlur = useCallback(async (driver_code: string) => {
    const normalized = normalizeDriverCode(driver_code)
    setForm((prev) => ({ ...prev, driver_code: normalized }))

    if (!normalized) return

    try {
      const response = await fetch(`/api/drivers?code=${encodeURIComponent(normalized)}`)
      if (!response.ok) return

      const existingDriver = await response.json()
      if (!existingDriver?.id) return

      const targetIndex = drivers.findIndex((driver) => driver.id === existingDriver.id)
      setForm(driverToForm(existingDriver))
      setCurrentIndex(targetIndex >= 0 ? targetIndex : 0)
      setIsNewMode(false)
      setDeleteError("")
    } catch (error) {
      console.error(error)
    }
  }, [drivers])

  const normalizedDriverCode = useMemo(() => normalizeDriverCode(form.driver_code), [form.driver_code])

  const hasDuplicateCode = useMemo(() => {
    return drivers.some((driver) => driver.id !== form.id && driver.driver_code.trim().toLowerCase() === normalizedDriverCode.trim().toLowerCase() && normalizedDriverCode.trim() !== "")
  }, [drivers, form.id, normalizedDriverCode])

  const normalizedDriverName = useMemo(() => form.name.trim().toLowerCase(), [form.name])

  const hasDuplicateName = useMemo(() => {
    return normalizedDriverName.length > 0 && drivers.some((driver) => driver.id !== form.id && driver.name.trim().toLowerCase() === normalizedDriverName)
  }, [drivers, form.id, normalizedDriverName])

  const canSaveForm = !!form.name.trim() && !!form.license_type_id && !hasDuplicateName

  const saveDriver = useCallback(async (options?: { afterSaveAction?: "new" | "close" }) => {
    if (!canSaveForm) {
      if (hasDuplicateName) {
        setValidationError("اسم السائق مكرر لا يمكن الاستمرار")
      } else if (!form.license_type_id) {
        setValidationError("يرجى اختيار نوع الرخصة")
      } else {
        setValidationError("يرجى إدخال اسم السائق")
      }
      return
    }

    setDeleteError("")
    setValidationError("")
    setIsSaving(true)
    try {
      const payload = {
        ...form,
        driver_code: normalizedDriverCode,
        name: form.name.trim(),
      }
      const method = form.id > 0 ? "PUT" : "POST"
      const response = await fetch(form.id > 0 ? `/api/drivers/${form.id}` : "/api/drivers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        let errorMessage = "فشل في حفظ السائق"
        try {
          const errorPayload = await response.json()
          errorMessage = errorPayload?.error || errorPayload?.message || errorMessage
        } catch {
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }

      await fetchDrivers({ silent: true })
      if (options?.afterSaveAction === "close") {
        setDialogOpen(false)
        return
      }

      await initializeNewDriverForm()
      setDialogOpen(true)
    } catch (error) {
      console.error(error)
      setValidationError(error instanceof Error ? error.message : "فشل في حفظ السائق")
    } finally {
      setIsSaving(false)
    }
  }, [canSaveForm, fetchDrivers, form, hasDuplicateName, initializeNewDriverForm, normalizedDriverCode])

  const deleteDriver = useCallback(async () => {
    if (!form.id) return
    try {
      const response = await fetch(`/api/drivers/${form.id}`, { method: "DELETE" })
      if (!response.ok) {
        let errorMessage = "فشل في حذف السائق"
        try {
          const errorPayload = await response.json()
          errorMessage = errorPayload?.error || errorPayload?.message || errorMessage
        } catch {
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }
      const updatedDrivers = await fetchDrivers({ silent: true })
      if (updatedDrivers.length > 0) {
        const nextDriver = updatedDrivers[Math.min(currentIndex, updatedDrivers.length - 1)]
        const nextForm = driverToForm(nextDriver)
        setForm(nextForm)
        syncInitialFormHash(nextForm)
        setCurrentIndex(Math.min(currentIndex, updatedDrivers.length - 1))
        setIsNewMode(false)
      } else {
        const emptyForm = buildEmptyForm()
        setForm(emptyForm)
        syncInitialFormHash(emptyForm)
        setIsNewMode(true)
      }
      setShowDeleteConfirm(false)
      setDeleteConfirmMessage("هل تريد حذف هذا السائق؟")
      setDeleteError("")
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "حدث خطأ أثناء الحذف"
      setDeleteConfirmMessage(message)
      setDeleteError(message)
      setShowDeleteConfirm(true)
    }
  }, [currentIndex, fetchDrivers, form.id, syncInitialFormHash])

  const handleNavigateRecord = useCallback((record: Driver) => {
    const nextForm = driverToForm(record)
    setForm(nextForm)
    syncInitialFormHash(nextForm)
    const targetIndex = filteredDrivers.findIndex((driver) => driver.id === record.id)
    setCurrentIndex(targetIndex >= 0 ? targetIndex : 0)
    setIsNewMode(false)
    setDialogOpen(true)
  }, [filteredDrivers, syncInitialFormHash])

  const handleRequestNew = useCallback(() => {
    if (dialogOpen && hasUnsavedChanges) {
      setPendingAction("new")
      setShowUnsavedConfirm(true)
      return
    }
    void openNewDriverDialog()
  }, [dialogOpen, hasUnsavedChanges, openNewDriverDialog])

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && (showDeleteConfirm || showUnsavedConfirm)) return
    if (!open && hasUnsavedChanges) {
      setPendingAction("close")
      setShowUnsavedConfirm(true)
      return
    }

    if (!open) {
      void fetchDrivers()
    }

    setDialogOpen(open)
  }, [fetchDrivers, hasUnsavedChanges, showDeleteConfirm, showUnsavedConfirm])

  const handleUnsavedConfirm = useCallback(async () => {
    setShowUnsavedConfirm(false)
    if (pendingAction === "new") {
      await saveDriver({ afterSaveAction: "new" })
    } else if (pendingAction === "close") {
      await saveDriver({ afterSaveAction: "close" })
    }
    setPendingAction(null)
  }, [pendingAction, saveDriver])

  const handleDiscardUnsaved = useCallback(() => {
    setShowUnsavedConfirm(false)
    setPendingAction(null)
    if (pendingAction === "new") {
      void openNewDriverDialog()
    } else if (pendingAction === "close") {
      void fetchDrivers()
      setDialogOpen(false)
    }
  }, [fetchDrivers, openNewDriverDialog, pendingAction])

  const handleCancelUnsaved = useCallback(() => {
    setShowUnsavedConfirm(false)
    setPendingAction(null)
  }, [])

  const handleFormChange = useCallback((field: string, value: string | number | null) => {
    setValidationError("")
    setForm((prev) => ({ ...prev, [field]: value }) as DriverFormData)
  }, [])

  const handleDelete = useCallback(() => {
    setDeleteConfirmMessage("هل تريد حذف هذا السائق؟")
    setDeleteError("")
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => void deleteDriver(), [deleteDriver])
  const handleCancelDelete = useCallback(() => setShowDeleteConfirm(false), [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
          <p className="text-muted-foreground">جاري تحميل السائقين...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-destructive">خطأ: {error}</p>
          <Button onClick={() => void fetchDrivers()} variant="outline">إعادة المحاولة</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 p-6" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xl font-semibold">
            <UserCog className="h-5 w-5 text-primary" />
            السائقين
          </div>
          <div className="text-sm text-muted-foreground">إدارة بيانات السائقين وتراخيصهم</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Input
              placeholder="بحث برقم أو اسم السائق أو رقم الهاتف"
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
            <Plus className="ml-2 h-4 w-4" /> إضافة سائق جديد
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-right font-semibold">رقم السائق</th>
                  <th className="p-4 text-right font-semibold">اسم السائق</th>
                  <th className="p-4 text-right font-semibold">رقم الهاتف</th>
                  <th className="p-4 text-right font-semibold">نوع الرخصة</th>
                  <th className="p-4 text-right font-semibold">تاريخ انتهاء الرخصة</th>
                  <th className="p-4 text-right font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.map((driver, index) => (
                  <tr key={driver.id} className="cursor-pointer border-b transition hover:bg-slate-50" onClick={() => openEditDriverDialog(driver, index)}>
                    <td className="p-4 font-mono">{driver.driver_code}</td>
                    <td className="p-4 font-semibold">{driver.name}</td>
                    <td className="p-4">{driver.phone || "-"}</td>
                    <td className="p-4">{driver.license_type_name || "-"}</td>
                    <td className="p-4">{driver.licence_expiry || "-"}</td>
                    <td className="p-4">
                      {driver.status === "نشط" ? (
                        <Badge className="bg-green-100 text-green-800">نشط</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800">غير نشط</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredDrivers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">لا يوجد سائقين مسجلين</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <UnifiedDrivers
        dialogOpen={dialogOpen}
        currentIndex={currentIndex}
        totalRecords={filteredDrivers.length}
        form={form}
        licenseTypes={licenseTypes}
        isSaving={isSaving}
        loading={loading}
        showDeleteConfirm={showDeleteConfirm}
        onOpenChange={handleOpenChange}
        onNew={handleRequestNew}
        onSave={saveDriver}
        onDelete={handleDelete}
        onNavigateRecord={handleNavigateRecord}
        onFormChange={handleFormChange}
        onCodeBlur={handleDriverCodeBlur}
        canSave={canSaveForm}
        hasDuplicateCode={hasDuplicateCode}
        hasDuplicateName={hasDuplicateName}
        deleteError={deleteError}
        deleteConfirmMessage={deleteConfirmMessage}
        validationError={validationError}
        isFirstRecord={currentIndex <= 0}
        isLastRecord={filteredDrivers.length === 0 ? true : currentIndex >= filteredDrivers.length - 1}
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
