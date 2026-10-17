"use client"

import { showAlert } from "@/components/ui/confirm-host"
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
import { Plus, Edit, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

interface WorkflowSequence {
  id: number
  sequence_name: string
  sequence_type: string
  description?: string
  is_default: boolean
  is_active: boolean
  steps_count: number
  created_at: string
  updated_at: string
}

interface WorkflowStage {
  id: number
  stage_name: string
  stage_color: string
  icon_name: string
}

const sequenceTypes = [
  { value: "sales_order", label: "أوامر البيع" },
  { value: "purchase_order", label: "أوامر الشراء" },
  { value: "inventory_transfer", label: "نقل المخزون" },
  { value: "quality_control", label: "مراقبة الجودة" },
]

export function WorkflowSequencesManagement() {
  const [sequences, setSequences] = useState<WorkflowSequence[]>([])
  const [stages, setStages] = useState<WorkflowStage[]>([])
  const [currentSequenceIndex, setCurrentSequenceIndex] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editingSequence, setEditingSequence] = useState<WorkflowSequence | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    sequence_name: "",
    sequence_type: "sales_order",
    description: "",
    is_default: false,
  })

  // جلب التسلسلات
  const fetchSequences = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/workflow/sequences")
      const data = await response.json()

      if (response.ok) {
        setSequences(data)
        if (data.length > 0 && currentSequenceIndex >= data.length) {
          setCurrentSequenceIndex(0)
        }
      }
    } catch (error) {
      console.error("Error fetching sequences:", error)
    } finally {
      setLoading(false)
    }
  }

  // جلب المراحل
  const fetchStages = async () => {
    try {
      const response = await fetch("/api/workflow/stages")
      const data = await response.json()

      if (response.ok) {
        setStages(data)
      }
    } catch (error) {
      console.error("Error fetching stages:", error)
    }
  }

  // حفظ التسلسل
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setSaving(true)
      const url = editingSequence ? `/api/workflow/sequences/${editingSequence.id}` : "/api/workflow/sequences"
      const method = editingSequence ? "PUT" : "POST"

      console.log("[v0] Making API request:", { url, method, data: formData })

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      console.log("[v0] API response status:", response.status)
      console.log("[v0] API response headers:", Object.fromEntries(response.headers.entries()))

      // Check if response is JSON
      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await response.text()
        console.error("[v0] Non-JSON response received:", textResponse)
        throw new Error(`Server returned non-JSON response: ${textResponse}`)
      }

      const result = await response.json()
      console.log("[v0] API response data:", result)

      if (response.ok) {
        await fetchSequences()
        resetForm()
        setShowForm(false)
        showAlert(result.message || "تم الحفظ بنجاح")
      } else {
        showAlert(result.error || "حدث خطأ أثناء الحفظ")
      }
    } catch (error) {
      console.error("[v0] Error saving sequence:", error)
      showAlert(`حدث خطأ أثناء الحفظ: ${error instanceof Error ? error.message : "خطأ غير معروف"}`)
    } finally {
      setSaving(false)
    }
  }

  // إعداد النموذج للتعديل
  const handleEdit = (sequence: WorkflowSequence) => {
    setEditingSequence(sequence)
    setFormData({
      sequence_name: sequence.sequence_name,
      sequence_type: sequence.sequence_type,
      description: sequence.description || "",
      is_default: sequence.is_default,
    })
    setShowForm(true)
  }

  // إعادة تعيين النموذج
  const resetForm = () => {
    setEditingSequence(null)
    setFormData({
      sequence_name: "",
      sequence_type: "sales_order",
      description: "",
      is_default: false,
    })
  }

  // تحديث حقل النموذج
  const updateFormField = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    fetchSequences()
    fetchStages()
  }, [])

  const currentSequence = sequences[currentSequenceIndex]

  return (
    <div className="p-6 dir-rtl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold text-primary">إدارة تسلسلات العمل</h1>
        <Button
          className="erp-btn-primary"
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
        >
          <Plus className="h-4 w-4 ml-2" />
          إضافة تسلسل جديد
        </Button>
      </div>

      {/* شريط الأدوات */}
      <UniversalToolbar
        currentIndex={currentSequenceIndex}
        totalRecords={sequences.length}
        onFirst={() => setCurrentSequenceIndex(0)}
        onPrevious={() => setCurrentSequenceIndex(Math.max(0, currentSequenceIndex - 1))}
        onNext={() => setCurrentSequenceIndex(Math.min(sequences.length - 1, currentSequenceIndex + 1))}
        onLast={() => setCurrentSequenceIndex(sequences.length - 1)}
        isFirstRecord={currentSequenceIndex === 0}
        isLastRecord={currentSequenceIndex === sequences.length - 1}
        isSaving={saving}
      />

      {/* نموذج إضافة/تعديل التسلسل */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingSequence ? "تعديل التسلسل" : "إضافة تسلسل جديد"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="erp-label">اسم التسلسل *</Label>
                  <Input
                    value={formData.sequence_name}
                    onChange={(e) => updateFormField("sequence_name", e.target.value)}
                    className="erp-input"
                    placeholder="مثال: تسلسل أوامر البيع الافتراضي"
                    required
                  />
                </div>

                <div>
                  <Label className="erp-label">نوع التسلسل *</Label>
                  <Select
                    value={formData.sequence_type}
                    onValueChange={(value) => updateFormField("sequence_type", value)}
                  >
                    <SelectTrigger className="erp-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sequenceTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="erp-label">وصف التسلسل</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => updateFormField("description", e.target.value)}
                  className="erp-input"
                  placeholder="وصف تفصيلي للتسلسل..."
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.is_default}
                  onCheckedChange={(checked) => updateFormField("is_default", checked)}
                />
                <Label>تسلسل افتراضي</Label>
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
                  {saving ? "جاري الحفظ..." : "حفظ التسلسل"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* عرض التسلسلات الحالية */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : sequences.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">لا توجد تسلسلات محددة بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* تفاصيل التسلسل الحالي */}
          {currentSequence && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-3">
                    <Settings className="h-5 w-5 text-primary" />
                    {currentSequence.sequence_name}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(currentSequence)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">نوع التسلسل</Label>
                    <Badge variant="outline">
                      {sequenceTypes.find((type) => type.value === currentSequence.sequence_type)?.label}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">عدد المراحل</Label>
                    <p className="font-medium">{currentSequence.steps_count} مرحلة</p>
                  </div>
                </div>

                {currentSequence.description && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">الوصف</Label>
                    <p className="text-sm">{currentSequence.description}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {currentSequence.is_default && <Badge variant="default">تسلسل افتراضي</Badge>}
                  {currentSequence.is_active && <Badge variant="secondary">نشط</Badge>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* قائمة جميع التسلسلات */}
          <Card>
            <CardHeader>
              <CardTitle>جميع التسلسلات ({sequences.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sequences.map((sequence, index) => (
                  <div
                    key={sequence.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                      index === currentSequenceIndex ? "bg-primary/10 border-primary" : "hover:bg-muted/50",
                    )}
                    onClick={() => setCurrentSequenceIndex(index)}
                  >
                    <div className="flex items-center gap-3">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{sequence.sequence_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {sequenceTypes.find((type) => type.value === sequence.sequence_type)?.label}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{sequence.steps_count} مرحلة</Badge>
                      {sequence.is_default && (
                        <Badge variant="default" className="text-xs">
                          افتراضي
                        </Badge>
                      )}
                    </div>
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
