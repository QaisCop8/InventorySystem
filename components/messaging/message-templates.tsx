"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Edit, Trash2, Copy, FileText, CheckCircle, AlertTriangle } from "lucide-react"

interface MessageTemplate {
  id: number
  template_name: string
  template_code: string
  template_category: string
  message_content: string
  variables: string[]
  is_active: boolean
  is_system: boolean
  usage_count: number
  last_used_at: string | null
  created_at: string
}

export function MessageTemplates() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [formData, setFormData] = useState({
    template_name: "",
    template_code: "",
    template_category: "general",
    message_content: "",
    variables: [] as string[],
  })

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const response = await fetch("/api/messaging/templates")
      if (response.ok) {
        const data = await response.json()
        setTemplates(data)
      }
    } catch (error) {
      console.error("[v0] Error fetching templates:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTemplate = async () => {
    try {
      const url = editingTemplate ? `/api/messaging/templates/${editingTemplate.id}` : "/api/messaging/templates"

      const response = await fetch(url, {
        method: editingTemplate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) throw new Error("فشل في حفظ النموذج")

      setMessage({ type: "success", text: "تم حفظ النموذج بنجاح" })
      setIsDialogOpen(false)
      fetchTemplates()
      resetForm()
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ أثناء الحفظ" })
    }
  }

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا النموذج؟")) return

    try {
      const response = await fetch(`/api/messaging/templates/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("فشل في حذف النموذج")

      setMessage({ type: "success", text: "تم حذف النموذج بنجاح" })
      fetchTemplates()
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ أثناء الحذف" })
    }
  }

  const handleEditTemplate = (template: MessageTemplate) => {
    setEditingTemplate(template)
    setFormData({
      template_name: template.template_name,
      template_code: template.template_code,
      template_category: template.template_category,
      message_content: template.message_content,
      variables: template.variables,
    })
    setIsDialogOpen(true)
  }

  const handleDuplicateTemplate = (template: MessageTemplate) => {
    setEditingTemplate(null)
    setFormData({
      template_name: `${template.template_name} (نسخة)`,
      template_code: `${template.template_code}_COPY`,
      template_category: template.template_category,
      message_content: template.message_content,
      variables: template.variables,
    })
    setIsDialogOpen(true)
  }

  const resetForm = () => {
    setEditingTemplate(null)
    setFormData({
      template_name: "",
      template_code: "",
      template_category: "general",
      message_content: "",
      variables: [],
    })
  }

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      inventory: "bg-blue-100 text-blue-800",
      orders: "bg-green-100 text-green-800",
      customers: "bg-purple-100 text-purple-800",
      general: "bg-gray-100 text-gray-800",
    }
    return <Badge className={colors[category] || colors.general}>{category}</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">نماذج الرسائل</h2>
          <p className="text-muted-foreground">إدارة نماذج الرسائل القابلة لإعادة الاستخدام</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className="gap-2">
              <Plus className="h-4 w-4" />
              نموذج جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "تعديل النموذج" : "نموذج جديد"}</DialogTitle>
              <DialogDescription>أنشئ نموذج رسالة قابل لإعادة الاستخدام</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>اسم النموذج</Label>
                <Input
                  value={formData.template_name}
                  onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
                  placeholder="مثال: تنبيه إعادة طلب المخزون"
                />
              </div>
              <div>
                <Label>كود النموذج</Label>
                <Input
                  value={formData.template_code}
                  onChange={(e) => setFormData({ ...formData, template_code: e.target.value })}
                  placeholder="مثال: INVENTORY_REORDER"
                />
              </div>
              <div>
                <Label>التصنيف</Label>
                <Select
                  value={formData.template_category}
                  onValueChange={(value) => setFormData({ ...formData, template_category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inventory">المخزون</SelectItem>
                    <SelectItem value="orders">الطلبيات</SelectItem>
                    <SelectItem value="customers">العملاء</SelectItem>
                    <SelectItem value="general">عام</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>محتوى الرسالة</Label>
                <Textarea
                  value={formData.message_content}
                  onChange={(e) => setFormData({ ...formData, message_content: e.target.value })}
                  rows={8}
                  placeholder="استخدم {variable_name} للمتغيرات"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  استخدم الأقواس المعقوفة للمتغيرات، مثل: {"{product_name}"}, {"{order_number}"}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  إلغاء
                </Button>
                <Button onClick={handleSaveTemplate}>حفظ النموذج</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Messages */}
      {message && (
        <Alert className={message.type === "success" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          )}
          <AlertDescription className={message.type === "success" ? "text-green-800" : "text-red-800"}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Templates Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id} className="relative">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">{template.template_name}</CardTitle>
                  <CardDescription className="mt-1">{template.template_code}</CardDescription>
                </div>
                {template.is_system && (
                  <Badge variant="outline" className="text-xs">
                    نظامي
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {getCategoryBadge(template.template_category)}
                {template.is_active ? (
                  <Badge className="bg-green-100 text-green-800">مفعل</Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-800">معطل</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground line-clamp-3 font-mono bg-muted p-2 rounded">
                  {template.message_content}
                </div>
                {template.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {template.variables.map((variable) => (
                      <Badge key={variable} variant="outline" className="text-xs">
                        {variable}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span>استخدم {template.usage_count} مرة</span>
                  {template.last_used_at && (
                    <span>آخر استخدام: {new Date(template.last_used_at).toLocaleDateString("ar-SA")}</span>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => handleEditTemplate(template)} className="flex-1">
                    <Edit className="h-3 w-3 ml-1" />
                    تعديل
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDuplicateTemplate(template)}
                    className="flex-1"
                  >
                    <Copy className="h-3 w-3 ml-1" />
                    نسخ
                  </Button>
                  {!template.is_system && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {templates.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">لا توجد نماذج</h3>
            <p className="text-muted-foreground text-center mb-4">ابدأ بإنشاء نموذج رسالة جديد</p>
            <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              إنشاء نموذج
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
