"use client"

import { confirmYesNo } from "@/components/ui/confirm-host"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ErrorHandler, type ErrorLog } from "@/lib/error-handler"
import { Download, Trash2, RefreshCw, AlertTriangle, AlertCircle, Info } from "lucide-react"

export function ErrorLogsViewer() {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [selectedLevel, setSelectedLevel] = useState<"all" | "error" | "warning" | "info">("all")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadLogs()
  }, [selectedLevel])

  const loadLogs = () => {
    setIsLoading(true)
    const level = selectedLevel === "all" ? undefined : selectedLevel
    const localLogs = ErrorHandler.getLogs(level, 200)
    setLogs(localLogs)
    setIsLoading(false)
  }

  const exportLogs = () => {
    const data = ErrorHandler.exportLogs()
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `error-logs-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const clearLogs = async () => {
    if ((await confirmYesNo("هل أنت متأكد من حذف جميع السجلات؟"))) {
      ErrorHandler.clearLogs()
      setLogs([])
    }
  }

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "error":
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case "warning":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case "info":
        return <Info className="h-4 w-4 text-blue-500" />
      default:
        return null
    }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "destructive"
      case "warning":
        return "secondary"
      case "info":
        return "outline"
      default:
        return "outline"
    }
  }

  const errorCount = logs.filter((log) => log.level === "error").length
  const warningCount = logs.filter((log) => log.level === "warning").length
  const infoCount = logs.filter((log) => log.level === "info").length

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">سجلات الأخطاء</h2>
        <div className="flex gap-2">
          <Button onClick={loadLogs} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 ml-2" />
            تحديث
          </Button>
          <Button onClick={exportLogs} variant="outline" size="sm">
            <Download className="h-4 w-4 ml-2" />
            تصدير
          </Button>
          <Button onClick={clearLogs} variant="destructive" size="sm">
            <Trash2 className="h-4 w-4 ml-2" />
            مسح الكل
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm text-muted-foreground">أخطاء</p>
                <p className="text-2xl font-bold text-red-500">{errorCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-sm text-muted-foreground">تحذيرات</p>
                <p className="text-2xl font-bold text-yellow-500">{warningCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">معلومات</p>
                <p className="text-2xl font-bold text-blue-500">{infoCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm text-muted-foreground">المجموع</p>
                <p className="text-2xl font-bold">{logs.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedLevel} onValueChange={(value) => setSelectedLevel(value as any)}>
        <TabsList>
          <TabsTrigger value="all">الكل</TabsTrigger>
          <TabsTrigger value="error">أخطاء</TabsTrigger>
          <TabsTrigger value="warning">تحذيرات</TabsTrigger>
          <TabsTrigger value="info">معلومات</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedLevel} className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>السجلات ({logs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-4">
                  {logs.map((log) => (
                    <div key={log.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getLevelIcon(log.level)}
                          <Badge variant={getLevelColor(log.level) as any}>{log.level}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {new Date(log.timestamp).toLocaleString("ar-SA")}
                          </span>
                        </div>
                        {log.userId && <Badge variant="outline">المستخدم: {log.userId}</Badge>}
                      </div>

                      <p className="font-medium">{log.message}</p>

                      {log.context && Object.keys(log.context).length > 0 && (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-muted-foreground">السياق</summary>
                          <pre className="mt-2 bg-muted p-2 rounded text-xs overflow-x-auto">
                            {JSON.stringify(log.context, null, 2)}
                          </pre>
                        </details>
                      )}

                      {log.stack && (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-muted-foreground">تفاصيل الخطأ</summary>
                          <pre className="mt-2 bg-muted p-2 rounded text-xs overflow-x-auto">{log.stack}</pre>
                        </details>
                      )}

                      {log.url && <p className="text-xs text-muted-foreground">الصفحة: {log.url}</p>}
                    </div>
                  ))}

                  {logs.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">لا توجد سجلات للعرض</div>
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
