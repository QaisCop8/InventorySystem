"use client"

import { tr, appDir } from "@/lib/i18n"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download } from "lucide-react"

interface StatisticsData {
  daily: Array<{
    date: string
    total_sent: number
    total_delivered: number
    total_failed: number
    success_rate: number
  }>
  weekly: {
    total_sent: number
    total_delivered: number
    total_failed: number
    success_rate: number
  }
  monthly: {
    total_sent: number
    total_delivered: number
    total_failed: number
    success_rate: number
  }
}

export function MessagingStatistics() {
  const [statistics, setStatistics] = useState<StatisticsData | null>(null)
  const [period, setPeriod] = useState("week")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStatistics()
  }, [period])

  const fetchStatistics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/messaging/statistics?period=${period}`)
      if (response.ok) {
        const data = await response.json()
        setStatistics(data)
      }
    } catch (error) {
      console.error("[v0] Error fetching statistics:", error)
    } finally {
      setLoading(false)
    }
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
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">{tr("آخر 7 أيام")}</SelectItem>
              <SelectItem value="month">{tr("آخر 30 يوم")}</SelectItem>
              <SelectItem value="quarter">{tr("آخر 3 أشهر")}</SelectItem>
              <SelectItem value="year">{tr("آخر سنة")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" className="gap-2 bg-transparent">
          <Download className="h-4 w-4" />
          {tr("تصدير البيانات")}
        </Button>
      </div>

      {/* Summary Cards */}
      {statistics && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{tr("إجمالي الرسائل المرسلة")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {period === "week" ? statistics.weekly.total_sent : statistics.monthly.total_sent}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {tr("خلال ")}{period === "week" ? tr("الأسبوع") : tr("الشهر")}{tr(" الماضي")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{tr("معدل التسليم")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {period === "week"
                  ? statistics.weekly.success_rate.toFixed(1)
                  : statistics.monthly.success_rate.toFixed(1)}
                %
              </div>
              <p className="text-xs text-muted-foreground mt-2">{tr("من إجمالي الرسائل")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{tr("الرسائل الفاشلة")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {period === "week" ? statistics.weekly.total_failed : statistics.monthly.total_failed}
              </div>
              <p className="text-xs text-muted-foreground mt-2">{tr("تحتاج إلى مراجعة")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Daily Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{tr("الرسائل اليومية")}</CardTitle>
          <CardDescription>{tr("عدد الرسائل المرسلة يومياً")}</CardDescription>
        </CardHeader>
        <CardContent>
          {statistics && statistics.daily.length > 0 ? (
            <div className="space-y-4">
              {statistics.daily.map((day) => (
                <div key={day.date} className="flex items-center gap-4">
                  <div className="w-24 text-sm text-muted-foreground">
                    {new Date(day.date).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-green-500 h-full"
                          style={{ width: `${(day.total_delivered / day.total_sent) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{day.total_sent}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="text-green-600">✓ {day.total_delivered}{tr(" تم التسليم")}</span>
                      <span className="text-red-600">✗ {day.total_failed}{tr(" فشل")}</span>
                      <span>{day.success_rate.toFixed(1)}{tr("% معدل النجاح")}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">{tr("لا توجد بيانات للفترة المحددة")}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
