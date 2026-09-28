"use client"

import type { ReactNode } from "react"
import { ChartNoAxesCombined, Loader2, type LucideIcon } from "lucide-react"
import "./report-theme.css"

export function ReportPage({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  return <main dir="rtl" className="report-page" aria-busy={loading}>
    {loading && <div role="status" className="report-loading print:hidden"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true"/>جاري تحميل بيانات التقرير...</div>}
    <div className="report-body">{children}</div></main>
}

export function ReportHeader({ title, description, category = "التقارير", icon: Icon = ChartNoAxesCombined, actions }: {
  title: ReactNode
  description?: ReactNode
  category?: string
  icon?: LucideIcon
  actions?: ReactNode
}) {
  return <header className="report-header">
    <div className="report-heading"><span className="report-heading-icon"><Icon size={22} aria-hidden="true"/></span><div><span className="report-category">{category}</span><h1>{title}</h1>{description && <p>{description}</p>}</div></div>
    {actions && <div className="report-header-actions print:hidden">{actions}</div>}
  </header>
}
