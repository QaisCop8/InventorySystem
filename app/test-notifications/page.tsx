"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Send, MessageSquare, Phone, CheckCircle, XCircle, Clock, AlertCircle, Loader2 } from "lucide-react"

interface NotificationLog {
  id: number
  phone_number: string
  message: string
  status: string
  sent_at: string
  error_message?: string
}

export default function TestNotificationsPage() {
  const [state, setState] = useState({
    // SMS Test
    smsPhone: "+966",
    smsMessage: "مرحباً! هذه رسالة تجريبية من نظام ERP",
    smsSending: false,
    smsResult: null as { success: boolean; message: string } | null,

    // WhatsApp Test
    whatsappPhone: "+966",
    whatsappMessage: "مرحباً! هذه رسالة تجريبية عبر واتساب من نظام ERP",
    whatsappSending: false,
    whatsappResult: null as { success: boolean; message: string } | null,

    // Reorder Notifications Test
    reorderSending: false,
    reorderResult: null as { success: boolean; message: string; count?: number } | null,

    // Notification Logs
    logs: [] as NotificationLog[],
    logsLoading: false,
  })

  const sendSMS = async () => {
    if (!state.smsPhone || !state.smsMessage) {
      setState((prev) => ({
        ...prev,
        smsResult: { success: false, message: "الرجاء إدخال رقم الهاتف والرسالة" },
      }))
      return
    }

    setState((prev) => ({ ...prev, smsSending: true, smsResult: null }))

    try {
      const response = await fetch("/api/notifications/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: state.smsPhone,
          message: state.smsMessage,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setState((prev) => ({
          ...prev,
          smsResult: { success: true, message: "تم إرسال الرسالة بنجاح!" },
        }))
        fetchLogs()
      } else {
        setState((prev) => ({
          ...prev,
          smsResult: { success: false, message: data.message || "فشل إرسال الرسالة" },
        }))
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        smsResult: { success: false, message: "حدث خطأ في الاتصال بالخادم" },
      }))
    } finally {
      setState((prev) => ({ ...prev, smsSending: false }))
    }
  }

  const sendWhatsApp = async () => {
    if (!state.whatsappPhone || !state.whatsappMessage) {
      setState((prev) => ({
        ...prev,
        whatsappResult: { success: false, message: "الرجاء إدخال رقم الهاتف والرسالة" },
      }))
      return
    }

    setState((prev) => ({ ...prev, whatsappSending: true, whatsappResult: null }))

    try {
      const response = await fetch("/api/notifications/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: state.whatsappPhone,
          message: state.whatsappMessage,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setState((prev) => ({
          ...prev,
          whatsappResult: { success: true, message: "تم إرسال رسالة واتساب بنجاح!" },
        }))
        fetchLogs()
      } else {
        setState((prev) => ({
          ...prev,
          whatsappResult: { success: false, message: data.message || "فشل إرسال رسالة واتساب" },
        }))
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        whatsappResult: { success: false, message: "حدث خطأ في الاتصال بالخادم" },
      }))
    } finally {
      setState((prev) => ({ ...prev, whatsappSending: false }))
    }
  }

  const sendReorderNotifications = async () => {
    setState((prev) => ({ ...prev, reorderSending: true, reorderResult: null }))

    try {
      const response = await fetch("/api/inventory/send-reorder-notifications", {
        method: "POST",
      })

      const data = await response.json()

      if (response.ok) {
        setState((prev) => ({
          ...prev,
          reorderResult: {
            success: true,
            message: `تم إرسال ${data.count || 0} إشعار بنجاح!`,
            count: data.count,
          },
        }))
        fetchLogs()
      } else {
        setState((prev) => ({
          ...prev,
          reorderResult: { success: false, message: data.message || "فشل إرسال الإشعارات" },
        }))
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        reorderResult: { success: false, message: "حدث خطأ في الاتصال بالخادم" },
      }))
    } finally {
      setState((prev) => ({ ...prev, reorderSending: false }))
    }
  }

  const fetchLogs = async () => {
    setState((prev) => ({ ...prev, logsLoading: true }))

    try {
      const response = await fetch("/api/inventory/send-reorder-notifications")
      if (response.ok) {
        const data = await response.json()
        setState((prev) => ({ ...prev, logs: data.logs || [] }))
      }
    } catch (error) {
      console.error("Error fetching logs:", error)
    } finally {
      setState((prev) => ({ ...prev, logsLoading: false }))
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === "sent") {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="h-3 w-3 ml-1" />
          تم الإرسال
        </Badge>
      )
    } else if (status === "failed") {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200">
          <XCircle className="h-3 w-3 ml-1" />
          فشل
        </Badge>
      )
    } else {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
          <Clock className="h-3 w-3 ml-1" />
          قيد الإرسال
        </Badge>
      )
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            اختبار نظام الإشعارات
          </h1>
          <p className="text-slate-600 mt-2 text-lg">اختبر إرسال الإشعارات عبر SMS و WhatsApp</p>
        </div>

        <Tabs defaultValue="sms" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-white shadow-sm">
            <TabsTrigger value="sms" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              SMS
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="reorder" className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              إشعارات المخزون
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              السجل
            </TabsTrigger>
          </TabsList>

          {/* SMS Test */}
          <TabsContent value="sms">
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-blue-600" />
                  اختبار إرسال SMS
                </CardTitle>
                <CardDescription>أرسل رسالة نصية تجريبية عبر Twilio</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>رقم الهاتف (مع رمز الدولة)</Label>
                  <Input
                    placeholder="+966501234567"
                    value={state.smsPhone}
                    onChange={(e) => setState((prev) => ({ ...prev, smsPhone: e.target.value }))}
                    className="bg-white"
                  />
                  <p className="text-sm text-slate-500 mt-1">مثال: +966501234567 (السعودية)</p>
                </div>

                <div>
                  <Label>نص الرسالة</Label>
                  <Textarea
                    placeholder="اكتب رسالتك هنا..."
                    value={state.smsMessage}
                    onChange={(e) => setState((prev) => ({ ...prev, smsMessage: e.target.value }))}
                    rows={4}
                    className="bg-white"
                  />
                  <p className="text-sm text-slate-500 mt-1">عدد الأحرف: {state.smsMessage.length}</p>
                </div>

                {state.smsResult && (
                  <Alert
                    className={state.smsResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}
                  >
                    <AlertDescription className="flex items-center gap-2">
                      {state.smsResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      {state.smsResult.message}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={sendSMS}
                  disabled={state.smsSending}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600"
                >
                  {state.smsSending ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Send className="ml-2 h-4 w-4" />
                      إرسال SMS
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* WhatsApp Test */}
          <TabsContent value="whatsapp">
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-green-600" />
                  اختبار إرسال WhatsApp
                </CardTitle>
                <CardDescription>أرسل رسالة واتساب تجريبية عبر Twilio</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>رقم الهاتف (مع رمز الدولة)</Label>
                  <Input
                    placeholder="+966501234567"
                    value={state.whatsappPhone}
                    onChange={(e) => setState((prev) => ({ ...prev, whatsappPhone: e.target.value }))}
                    className="bg-white"
                  />
                  <p className="text-sm text-slate-500 mt-1">مثال: +966501234567 (السعودية)</p>
                </div>

                <div>
                  <Label>نص الرسالة</Label>
                  <Textarea
                    placeholder="اكتب رسالتك هنا..."
                    value={state.whatsappMessage}
                    onChange={(e) => setState((prev) => ({ ...prev, whatsappMessage: e.target.value }))}
                    rows={4}
                    className="bg-white"
                  />
                  <p className="text-sm text-slate-500 mt-1">عدد الأحرف: {state.whatsappMessage.length}</p>
                </div>

                {state.whatsappResult && (
                  <Alert
                    className={
                      state.whatsappResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                    }
                  >
                    <AlertDescription className="flex items-center gap-2">
                      {state.whatsappResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      {state.whatsappResult.message}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={sendWhatsApp}
                  disabled={state.whatsappSending}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600"
                >
                  {state.whatsappSending ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Send className="ml-2 h-4 w-4" />
                      إرسال WhatsApp
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reorder Notifications Test */}
          <TabsContent value="reorder">
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  اختبار إشعارات إعادة الطلب
                </CardTitle>
                <CardDescription>إرسال إشعارات تلقائية للمنتجات التي وصلت لنقطة إعادة الطلب</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertDescription>
                    سيتم فحص جميع المنتجات في المخزون وإرسال إشعارات للمنتجات التي وصلت أو تجاوزت نقطة إعادة الطلب.
                  </AlertDescription>
                </Alert>

                {state.reorderResult && (
                  <Alert
                    className={
                      state.reorderResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                    }
                  >
                    <AlertDescription className="flex items-center gap-2">
                      {state.reorderResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      {state.reorderResult.message}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={sendReorderNotifications}
                  disabled={state.reorderSending}
                  className="w-full bg-gradient-to-r from-amber-600 to-orange-600"
                >
                  {state.reorderSending ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      جاري الفحص والإرسال...
                    </>
                  ) : (
                    <>
                      <Send className="ml-2 h-4 w-4" />
                      فحص وإرسال الإشعارات
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Logs */}
          <TabsContent value="logs">
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-slate-600" />
                      سجل الإشعارات
                    </CardTitle>
                    <CardDescription>آخر الإشعارات المرسلة</CardDescription>
                  </div>
                  <Button onClick={fetchLogs} variant="outline" size="sm">
                    تحديث
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {state.logsLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-400" />
                    <p className="text-slate-600 mt-2">جاري تحميل السجل...</p>
                  </div>
                ) : state.logs.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 mx-auto text-slate-300 mb-2" />
                    <p className="text-slate-600">لا توجد إشعارات مسجلة</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {state.logs.map((log) => (
                      <div key={log.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium text-slate-800">{log.phone_number}</p>
                            <p className="text-sm text-slate-600 mt-1">{log.message}</p>
                          </div>
                          {getStatusBadge(log.status)}
                        </div>
                        <div className="flex justify-between items-center text-xs text-slate-500 mt-2">
                          <span>{new Date(log.sent_at).toLocaleString("en-GB")}</span>
                          {log.error_message && <span className="text-red-600">{log.error_message}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
