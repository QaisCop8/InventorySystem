"use client"

import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WorkspaceTab } from "@/contexts/workspace-context"

interface TabStripProps {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
}

// حاوية الأزرار نفسها (خلفية/حدود) مملوكة للأب (WorkspacePane) لا هذا المكوّن — يُعرَض هذا الشريط
// دوماً بنفس صف PaneMenu حتى لو كان تبويبات هذا الجزء فارغة حالياً (جزء شاشة مقسمة حديث لم يُفتح
// به شيء بعد)، فلا يصح أن يُخفي نفسه بالكامل (return null) وقتها كما كان سابقاً — كان هذا يُخفي زر
// "فتح صفحة" معه أيضاً بالضبط باللحظة التي يحتاجها المستخدم لفتح أول صفحة بذلك الجزء.
export function TabStrip({ tabs, activeTabId, onActivate, onClose }: TabStripProps) {
  return (
    <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto" dir="rtl">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer min-w-0 max-w-48 shrink-0",
            activeTabId === tab.id
              ? "bg-background text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
          onClick={() => onActivate(tab.id)}
        >
          <span className="truncate flex-1">{tab.title}</span>
          <button
            type="button"
            className="h-4 w-4 shrink-0 flex items-center justify-center rounded hover:bg-destructive hover:text-destructive-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onClose(tab.id)
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
