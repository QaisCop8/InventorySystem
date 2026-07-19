"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Download, Package, Layers, BarChart3, TrendingUp, Trash2, Edit } from "lucide-react"
import UnifiedProductGroups from "@/components/products/unified-product-groups"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"

interface ItemGroup {
  id: number
  group_code: string
  group_name: string
  description?: string | null
  product_count?: number | null
  status: "نشط" | "غير نشط" | "متوقف"
}

interface FormData {
  id: number
  group_code: string
  group_name: string
  description: string
  status: "نشط" | "غير نشط"
}

const buildEmptyForm = (): FormData => ({
  id: 0,
  group_code: "",
  group_name: "",
  description: "",
  status: "نشط",
})

const normalizeGroupStatus = (value?: string | null): FormData["status"] => (value === "غير نشط" ? "غير نشط" : "نشط")

const formatGroupCode = (code: string): string => {
  const cleaned = (code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!cleaned) return ""

  const letters = cleaned.replace(/\d/g, "")
  const digits = cleaned.replace(/\D/g, "")
  const prefix = letters.slice(0, 8)

  if (!digits) return prefix.slice(0, 8)

  const paddingLength = Math.max(1, 8 - prefix.length)
  return `${prefix}${digits.padStart(paddingLength, "0")}`.slice(0, 8)
}

export default function ProductGroups() {
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [form, setForm] = useState<FormData>(buildEmptyForm())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isNewMode, setIsNewMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [deleteConfirmMessage, setDeleteConfirmMessage] = useState("هل تريد حذف هذه المجموعة؟")
  const [showFreezeConfirm, setShowFreezeConfirm] = useState(false)
  const [freezeConfirmMessage, setFreezeConfirmMessage] = useState("")
  const [freezeAction, setFreezeAction] = useState<"freeze" | "unfreeze" | null>(null)
  const [validationError, setValidationError] = useState("")
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const [pendingAction, setPendingAction] = useState<"new" | "close" | null>(null)
  const initialFormHashRef = useRef("")

  const getFormHash = useCallback((value: FormData) => JSON.stringify({
    id: value.id,
    group_code: value.group_code,
    group_name: value.group_name,
    description: value.description,
    status: value.status,
  }), [])

  const syncInitialFormHash = useCallback((value: FormData) => {
    initialFormHashRef.current = getFormHash(value)
  }, [getFormHash])

  const hasUnsavedChanges = useMemo(() => {
    if (!initialFormHashRef.current) return false
    return initialFormHashRef.current !== getFormHash(form)
  }, [form, getFormHash])

  const filteredGroups = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    return itemGroups.filter((group) => {
      if (!search) return true
      return (
        group.group_name?.toLowerCase().includes(search) ||
        group.group_code?.toLowerCase().includes(search) ||
        (group.description || "").toLowerCase().includes(search)
      )
    })
  }, [itemGroups, searchTerm])

  const statistics = useMemo(() => {
    const totalGroups = itemGroups.length
    const totalProducts = itemGroups.reduce((sum, g) => sum + (Number(g.product_count) || 0), 0)
    const largestGroup = itemGroups.reduce(
      (max, g) => (g.product_count && g.product_count > (max.product_count || 0) ? g : max),
      { group_name: "لا يوجد", product_count: 0 } as ItemGroup,
    )
    const averageProducts = totalGroups ? Math.round(totalProducts / totalGroups) : 0
    return { totalGroups, totalProducts, largestGroup, averageProducts }
  }, [itemGroups])

  const fetchItemGroups = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) setLoading(true)
    if (!silent) setError(null)
    try {
      const res = await fetch("/api/item-groups")
      if (!res.ok) throw new Error("فشل في تحميل المجموعات")
      const data: ItemGroup[] = await res.json()
      setItemGroups(data)
      return data
    } catch (err: any) {
      if (!silent) setError(err.message || "حدث خطأ")
      return []
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchItemGroups()
  }, [fetchItemGroups])

  const initializeNewGroupForm = useCallback(async () => {
    setDeleteError("")
    let nextForm = buildEmptyForm()
    try {
      const response = await fetch("/api/item-groups/generate-number")
      const data = await response.json()
      const generatedCode = formatGroupCode(String(data.number || ""))
      nextForm = { ...nextForm, group_code: generatedCode }
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

  const openNewGroupDialog = useCallback(async () => {
    await initializeNewGroupForm()
    setDialogOpen(true)
  }, [initializeNewGroupForm])

  const openEditGroupDialog = useCallback((group: ItemGroup, index: number) => {
    setDeleteError("")
    const nextForm = {
      id: group.id,
      group_code: group.group_code,
      group_name: group.group_name,
      description: group.description || "",
      status: normalizeGroupStatus(group.status === "متوقف" ? "نشط" : group.status || "نشط"),
    }
    setForm(nextForm)
    syncInitialFormHash(nextForm)
    setCurrentIndex(index)
    setIsNewMode(false)
    setDialogOpen(true)
  }, [syncInitialFormHash])

  const handleGroupCodeBlur = useCallback(async (group_code: string) => {
    const normalized = formatGroupCode(group_code)
    setForm((prev) => ({ ...prev, group_code: normalized }))

    if (!normalized) return

    try {
      const response = await fetch(`/api/item-groups?code=${encodeURIComponent(normalized)}`)
      if (!response.ok) return

      const existingGroup = await response.json()
      if (!existingGroup?.id) return

      const targetIndex = itemGroups.findIndex((group) => group.id === existingGroup.id)
      setForm({
        id: existingGroup.id,
        group_code: existingGroup.group_code,
        group_name: existingGroup.group_name,
        description: existingGroup.description || "",
        status: existingGroup.status === "غير نشط" ? "غير نشط" : "نشط",
      })
      setCurrentIndex(targetIndex >= 0 ? targetIndex : 0)
      setIsNewMode(false)
      setDeleteError("")
    } catch (error) {
      console.error(error)
    }
  }, [itemGroups])

  const normalizedGroupCode = useMemo(() => formatGroupCode(form.group_code), [form.group_code])

  const hasDuplicateCode = useMemo(() => {
    return itemGroups.some((group) => group.id !== form.id && group.group_code.trim().toLowerCase() === normalizedGroupCode.trim().toLowerCase() && normalizedGroupCode.trim() !== "")
  }, [form.id, itemGroups, normalizedGroupCode])

  const normalizedGroupName = useMemo(() => form.group_name.trim().toLowerCase(), [form.group_name])

  const hasDuplicateName = useMemo(() => {
    return (
      normalizedGroupName.length > 0 &&
      itemGroups.some((group) => group.id !== form.id && group.group_name.trim().toLowerCase() === normalizedGroupName)
    )
  }, [form.id, itemGroups, normalizedGroupName])

  const canSaveForm = !!form.group_name.trim() && !!normalizedGroupCode && !hasDuplicateCode && !hasDuplicateName

  const saveGroup = useCallback(async (options?: { afterSaveAction?: "new" | "close" }) => {
    if (!canSaveForm) {
      if (hasDuplicateName) {
        setValidationError("اسم المجموعة مكرر لا يمكن الاستمرار")
      } else if (hasDuplicateCode) {
        setValidationError("هذا الرقم مستخدم بالفعل. الرجاء اختيار رقم آخر.")
      } else {
        setValidationError("يرجى إدخال اسم المجموعة ورقم المجموعة")
      }
      return
    }

    setDeleteError("")
    setValidationError("")
    setIsSaving(true)
    try {
      const payload = {
        ...form,
        group_code: normalizedGroupCode,
        group_name: form.group_name.trim(),
        description: form.description || "",
        status: form.status === "غير نشط" ? "غير نشط" : "نشط",
      }
      const method = form.id > 0 ? "PUT" : "POST"
      const response = await fetch(form.id > 0 ? `/api/item-groups/${form.id}` : "/api/item-groups", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        let errorMessage = "فشل في حفظ المجموعة"
        try {
          const errorPayload = await response.json()
          errorMessage = errorPayload?.error || errorPayload?.message || errorMessage
        } catch {
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }

      await fetchItemGroups({ silent: true })
      if (options?.afterSaveAction === "close") {
        setDialogOpen(false)
        return
      }

      await initializeNewGroupForm()
      setDialogOpen(true)
    } catch (error) {
      console.error(error)
      setValidationError(error instanceof Error ? error.message : "فشل في حفظ المجموعة")
    } finally {
      setIsSaving(false)
    }
  }, [canSaveForm, fetchItemGroups, form, hasDuplicateCode, hasDuplicateName, initializeNewGroupForm, normalizedGroupCode, syncInitialFormHash])

  const deleteGroup = useCallback(async () => {
    if (!form.id) return
    try {
      const response = await fetch(`/api/item-groups/${form.id}`, { method: "DELETE" })
      if (!response.ok) {
        let errorMessage = "فشل في حذف المجموعة"
        try {
          const errorPayload = await response.json()
          errorMessage = errorPayload?.error || errorPayload?.message || errorMessage
        } catch {
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }
      const updatedGroups = await fetchItemGroups({ silent: true })
      if (updatedGroups.length > 0) {
        const nextGroup = updatedGroups[Math.min(currentIndex, updatedGroups.length - 1)]
        const nextForm: FormData = {
          id: nextGroup.id,
          group_code: nextGroup.group_code,
          group_name: nextGroup.group_name,
          description: nextGroup.description || "",
          status: normalizeGroupStatus(nextGroup.status === "متوقف" ? "نشط" : nextGroup.status || "نشط"),
        }
        setForm(nextForm)
        syncInitialFormHash(nextForm)
        setCurrentIndex(Math.min(currentIndex, updatedGroups.length - 1))
        setIsNewMode(false)
      } else {
        const emptyForm = buildEmptyForm()
        setForm(emptyForm)
        syncInitialFormHash(emptyForm)
        setIsNewMode(true)
      }
      setShowDeleteConfirm(false)
      setDeleteConfirmMessage("هل تريد حذف هذه المجموعة؟")
      setDeleteError("")
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "حدث خطأ أثناء الحذف"
      setDeleteConfirmMessage(message)
      setDeleteError(message)
      setShowDeleteConfirm(true)
    }
  }, [currentIndex, fetchItemGroups, form.id, syncInitialFormHash])

  const handleNavigateRecord = useCallback((record: ItemGroup) => {
    const nextForm: FormData = {
      id: record.id,
      group_code: record.group_code,
      group_name: record.group_name,
      description: record.description || "",
      status: normalizeGroupStatus(record.status === "متوقف" ? "نشط" : record.status || "نشط"),
    }
    setForm(nextForm)
    syncInitialFormHash(nextForm)
    const targetIndex = filteredGroups.findIndex((group) => group.id === record.id)
    setCurrentIndex(targetIndex >= 0 ? targetIndex : 0)
    setIsNewMode(false)
    setDialogOpen(true)
  }, [filteredGroups, syncInitialFormHash])

  const handleRequestNew = useCallback(() => {
    // Only prompt about unsaved changes when the editor popup is currently open.
    if (dialogOpen && hasUnsavedChanges) {
      setPendingAction("new")
      setShowUnsavedConfirm(true)
      return
    }
    void openNewGroupDialog()
  }, [dialogOpen, hasUnsavedChanges, openNewGroupDialog])

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && (showDeleteConfirm || showUnsavedConfirm)) return
    if (!open && hasUnsavedChanges) {
      setPendingAction("close")
      setShowUnsavedConfirm(true)
      return
    }

    if (!open) {
      void fetchItemGroups()
    }

    setDialogOpen(open)
  }, [fetchItemGroups, hasUnsavedChanges, showDeleteConfirm, showUnsavedConfirm])

  const handleUnsavedConfirm = useCallback(async () => {
    setShowUnsavedConfirm(false)
    if (pendingAction === "new") {
      await saveGroup({ afterSaveAction: "new" })
    } else if (pendingAction === "close") {
      await saveGroup({ afterSaveAction: "close" })
    }
    setPendingAction(null)
  }, [pendingAction, saveGroup])

  const handleDiscardUnsaved = useCallback(() => {
    setShowUnsavedConfirm(false)
    setPendingAction(null)
    if (pendingAction === "new") {
      void openNewGroupDialog()
    } else if (pendingAction === "close") {
      void fetchItemGroups()
      setDialogOpen(false)
    }
  }, [fetchItemGroups, pendingAction, syncInitialFormHash])

  const handleCancelUnsaved = useCallback(() => {
    setShowUnsavedConfirm(false)
    setPendingAction(null)
  }, [])

  const handleFormChange = useCallback((field: string, value: string) => {
    setValidationError("")
    setForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleDelete = useCallback(() => {
    setDeleteConfirmMessage("هل تريد حذف هذه المجموعة؟")
    setDeleteError("")
    setShowDeleteConfirm(true)
  }, [])
  const handleFreeze = useCallback((group: ItemGroup, index: number) => {
    const isFrozen = group.status === "غير نشط"
    setForm({
      id: group.id,
      group_code: group.group_code,
      group_name: group.group_name,
      description: group.description || "",
      status: isFrozen ? "غير نشط" : "نشط",
    })
    setCurrentIndex(index)
    setFreezeAction(isFrozen ? "unfreeze" : "freeze")
    setFreezeConfirmMessage(isFrozen ? "هل تريد إلغاء التجميد لهذه المجموعة؟" : "هل تريد تجميد هذه المجموعة؟")
    setShowFreezeConfirm(true)
  }, [])
  const handleConfirmDelete = useCallback(() => void deleteGroup(), [deleteGroup])
  const handleCancelDelete = useCallback(() => setShowDeleteConfirm(false), [])

  const handleConfirmFreeze = useCallback(() => {
    if (!form.id || !freezeAction) return
    const targetStatus = freezeAction === "freeze" ? "غير نشط" : "نشط"
    const doUpdate = async () => {
      setIsSaving(true)
      try {
        const payload = {
          ...form,
          status: targetStatus,
          group_code: normalizedGroupCode,
          group_name: form.group_name.trim(),
          description: form.description || "",
        }
        const res = await fetch(`/api/item-groups/${form.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          let message = "فشل في تحديث حالة المجموعة"
          try {
            const err = await res.json()
            message = err?.error || err?.message || message
          } catch {}
          throw new Error(message)
        }

        // fetch the updated single row
        const getRes = await fetch(`/api/item-groups/${form.id}`)
        if (getRes.ok) {
          const updated = await getRes.json()
          setItemGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)))
          const nextForm: FormData = {
            id: updated.id,
            group_code: updated.group_code,
            group_name: updated.group_name,
            description: updated.description || "",
            status: updated.status === "غير نشط" ? "غير نشط" : "نشط",
          }
          setForm(nextForm)
          syncInitialFormHash(nextForm)
        }
      } catch (err) {
        console.error(err)
        setValidationError(err instanceof Error ? err.message : "فشل في تحديث الحالة")
      } finally {
        setIsSaving(false)
        setShowFreezeConfirm(false)
        setFreezeAction(null)
        setFreezeConfirmMessage("")
      }
    }
    void doUpdate()
  }, [form, freezeAction])

  const handleCancelFreeze = useCallback(() => {
    setShowFreezeConfirm(false)
    setFreezeAction(null)
    setFreezeConfirmMessage("")
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
          <p className="text-muted-foreground">جاري تحميل المجموعات...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-destructive">خطأ: {error}</p>
          <Button onClick={() => void fetchItemGroups()} variant="outline">إعادة المحاولة</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 p-6" dir="rtl">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-blue-700">إجمالي المجموعات</p>
              <p className="text-3xl font-bold text-blue-900">{statistics.totalGroups}</p>
            </div>
            <Layers className="h-10 w-10 text-blue-600" />
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-green-100">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-green-700">إجمالي الأصناف</p>
              <p className="text-3xl font-bold text-green-900">{statistics.totalProducts}</p>
            </div>
            <Package className="h-10 w-10 text-green-600" />
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-orange-700">أكبر مجموعة</p>
              <p className="truncate text-lg font-bold text-orange-900">{statistics.largestGroup.group_name}</p>
              <p className="text-sm text-orange-600">{statistics.largestGroup.product_count} صنف</p>
            </div>
            <BarChart3 className="h-10 w-10 text-orange-600" />
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-purple-700">متوسط الأصناف</p>
              <p className="text-3xl font-bold text-purple-900">{statistics.averageProducts}</p>
            </div>
            <TrendingUp className="h-10 w-10 text-purple-600" />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-xl font-semibold">مجموعات الأصناف</div>
          <div className="text-sm text-muted-foreground">إدارة مجموعات الأصناف ورموزها الأساسية</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Input
              placeholder="بحث برقم أو اسم المجموعة"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="min-w-[260px]"
              disabled={loading}
            />
            <Button variant="outline" size="sm" disabled={loading} onClick={() => setSearchTerm(searchTerm)}>
              <Search className="h-4 w-4" />
              بحث
            </Button>
          </div>
          <Button onClick={() => void handleRequestNew()} className="whitespace-nowrap" disabled={loading}>
            <Plus className="ml-2 h-4 w-4" /> إضافة مجموعة جديدة
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-4 text-right font-semibold">رقم المجموعة</th>
              <th className="p-4 text-right font-semibold">اسم المجموعة</th>
              <th className="p-4 text-right font-semibold">الوصف</th>
              <th className="p-4 text-right font-semibold">عدد الأصناف</th>
              <th className="p-4 text-right font-semibold">الحالة</th>
              <th className="p-4 text-right font-semibold">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map((group, index) => (
              <tr key={group.id} className="cursor-pointer border-b transition hover:bg-slate-50" onClick={() => openEditGroupDialog(group, index)}>
                <td className="p-4 font-mono">{group.group_code}</td>
                <td className="p-4 font-semibold">{group.group_name}</td>
                <td className="p-4">{group.description || "-"}</td>
                <td className="p-4 font-medium">{group.product_count || 0}</td>
                <td className="p-4">{group.status === "نشط" ? <Badge className="bg-green-100 text-green-800">نشط</Badge> : <Badge className="bg-red-100 text-red-800">غير نشط</Badge>}</td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditGroupDialog(group, index)
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFreeze(group, index)
                      }}
                      className="whitespace-nowrap"
                    >
                      {group.status === "نشط" ? "تجميد" : "الغاء التجميد"}
                    </Button>
                    {/* Delete button removed per user request */}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UnifiedProductGroups
        dialogOpen={dialogOpen}
        currentIndex={currentIndex}
        totalRecords={filteredGroups.length}
        form={form}
        isSaving={isSaving}
        loading={loading}
        showDeleteConfirm={showDeleteConfirm}
        onOpenChange={handleOpenChange}
        onNew={handleRequestNew}
        onSave={saveGroup}
        onDelete={handleDelete}
        onNavigateRecord={handleNavigateRecord}
        onFormChange={handleFormChange}
        onCodeBlur={handleGroupCodeBlur}
        canSave={canSaveForm}
        hasDuplicateCode={hasDuplicateCode}
        hasDuplicateName={hasDuplicateName}
        deleteError={deleteError}
        deleteConfirmMessage={deleteConfirmMessage}
        validationError={validationError}
        isFirstRecord={currentIndex <= 0}
        isLastRecord={filteredGroups.length === 0 ? true : currentIndex >= filteredGroups.length - 1}
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
      <ConfirmDialogYesNo
        visible={showFreezeConfirm}
        message={freezeConfirmMessage || "هل أنت متأكد؟"}
        onConfirm={handleConfirmFreeze}
        onCancel={handleCancelFreeze}
        isCompact={true}
      />
    </div>
  )
}
