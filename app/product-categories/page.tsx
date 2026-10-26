"use client"

import { confirmYesNo, showAlert } from "@/components/ui/confirm-host"
import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit, Trash2, Package, Search, Filter } from "lucide-react"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { cn } from "@/lib/utils"

interface ProductCategory {
  id: number
  group_number: string
  group_name: string
  description?: string
  is_active: boolean
  product_count: number
  created_at: string
  updated_at: string
  status: string
}

export default function ProductCategoriesPage() {
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterActive, setFilterActive] = useState<boolean | null>(null)

  const [formData, setFormData] = useState({
    group_name: "",
    description: "",
    is_active: true,
  })

  console.log("[v0] Product Categories page initialized")

  const fetchCategories = async () => {
    try {
      setLoading(true)
      console.log("[v0] Fetching categories from API...")
      const response = await fetch("/api/item-groups")
      if (!response.ok) {
        throw new Error("Failed to fetch categories")
      }
      const data = await response.json()
      console.log("[v0] Fetched categories:", data.length)
      setCategories(data)
    } catch (error) {
      console.error("[v0] Error fetching categories:", error)
    } finally {
      setLoading(false)
    }
  }

  const createCategory = async (categoryData: any) => {
    try {
      console.log("[v0] Creating category:", categoryData)
      const response = await fetch("/api/item-groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(categoryData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create category")
      }

      const newCategory = await response.json()
      console.log("[v0] Created category:", newCategory.id)
      return newCategory
    } catch (error) {
      console.error("[v0] Error creating category:", error)
      throw error
    }
  }

  const updateCategory = async (id: number, categoryData: any) => {
    try {
      console.log("[v0] Updating category:", id, categoryData)
      const response = await fetch(`/api/item-groups/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(categoryData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update category")
      }

      const updatedCategory = await response.json()
      console.log("[v0] Updated category:", updatedCategory.id)
      return updatedCategory
    } catch (error) {
      console.error("[v0] Error updating category:", error)
      throw error
    }
  }

  const deleteCategory = async (id: number) => {
    try {
      console.log("[v0] Deleting category:", id)
      const response = await fetch(`/api/item-groups/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to delete category")
      }

      console.log("[v0] Deleted category:", id)
      return true
    } catch (error) {
      console.error("[v0] Error deleting category:", error)
      throw error
    }
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const filteredCategories = categories.filter((category) => {
    const matchesSearch =
      category.group_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      category.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterActive === null || category.is_active === filterActive
    return matchesSearch && matchesFilter
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log("[v0] Submitting category form:", formData)

    try {
      if (editingCategory) {
        // Update existing category
        const updatedCategory = await updateCategory(editingCategory.id, {
          ...formData,
          status: formData.is_active ? "نشط" : "غير نشط",
        })
        setCategories(categories.map((cat) => (cat.id === editingCategory.id ? updatedCategory : cat)))
        console.log("[v0] Updated category:", editingCategory.id)
      } else {
        // Create new category
        const newCategory = await createCategory({
          ...formData,
          status: formData.is_active ? "نشط" : "غير نشط",
        })
        setCategories([newCategory, ...categories])
        console.log("[v0] Created new category:", newCategory.id)
      }

      resetForm()
    } catch (error: unknown) {
      console.error("[v0] Error submitting form:", error)

      const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع"

      showAlert(`خطأ في ${editingCategory ? "تحديث" : "إنشاء"} التصنيف: ${message}`)
    }
  }

  const resetForm = () => {
    setFormData({
      group_name: "",
      description: "",
      is_active: true,
    })
    setEditingCategory(null)
    setShowForm(false)
  }

  const handleEdit = (category: ProductCategory) => {
    console.log("[v0] Editing category:", category.id)
    setEditingCategory(category)
    setFormData({
      group_name: category.group_name,
      description: category.description || "",
      is_active: category.is_active,
    })
    setShowForm(true)
  }

  const handleDelete = async (categoryId: number) => {
    if (!(await confirmYesNo("هل أنت متأكد من حذف هذا التصنيف؟"))) {
      return
    }

    try {
      await deleteCategory(categoryId)
      const updatedCategories = categories.filter((cat) => cat.id !== categoryId)
      setCategories(updatedCategories)
      if (currentIndex >= updatedCategories.length) {
        setCurrentIndex(Math.max(0, updatedCategories.length - 1))
      }
      console.log("[v0] Successfully deleted category:", categoryId)
    } catch (error: unknown) {
      console.error("[v0] Error deleting category:", error)

      const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع"

      showAlert(`خطأ في حذف التصنيف: ${message}`)
    }
  }

  const toggleStatus = async (categoryId: number) => {
    const category = categories.find((cat) => cat.id === categoryId)
    if (!category) return

    try {
      console.log("[v0] Toggling status for category:", categoryId)
      const updatedCategory = await updateCategory(categoryId, {
        group_name: category.group_name,
        description: category.description,
        is_active: !category.is_active,
        status: !category.is_active ? "نشط" : "غير نشط",
      })
      setCategories(categories.map((cat) => (cat.id === categoryId ? updatedCategory : cat)))
    } catch (error: unknown) {
      console.error("[v0] Error toggling status:", error)

      const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع"

      showAlert(`خطأ في تغيير حالة التصنيف: ${message}`)
    }

  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-spin" />
          <p className="text-muted-foreground">جاري تحميل التصنيفات...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-heading font-bold text-primary">تصنيفات الأصناف</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {filteredCategories.length} تصنيف
          </Badge>
          <Button className="erp-btn-primary" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            تصنيف جديد
          </Button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <Card className="mb-6" dir="rtl">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث في التصنيفات..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="erp-input pr-10 text-right"
                dir="rtl"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Button
                variant={filterActive === null ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterActive(null)}
              >
                الكل
              </Button>
              <Button
                variant={filterActive === true ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterActive(true)}
              >
                نشط
              </Button>
              <Button
                variant={filterActive === false ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterActive(false)}
              >
                غير نشط
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Categories List */}
        <div className="xl:col-span-2">
          <Card dir="rtl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  قائمة التصنيفات
                </CardTitle>
                <UniversalToolbar
                  currentIndex={currentIndex}
                  totalRecords={filteredCategories.length}
                  onFirst={() => setCurrentIndex(0)}
                  onPrevious={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  onNext={() => setCurrentIndex(Math.min(filteredCategories.length - 1, currentIndex + 1))}
                  onLast={() => setCurrentIndex(filteredCategories.length - 1)}
                  isFirstRecord={currentIndex === 0}
                  isLastRecord={currentIndex === filteredCategories.length - 1}
                  isSaving={false}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {filteredCategories.map((category, index) => (
                  <div
                    key={category.id}
                    className={cn(
                      "p-4 rounded-lg border transition-all cursor-pointer",
                      index === currentIndex
                        ? "bg-primary/10 border-primary shadow-sm"
                        : "bg-background hover:bg-muted/50",
                    )}
                    onClick={() => setCurrentIndex(index)}
                    dir="rtl"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-primary" />
                        <div className="text-right">
                          <h4 className="font-heading font-semibold">{category.group_name}</h4>
                          <p className="text-xs text-muted-foreground">#{category.group_number}</p>
                        </div>
                      </div>
                      <Badge variant={category.is_active ? "default" : "secondary"} className="text-xs">
                        {category.is_active ? "نشط" : "غير نشط"}
                      </Badge>
                    </div>

                    {category.description && (
                      <p className="text-sm text-muted-foreground mb-3 text-right">{category.description}</p>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className="text-xs">
                          {category.product_count || 0} صنف
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEdit(category)
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleStatus(category.id)
                          }}
                        >
                          {category.is_active ? "إلغاء" : "تفعيل"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(category.id)
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Form Panel */}
        <div>
          <Card dir="rtl">
            <CardHeader>
              <CardTitle className="text-right">{editingCategory ? "تعديل التصنيف" : "إضافة تصنيف جديد"}</CardTitle>
            </CardHeader>
            <CardContent>
              {showForm ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="text-right">
                    <Label className="erp-label text-right block">اسم التصنيف *</Label>
                    <Input
                      required
                      value={formData.group_name}
                      onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
                      className="erp-input text-right"
                      placeholder="مثال: مواد غذائية"
                      dir="rtl"
                    />
                  </div>

                  <div className="text-right">
                    <Label className="erp-label text-right block">الوصف</Label>
                    <Input
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="erp-input text-right"
                      placeholder="وصف مختصر للتصنيف"
                      dir="rtl"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="rounded"
                    />
                    <Label htmlFor="isActive" className="text-right">
                      تصنيف نشط
                    </Label>
                  </div>

                  <div className="flex justify-start gap-2 pt-4">
                    <Button type="submit" className="erp-btn-primary">
                      {editingCategory ? "تحديث التصنيف" : "حفظ التصنيف"}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetForm}>
                      إلغاء
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">انقر على "تصنيف جديد" لإضافة تصنيف جديد</p>
                  <Button onClick={() => setShowForm(true)} className="erp-btn-primary">
                    <Plus className="h-4 w-4 mr-2" />
                    إضافة تصنيف
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category Details */}
          {filteredCategories.length > 0 && (
            <Card className="mt-4" dir="rtl">
              <CardHeader>
                <CardTitle className="text-right">تفاصيل التصنيف</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredCategories[currentIndex] && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-primary" />
                      <h3 className="font-semibold">{filteredCategories[currentIndex].group_name}</h3>
                    </div>

                    <div className="text-sm space-y-2">
                      <div className="flex justify-between">
                        <span>{filteredCategories[currentIndex].group_number}</span>
                        <span className="text-muted-foreground">:الرمز</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{filteredCategories[currentIndex].product_count || 0}</span>
                        <span className="text-muted-foreground">:عدد الأصناف</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{new Date(filteredCategories[currentIndex].created_at).toLocaleDateString("en-GB")}</span>
                        <span className="text-muted-foreground">:تاريخ الإنشاء</span>
                      </div>
                    </div>

                    {filteredCategories[currentIndex].description && (
                      <div>
                        <Label className="text-sm font-medium">الوصف:</Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {filteredCategories[currentIndex].description}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
