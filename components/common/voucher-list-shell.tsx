"use client"

import type { ReactNode } from "react"
import { CalendarDays, Coins, FileText, Plus, TrendingUp, type LucideIcon } from "lucide-react"
import "./voucher-list-theme.css"

// قوالب صفحات قوائم الحركات (فواتير، إرساليات، سندات قبض/صرف/قيد، إشعارات، سندات المخزون):
// رأس بنفس تصميم رأس الرئيسية (.page-hero) مع زر الإضافة (F5)، وبطاقات مؤشرات حديثة بألوان النظام.
// بطاقات البحث والجدول تُنسَّق عبر .voucher-list-page في voucher-list-theme.css.

export function VoucherListHero({ title, subtitle, addLabel, onNew, icon: Icon = FileText, category = "الحركات", actions, addDisabled = false }: {
  title: ReactNode
  subtitle?: ReactNode
  addLabel: ReactNode
  onNew: () => void
  icon?: LucideIcon
  /** النص الصغير فوق العنوان (الحركات / الملفات…) */
  category?: ReactNode
  /** أزرار إضافية بجانب زر الإضافة (مثل الاستيراد) */
  actions?: ReactNode
  addDisabled?: boolean
}) {
  return (
    <header className="page-hero relative overflow-hidden rounded-2xl px-5 py-5 sm:px-7">
      <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 right-1/3 h-56 w-56 rounded-full bg-teal-300/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur"><Icon className="h-7 w-7 text-white" /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-50/90">{category}</p>
            <h1 className="truncate text-2xl font-black text-white drop-shadow-sm sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-emerald-50/85">{subtitle}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {actions}
        <button
          type="button"
          data-hotkey-new
          onClick={onNew}
          disabled={addDisabled}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-emerald-700 shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-50 focus:outline-none focus:ring-4 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {addLabel}
          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700" dir="ltr">F5</span>
        </button>
        </div>
      </div>
    </header>
  )
}

const TONES = [
  { icon: FileText, chip: "bg-emerald-100 text-emerald-700", bar: "from-emerald-500 to-teal-500" },
  { icon: CalendarDays, chip: "bg-sky-100 text-sky-700", bar: "from-sky-500 to-cyan-500" },
  { icon: Coins, chip: "bg-amber-100 text-amber-700", bar: "from-amber-500 to-orange-500" },
  { icon: TrendingUp, chip: "bg-teal-100 text-teal-700", bar: "from-teal-500 to-emerald-500" },
]

export function VoucherStats({ stats }: { stats: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${stats.length >= 4 ? "xl:grid-cols-4" : stats.length === 3 ? "xl:grid-cols-3" : ""}`}>
      {stats.map((stat, index) => {
        const tone = TONES[index % TONES.length]
        const Icon = tone.icon
        return (
          <div key={index} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-l ${tone.bar}`} />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{stat.label}</p>
                <p className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white" dir="ltr">{stat.value}</p>
              </div>
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone.chip}`}><Icon className="h-5 w-5" /></span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
