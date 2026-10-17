"use client"

import { showAlert } from "@/components/ui/confirm-host"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CheckCircle, XCircle, AlertTriangle, Info, RefreshCw, Database, Settings } from "lucide-react"

interface SystemValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  recommendations: string[]
  summary: {
    tablesChecked: number
    criticalIssues: number
    warnings: number
    recommendations: number
  }
}

export default function SystemHealthDashboard() {
  const [validationResult, setValidationResult] = useState<SystemValidationResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [autoFixResults, setAutoFixResults] = useState<string[]>([])

  const runSystemValidation = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/system/validate")
      const result = await response.json()
      setValidationResult(result)
    } catch (error) {
      console.error("خطأ في فحص النظام:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const runAutoFix = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/system/auto-fix", { method: "POST" })
      const result = await response.json()
      setAutoFixResults(result.fixes || [])
      // إعادة تشغيل الفحص بعد الإصلاح
      await runSystemValidation()
    } catch (error) {
      console.error("خطأ في الإصلاح التلقائي:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const cleanTestData = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/system/cleanup-test-data", { method: "POST" })
      const result = await response.json()
      if (result.success) {
        showAlert("تم مسح البيانات التجريبية بنجاح")
        await runSystemValidation()
      }
    } catch (error) {
      console.error("خطأ في مسح البيانات:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    runSystemValidation()
  }, [])

  const getHealthScore = () => {
    if (!validationResult) return 0
    const total = validationResult.summary.criticalIssues + validationResult.summary.warnings
    const max = validationResult.summary.tablesChecked * 2
    return Math.max(0, Math.round(((max - total) / max) * 100))
  }

  const getHealthColor = (score: number) => {
    if (score >= 90) return "text-green-600"
    if (score >= 70) return "text-yellow-600"
    return "text-red-600"
  }

  const getHealthStatus = (score: number) => {
    if (score >= 90) return "ممتاز"
    if (score >= 70) return "جيد"
    if (score >= 50) return "مقبول"
    return "يحتاج تحسين"
  }

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">لوحة صحة النظام</h1>
          <p className="text-muted-foreground">مراقبة واستقرار النظام</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runSystemValidation} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ml-2 ${isLoading ? "animate-spin" : ""}`} />
            فحص النظام
          </Button>
          <Button onClick={runAutoFix} variant="outline" disabled={isLoading}>
            <Settings className="h-4 w-4 ml-2" />
            إصلاح تلقائي
          </Button>
          <Button onClick={cleanTestData} variant="destructive" disabled={isLoading}>
            <Database className="h-4 w-4 ml-2" />
            مسح البيانات التجريبية
          </Button>
        </div>
      </div>

      {validationResult && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">صحة النظام العامة</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getHealthColor(getHealthScore())}`}>{getHealthScore()}%</div>
              <p className="text-xs text-muted-foreground">{getHealthStatus(getHealthScore())}</p>
              <Progress value={getHealthScore()} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">مشاكل حرجة</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{validationResult.summary.criticalIssues}</div>
              <p className="text-xs text-muted-foreground">يجب إصلاحها فوراً</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">تحذيرات</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{validationResult.summary.warnings}</div>
              <p className="text-xs text-muted-foreground">تحتاج مراجعة</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">توصيات</CardTitle>
              <Info className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{validationResult.summary.recommendations}</div>
              <p className="text-xs text-muted-foreground">لتحسين الأداء</p>
            </CardContent>
          </Card>
        </div>
      )}

      {autoFixResults.length > 0 && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>تم تنفيذ الإصلاحات التلقائية</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside mt-2">
              {autoFixResults.map((fix, index) => (
                <li key={index}>{fix}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {validationResult && (
        <Tabs defaultValue="errors" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="errors">المشاكل الحرجة ({validationResult.errors.length})</TabsTrigger>
            <TabsTrigger value="warnings">التحذيرات ({validationResult.warnings.length})</TabsTrigger>
            <TabsTrigger value="recommendations">التوصيات ({validationResult.recommendations.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="errors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  المشاكل الحرجة
                </CardTitle>
                <CardDescription>هذه المشاكل تؤثر على استقرار النظام ويجب إصلاحها فوراً</CardDescription>
              </CardHeader>
              <CardContent>
                {validationResult.errors.length === 0 ? (
                  <div className="text-center py-8 text-green-600">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4" />
                    <p className="text-lg font-semibold">لا توجد مشاكل حرجة!</p>
                    <p className="text-sm text-muted-foreground">النظام يعمل بشكل مستقر</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {validationResult.errors.map((error, index) => (
                      <Alert key={index} variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="warnings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  التحذيرات
                </CardTitle>
                <CardDescription>هذه المسائل لا تؤثر على عمل النظام لكن يُنصح بمراجعتها</CardDescription>
              </CardHeader>
              <CardContent>
                {validationResult.warnings.length === 0 ? (
                  <div className="text-center py-8 text-green-600">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4" />
                    <p className="text-lg font-semibold">لا توجد تحذيرات!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {validationResult.warnings.map((warning, index) => (
                      <Alert key={index}>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{warning}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-500" />
                  التوصيات
                </CardTitle>
                <CardDescription>اقتراحات لتحسين أداء النظام وتجربة المستخدم</CardDescription>
              </CardHeader>
              <CardContent>
                {validationResult.recommendations.length === 0 ? (
                  <div className="text-center py-8 text-green-600">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4" />
                    <p className="text-lg font-semibold">النظام محسّن بالكامل!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {validationResult.recommendations.map((recommendation, index) => (
                      <Alert key={index}>
                        <Info className="h-4 w-4" />
                        <AlertDescription>{recommendation}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
