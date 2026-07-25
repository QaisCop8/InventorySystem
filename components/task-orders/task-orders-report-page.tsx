"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TaskReport } from "./task-report"

export default function TaskOrdersReportPage() {
  return (
    <div dir="rtl" className="p-1">
      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">تقرير متابعة الطلبات</TabsTrigger>
        </TabsList>
        <TabsContent value="report" className="mt-4">
          <TaskReport />
        </TabsContent>
      </Tabs>
    </div>
  )
}
