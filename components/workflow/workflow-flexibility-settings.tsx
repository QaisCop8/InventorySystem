"use client"

import { showAlert } from "@/components/ui/confirm-host"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, Settings, Clock } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface WorkflowSettings {
  workflowSystemMandatory: boolean
  allowSkipStages: boolean
  requireApprovalNotes: boolean
  requireRejectionReason: boolean
  autoAssignToDepartment: boolean
  sendNotifications: boolean
  trackTimeInStages: boolean
  allowParallelProcessing: boolean
}

interface StageFlexibilitySettings {
  id: number
  stageId: number
  stageName: string
  stageCode: string
  isOptional: boolean
  requiresApproval: boolean
  requiresPreviousApproval: boolean
  canSkip: boolean
  skipConditions?: string
  maxDurationHours?: number
  warningHours?: number
  escalationHours?: number
  escalationToDepartment?: string
}

export default function WorkflowFlexibilitySettings() {
  const [workflowSettings, setWorkflowSettings] = useState<WorkflowSettings>({
    workflowSystemMandatory: true,
    allowSkipStages: false,
    requireApprovalNotes: true,
    requireRejectionReason: true,
    autoAssignToDepartment: true,
    sendNotifications: true,
    trackTimeInStages: true,
    allowParallelProcessing: false,
  })

  const [stageSettings, setStageSettings] = useState<StageFlexibilitySettings[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedStage, setSelectedStage] = useState<StageFlexibilitySettings | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)

      // تحميل إعدادات النظام العامة
      const workflowResponse = await fetch("/api/workflow/settings")
      if (workflowResponse.ok) {
        const workflowData = await workflowResponse.json()
        setWorkflowSettings(workflowData)
      }

      // تحميل إعدادات المراحل
      const stagesResponse = await fetch("/api/workflow/stages/flexibility")
      if (stagesResponse.ok) {
        const stagesData = await stagesResponse.json()
        setStageSettings(stagesData)
      }
    } catch (error) {
      console.error("Error loading settings:", error)
    } finally {
      setLoading(false)
    }
  }

  const saveWorkflowSettings = async () => {
    try {
      setSaving(true)
      const response = await fetch("/api/workflow/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflowSettings),
      })

      if (response.ok) {
        showAlert("تم حفظ الإعدادات بنجاح")
      }
    } catch (error) {
      console.error("Error saving workflow settings:", error)
      showAlert("حدث خطأ في حفظ الإعدادات")
    } finally {
      setSaving(false)
    }
  }

  const saveStageSettings = async (stageId: number, settings: Partial<StageFlexibilitySettings>) => {
    try {
      const response = await fetch(`/api/workflow/stages/${stageId}/flexibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })

      if (response.ok) {
        // تحديث الحالة المحلية
        setStageSettings((prev) => prev.map((stage) => (stage.stageId === stageId ? { ...stage, ...settings } : stage)))
        showAlert("تم حفظ إعدادات المرحلة بنجاح")
      }
    } catch (error) {
      console.error("Error saving stage settings:", error)
      showAlert("حدث خطأ في حفظ إعدادات المرحلة")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p>جاري تحميل الإعدادات...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-6 w-6" />
        <h2 className="text-2xl font-bold">إعدادات مرونة نظام المراحل</h2>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">الإعدادات العامة</TabsTrigger>
          <TabsTrigger value="stages">إعدادات المراحل</TabsTrigger>
          <TabsTrigger value="rules">قواعد الانتقال</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>إعدادات النظام العامة</CardTitle>
              <CardDescription>تحكم في السلوك العام لنظام المراحل</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="mandatory">نظام المراحل إجباري</Label>
                    <Switch
                      id="mandatory"
                      checked={workflowSettings.workflowSystemMandatory}
                      onCheckedChange={(checked) =>
                        setWorkflowSettings((prev) => ({ ...prev, workflowSystemMandatory: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="skip">السماح بتخطي المراحل</Label>
                    <Switch
                      id="skip"
                      checked={workflowSettings.allowSkipStages}
                      onCheckedChange={(checked) =>
                        setWorkflowSettings((prev) => ({ ...prev, allowSkipStages: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="approval-notes">إجبار ملاحظات الموافقة</Label>
                    <Switch
                      id="approval-notes"
                      checked={workflowSettings.requireApprovalNotes}
                      onCheckedChange={(checked) =>
                        setWorkflowSettings((prev) => ({ ...prev, requireApprovalNotes: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="rejection-reason">إجبار سبب الرفض</Label>
                    <Switch
                      id="rejection-reason"
                      checked={workflowSettings.requireRejectionReason}
                      onCheckedChange={(checked) =>
                        setWorkflowSettings((prev) => ({ ...prev, requireRejectionReason: checked }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-assign">تعيين تلقائي للأقسام</Label>
                    <Switch
                      id="auto-assign"
                      checked={workflowSettings.autoAssignToDepartment}
                      onCheckedChange={(checked) =>
                        setWorkflowSettings((prev) => ({ ...prev, autoAssignToDepartment: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="notifications">إرسال التنبيهات</Label>
                    <Switch
                      id="notifications"
                      checked={workflowSettings.sendNotifications}
                      onCheckedChange={(checked) =>
                        setWorkflowSettings((prev) => ({ ...prev, sendNotifications: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="track-time">تتبع الوقت في المراحل</Label>
                    <Switch
                      id="track-time"
                      checked={workflowSettings.trackTimeInStages}
                      onCheckedChange={(checked) =>
                        setWorkflowSettings((prev) => ({ ...prev, trackTimeInStages: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="parallel">المعالجة المتوازية</Label>
                    <Switch
                      id="parallel"
                      checked={workflowSettings.allowParallelProcessing}
                      onCheckedChange={(checked) =>
                        setWorkflowSettings((prev) => ({ ...prev, allowParallelProcessing: checked }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveWorkflowSettings} disabled={saving}>
                  {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stages">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* قائمة المراحل */}
            <Card>
              <CardHeader>
                <CardTitle>المراحل المتاحة</CardTitle>
                <CardDescription>اختر مرحلة لتعديل إعداداتها</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stageSettings.map((stage) => (
                    <div
                      key={stage.stageId}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedStage?.stageId === stage.stageId
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      onClick={() => setSelectedStage(stage)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{stage.stageName}</span>
                        <div className="flex gap-1">
                          {stage.isOptional && (
                            <Badge variant="secondary" className="text-xs">
                              اختيارية
                            </Badge>
                          )}
                          {stage.requiresApproval && (
                            <Badge variant="default" className="text-xs">
                              تحتاج موافقة
                            </Badge>
                          )}
                          {stage.canSkip && (
                            <Badge variant="outline" className="text-xs">
                              قابلة للتخطي
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* إعدادات المرحلة المحددة */}
            {selectedStage && (
              <Card>
                <CardHeader>
                  <CardTitle>إعدادات المرحلة: {selectedStage.stageName}</CardTitle>
                  <CardDescription>تخصيص سلوك هذه المرحلة</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>مرحلة اختيارية</Label>
                    <Switch
                      checked={selectedStage.isOptional}
                      onCheckedChange={(checked) =>
                        setSelectedStage((prev) => (prev ? { ...prev, isOptional: checked } : null))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>تتطلب موافقة</Label>
                    <Switch
                      checked={selectedStage.requiresApproval}
                      onCheckedChange={(checked) =>
                        setSelectedStage((prev) => (prev ? { ...prev, requiresApproval: checked } : null))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>تتطلب موافقة من المرحلة السابقة</Label>
                    <Switch
                      checked={selectedStage.requiresPreviousApproval}
                      onCheckedChange={(checked) =>
                        setSelectedStage((prev) => (prev ? { ...prev, requiresPreviousApproval: checked } : null))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>يمكن تخطيها</Label>
                    <Switch
                      checked={selectedStage.canSkip}
                      onCheckedChange={(checked) =>
                        setSelectedStage((prev) => (prev ? { ...prev, canSkip: checked } : null))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>الحد الأقصى للمدة (ساعات)</Label>
                    <Input
                      type="number"
                      value={selectedStage.maxDurationHours || ""}
                      onChange={(e) =>
                        setSelectedStage((prev) =>
                          prev
                            ? {
                                ...prev,
                                maxDurationHours: e.target.value ? Number.parseInt(e.target.value) : undefined,
                              }
                            : null,
                        )
                      }
                      placeholder="غير محدد"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>ساعات التحذير</Label>
                    <Input
                      type="number"
                      value={selectedStage.warningHours || ""}
                      onChange={(e) =>
                        setSelectedStage((prev) =>
                          prev
                            ? {
                                ...prev,
                                warningHours: e.target.value ? Number.parseInt(e.target.value) : undefined,
                              }
                            : null,
                        )
                      }
                      placeholder="غير محدد"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>قسم التصعيد</Label>
                    <Select
                      value={selectedStage.escalationToDepartment || "بدون تصعيد"}
                      onValueChange={(value) =>
                        setSelectedStage((prev) =>
                          prev
                            ? {
                                ...prev,
                                escalationToDepartment: value || undefined,
                              }
                            : null,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر قسم التصعيد" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="بدون تصعيد">بدون تصعيد</SelectItem>
                        <SelectItem value="الإدارة">الإدارة</SelectItem>
                        <SelectItem value="المبيعات">المبيعات</SelectItem>
                        <SelectItem value="المحاسبة">المحاسبة</SelectItem>
                        <SelectItem value="المستودعات">المستودعات</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedStage.canSkip && (
                    <div className="space-y-2">
                      <Label>شروط التخطي (JSON)</Label>
                      <Textarea
                        value={selectedStage.skipConditions || ""}
                        onChange={(e) =>
                          setSelectedStage((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  skipConditions: e.target.value || undefined,
                                }
                              : null,
                          )
                        }
                        placeholder='{"amount": {"$lt": 1000}}'
                        rows={3}
                      />
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button onClick={() => saveStageSettings(selectedStage.stageId, selectedStage)}>
                      حفظ إعدادات المرحلة
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle>قواعد الانتقال بين المراحل</CardTitle>
              <CardDescription>تحديد كيفية الانتقال من مرحلة لأخرى ومتطلبات كل انتقال</CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  هذه الميزة قيد التطوير. ستتمكن قريباً من إنشاء وتعديل قواعد الانتقال المخصصة.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
