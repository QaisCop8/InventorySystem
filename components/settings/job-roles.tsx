"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Edit, Trash2, UserCog } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"

interface JobRole {
  id: number
  name: string
  status: number
  created_at: string
  updated_at: string
}

const getStatusBadgeVariant = (status?: number) =>
  status === 1 ? "default" : status === 2 ? "secondary" : "destructive"
const getStatusLabel = (status?: number) => (status === 1 ? "نشط" : status === 2 ? "مجمّد" : "محذوف")
const getToggleStatusLabel = (status?: number) => (status === 2 ? "إلغاء التجميد" : "تجميد")
const getToggledStatus = (status?: number) => (status === 2 ? 1 : 2)

export default function JobRoles() {
  const { toast } = useToast()
  const [items, setItems] = useState<JobRole[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ id: 0, name: "", status: 1 })
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState("")
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/settings/job-roles")
      if (!response.ok) throw new Error("فشل في تحميل الأدوار الوظيفية")
      setItems(await response.json())
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchItems()
  }, [fetchItems])

  const openDeleteConfirm = (message: string, action: () => void) => {
    setConfirmMessage(message)
    setConfirmAction(() => action)
    setConfirmVisible(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم الدور الوظيفي", variant: "destructive" })
      return
    }
    try {
      const isEditing = form.id > 0
      const url = isEditing ? `/api/settings/job-roles/${form.id}` : "/api/settings/job-roles"
      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, status: form.status }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حفظ الدور الوظيفي")
      }
      await fetchItems()
      setForm({ id: 0, name: "", status: 1 })
      setShowForm(false)
      toast({ title: "تم الحفظ بنجاح", description: isEditing ? "تم تعديل الدور الوظيفي" : "تم إضافة الدور الوظيفي" })
    } catch (error) {
      toast({ title: "فشل الحفظ", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
    }
  }

  const handleEdit = (item: JobRole) => {
    setForm({ id: item.id, name: item.name, status: item.status })
    setShowForm(true)
  }

  const handleFreeze = async (item: JobRole) => {
    const nextStatus = getToggledStatus(item.status)
    try {
      const response = await fetch(`/api/settings/job-roles/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, status: nextStatus }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في تحديث الحالة")
      }
      await fetchItems()
      toast({ title: nextStatus === 2 ? "تم التجميد" : "تم إلغاء التجميد" })
    } catch (error) {
      toast({ title: "فشل", description: error instanceof Error ? error.message : "تعذر تحديث الحالة", variant: "destructive" })
    }
  }

  const handleDelete = async (itemId: number) => {
    try {
      const response = await fetch(`/api/settings/job-roles/${itemId}`, { method: "DELETE" })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف الدور الوظيفي")
      }
      await fetchItems()
      toast({ title: "تم الحذف", description: "تم حذف الدور الوظيفي" })
    } catch (error) {
      toast({ title: "فشل الحذف", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4 overflow-x-hidden p-3 sm:space-y-6 sm:p-6" dir="rtl">
      <Card dir="rtl">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
              <UserCog className="h-5 w-5 text-primary" />
              <span className="break-words">الأدوار الوظيفية ({items.length})</span>
            </CardTitle>
            <Button
              className="erp-btn-primary w-full whitespace-normal sm:w-auto"
              size="sm"
              onClick={() => {
                setForm({ id: 0, name: "", status: 1 })
                setShowForm(!showForm)
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              إضافة دور وظيفي
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showForm && (
            <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
              <h3 className="font-heading font-semibold mb-4 text-right">
                {form.id > 0 ? "تعديل الدور الوظيفي" : "إضافة دور وظيفي جديد"}
              </h3>
              <form className="space-y-4" onSubmit={handleSave}>
                <div className="text-right">
                  <Label className="text-right block">اسم الدور الوظيفي *</Label>
                  <Input
                    required
                    className="text-right"
                    placeholder="مثال: مشرف مبيعات"
                    dir="rtl"
                    maxLength={100}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="flex flex-wrap justify-start gap-2 pt-2">
                  <Button type="submit" className="erp-btn-primary" size="sm">
                    حفظ الدور الوظيفي
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowForm(false)
                      setForm({ id: 0, name: "", status: 1 })
                    }}
                  >
                    إلغاء
                  </Button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">جاري التحميل...</div>
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className={cn(
                    "p-4 rounded-lg border transition-all cursor-pointer",
                    index === currentIndex ? "bg-primary/10 border-primary shadow-sm" : "bg-background hover:bg-muted/50",
                  )}
                  onClick={() => setCurrentIndex(index)}
                  dir="rtl"
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1 text-right">
                      <h4 className="break-words font-heading font-semibold">{item.name}</h4>
                      <p className="text-xs text-muted-foreground">ID: {item.id}</p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(item)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      {item.status !== 3 && (
                        <Button variant="outline" size="sm" className="whitespace-normal text-xs sm:text-sm" onClick={() => void handleFreeze(item)}>
                          {getToggleStatusLabel(item.status)}
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذا الدور الوظيفي؟", () => void handleDelete(item.id))}
                        aria-label="حذف الدور الوظيفي"
                        title="حذف الدور الوظيفي"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      <Badge className="shrink-0" variant={getStatusBadgeVariant(item.status)}>{getStatusLabel(item.status)}</Badge>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="flex h-40 items-center justify-center text-muted-foreground">لا توجد أدوار وظيفية بعد</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialogYesNo
        visible={confirmVisible}
        message={confirmMessage}
        onConfirm={() => {
          confirmAction?.()
          setConfirmVisible(false)
        }}
        onCancel={() => setConfirmVisible(false)}
        isCompact={true}
      />
    </div>
  )
}
