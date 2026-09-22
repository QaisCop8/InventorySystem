"use client"

import type { ReactNode } from "react"
import { ChartNoAxesCombined, type LucideIcon } from "lucide-react"
import "./report-theme.css"

export function ReportPage({ children }: { children: ReactNode }) {
  return <main dir="rtl" className="report-page"><div className="report-body">{children}</div></main>
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
