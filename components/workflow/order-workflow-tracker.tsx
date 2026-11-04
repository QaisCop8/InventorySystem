"use client"

import { tr, appDir } from "@/lib/i18n"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  X,
  User,
  Calendar,
  MessageSquare,
  ChevronRight,
  Bell,
} from "lucide-react"
import { formatDateToBritish, formatDateTimeToBritish } from "@/lib/utils"

interface WorkflowStatus {
  id: number
  order_id: number
  order_type: string
  order_number: string
  current_stage_id: number
  stage_name: string
  stage_color: string
  icon_name: string
  stage_type: string
  requires_approval: boolean
  assigned_to_department?: string
  stage_start_time: string
  is_overdue: boolean
  priority_level: string
  sequence_name: string
}

interface WorkflowHistory {
  id: number
  from_stage_display?: string
  to_stage_display: string
  action_type: string
  performed_by_username?: string
  performed_by_department?: string
  reason?: string
  notes?: string
  created_at: string
  stage_color: string
  icon_name: string
}

interface OrderWorkflowTrackerProps {
  orderId: number
  orderType: "sales" | "purchase"
  orderNumber: string
  currentUser?: string
  currentDepartment?: string
}

export function OrderWorkflowTracker({
  orderId,
  orderType,
  orderNumber,
  currentUser = "المستخدم الحالي",
  currentDepartment = "المبيعات",
}: OrderWorkflowTrackerProps) {
  const [status, setStatus] = useState<WorkflowStatus | null>(null)
  const [history, setHistory] = useState<WorkflowHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [notes, setNotes] = useState("")
  const [rejectReason, setRejectReason] = useState("")
  const [sendNotification, setSendNotification] = useState(true)

  useEffect(() => {
    fetchWorkflowData()
  }, [orderId, orderType])

  const fetchWorkflowData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/workflow/orders/${orderId}/status?type=${orderType}`)
      const result = await response.json()

      if (result.success) {
        setStatus(result.data.status)
        setHistory(result.data.history)
      }
    } catch (error) {
      console.error("Error fetching workflow data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdvanceOrder = async () => {
    try {
      setActionLoading(true)
      const response = await fetch(`/api/workflow/orders/${orderId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType,
          performedByUser: currentUser,
          performedByDepartment: currentDepartment,
          notes,
          sendNotification,
        }),
      })

      const result = await response.json()
      if (result.success) {
        await fetchWorkflowData()
        setShowAdvanceDialog(false)
        setNotes("")
        setSendNotification(true)
      }
    } catch (error) {
      console.error("Error advancing order:", error)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRejectOrder = async () => {
    try {
      setActionLoading(true)
      const response = await fetch(`/api/workflow/orders/${orderId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType,
          performedByUser: currentUser,
          performedByDepartment: currentDepartment,
          reason: rejectReason,
          notes,
          sendNotification,
        }),
      })

      const result = await response.json()
      if (result.success) {
        await fetchWorkflowData()
        setShowRejectDialog(false)
        setRejectReason("")
        setNotes("")
        setSendNotification(true)
      }
    } catch (error) {
      console.error("Error rejecting order:", error)
    } finally {
      setActionLoading(false)
    }
  }

  const getStageIcon = (iconName: string) => {
    switch (iconName) {
      case "check-circle":
        return <CheckCircle2 className="h-5 w-5" />
      case "clock":
        return <Clock className="h-5 w-5" />
      case "alert-triangle":
        return <AlertTriangle className="h-5 w-5" />
      default:
        return <CheckCircle2 className="h-5 w-5" />
    }
  }

  const getActionTypeIcon = (actionType: string) => {
    switch (actionType) {
      case "advance":
        return <ArrowRight className="h-4 w-4 text-green-600" />
      case "reject":
        return <X className="h-4 w-4 text-red-600" />
      case "return":
        return <ArrowRight className="h-4 w-4 text-orange-600 rotate-180" />
      default:
        return <ArrowRight className="h-4 w-4 text-blue-600" />
    }
  }

  const getActionTypeText = (actionType: string) => {
    switch (actionType) {
      case "advance":
        return tr("تقديم")
      case "reject":
        return tr("رفض")
      case "return":
        return tr("إرجاع")
      case "reassign":
        return tr("إعادة تعيين")
      default:
        return actionType
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800"
      case "high":
        return "bg-orange-100 text-orange-800"
      case "normal":
        return "bg-blue-100 text-blue-800"
      case "low":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-blue-100 text-blue-800"
    }
  }

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case "urgent":
        return tr("عاجل")
      case "high":
        return tr("عالي")
      case "normal":
        return tr("عادي")
      case "low":
        return tr("منخفض")
      default:
        return tr("عادي")
    }
  }

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ms-3">{tr("جاري تحميل بيانات التتبع...")}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!status) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-center text-gray-500">{tr("لا توجد بيانات تتبع لهذه الطلبية")}</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6" dir={appDir()}>
      {/* Current Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-full"
                style={{ backgroundColor: `${status.stage_color}20`, color: status.stage_color }}
              >
                {getStageIcon(status.icon_name)}
              </div>
              <div>
                <h3 className="text-lg font-semibold">{status.stage_name}</h3>
                <p className="text-sm text-gray-600">{tr("طلبية رقم: ")}{orderNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={getPriorityColor(status.priority_level)}>
                {getPriorityText(status.priority_level)}
              </Badge>
              {status.is_overdue && <Badge variant="destructive">{tr("متأخرة")}</Badge>}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-500" />
              <span className="text-sm">{tr("القسم المسؤول: ")}{status.assigned_to_department || tr("غير محدد")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-sm">{tr("بدء المرحلة: ")}{formatDateToBritish(status.stage_start_time)}</span>
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gray-500" />
              <span className="text-sm">{tr("التسلسل: ")}{status.sequence_name}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Dialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700">
                  <ArrowRight className="h-4 w-4 me-2" />
                  {tr("تقديم للمرحلة التالية")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{tr("تقديم الطلبية للمرحلة التالية")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">{tr("ملاحظات (اختيارية)")}</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={tr("أضف أي ملاحظات حول تقديم الطلبية...")}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-blue-50">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-blue-600" />
                      <Label htmlFor="send-notification" className="cursor-pointer">
                        {tr("إرسال إشعار للعميل")}
                      </Label>
                    </div>
                    <Switch id="send-notification" checked={sendNotification} onCheckedChange={setSendNotification} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowAdvanceDialog(false)}>
                      {tr("إلغاء")}
                    </Button>
                    <Button
                      onClick={handleAdvanceOrder}
                      disabled={actionLoading}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {actionLoading ? tr("جاري التقديم...") : tr("تقديم")}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <X className="h-4 w-4 me-2" />
                  {tr("رفض الطلبية")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{tr("رفض الطلبية")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">{tr("سبب الرفض *")}</label>
                    <Select value={rejectReason} onValueChange={setRejectReason}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={tr("اختر سبب الرفض")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="incomplete_info">{tr("معلومات ناقصة")}</SelectItem>
                        <SelectItem value="invalid_data">{tr("بيانات غير صحيحة")}</SelectItem>
                        <SelectItem value="out_of_stock">{tr("نفاد المخزون")}</SelectItem>
                        <SelectItem value="customer_request">{tr("طلب العميل")}</SelectItem>
                        <SelectItem value="other">{tr("أخرى")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">{tr("ملاحظات إضافية")}</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={tr("أضف تفاصيل إضافية حول سبب الرفض...")}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-red-50">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-red-600" />
                      <Label htmlFor="send-notification-reject" className="cursor-pointer">
                        {tr("إرسال إشعار للعميل")}
                      </Label>
                    </div>
                    <Switch
                      id="send-notification-reject"
                      checked={sendNotification}
                      onCheckedChange={setSendNotification}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
                      {tr("إلغاء")}
                    </Button>
                    <Button variant="destructive" onClick={handleRejectOrder} disabled={actionLoading || !rejectReason}>
                      {actionLoading ? tr("جاري الرفض...") : tr("رفض")}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Workflow History */}
      <Card>
        <CardHeader>
          <CardTitle>{tr("تاريخ الطلبية")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {history.map((item, index) => (
              <div key={item.id} className="flex items-start gap-4 pb-4 border-b border-gray-100 last:border-b-0">
                <div className="flex-shrink-0">
                  <div
                    className="p-2 rounded-full"
                    style={{ backgroundColor: `${item.stage_color}20`, color: item.stage_color }}
                  >
                    {getActionTypeIcon(item.action_type)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{getActionTypeText(item.action_type)}</span>
                    {item.from_stage_display && (
                      <>
                        <span className="text-gray-500 text-sm">{tr("من")}</span>
                        <span className="text-sm">{item.from_stage_display}</span>
                      </>
                    )}
                    <ChevronRight className="h-3 w-3 text-gray-400" />
                    <span className="text-sm">{item.to_stage_display}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                    <span>{tr("بواسطة: ")}{item.performed_by_username || tr("النظام")}</span>
                    <span>{tr("القسم: ")}{item.performed_by_department || tr("غير محدد")}</span>
                    <span>{formatDateTimeToBritish(item.created_at)}</span>
                  </div>
                  {item.reason && <div className="text-sm text-orange-600 mb-1">{tr("السبب: ")}{item.reason}</div>}
                  {item.notes && <div className="text-sm text-gray-600">{tr("ملاحظات: ")}{item.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
