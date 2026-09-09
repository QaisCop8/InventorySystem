import type { ReactNode } from "react"

export function ReportSummaryCard({ label, children, highlight = false }: {
  label: string
  children: ReactNode
  highlight?: boolean
}) {
  return (
    <article className="flex min-h-[72px] min-w-0 flex-col justify-center rounded-[12px] border border-slate-200 bg-white px-3 py-3 text-right shadow-[0_3px_8px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[10px] font-normal leading-4 text-slate-500 dark:text-slate-400">{label}</p>
      <p dir="ltr" className={`mt-1 text-right text-[18px] font-black leading-6 tabular-nums ${highlight ? "text-[#ff004f] dark:text-rose-400" : "text-[#0f172a] dark:text-white"}`}>
        {children}
      </p>
    </article>
  )
}
