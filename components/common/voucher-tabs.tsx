"use client"

import type { ComponentType, ReactNode } from "react"
import { TabsTrigger } from "@/components/ui/tabs"

// تبويبات السندات الحديثة (2026-11-20): "حبوب" بأيقونة، الفعّال أبيض مرتفع بخط سفلي متدرّج.
// مستخدمة في سند البضاعة، فاتورة المبيعات/التسليم، وسند القبض/الصرف.
// لا تُضَف هنا حركة (animate-in) على اللوحات: التحويل أثناء الحركة يُدخل عنصر Wijmo المخفي
// (المتموضع بعيداً خارج الشاشة) في منطقة التمرير فيُزاح السند كله أفقياً.

export const voucherTabListClass =
  "flex h-auto flex-wrap justify-start gap-1.5 rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-slate-100/80 p-1.5 shadow-inner dark:border-slate-800 dark:from-slate-900 dark:to-slate-900"

export const voucherTabTriggerClass =
  "group relative gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition-all duration-200 hover:bg-emerald-50 hover:text-emerald-700 " +
  "data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-[0_6px_18px_-8px_rgba(5,150,105,.55)] data-[state=active]:ring-1 data-[state=active]:ring-emerald-200 " +
  "after:absolute after:inset-x-4 after:-bottom-px after:h-[3px] after:scale-x-0 after:rounded-full after:bg-gradient-to-l after:from-emerald-500 after:to-teal-500 after:transition-transform after:duration-300 data-[state=active]:after:scale-x-100 " +
  "dark:text-slate-400 dark:hover:bg-slate-800 dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-emerald-300 dark:data-[state=active]:ring-emerald-800"

export const voucherTabIconClass =
  "grid h-6 w-6 place-items-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-emerald-100 group-hover:text-emerald-700 group-data-[state=active]:bg-gradient-to-br group-data-[state=active]:from-emerald-500 group-data-[state=active]:to-teal-500 group-data-[state=active]:text-white dark:bg-slate-800"

export function VoucherTabTrigger({
  value,
  icon: Icon,
  count,
  dot,
  children,
}: {
  value: string
  icon: ComponentType<{ className?: string }>
  /** رقم صغير بجانب العنوان (مثل عدد الأصناف) */
  count?: number
  /** نقطة تنبيه (مثل وجود ملاحظة) */
  dot?: boolean
  children: ReactNode
}) {
  return (
    <TabsTrigger value={value} className={voucherTabTriggerClass}>
      <span className={voucherTabIconClass}><Icon className="h-3.5 w-3.5" /></span>
      {children}
      {count !== undefined && (
        <span className="min-w-[1.5rem] rounded-full bg-emerald-100 px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          {count}
        </span>
      )}
      {dot && <span className="h-2 w-2 rounded-full bg-amber-400 ring-2 ring-amber-100" />}
    </TabsTrigger>
  )
}
