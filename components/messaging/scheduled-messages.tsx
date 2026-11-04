"use client"

import { tr, appDir } from "@/lib/i18n"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, Send, Trash2, Plus } from "lucide-react"

interface ScheduledMessage {
  id: number
  template_name: string
  recipient_type: string
  scheduled_time: string
  repeat_type: string
  status: string
  message_content: string
  created_at: string
}

export function ScheduledMessages() {
  const [messages, setMessages] = useState<ScheduledMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchScheduledMessages()
  }, [])

  const fetchScheduledMessages = async () => {
    try {
      const response = await fetch("/api/messaging/scheduled")
      if (response.ok) {
        const data = await response.json()
        setMessages(data)
      }
    } catch (error) {
      console.error("[v0] Error fetching scheduled messages:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelMessage = async (id: number) => {
    if (!(await confirmYesNo(tr("هل أنت متأكد من إلغاء هذه الرسالة المجدولة؟")))) return

    try {
      const response = await fetch(`/api/messaging/scheduled/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        fetchScheduledMessages()
      }
    } catch (error) {
      console.error("[v0] Error cancelling message:", error)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">{tr("قيد الانتظار")}</Badge>
      case "sent":
        return <Badge className="bg-green-100 text-green-800">{tr("تم الإرسال")}</Badge>
      case "cancelled":
        return <Badge className="bg-gray-100 text-gray-800">{tr("ملغي")}</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getRepeatBadge = (repeatType: string) => {
    const labels: Record<string, string> = {
      once: tr("مرة واحدة"),
      daily: tr("يومي"),
      weekly: tr("أسبوعي"),
      monthly: tr("شهري"),
    }
    return <Badge variant="outline">{labels[repeatType] || repeatType}</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={appDir()}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{tr("الرسائل المجدولة")}</h2>
          <p className="text-muted-foreground">{tr("إدارة الرسائل المجدولة للإرسال التلقائي")}</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          {tr("جدولة رسالة جديدة")}
        </Button>
      </div>

      {/* Messages List */}
      {messages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{tr("لا توجد رسائل مجدولة")}</h3>
            <p className="text-muted-foreground text-center mb-4">{tr("ابدأ بجدولة رسالة جديدة للإرسال التلقائي")}</p>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              {tr("جدولة رسالة")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {messages.map((message) => (
            <Card key={message.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{message.template_name}</CardTitle>
                    <CardDescription className="mt-1">
                      <div className="flex items-center gap-2 mt-2">
                        <Calendar className="h-4 w-4" />
                        {new Date(message.scheduled_time).toLocaleString("en-GB")}
                      </div>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(message.status)}
                    {getRepeatBadge(message.repeat_type)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground bg-muted p-3 rounded">{message.message_content}</div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="text-sm text-muted-foreground">
                      {tr("نوع المستلمين: ")}<span className="font-medium">{message.recipient_type}</span>
                    </div>
                    {message.status === "pending" && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <Send className="h-3 w-3 me-1" />
                          {tr("إرسال الآن")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancelMessage(message.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3 me-1" />
                          {tr("إلغاء")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
