"use client"

import { appDir } from "@/lib/i18n"
import { TaskBoard } from "./task-board"

// كانت اللوحة ملفوفة بتبويبات فيها تبويب وحيد ("لوحة التحكم") — عنصر بلا وظيفة يأخذ مساحة عمودية.
export default function TaskOrdersBoardPage() {
  return (
    <div dir={appDir()} className="p-1">
      <TaskBoard />
    </div>
  )
}
