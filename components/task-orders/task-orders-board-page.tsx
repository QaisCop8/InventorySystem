"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TaskBoard } from "./task-board"

export default function TaskOrdersBoardPage() {
  return (
    <div dir="rtl" className="p-1">
      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">لوحة التحكم</TabsTrigger>
        </TabsList>
        <TabsContent value="board" className="mt-4">
          <TaskBoard />
        </TabsContent>
      </Tabs>
    </div>
  )
}
