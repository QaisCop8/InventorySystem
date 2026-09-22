import type { ReactNode } from "react"
import "./report-theme.css"

export function ReportSummaryCard({ label, children, highlight = false }: {
  label: string
  children: ReactNode
  highlight?: boolean
}) {
  return (
    <article className={`report-summary-card${highlight ? " is-highlight" : ""}`}>
      <p className="report-summary-label">{label}</p>
      <p dir="ltr" className="report-summary-value">
        {children}
      </p>
    </article>
  )
}
