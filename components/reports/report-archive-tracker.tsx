"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { logReportAudit } from "@/lib/audit-client"
import { collectReportFilters } from "@/lib/report-filters-capture"
import { ReportShareButton } from "./report-share-button"

// أزرار عرض التقرير في التقارير التي لا تستخدم data-report-apply
const RUN_TEXT = /^(عرض|تطبيق|تحديث|بحث|استعلام|إظهار|اظهار)/

/**
 * يلفّ كل تقرير (من ReportAccessGate): يسجّل فتحه، وكل عرض له مع الفلاتر الظاهرة، في تقرير ارشفة التقارير.
 * display:contents حتى لا يغيّر تخطيط التقرير. إن لم يكن للتقرير رأس قياسي (ReportHeader) يظهر زر واتساب عائماً.
 */
export function ReportArchiveTracker({ section, title, children }: { section: string; title: string; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lastRunRef = useRef<{ key: string; at: number } | null>(null)
  const [needsFloatingShare, setNeedsFloatingShare] = useState(false)

  useEffect(() => {
    logReportAudit({ action: "open", report_key: section, report_title: title })
  }, [section, title])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const timer = window.setTimeout(() => setNeedsFloatingShare(!root.querySelector(".report-header")), 1500)

    const logRun = () => {
      const filters = collectReportFilters((root.querySelector(".report-page") as HTMLElement | null) || root)
      const key = JSON.stringify(filters)
      const now = Date.now()
      if (lastRunRef.current && lastRunRef.current.key === key && now - lastRunRef.current.at < 1500) return
      lastRunRef.current = { key, at: now }
      logReportAudit({ action: "run", report_key: section, report_title: title, filters })
    }
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.("button")
      if (!button || button.disabled || !root.contains(button)) return
      if (button.closest("[role=dialog], table, .wj-flexgrid")) return
      const text = (button.textContent || "").trim()
      if (button.matches("[data-report-apply]") || RUN_TEXT.test(text)) logRun()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.target as Element | null)?.matches?.("input[data-report-apply-on-enter]")) logRun()
    }
    root.addEventListener("click", onClick, true)
    root.addEventListener("keydown", onKey, true)
    return () => {
      window.clearTimeout(timer)
      root.removeEventListener("click", onClick, true)
      root.removeEventListener("keydown", onKey, true)
    }
  }, [section, title])

  return <div ref={rootRef} data-report-section={section} data-report-title={title} style={{ display: "contents" }}>
    {children}
    {needsFloatingShare && <div className="fixed bottom-5 left-5 z-40 print:hidden"><ReportShareButton className="bg-white shadow-lg" /></div>}
  </div>
}
