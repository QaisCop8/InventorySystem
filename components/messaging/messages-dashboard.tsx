"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  MessageSquare,
  Send,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  FileText,
  Calendar,
  Download,
} from "lucide-react"
import { MessagingStatistics } from "./messaging-statistics"
import { MessageTemplates } from "./message-templates"
import { MessageLog } from "./message-log"
import { ScheduledMessages } from "./scheduled-messages"

interface DashboardStats {
  today: {
    total_sent: number
    total_delivered: number
    total_failed: number
    success_rate: number
  }
  yesterday: {
    total_sent: number
    success_rate: number
  }
  week: {
    total_sent: number
    total_delivered: number
    total_failed: number
    success_rate: number
  }
  month: {
    total_sent: number
    total_delivered: number
    total_failed: number
    success_rate: number
  }
}

export function MessagesDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")

  useEffect(() => {
    fetchDashboardStats()
  }, [])

  const fetchDashboardStats = async () => {
    try {
      const response = await fetch("/api/messaging/dashboard-stats")
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error("[v0] Error fetching dashboard stats:", error)
    } finally {
      setLoading(false)
    }
  }

  const getTrendIndicator = (current: number, previous: number) => {
    if (current > previous) {
      return (
        <div className="flex items-center gap-1 text-green-600">
          <TrendingUp className="h-4 w-4" />
          <span className="text-sm">+{(((current - previous) / previous) * 100).toFixed(1)}%</span>
        </div>
      )
    } else if (current < previous) {
      return (
        <div className="flex items-center gap-1 text-red-600">
          <TrendingDown className="h-4 w-4" />
          <span className="text-sm">-{(((previous - current) / previous) * 100).toFixed(1)}%</span>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل الأصناف...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 bg-background" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-primary" />
            لوحة إدارة الرسائل
          </h1>
          <p className="text-muted-foreground mt-1">إدارة شاملة لجميع الرسائل والإشعارات</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 bg-transparent">
            <Download className="h-4 w-4" />
            تصدير التقرير
          </Button>
          <Button className="gap-2">
            <Send className="h-4 w-4" />
            إرسال رسالة جديدة
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">رسائل اليوم</CardTitle>
              <Send className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.today.total_sent}</div>
              {getTrendIndicator(stats.today.total_sent, stats.yesterday.total_sent)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">تم التسليم</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.today.total_delivered}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.today.total_sent > 0
                  ? `${((stats.today.total_delivered / stats.today.total_sent) * 100).toFixed(1)}% من الإجمالي`
                  : "لا توجد رسائل"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">فشل الإرسال</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.today.total_failed}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.today.total_sent > 0
                  ? `${((stats.today.total_failed / stats.today.total_sent) * 100).toFixed(1)}% من الإجمالي`
                  : "لا توجد رسائل"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">معدل النجاح</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.today.success_rate.toFixed(1)}%</div>
              {getTrendIndicator(stats.today.success_rate, stats.yesterday.success_rate)}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="h-4 w-4" />
            القوالب
          </TabsTrigger>
          <TabsTrigger value="log" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            سجل الرسائل
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="gap-2">
            <Calendar className="h-4 w-4" />
            الرسائل المجدولة
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <MessagingStatistics />
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <MessageTemplates />
        </TabsContent>

        <TabsContent value="log" className="space-y-4">
          <MessageLog />
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-4">
          <ScheduledMessages />
        </TabsContent>
      </Tabs>
    </div>
  )
}
