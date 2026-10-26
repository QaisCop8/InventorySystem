"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import {
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Database,
  Server,
  Activity,
  Clock,
  HardDrive,
} from "lucide-react"

interface HealthCheck {
  timestamp: string
  status: "healthy" | "degraded" | "unhealthy"
  version: string
  uptime: number
  checks: {
    database?: any
    memory?: any
    environment?: any
  }
  performance?: any
  errors: string[]
}

interface Diagnostics {
  timestamp: string
  database: any
  tables: Record<string, any>
  performance: any
  errors: string[]
}

export function SystemDiagnostics() {
  const [healthData, setHealthData] = useState<HealthCheck | null>(null)
  const [diagnosticsData, setDiagnosticsData] = useState<Diagnostics | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [performanceWarning, setPerformanceWarning] = useState<string | null>(null)

  useEffect(() => {
    runDiagnostics()
    let interval: NodeJS.Timeout | null = null

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (interval) clearInterval(interval)
      } else if (autoRefresh) {
        interval = setInterval(runDiagnostics, 30000)
      }
    }

    if (autoRefresh) {
      interval = setInterval(runDiagnostics, 30000)
      document.addEventListener("visibilitychange", handleVisibilityChange)
    }

    return () => {
      if (interval) clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [autoRefresh])

  const runDiagnostics = async () => {
    setIsLoading(true)
    setPerformanceWarning(null)
    const startTime = Date.now()

    try {
      const [healthResponse, diagnosticsResponse] = await Promise.all([
        fetch("/api/system/health"),
        fetch("/api/system/diagnostics"),
      ])

      const [healthResult, diagnosticsResult] = await Promise.all([healthResponse.json(), diagnosticsResponse.json()])

      setHealthData(healthResult)
      setDiagnosticsData(diagnosticsResult)
      setLastUpdate(new Date())

      const totalTime = Date.now() - startTime
      if (totalTime > 5000) {
        setPerformanceWarning(`التشخيص استغرق ${totalTime}ms - قد يؤثر على الأداء`)
      }
    } catch (error) {
      console.error("[v0] Failed to run diagnostics:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case "degraded":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case "unhealthy":
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-500"
      case "degraded":
        return "bg-yellow-500"
      case "unhealthy":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}س ${minutes}د`
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">تشخيص النظام</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            تحديث تلقائي
          </label>
          {lastUpdate && (
            <span className="text-sm text-muted-foreground">آخر تحديث: {lastUpdate.toLocaleTimeString("en-GB")}</span>
          )}
          <Button onClick={runDiagnostics} disabled={isLoading} size="sm">
            <RefreshCw className={`h-4 w-4 ml-2 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "جاري الفحص..." : "فحص الآن"}
          </Button>
        </div>
      </div>

      {performanceWarning && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span className="text-yellow-800">{performanceWarning}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {healthData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                {getStatusIcon(healthData.status)}
                <div>
                  <p className="text-sm text-muted-foreground">حالة النظام</p>
                  <p className="text-lg font-bold">
                    {healthData.status === "healthy" ? "سليم" : healthData.status === "degraded" ? "متدهور" : "معطل"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">وقت التشغيل</p>
                  <p className="text-lg font-bold">{formatUptime(healthData.uptime)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-sm text-muted-foreground">الذاكرة</p>
                  <p className="text-lg font-bold">
                    {healthData.checks.memory
                      ? `${healthData.checks.memory.heapUsed}/${healthData.checks.memory.heapTotal} MB`
                      : "غير متاح"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">قاعدة البيانات</p>
                  <p className="text-lg font-bold">
                    {healthData.checks.database?.responseTime
                      ? `${healthData.checks.database.responseTime}ms`
                      : "معطلة"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="database">قاعدة البيانات</TabsTrigger>
          <TabsTrigger value="performance">الأداء</TabsTrigger>
          <TabsTrigger value="errors">الأخطاء</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {healthData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    معلومات الخادم
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span>الإصدار:</span>
                    <Badge variant="outline">{healthData.version}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Node.js:</span>
                    <Badge variant="outline">{healthData.performance?.nodeVersion}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>المنصة:</span>
                    <Badge variant="outline">{healthData.performance?.platform}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>المعمارية:</span>
                    <Badge variant="outline">{healthData.performance?.arch}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    حالة المكونات
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(healthData.checks).map(([key, check]: [string, any]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="capitalize">
                        {key === "database"
                          ? "قاعدة البيانات"
                          : key === "memory"
                            ? "الذاكرة"
                            : key === "environment"
                              ? "البيئة"
                              : key}
                      </span>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(check.status)}
                        <Badge variant={check.status === "healthy" ? "default" : "destructive"}>
                          {check.status === "healthy" ? "سليم" : check.status === "degraded" ? "متدهور" : "معطل"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          {diagnosticsData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>إحصائيات قاعدة البيانات</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span>زمن الاستجابة:</span>
                    <Badge variant="outline">{diagnosticsData.database.responseTime}ms</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>عدد الجداول:</span>
                    <Badge variant="outline">{diagnosticsData.database.totalTables}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>حالة الجداول</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {Object.entries(diagnosticsData.tables).map(([tableName, tableInfo]: [string, any]) => (
                        <div key={tableName} className="flex items-center justify-between p-2 border rounded">
                          <span className="font-medium">{tableName}</span>
                          <div className="flex items-center gap-2">
                            {tableInfo.exists ? (
                              <>
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <Badge variant="outline">{tableInfo.records} سجل</Badge>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-4 w-4 text-red-500" />
                                <Badge variant="destructive">غير موجود</Badge>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          {diagnosticsData && healthData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>أداء الاستعلامات</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span>استعلام بسيط:</span>
                      <span>{diagnosticsData.performance.simpleQueryTime}ms</span>
                    </div>
                    <Progress value={Math.min(diagnosticsData.performance.simpleQueryTime / 10, 100)} />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <span>استعلام معقد:</span>
                      <span>{diagnosticsData.performance.complexQueryTime}ms</span>
                    </div>
                    <Progress value={Math.min(diagnosticsData.performance.complexQueryTime / 100, 100)} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>استخدام الذاكرة</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {healthData.checks.memory && (
                    <>
                      <div>
                        <div className="flex justify-between mb-2">
                          <span>Heap المستخدم:</span>
                          <span>{healthData.checks.memory.heapUsed} MB</span>
                        </div>
                        <Progress
                          value={(healthData.checks.memory.heapUsed / healthData.checks.memory.heapTotal) * 100}
                        />
                      </div>
                      <div>
                        <div className="flex justify-between mb-2">
                          <span>RSS:</span>
                          <span>{healthData.checks.memory.rss} MB</span>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-2">
                          <span>External:</span>
                          <span>{healthData.checks.memory.external} MB</span>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>أخطاء النظام</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {healthData?.errors.length === 0 && diagnosticsData?.errors.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                      لا توجد أخطاء في النظام
                    </div>
                  ) : (
                    <>
                      {healthData?.errors.map((error, index) => (
                        <div key={`health-${index}`} className="flex items-start gap-2 p-3 border rounded bg-red-50">
                          <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                          <div>
                            <p className="font-medium text-red-700">خطأ في الصحة العامة</p>
                            <p className="text-sm text-red-600">{error}</p>
                          </div>
                        </div>
                      ))}
                      {diagnosticsData?.errors.map((error, index) => (
                        <div key={`diag-${index}`} className="flex items-start gap-2 p-3 border rounded bg-yellow-50">
                          <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                          <div>
                            <p className="font-medium text-yellow-700">خطأ في التشخيص</p>
                            <p className="text-sm text-yellow-600">{error}</p>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
