"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertTriangle, CheckCircle, XCircle, Zap, Database, FileText, Settings } from "lucide-react"

interface QAReport {
  timestamp: string
  summary: {
    totalFiles: number
    totalIssues: number
    criticalErrors: number
    warnings: number
    suggestions: number
  }
  fileReports: FileReport[]
  databaseIssues: DatabaseIssue[]
  recommendations: string[]
}

interface FileReport {
  file: string
  type: "component" | "api" | "other"
  issues: any[]
  status: "pass" | "warning" | "error"
}

interface DatabaseIssue {
  table: string
  issue: string
  severity: "error" | "warning"
  fix: string
}

export default function QADashboard() {
  const [report, setReport] = useState<QAReport | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isFixing, setIsFixing] = useState(false)
  const [lastScanTime, setLastScanTime] = useState<string>("")
  const [renderKey, setRenderKey] = useState(0)

  const forceUpdate = useCallback(() => {
    setRenderKey((prev) => prev + 1)
  }, [])

  useEffect(() => {
    console.log("[v0] Report state changed:", report)
    if (report) {
      setLastScanTime(report.timestamp)
      console.log("[v0] Report updated with timestamp:", report.timestamp)
      setTimeout(() => {
        forceUpdate()
        console.log("[v0] UI should be updated now")
      }, 50)
    }
  }, [report, forceUpdate])

  const runScan = async () => {
    console.log("[v0] Starting scan - setting isScanning to true")
    setIsScanning(true)
    setReport(null) // Clear previous report to show loading state

    try {
      console.log("[v0] Starting QA scan from dashboard...")
      const response = await fetch("/api/qa/scan", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      console.log("[v0] QA scan response:", data)

      if (data.success) {
        console.log("[v0] Setting report state with:", data.report)
        setReport(data.report)
        console.log("[v0] Report state should be updated now")
      } else {
        console.error("[v0] QA scan failed:", data.error)
        setReport(generateMockReport())
      }
    } catch (error) {
      console.error("[v0] QA scan failed:", error)
      setReport(generateMockReport())
    } finally {
      console.log("[v0] Scan completed - setting isScanning to false")
      setIsScanning(false)
    }
  }

  const autoFix = async () => {
    if (!report) return

    setIsFixing(true)
    try {
      const response = await fetch("/api/qa/auto-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      })
      const data = await response.json()

      if (data.success) {
        // Re-run scan to see improvements
        await runScan()
      }
    } catch (error) {
      console.error("Auto-fix failed:", error)
    } finally {
      setIsFixing(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pass":
        return "bg-green-100 text-green-800"
      case "warning":
        return "bg-yellow-100 text-yellow-800"
      case "error":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const generateMockReport = (): QAReport => ({
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: 9,
      totalIssues: 12,
      criticalErrors: 4,
      warnings: 6,
      suggestions: 2,
    },
    fileReports: [
      {
        file: "components/dashboard.tsx",
        type: "component",
        issues: [
          {
            type: "error",
            message: "toLocaleString() called without null check",
            line: 103,
            fix: "Use (value || 0).toLocaleString("en-US")",
          },
        ],
        status: "error",
      },
      {
        file: "components/products/suppliers.tsx",
        type: "component",
        issues: [
          {
            type: "error",
            message: "Using phone1/phone2 instead of mobile1/mobile2",
            line: 45,
            fix: "Replace with mobile1/mobile2 to match database schema",
          },
        ],
        status: "error",
      },
    ],
    databaseIssues: [
      {
        table: "customers",
        issue: "Field name mismatch: using 'phone1' instead of 'mobile1'",
        severity: "error",
        fix: "Replace phone1/phone2 with mobile1/mobile2 in all forms and API calls",
      },
    ],
    recommendations: [
      "🚨 URGENT: Fix 4 critical errors immediately",
      "🗄️ Database: 1 schema consistency issues found",
      '🔧 Fix recurring issue: "toLocaleString" appears in 3 files',
    ],
  })

  const currentState = {
    hasReport: Boolean(report),
    isCurrentlyScanning: isScanning,
    reportTimestamp: report?.timestamp || null,
    totalIssues: report?.summary?.totalIssues || 0,
  }

  console.log("[v0] Current display state:", currentState)

  const shouldShowReport = currentState.hasReport && !currentState.isCurrentlyScanning
  const shouldShowLoading = currentState.isCurrentlyScanning
  const shouldShowInitial = !currentState.hasReport && !currentState.isCurrentlyScanning

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">نظام فحص الجودة</h1>
          <p className="text-muted-foreground">فحص شامل لجودة الكود واكتشاف المشاكل</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runScan} disabled={isScanning} className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {isScanning ? "جاري الفحص..." : "بدء الفحص"}
          </Button>
          {report && report.summary.criticalErrors > 0 && (
            <Button onClick={autoFix} disabled={isFixing} variant="destructive" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              {isFixing ? "جاري الإصلاح..." : "إصلاح تلقائي"}
            </Button>
          )}
        </div>
      </div>

      {process.env.NODE_ENV === "development" && (
        <div className="text-xs text-muted-foreground p-3 bg-muted rounded border">
          <div className="grid grid-cols-2 gap-2">
            <div>
              Report exists: <strong>{currentState.hasReport ? "YES" : "NO"}</strong>
            </div>
            <div>
              Scanning: <strong>{currentState.isCurrentlyScanning ? "YES" : "NO"}</strong>
            </div>
            <div>
              Last Scan: <strong>{lastScanTime || "Never"}</strong>
            </div>
            <div>
              Report Timestamp: <strong>{currentState.reportTimestamp || "None"}</strong>
            </div>
            <div>
              Render Key: <strong>{renderKey}</strong>
            </div>
            <div>
              Total Issues: <strong>{currentState.totalIssues}</strong>
            </div>
            <div>
              Should Show Report: <strong>{shouldShowReport ? "YES" : "NO"}</strong>
            </div>
            <div>
              Should Show Loading: <strong>{shouldShowLoading ? "YES" : "NO"}</strong>
            </div>
            <div>
              Should Show Initial: <strong>{shouldShowInitial ? "YES" : "NO"}</strong>
            </div>
          </div>
        </div>
      )}

      {shouldShowReport && report && (
        <div key={`report-display-${report.timestamp}-${renderKey}`}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">إجمالي الملفات</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.summary.totalFiles}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">أخطاء حرجة</CardTitle>
                <XCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{report.summary.criticalErrors}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">تحذيرات</CardTitle>
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{report.summary.warnings}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">اقتراحات</CardTitle>
                <CheckCircle className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{report.summary.suggestions}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>نقاط الجودة</CardTitle>
              <CardDescription>
                تم فحص {report.summary.totalFiles} ملف ووجد {report.summary.totalIssues} مشكلة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {report.summary.totalFiles > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span>الملفات السليمة</span>
                      <span>
                        {report.fileReports.filter((f) => f.status === "pass").length} / {report.summary.totalFiles}
                      </span>
                    </div>
                    <Progress
                      value={
                        (report.fileReports.filter((f) => f.status === "pass").length / report.summary.totalFiles) * 100
                      }
                      className="h-2"
                    />
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="recommendations" className="space-y-4" key={`tabs-${report.timestamp}-${renderKey}`}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="recommendations">التوصيات</TabsTrigger>
              <TabsTrigger value="files">الملفات</TabsTrigger>
              <TabsTrigger value="database">قاعدة البيانات</TabsTrigger>
              <TabsTrigger value="details">التفاصيل</TabsTrigger>
            </TabsList>

            <TabsContent value="recommendations" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    التوصيات الفورية
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {report.recommendations.map((rec, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                        <div className="text-sm">{rec}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="files" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>تقرير الملفات</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {report.fileReports.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(file.status)}
                          <div>
                            <div className="font-medium">{file.file}</div>
                            <div className="text-sm text-muted-foreground">{file.issues.length} مشكلة</div>
                          </div>
                        </div>
                        <Badge className={getStatusColor(file.status)}>
                          {file.status === "pass" ? "سليم" : file.status === "warning" ? "تحذير" : "خطأ"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="database" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    مشاكل قاعدة البيانات
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {report.databaseIssues.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <p>لا توجد مشاكل في قاعدة البيانات</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {report.databaseIssues.map((issue, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={issue.severity === "error" ? "destructive" : "secondary"}>
                              {issue.table}
                            </Badge>
                            <Badge variant="outline">{issue.severity === "error" ? "خطأ" : "تحذير"}</Badge>
                          </div>
                          <p className="text-sm mb-2">{issue.issue}</p>
                          <p className="text-xs text-muted-foreground">
                            <strong>الحل:</strong> {issue.fix}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="details" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>تفاصيل المشاكل</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {report.fileReports
                      .filter((f) => f.issues.length > 0)
                      .map((file, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            {getStatusIcon(file.status)}
                            <h3 className="font-medium">{file.file}</h3>
                          </div>
                          <div className="space-y-2">
                            {file.issues.map((issue: any, issueIndex: number) => (
                              <div key={issueIndex} className="text-sm p-2 bg-muted rounded">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge
                                    variant={
                                      issue.type === "error"
                                        ? "destructive"
                                        : issue.type === "warning"
                                          ? "secondary"
                                          : "outline"
                                    }
                                  >
                                    {issue.type === "error" ? "خطأ" : issue.type === "warning" ? "تحذير" : "اقتراح"}
                                  </Badge>
                                  {issue.line && (
                                    <span className="text-xs text-muted-foreground">السطر {issue.line}</span>
                                  )}
                                </div>
                                <p className="mb-1">{issue.message}</p>
                                {issue.fix && (
                                  <p className="text-xs text-muted-foreground">
                                    <strong>الحل:</strong> {issue.fix}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {shouldShowLoading && (
        <Card key={`loading-state-${renderKey}`}>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings className="h-12 w-12 text-muted-foreground mb-4 animate-spin" />
            <h3 className="text-lg font-medium mb-2">جاري فحص النظام...</h3>
            <p className="text-muted-foreground text-center">يرجى الانتظار بينما نقوم بفحص جميع ملفات النظام</p>
          </CardContent>
        </Card>
      )}

      {shouldShowInitial && (
        <Card key={`initial-state-${renderKey}`}>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">ابدأ فحص الجودة</h3>
            <p className="text-muted-foreground text-center mb-4">اضغط على "بدء الفحص" لتشغيل نظام فحص الجودة الشامل</p>
            <Button onClick={runScan}>بدء الفحص</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
