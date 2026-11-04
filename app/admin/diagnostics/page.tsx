"use client"

import { tr, appDir } from "@/lib/i18n"
import { SystemDiagnostics } from "@/components/admin/system-diagnostics"
import { ErrorLogsViewer } from "@/components/admin/error-logs-viewer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function DiagnosticsPage() {
  return (
    <div className="container mx-auto p-6" dir={appDir()}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{tr("مركز التشخيص والمراقبة")}</h1>
        <p className="text-muted-foreground mt-2">{tr("مراقبة شاملة لصحة النظام وتشخيص الأخطاء والأداء")}</p>
      </div>

      <Tabs defaultValue="diagnostics" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="diagnostics">{tr("تشخيص النظام")}</TabsTrigger>
          <TabsTrigger value="logs">{tr("سجلات الأخطاء")}</TabsTrigger>
        </TabsList>

        <TabsContent value="diagnostics" className="mt-6">
          <SystemDiagnostics />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <ErrorLogsViewer />
        </TabsContent>
      </Tabs>
    </div>
  )
}
