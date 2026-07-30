"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Edit, Trash2, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"

interface BrandType {
  id: number
  name: string
  status: number
}

interface Brand {
  id: number
  name: string
  brand_type_id: number
  brand_type_name: string
  status: number
  created_at: string
  updated_at: string
}

const getStatusBadgeVariant = (status?: number) =>
  status === 1 ? "default" : status === 2 ? "secondary" : "destructive"
const getStatusLabel = (status?: number) => (status === 1 ? "نشط" : status === 2 ? "مجمّد" : "محذوف")
const getToggleStatusLabel = (status?: number) => (status === 2 ? "إلغاء التجميد" : "تجميد")
const getToggledStatus = (status?: number) => (status === 2 ? 1 : 2)

export default function Brands() {
  const { toast } = useToast()
  const [items, setItems] = useState<Brand[]>([])
  const [brandTypes, setBrandTypes] = useState<BrandType[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ id: 0, name: "", brand_type_id: "", status: 1 })
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState("")
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)

  const fetchBrandTypes = useCallback(async () => {
    try {
      const response = await fetch("/api/brand-types")
      if (response.ok) setBrandTypes(await response.json())
    } catch (error) {
      console.error(error)
    }
  }, [])

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/brands")
      if (!response.ok) throw new Error("فشل في تحميل العلامات التجارية")
      setItems(await response.json())
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBrandTypes()
    void fetchItems()
  }, [fetchBrandTypes, fetchItems])

  const openDeleteConfirm = (message: string, action: () => void) => {
    setConfirmMessage(message)
    setConfirmAction(() => action)
    setConfirmVisible(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم العلامة التجارية", variant: "destructive" })
      return
    }
    if (!form.brand_type_id) {
      toast({ title: "خطأ", description: "يرجى اختيار نوع العلامة التجارية", variant: "destructive" })
      return
    }
    try {
      const isEditing = form.id > 0
      const url = isEditing ? `/api/brands/${form.id}` : "/api/brands"
      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, brand_type_id: Number(form.brand_type_id), status: form.status }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حفظ العلامة التجارية")
      }
      await fetchItems()
      setForm({ id: 0, name: "", brand_type_id: "", status: 1 })
      setShowForm(false)
      toast({ title: "تم الحفظ بنجاح", description: isEditing ? "تم تعديل العلامة التجارية" : "تم إضافة العلامة التجارية" })
    } catch (error) {
      toast({ title: "فشل الحفظ", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
    }
  }

  const handleEdit = (item: Brand) => {
    setForm({ id: item.id, name: item.name, brand_type_id: String(item.brand_type_id), status: item.status })
    setShowForm(true)
  }

  const handleFreeze = async (item: Brand) => {
    const nextStatus = getToggledStatus(item.status)
    try {
      const response = await fetch(`/api/brands/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, brand_type_id: item.brand_type_id, status: nextStatus }),
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
      const response = await fetch(`/api/brands/${itemId}`, { method: "DELETE" })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "فشل في حذف العلامة التجارية")
      }
      await fetchItems()
      toast({ title: "تم الحذف", description: "تم حذف العلامة التجارية" })
    } catch (error) {
      toast({ title: "فشل الحذف", description: error instanceof Error ? error.message : "حدث خطأ", variant: "destructive" })
    }
  }

  return (
    <div className="w-full space-y-6 p-6" dir="rtl">
      <Card dir="rtl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              العلامات التجارية ({items.length})
            </CardTitle>
            <Button
              className="erp-btn-primary"
              size="sm"
              onClick={() => {
                setForm({ id: 0, name: "", brand_type_id: "", status: 1 })
                setShowForm(!showForm)
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              إضافة علامة تجارية
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showForm && (
            <div className="bg-muted/30 rounded-lg p-4 border" dir="rtl">
              <h3 className="font-heading font-semibold mb-4 text-right">
                {form.id > 0 ? "تعديل العلامة التجارية" : "إضافة علامة تجارية جديدة"}
              </h3>
              <form className="space-y-4" onSubmit={handleSave}>
                <div className="text-right">
                  <Label className="text-right block">اسم العلامة التجارية *</Label>
                  <Input
                    required
                    className="text-right"
                    placeholder="مثال: سامسونج"
                    dir="rtl"
                    maxLength={100}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div className="text-right">
                  <Label className="text-right block">نوع العلامة التجارية *</Label>
                  <Select dir="rtl" value={form.brand_type_id} onValueChange={(value) => setForm({ ...form, brand_type_id: value })}>
                    <SelectTrigger className="text-right">
                      <SelectValue placeholder="اختر النوع" />
                    </SelectTrigger>
                    <SelectContent>
                      {brandTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id.toString()}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-start gap-2 pt-2">
                  <Button type="submit" className="erp-btn-primary" size="sm">
                    حفظ العلامة التجارية
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowForm(false)
                      setForm({ id: 0, name: "", brand_type_id: "", status: 1 })
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1 text-right">
                      <h4 className="font-heading font-semibold">{item.name}</h4>
                      <p className="text-xs text-muted-foreground">النوع: {item.brand_type_name || "-"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(item)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      {item.status !== 3 && (
                        <Button variant="outline" size="sm" onClick={() => void handleFreeze(item)}>
                          {getToggleStatusLabel(item.status)}
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDeleteConfirm("هل أنت متأكد من حذف هذه العلامة التجارية؟", () => void handleDelete(item.id))}
                        aria-label="حذف العلامة التجارية"
                        title="حذف العلامة التجارية"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      <Badge variant={getStatusBadgeVariant(item.status)}>{getStatusLabel(item.status)}</Badge>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="flex h-40 items-center justify-center text-muted-foreground">لا توجد علامات تجارية بعد</div>
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
