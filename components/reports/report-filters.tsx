"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ChevronDown, SlidersHorizontal, Pin, PinOff } from "lucide-react"
import "./report-theme.css"

type Chip = { label: string; value: string }

// ملخص الفلاتر وهي مطوية: لكل حقل (عنوان + قيمة) شريحة صغيرة — يُقرأ من الحقول نفسها فلا يحتاج كل تقرير لتمريره
function readChips(body: HTMLElement | null): Chip[] {
  if (!body) return []
  const chips: Chip[] = []
  body.querySelectorAll("label").forEach((label) => {
    const field = label.parentElement
    if (!field || chips.length >= 8) return
    const text = (label.textContent || "").trim()
    if (!text) return
    let value = ""
    const multi = field.querySelector<HTMLElement>("[data-filter-value]")
    const combo = field.querySelector<HTMLElement>("button[role=combobox]")
    const input = field.querySelector<HTMLInputElement>("input:not([type=checkbox]):not([type=radio]):not([type=hidden])")
    const toggle = label.querySelector<HTMLElement>("button[role=switch]") || field.querySelector<HTMLElement>("button[role=switch]")
    if (multi) value = multi.getAttribute("data-filter-value") || ""
    else if (combo) value = (combo.textContent || "").trim()
    else if (input) value = input.value.trim()
    else if (toggle) { if (toggle.getAttribute("aria-checked") !== "true") return; value = tr("نعم") }
    if (!value) return
    chips.push({ label: text.replace(/[*:]\s*$/, "").trim(), value: value.length > 40 ? `${value.slice(0, 40)}…` : value })
  })
  return chips
}

// فترات سريعة: تضبط أول حقلي تاريخ بالفلاتر (من/إلى) عبر حدث input الأصلي فيمرّ بـ onChange التقرير نفسه
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const PRESETS = [
  { key: "today", label: "اليوم", range: () => { const d = localDay(new Date()); return [d, d] } },
  { key: "month", label: "هذا الشهر", range: () => { const now = new Date(); return [localDay(new Date(now.getFullYear(), now.getMonth(), 1)), localDay(now)] } },
  { key: "year", label: "هذه السنة", range: () => { const now = new Date(); return [`${now.getFullYear()}-01-01`, localDay(now)] } },
] as const
const valueSetter = typeof window !== "undefined" ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set : undefined
function setNativeValue(input: HTMLInputElement, value: string) {
  if (input.value === value) return
  valueSetter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}
function dateInputs(body: HTMLElement | null) {
  return body ? [...body.querySelectorAll<HTMLInputElement>("input[type=date]")].filter((input) => !input.disabled) : []
}

/** Mark explicit report actions with data-report-apply; live filter edits stay open. */
export function ReportFilters({ children, title = "فلاتر التقرير" }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(true)
  const [pinned, setPinned] = useState(false)
  const [chips, setChips] = useState<Chip[]>([])
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const collapse = () => {
    if (pinned) return
    setOpen(false)
    trigger.current?.focus()
  }
  useLayoutEffect(() => { if (!open) setChips(readChips(body.current)) }, [open])

  // حقلا الفترة الحاليان (للفترات السريعة وتمييز الفترة المختارة) — يتابع الكتابة والتغيير البرمجي (مسح الفلاتر)
  const [range, setRange] = useState<[string, string] | null>(null)
  useEffect(() => {
    const element = body.current
    if (!element) return
    const sync = () => {
      const inputs = dateInputs(element)
      setRange(current => {
        const next: [string, string] | null = inputs.length >= 2 ? [inputs[0].value, inputs[1].value] : null
        return current && next && current[0] === next[0] && current[1] === next[1] ? current : next
      })
    }
    sync()
    element.addEventListener("input", sync)
    element.addEventListener("change", sync)
    const observer = new MutationObserver(sync)
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ["value"] })
    return () => { element.removeEventListener("input", sync); element.removeEventListener("change", sync); observer.disconnect() }
  }, [])
  const applyPreset = (from: string, to: string) => {
    const [fromInput, toInput] = dateInputs(body.current)
    if (!fromInput || !toInput) return
    setNativeValue(fromInput, from)
    // الثاني بعد إعادة الرسم: معالِجات التقارير تبني الحالة من لقطة الرسم ({...filters, toDate}) فلا يمحو الأول
    window.setTimeout(() => { const [, again] = dateInputs(body.current); if (again) setNativeValue(again, to) }, 40)
  }
  const activePreset = range ? PRESETS.find(preset => { const [from, to] = preset.range(); return range[0] === from && range[1] === to })?.key : undefined

  return <section dir={appDir()} className={`report-filters shrink-0 print:hidden ${open ? "is-open" : "is-closed"}`}>
    <div className="report-filters-bar">
      <h2 className="min-w-0 flex-1">
        <button ref={trigger} type="button" id={`${id}-trigger`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} className="report-filters-toggle">
          <span className="report-filters-icon" aria-hidden="true"><SlidersHorizontal className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="report-filters-title">{tr(title)}</span>
            {open
              ? <span className="report-filters-hint">{tr("حدّد المعايير ثم اضغط عرض النتائج")} <kbd>F5</kbd></span>
              : chips.length
                ? <span className="report-filters-chips">{chips.map(chip => <span key={chip.label} className="report-filter-chip"><span>{chip.label}</span><b>{chip.value}</b></span>)}</span>
                : <span className="report-filters-hint">{tr("اضغط لتعديل الفلاتر")}</span>}
          </span>
          <span className="report-filters-chevron" aria-hidden="true"><ChevronDown className="h-4 w-4" /></span>
        </button>
      </h2>
      <button type="button" aria-pressed={pinned} aria-label={tr("تثبيت الفلاتر")} title={pinned ? tr("إلغاء تثبيت الفلاتر") : tr("إبقاء الفلاتر مفتوحة بعد عرض التقرير")}
        onClick={() => { setPinned(value => !value); if (!pinned) setOpen(true) }} className="report-filters-pin">
        {pinned ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
        <span>{pinned ? tr("مثبّتة") : tr("تثبيت")}</span>
      </button>
    </div>
    <div ref={body} id={id} role="region" aria-labelledby={`${id}-trigger`} hidden={!open} className="report-filters-body"
      onClick={event => {
        const button = (event.target as Element).closest<HTMLButtonElement>("button[data-report-apply]")
        if (button && event.currentTarget.contains(button) && !button.disabled && !event.defaultPrevented) collapse()
      }}
      onKeyDown={event => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing && (event.target as Element).matches("input[data-report-apply-on-enter]") && !event.defaultPrevented) collapse()
      }}>
      {range && <div className="report-filter-presets" role="group" aria-label={tr("فترة سريعة")}>
        {PRESETS.map(preset => <button key={preset.key} type="button" aria-pressed={activePreset === preset.key} onClick={() => { const [from, to] = preset.range(); applyPreset(from, to) }}>{tr(preset.label)}</button>)}
      </div>}
      {children}
    </div>
  </section>
}
