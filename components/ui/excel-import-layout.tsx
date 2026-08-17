"use client"

import type { ReactNode } from "react"
import { Check, FileSpreadsheet } from "lucide-react"
import { cn } from "@/lib/utils"

export type ExcelImportStep = "upload" | "mapping" | "preview" | "result"

const steps: Array<{ key: ExcelImportStep; label: string }> = [
  { key: "upload", label: "رفع الملف" },
  { key: "mapping", label: "مطابقة الأعمدة" },
  { key: "preview", label: "مراجعة البيانات" },
  { key: "result", label: "النتيجة" },
]

export function ExcelImportHeader({ title, description, step, hideMapping = false }: { title: string; description?: string; step: ExcelImportStep; hideMapping?: boolean }) {
  const visibleSteps = hideMapping ? steps.filter((item) => item.key !== "mapping") : steps
  const currentIndex = visibleSteps.findIndex((item) => item.key === step)
  return <div className="space-y-4 border-b bg-gradient-to-l from-emerald-50 via-white to-white px-4 pb-4 pt-5 sm:px-6">
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-emerald-600 p-2.5 text-white shadow-sm"><FileSpreadsheet className="h-5 w-5" /></div>
      <div><h2 className="text-xl font-bold text-slate-900">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
    </div>
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${visibleSteps.length}, minmax(0, 1fr))` }}>
      {visibleSteps.map((item, index) => {
        const complete = index < currentIndex || step === "result"
        const active = index === currentIndex && step !== "result"
        return <li key={item.key} className={cn("flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2 text-xs font-semibold sm:px-3 sm:text-sm", complete && "border-emerald-200 bg-emerald-50 text-emerald-700", active && "border-emerald-500 bg-white text-emerald-800 shadow-sm", !complete && !active && "border-slate-200 bg-white/70 text-slate-400")}>
          <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs", complete && "border-emerald-600 bg-emerald-600 text-white", active && "border-emerald-600 text-emerald-700")}>{complete ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
          <span className="truncate">{item.label}</span>
        </li>
      })}
    </ol>
  </div>
}

export function ExcelImportProgress({ current, total, label = "جاري استيراد البيانات..." }: { current: number; total: number; label?: string }) {
  const percentage = total ? Math.min(100, Math.round((current / total) * 100)) : 0
  return <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
    <div className="flex items-center justify-between text-sm"><span className="font-medium text-blue-900">{label}</span><span className="tabular-nums text-blue-700">{current}/{total}</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-all duration-200" style={{ width: `${percentage}%` }} /></div>
  </div>
}

export function ExcelImportStats({ success, failed, duplicates = 0 }: { success: number; failed: number; duplicates?: number }) {
  const cards = [{ label: "تم بنجاح", value: success, className: "border-emerald-200 bg-emerald-50 text-emerald-700" }, { label: "فشل", value: failed, className: "border-rose-200 bg-rose-50 text-rose-700" }, { label: "مكرر", value: duplicates, className: "border-amber-200 bg-amber-50 text-amber-700" }]
  return <div className="grid grid-cols-3 gap-3">{cards.map((card) => <div key={card.label} className={cn("rounded-xl border p-4 text-center", card.className)}><div className="text-2xl font-bold tabular-nums">{card.value}</div><div className="mt-1 text-xs font-semibold sm:text-sm">{card.label}</div></div>)}</div>
}

export function ExcelImportBody({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">{children}</div>
}
