"use client"

import { tr } from "@/lib/i18n"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle, Info, Zap } from "lucide-react"

interface QAIssue {
  type: "error" | "warning" | "suggestion"
  message: string
  line?: number
  fix?: string
}

interface FileReport {
  file: string
  type: string
  issues: QAIssue[]
}

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
}

export default function QADashboardSimple() {
  const [isScanning, setIsScanning] = useState(false)
  const [report, setReport] = useState<QAReport | null>(null)
  const [forceRender, setForceRender] = useState(0)

  useEffect(() => {
    console.log("[v0] Report state changed:", report)
    if (report) {
      console.log("[v0] Report updated with timestamp:", report.timestamp)
      setForceRender((prev) => prev + 1)
    }
  }, [report])

  useEffect(() => {
    const currentState = {
      hasReport: !!report,
      isCurrentlyScanning: isScanning,
      reportTimestamp: report?.timestamp || null,
      totalIssues: report?.summary?.totalIssues || 0,
    }
    console.log("[v0] Current display state:", currentState)

    if (currentState.hasReport && !currentState.isCurrentlyScanning) {
      console.log("[v0] UI should be updated now")
    }
  }, [report, isScanning])

  const startScan = async () => {
    console.log("[v0] Starting QA scan from dashboard...")
    setIsScanning(true)
    setReport(null)

    try {
      const response = await fetch("/api/qa-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = await response.json()
      console.log("[v0] QA scan response:", data)

      if (data.success && data.report) {
        console.log("[v0] Setting report state with:", data.report)
        setReport(data.report)
        console.log("[v0] Report state should be updated now")
      }
    } catch (error) {
      console.error("[v0] QA scan error:", error)
    } finally {
      console.log("[v0] Scan completed - setting isScanning to false")
      setIsScanning(false)
    }
  }

  const getIssueIcon = (type: string) => {
    switch (type) {
      case "error":
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case "warning":
        return <Info className="h-4 w-4 text-yellow-500" />
      case "suggestion":
        return <CheckCircle className="h-4 w-4 text-blue-500" />
      default:
        return <Info className="h-4 w-4" />
    }
  }

  const getIssueColor = (type: string) => {
    switch (type) {
      case "error":
        return "destructive"
      case "warning":
        return "secondary"
      case "suggestion":
        return "outline"
      default:
        return "outline"
    }
  }

  const shouldShowResults = report && !isScanning
  const shouldShowScanning = isScanning
  const shouldShowEmpty = !report && !isScanning

  console.log("[v0] Render conditions:", {
    shouldShowResults,
    shouldShowScanning,
    shouldShowEmpty,
    reportExists: !!report,
    isCurrentlyScanning: isScanning,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{tr("فحص جودة النظام")}</h1>
        <Button onClick={startScan} disabled={isScanning} className="bg-blue-600 hover:bg-blue-700">
          {isScanning ? (
            <>
              <Zap className="ms-2 h-4 w-4 animate-spin" />
              {tr("جاري الفحص...")}
            </>
          ) : (
            <>
              <Zap className="ms-2 h-4 w-4" />
              {tr("بدء الفحص")}
            </>
          )}
        </Button>
      </div>

      {shouldShowScanning && (
        <Card key="scanning">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center space-x-2">
              <Zap className="h-5 w-5 animate-spin text-blue-500" />
              <span className="text-lg">{tr("جاري فحص النظام...")}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {shouldShowResults && (
        <div className="space-y-6" key={`results-${report?.timestamp}`}>
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {tr("✅ تم اكتمال الفحص! تم العثور على ")}{report!.summary.totalIssues}{tr(" مشكلة في ")}{report!.summary.totalFiles}{tr(" ملف")}
          </div>

          {/* ملخص النتائج */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                {tr("ملخص نتائج الفحص")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{report!.summary.totalFiles}</div>
                  <div className="text-sm text-gray-600">{tr("ملف تم فحصه")}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{report!.summary.criticalErrors}</div>
                  <div className="text-sm text-gray-600">{tr("أخطاء حرجة")}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{report!.summary.warnings}</div>
                  <div className="text-sm text-gray-600">{tr("تحذيرات")}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{report!.summary.suggestions}</div>
                  <div className="text-sm text-gray-600">{tr("اقتراحات")}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* تفاصيل الملفات */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">{tr("تفاصيل الملفات")}</h2>
            {report!.fileReports.map((fileReport, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg">{fileReport.file}</CardTitle>
                  <Badge variant="outline">{fileReport.type}</Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {fileReport.issues.map((issue, issueIndex) => (
                      <div key={issueIndex} className="flex items-start gap-3 p-3 border rounded-lg">
                        {getIssueIcon(issue.type)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={getIssueColor(issue.type) as any}>
                              {issue.type === "error" ? tr("خطأ") : issue.type === "warning" ? tr("تحذير") : tr("اقتراح")}
                            </Badge>
                            {issue.line && <span className="text-sm text-gray-500">{tr("السطر ")}{issue.line}</span>}
                          </div>
                          <p className="text-sm mb-2">{issue.message}</p>
                          {issue.fix && (
                            <div className="bg-gray-50 p-2 rounded text-sm">
                              <strong>{tr("الحل المقترح:")}</strong> {issue.fix}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {shouldShowEmpty && (
        <Card key="empty">
          <CardContent className="pt-6">
            <div className="text-center text-gray-500">
              <Zap className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>{tr("اضغط على \"بدء الفحص\" لفحص جودة النظام")}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
