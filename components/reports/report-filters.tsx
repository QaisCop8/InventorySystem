"use client"

import { useId, useRef, useState, type ReactNode } from "react"
import { ChevronDown, Filter, Pin, PinOff } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Mark explicit report actions with data-report-apply; live filter edits stay open. */
export function ReportFilters({ children, title = "فلاتر التقرير" }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(true)
  const [pinned, setPinned] = useState(false)
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const collapse = () => {
    if (pinned) return
    setOpen(false)
    trigger.current?.focus()
  }

  return <section dir="rtl" className="shrink-0 rounded-2xl border border-slate-200 bg-background shadow-sm dark:border-slate-800 print:hidden">
    <div className="flex items-center gap-2 px-4 py-2">
      <h2 className="min-w-0 flex-1">
        <button ref={trigger} type="button" id={`${id}-trigger`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} className="flex w-full items-center gap-2 rounded-lg py-2 text-right font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
          <Filter className="h-4 w-4 text-teal-600" aria-hidden="true" />
          <span className="flex-1">{title}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </h2>
      <Button type="button" variant={pinned ? "secondary" : "ghost"} size="sm" aria-pressed={pinned} aria-label="تثبيت الفلاتر" title={pinned ? "إلغاء تثبيت الفلاتر" : "إبقاء الفلاتر مفتوحة بعد عرض التقرير"} onClick={() => { setPinned(value => !value); if (!pinned) setOpen(true) }} className={pinned ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground"}>
        {pinned ? <PinOff className="h-4 w-4" aria-hidden="true" /> : <Pin className="h-4 w-4" aria-hidden="true" />}
        <span className="mr-1">تثبيت</span>
      </Button>
    </div>
    <div id={id} role="region" aria-labelledby={`${id}-trigger`} hidden={!open} className="border-t p-4"
      onClick={event => {
        const button = (event.target as Element).closest<HTMLButtonElement>("button[data-report-apply]")
        if (button && event.currentTarget.contains(button) && !button.disabled && !event.defaultPrevented) collapse()
      }}
      onKeyDown={event => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing && (event.target as Element).matches("input[data-report-apply-on-enter]") && !event.defaultPrevented) collapse()
      }}>
      {children}
    </div>
  </section>
}
