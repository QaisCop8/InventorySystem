"use client"

import { tr, appDir } from "@/lib/i18n"
import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { Bell, CheckCheck, Clock, AlertTriangle, Info, ChevronLeft } from "lucide-react"
import { useReportAccess } from "@/components/auth/use-report-access"
import { useFileSectionAccess } from "@/components/auth/use-file-access"
import { useTransactionSectionAccess } from "@/components/auth/transaction-access-gate"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { formatDateTimeToBritish } from "@/lib/utils"

interface Notification {
  id: number
  notification_type: string
  title: string
  message: string
  priority_level: "low" | "normal" | "high" | "urgent"
  is_read: boolean
  related_order_number?: string
  stage_name?: string
  stage_color?: string
  icon_name?: string
  created_at: string
}

// تنبيهات العمل الحيّة (/api/work-alerts): أعداد ما ينتظر معالجة، كل منها يفتح شاشته
interface WorkAlert {
  key: string
  title: string
  message: string
  count: number
  section: string
  priority: "normal" | "high" | "urgent"
}

// آخر عدد اطّلع عليه المستخدم لكل تنبيه — الشارة تعدّ ما زاد بعده فقط (للمتصفح الحالي)
const SEEN_KEY = "work_alerts_seen"
const readSeen = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") || {} } catch { return {} }
}
const writeSeen = (value: Record<string, number>) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(value)) } catch {}
}

interface NotificationCenterProps {
  userId?: string
  department?: string
  className?: string
}

export function NotificationCenter({ userId, department, className }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [alerts, setAlerts] = useState<WorkAlert[]>([])
  const [seen, setSeen] = useState<Record<string, number>>({})
  const previousCounts = useRef<Record<string, number> | null>(null)
  const router = useRouter()
  const { toast } = useToast()
  const canOpenReport = useReportAccess()
  const canOpenFile = useFileSectionAccess()
  const canOpenTransaction = useTransactionSectionAccess()
  const canOpen = (section: string) => canOpenReport(section) && canOpenFile(section) && canOpenTransaction(section)
  const visibleAlerts = useMemo(() => alerts.filter((alert) => canOpen(alert.section)), [alerts, canOpenReport, canOpenFile, canOpenTransaction])
  const newAlerts = visibleAlerts.filter((alert) => alert.count > (seen[alert.key] || 0)).length
  const badgeCount = unreadCount + newAlerts

  const fetchAlerts = async () => {
    try {
      const response = await fetch(`/api/work-alerts?_=${Date.now()}`, { cache: "no-store" })
      if (!response.ok) return
      const data = await response.json()
      setAlerts(Array.isArray(data.alerts) ? data.alerts : [])
    } catch {}
  }

  // جلب التنبيهات
  const fetchNotifications = async (unreadOnly = false) => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (userId) params.append("user_id", userId.toString())
      if (department) params.append("department", department)
      if (unreadOnly) params.append("unread_only", "true")
      params.append("limit", "20")

      const response = await fetch(`/api/notifications?${params}`)

      if (!response.ok) return

      const data = await response.json()
      setNotifications(Array.isArray(data.notifications) ? data.notifications : [])
      setUnreadCount(typeof data.totalUnread === "number" ? data.totalUnread : 0)
    } catch (error) {
      console.error("Error fetching notifications:", error)
    } finally {
      setLoading(false)
    }
  }

  // تحديد تنبيه كمقروء
  const markAsRead = async (notificationId: number) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PATCH",
      })

      if (response.ok) {
        setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)))
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (error) {
      console.error("Error marking notification as read:", error)
      // Update locally even if API fails
      setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }
  }

  // تحديد جميع التنبيهات كمقروءة
  const markAllAsRead = async () => {
    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, department }),
      })

      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
        setUnreadCount(0)
      }
    } catch (error) {
      console.error("Error marking all notifications as read:", error)
      // Update locally even if API fails
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    }
  }

  // الحصول على أيقونة الأولوية
  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case "high":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />
      case "normal":
        return <Info className="h-4 w-4 text-blue-500" />
      case "low":
        return <Clock className="h-4 w-4 text-gray-500" />
      default:
        return <Info className="h-4 w-4 text-blue-500" />
    }
  }

  // الحصول على لون الأولوية
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 border-red-200 text-red-800"
      case "high":
        return "bg-orange-100 border-orange-200 text-orange-800"
      case "normal":
        return "bg-blue-100 border-blue-200 text-blue-800"
      case "low":
        return "bg-gray-100 border-gray-200 text-gray-800"
      default:
        return "bg-blue-100 border-blue-200 text-blue-800"
    }
  }

  // تحديث التنبيهات كل 30 ثانية، وتنبيهات العمل كل دقيقة
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(() => {
      fetchNotifications()
    }, 30000)

    return () => clearInterval(interval)
  }, [userId, department])

  useEffect(() => {
    setSeen(readSeen())
    previousCounts.current = null
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 60000)
    return () => clearInterval(interval)
  }, [userId])

  // إشعار منبثق عند ظهور عمل جديد (عند الدخول: ما زاد منذ آخر اطّلاع؛ بعدها: ما زاد منذ آخر تحديث)
  useEffect(() => {
    if (!visibleAlerts.length && previousCounts.current === null) return
    const baseline = previousCounts.current ?? seen
    const grown = visibleAlerts.filter((alert) => alert.count > (baseline[alert.key] || 0))
    previousCounts.current = Object.fromEntries(visibleAlerts.map((alert) => [alert.key, alert.count]))
    if (!grown.length) return
    const first = grown[0]
    toast({
      title: first.title,
      description: grown.length > 1 ? tr("{0} — و{1} تنبيه آخر في الجرس", first.message, grown.length - 1) : first.message,
      variant: first.priority === "urgent" ? "destructive" : "default",
    })
  }, [visibleAlerts])

  const markAlertsSeen = () => {
    const next = { ...readSeen(), ...Object.fromEntries(visibleAlerts.map((alert) => [alert.key, alert.count])) }
    writeSeen(next)
    setSeen(next)
  }

  const openAlert = (alert: WorkAlert) => {
    setIsOpen(false)
    router.push(`/?section=${alert.section}`, { scroll: false })
  }

  return (
    <Popover open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (open) { fetchAlerts(); markAlertsSeen() } }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("relative", className)} onClick={() => fetchNotifications()}>
          <Bell className="h-4 w-4 md:h-5 md:w-5" />
          {badgeCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -start-1 h-4 w-4 md:h-5 md:w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {badgeCount > 99 ? "99+" : badgeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[min(24rem,calc(100vw-1rem))] p-0" align="end" dir={appDir()}>
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{tr("التنبيهات")}</CardTitle>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
                    <CheckCheck className="h-4 w-4 me-1" />
                    {tr("تحديد الكل كمقروء")}
                  </Button>
                )}
                <Badge variant="secondary">{unreadCount}{tr(" غير مقروء")}</Badge>
              </div>
            </div>
          </CardHeader>

          <Separator />

          <CardContent className="p-0">
            <ScrollArea className="h-96">
              {visibleAlerts.length > 0 && (
                <div className="border-b bg-amber-50/40 p-2">
                  <div className="px-2 pb-1 text-xs font-semibold text-muted-foreground">{tr("بحاجة لمتابعة")}</div>
                  {visibleAlerts.map((alert) => (
                    <button
                      key={alert.key}
                      type="button"
                      onClick={() => openAlert(alert)}
                      className="flex w-full items-start gap-3 rounded-lg p-2 text-start transition-colors hover:bg-white"
                    >
                      <div className="mt-0.5 flex-shrink-0">{getPriorityIcon(alert.priority)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{alert.title}</div>
                        <p className="text-xs text-muted-foreground">{alert.message}</p>
                      </div>
                      <Badge variant="outline" className={cn("flex-shrink-0 text-xs", getPriorityColor(alert.priority))}>{alert.count}</Badge>
                      <ChevronLeft className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : notifications.length === 0 ? (
                visibleAlerts.length ? null : <div className="text-center py-8 text-muted-foreground">{tr("لا توجد تنبيهات")}</div>
              ) : (
                <div className="divide-y">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={cn(
                        "p-4 hover:bg-muted/50 cursor-pointer transition-colors",
                        !notification.is_read && "bg-blue-50/50",
                      )}
                      onClick={() => !notification.is_read && markAsRead(notification.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">{getPriorityIcon(notification.priority_level)}</div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4
                              className={cn("text-sm font-medium truncate", !notification.is_read && "font-semibold")}
                            >
                              {notification.title}
                            </h4>
                            {!notification.is_read && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                            )}
                          </div>

                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{notification.message}</p>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {notification.related_order_number && (
                                <Badge variant="outline" className="text-xs">
                                  {notification.related_order_number}
                                </Badge>
                              )}
                              {notification.stage_name && (
                                <Badge
                                  variant="outline"
                                  className="text-xs"
                                  style={{
                                    backgroundColor: notification.stage_color + "20",
                                    borderColor: notification.stage_color,
                                    color: notification.stage_color,
                                  }}
                                >
                                  {notification.stage_name}
                                </Badge>
                              )}
                            </div>

                            <span className="text-xs text-muted-foreground">
                              {formatDateTimeToBritish(notification.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  )
}
