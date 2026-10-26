"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { ChartNoAxesCombined, Loader2, type LucideIcon } from "lucide-react"
import "./report-theme.css"
import { ReportShareButton } from "./report-share-button"
import { usePathname } from "next/navigation"
import { useReportAccess } from "@/components/auth/use-report-access"
import { REPORT_DEFINITIONS, reportDefinitionFor } from "@/lib/report-permission-definitions"

export function ReportPage({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  const pathname = usePathname()
  const routeSection = pathname.split("/").filter(Boolean).at(-1) || ""
  const section = reportDefinitionFor(routeSection)?.section
    || REPORT_DEFINITIONS.find((definition) => definition.section.replace(/-report$/, "") === routeSection)?.section
  return <main dir="rtl" className="report-page" data-report-section={section} aria-busy={loading}>
    {/* تحميل بيانات أي تقرير: طبقة فوق التقرير بالكامل (تبقى ظاهرة مهما كان موضع التمرير) */}
    {loading && <div role="status" aria-live="polite" className="report-loading print:hidden"><div className="report-loading-box"><Loader2 className="h-6 w-6 animate-spin" aria-hidden="true"/>جاري تحميل البيانات...</div></div>}
    <div className="report-body">{children}</div></main>
}

export function ReportHeader({ title, description, category = "التقارير", icon: Icon = ChartNoAxesCombined, actions }: {
  title: ReactNode
  description?: ReactNode
  category?: string
  icon?: LucideIcon
  actions?: ReactNode
}) {
  const actionsRef = useRef<HTMLDivElement>(null)
  const canUseReportAction = useReportAccess()
  useEffect(() => {
    const container = actionsRef.current
    if (!container) return
    const section = container.closest<HTMLElement>("[data-report-section]")?.dataset.reportSection
    const update = () => {
      for (const button of Array.from(container.querySelectorAll<HTMLButtonElement>("button"))) {
        const label = (button.getAttribute("aria-label") || button.textContent || "").replace(/\s+/g, " ").trim()
        const action = label.includes("طباعة") ? "print" : label.includes("تصدير") ? "export" : null
        if (action) {
          const shouldHide = !canUseReportAction(section, action)
          if (button.hidden !== shouldHide) button.hidden = shouldHide
        }
      }
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(container, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [canUseReportAction])

  return <header className="report-header">
    <div className="report-heading"><span className="report-heading-icon"><Icon size={22} aria-hidden="true"/></span><div><span className="report-category">{category}</span><h1>{title}</h1>{description && <p>{description}</p>}</div></div>
    <div ref={actionsRef} className="report-header-actions print:hidden">{actions}<ReportShareButton /></div>
  </header>
}
