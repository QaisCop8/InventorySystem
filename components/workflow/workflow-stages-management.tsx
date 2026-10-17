"use client"

import { confirmYesNo, showAlert } from "@/components/ui/confirm-host"
import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { Plus, Edit, Trash2, Clock, CheckCircle, AlertCircle, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

interface WorkflowStage {
  id: number
  stage_code: string
  stage_name: string
  stage_name_en?: string
  description?: string
  stage_type: "start" | "normal" | "end" | "conditional"
  stage_color: string
  icon_name: string
  is_active: boolean
  requires_approval: boolean
  max_duration_hours?: number
  auto_advance: boolean
  created_at: string
  updated_at: string
}

const stageTypeOptions = [
  { value: "start", label: "مرحلة بداية", icon: Circle },
  { value: "normal", label: "مرحلة عادية", icon: Clock },
  { value: "conditional", label: "مرحلة شرطية", icon: AlertCircle },
  { value: "end", label: "مرحلة نهاية", icon: CheckCircle },
]

const iconOptions = [
  "FileText",
  "Clock",
  "CheckCircle",
  "AlertCircle",
  "Settings",
  "Package",
  "Truck",
  "CreditCard",
  "UserCheck",
  "FileCheck",
  "Send",
  "Archive",
]

const colorOptions = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
  "#F97316",
  "#6366F1",
]

export function WorkflowStagesManagement() {
  const [stages, setStages] = useState<WorkflowStage[]>([])
  const [currentStageIndex, setCurrentStageIndex] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editingStage, setEditingStage] = useState<WorkflowStage | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    stage_code: "",
    stage_name: "",
    stage_name_en: "",
    description: "",
    stage_type: "normal" as const,
    stage_color: "#3B82F6",
    icon_name: "Clock",
    requires_approval: false,
    max_duration_hours: "",
    auto_advance: false,
  })

  // جلب المراحل
  const fetchStages = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/workflow/stages")
      const data = await response.json()

      if (response.ok) {
        setStages(data)
        if (data.length > 0 && currentStageIndex >= data.length) {
          setCurrentStageIndex(0)
        }
      }
    } catch (error) {
      console.error("Error fetching stages:", error)
    } finally {
      setLoading(false)
    }
  }

  // حفظ المرحلة
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setSaving(true)
      const url = editingStage ? `/api/workflow/stages/${editingStage.id}` : "/api/workflow/stages"

      const method = editingStage ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          max_duration_hours: formData.max_duration_hours ? Number.parseInt(formData.max_duration_hours) : null,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        await fetchStages()
        resetForm()
        setShowForm(false)
      } else {
        showAlert(result.error || "حدث خطأ أثناء الحفظ")
      }
    } catch (error) {
      console.error("Error saving stage:", error)
      showAlert("حدث خطأ أثناء الحفظ")
    } finally {
      setSaving(false)
    }
  }

  // حذف المرحلة
  const handleDelete = async (stageId: number) => {
    if (!(await confirmYesNo("هل أنت متأكد من حذف هذه المرحلة؟"))) return

    try {
      const response = await fetch(`/api/workflow/stages/${stageId}`, {
        method: "DELETE",
      })

      const result = await response.json()

      if (response.ok) {
        await fetchStages()
      } else {
        showAlert(result.error || "حدث خطأ أثناء الحذف")
      }
    } catch (error) {
      console.error("Error deleting stage:", error)
      showAlert("حدث خطأ أثناء الحذف")
    }
  }

  // إعداد النموذج للتعديل
  const handleEdit = (stage: WorkflowStage) => {
    setEditingStage(stage)
    setFormData({
      stage_code: stage.stage_code,
      stage_name: stage.stage_name,
      stage_name_en: stage.stage_name_en || "",
      description: stage.description || "",
      stage_type: stage.stage_type,
      stage_color: stage.stage_color,
      icon_name: stage.icon_name,
      requires_approval: stage.requires_approval,
      max_duration_hours: stage.max_duration_hours?.toString() || "",
      auto_advance: stage.auto_advance,
    })
    setShowForm(true)
  }

  // إعادة تعيين النموذج
  const resetForm = () => {
    setEditingStage(null)
    setFormData({
      stage_code: "",
      stage_name: "",
      stage_name_en: "",
      description: "",
      stage_type: "normal",
      stage_color: "#3B82F6",
      icon_name: "Clock",
      requires_approval: false,
      max_duration_hours: "",
      auto_advance: false,
    })
  }

  // تحديث حقل النموذج
  const updateFormField = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    fetchStages()
  }, [])

  const currentStage = stages[currentStageIndex]

  return (
    <div className="p-6 dir-rtl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold text-primary">إدارة مراحل العمل</h1>
        <Button
          className="erp-btn-primary"
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
        >
          <Plus className="h-4 w-4 ml-2" />
          إضافة مرحلة جديدة
        </Button>
      </div>

      {/* شريط الأدوات */}
      <UniversalToolbar
        currentIndex={currentStageIndex}
        totalRecords={stages.length}
        onFirst={() => setCurrentStageIndex(0)}
        onPrevious={() => setCurrentStageIndex(Math.max(0, currentStageIndex - 1))}
        onNext={() => setCurrentStageIndex(Math.min(stages.length - 1, currentStageIndex + 1))}
        onLast={() => setCurrentStageIndex(stages.length - 1)}
        isFirstRecord={currentStageIndex === 0}
        isLastRecord={currentStageIndex === stages.length - 1}
        isSaving={saving}
      />

      {/* نموذج إضافة/تعديل المرحلة */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingStage ? "تعديل المرحلة" : "إضافة مرحلة جديدة"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="erp-label">رمز المرحلة *</Label>
                  <Input
                    value={formData.stage_code}
                    onChange={(e) => updateFormField("stage_code", e.target.value)}
                    className="erp-input"
                    placeholder="مثال: STAGE_001"
                    required
                  />
                </div>

                <div>
                  <Label className="erp-label">اسم المرحلة *</Label>
                  <Input
                    value={formData.stage_name}
                    onChange={(e) => updateFormField("stage_name", e.target.value)}
                    className="erp-input"
                    placeholder="مثال: مراجعة الطلبية"
                    required
                  />
                </div>

                <div>
                  <Label className="erp-label">الاسم بالإنجليزية</Label>
                  <Input
                    value={formData.stage_name_en}
                    onChange={(e) => updateFormField("stage_name_en", e.target.value)}
                    className="erp-input"
                    placeholder="Order Review"
                  />
                </div>

                <div>
                  <Label className="erp-label">نوع المرحلة *</Label>
                  <Select value={formData.stage_type} onValueChange={(value) => updateFormField("stage_type", value)}>
                    <SelectTrigger className="erp-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stageTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <option.icon className="h-4 w-4" />
                            {option.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="erp-label">لون المرحلة</Label>
                  <div className="flex gap-2 mt-2">
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cn(
                          "w-8 h-8 rounded-full border-2",
                          formData.stage_color === color ? "border-gray-800" : "border-gray-300",
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => updateFormField("stage_color", color)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="erp-label">أيقونة المرحلة</Label>
                  <Select value={formData.icon_name} onValueChange={(value) => updateFormField("icon_name", value)}>
                    <SelectTrigger className="erp-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {iconOptions.map((icon) => (
                        <SelectItem key={icon} value={icon}>
                          {icon}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="erp-label">الحد الأقصى للمدة (بالساعات)</Label>
                  <Input
                    type="number"
                    value={formData.max_duration_hours}
                    onChange={(e) => updateFormField("max_duration_hours", e.target.value)}
                    className="erp-input"
                    placeholder="24"
                  />
                </div>
              </div>

              <div>
                <Label className="erp-label">وصف المرحلة</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => updateFormField("description", e.target.value)}
                  className="erp-input"
                  placeholder="وصف تفصيلي للمرحلة..."
                  rows={3}
                />
              </div>

              <div className="flex flex-wrap gap-6">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.requires_approval}
                    onCheckedChange={(checked) => updateFormField("requires_approval", checked)}
                  />
                  <Label>تتطلب موافقة</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.auto_advance}
                    onCheckedChange={(checked) => updateFormField("auto_advance", checked)}
                  />
                  <Label>انتقال تلقائي</Label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false)
                    resetForm()
                  }}
                >
                  إلغاء
                </Button>
                <Button type="submit" className="erp-btn-primary" disabled={saving}>
                  {saving ? "جاري الحفظ..." : "حفظ المرحلة"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* عرض المراحل الحالية */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : stages.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">لا توجد مراحل محددة بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* تفاصيل المرحلة الحالية */}
          {currentStage && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: currentStage.stage_color }} />
                    {currentStage.stage_name}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(currentStage)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(currentStage.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">رمز المرحلة</Label>
                    <p className="font-mono">{currentStage.stage_code}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">نوع المرحلة</Label>
                    <Badge variant="outline">
                      {stageTypeOptions.find((opt) => opt.value === currentStage.stage_type)?.label}
                    </Badge>
                  </div>
                </div>

                {currentStage.description && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">الوصف</Label>
                    <p className="text-sm">{currentStage.description}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {currentStage.requires_approval && <Badge variant="secondary">تتطلب موافقة</Badge>}
                  {currentStage.auto_advance && <Badge variant="secondary">انتقال تلقائي</Badge>}
                  {currentStage.max_duration_hours && (
                    <Badge variant="outline">حد أقصى: {currentStage.max_duration_hours} ساعة</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* قائمة جميع المراحل */}
          <Card>
            <CardHeader>
              <CardTitle>جميع المراحل ({stages.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {stages.map((stage, index) => (
                  <div
                    key={stage.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                      index === currentStageIndex ? "bg-primary/10 border-primary" : "hover:bg-muted/50",
                    )}
                    onClick={() => setCurrentStageIndex(index)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.stage_color }} />
                      <div>
                        <p className="font-medium">{stage.stage_name}</p>
                        <p className="text-sm text-muted-foreground">{stage.stage_code}</p>
                      </div>
                    </div>
                    <Badge variant="outline">
                      {stageTypeOptions.find((opt) => opt.value === stage.stage_type)?.label}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
