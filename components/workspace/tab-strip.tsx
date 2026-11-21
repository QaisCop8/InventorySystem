"use client"

import { tr, appDir } from "@/lib/i18n"
import { RotateCw, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WorkspaceTab } from "@/contexts/workspace-context"

interface TabStripProps {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  /** تحديث صفحة هذا التبويب وحده (إعادة تحميلها من جديد) */
  onRefresh?: (tabId: string) => void
}

// حاوية الأزرار نفسها (خلفية/حدود) مملوكة للأب (WorkspacePane) لا هذا المكوّن — يُعرَض هذا الشريط
// دوماً بنفس صف PaneMenu حتى لو كان تبويبات هذا الجزء فارغة حالياً (جزء شاشة مقسمة حديث لم يُفتح
// به شيء بعد)، فلا يصح أن يُخفي نفسه بالكامل (return null) وقتها كما كان سابقاً — كان هذا يُخفي زر
// "فتح صفحة" معه أيضاً بالضبط باللحظة التي يحتاجها المستخدم لفتح أول صفحة بذلك الجزء.
//
// التصميم (2026-11-20): بطاقات بزوايا علوية مستديرة، النشط أبيض مرتفع بخط علوي أخضر ونقطة، وأزرار التحديث/الإغلاق
// تظهر للنشط دائماً وللبقية عند التمرير فقط. النقر الأوسط يغلق التبويب.
export function TabStrip({ tabs, activeTabId, onActivate, onClose, onRefresh }: TabStripProps) {
  return (
    <div
      className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300"
      dir={appDir()}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = activeTabId === tab.id
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            title={tab.title}
            onClick={() => onActivate(tab.id)}
            onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); onClose(tab.id) } }}
            className={cn(
              "group relative flex h-9 min-w-[7.5rem] max-w-[13rem] shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-t-xl border border-b-0 px-3 text-[13px] transition-all duration-150",
              active
                ? "z-10 border-slate-200 bg-white font-bold text-slate-800 shadow-[0_-4px_12px_-6px_rgba(15,23,42,.18)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                : "border-transparent bg-slate-100/70 font-medium text-slate-500 hover:bg-white/80 hover:text-slate-700 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-800",
            )}
          >
            {/* خط علوي أخضر للتبويب النشط */}
            <span aria-hidden className={cn("absolute inset-x-2 top-0 h-[3px] rounded-b-full bg-gradient-to-l from-emerald-500 to-teal-500 transition-opacity", active ? "opacity-100" : "opacity-0")} />
            <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")} />
            <span className="min-w-0 flex-1 truncate">{tab.title}</span>
            <span className={cn("flex shrink-0 items-center gap-0.5 transition-opacity", active ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100")}>
              {onRefresh && (
                <button
                  type="button"
                  title={tr("تحديث هذا التبويب")}
                  aria-label={tr("تحديث هذا التبويب")}
                  className="grid h-5 w-5 place-items-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-300"
                  onClick={(event) => { event.stopPropagation(); onRefresh(tab.id) }}
                >
                  <RotateCw className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                title={tr("إغلاق")}
                aria-label={tr("إغلاق")}
                className="grid h-5 w-5 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-300"
                onClick={(event) => { event.stopPropagation(); onClose(tab.id) }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        )
      })}
    </div>
  )
}
