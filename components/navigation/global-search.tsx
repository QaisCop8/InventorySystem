"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CornerDownLeft, Search, X } from "lucide-react"
import { menuItems, type MenuItem } from "@/components/sidebar"
import { useReportAccess } from "@/components/auth/use-report-access"
import { cn } from "@/lib/utils"

// بحث النظام بالشريط العلوي: يبحث في كل شاشات القائمة (بنفس صلاحيات الشريط الجانبي — التقارير غير
// المسموحة تُخفى) ويفتح الشاشة المختارة. مطابقة عربية متسامحة (أ/إ/آ=ا، ة=ه، ى=ي، بلا تشكيل)، تنقّل
// بالأسهم وEnter، وCtrl+K للتركيز من أي مكان.

type SearchEntry = { section: string; title: string; path: string[]; icon: MenuItem["icon"]; haystack: string }

const normalizeArabic = (value: string) =>
  value
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()

function flatten(items: MenuItem[], path: string[] = []): Omit<SearchEntry, "haystack">[] {
  return items.flatMap((item) => {
    if (item.submenu?.length) return flatten(item.submenu, [...path, item.title])
    return item.section ? [{ section: item.section, title: item.title, path, icon: item.icon }] : []
  })
}

export function GlobalSearch({ onNavigate, className }: { onNavigate: (section: string) => void; className?: string }) {
  const canOpenReport = useReportAccess()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<SearchEntry[]>(() => {
    const seen = new Set<string>()
    return flatten(menuItems)
      .filter((entry) => canOpenReport(entry.section))
      .filter((entry) => (seen.has(entry.section) ? false : (seen.add(entry.section), true)))
      .map((entry) => ({ ...entry, haystack: normalizeArabic(`${entry.title} ${entry.path.join(" ")}`) }))
  }, [canOpenReport])

  const results = useMemo(() => {
    const terms = normalizeArabic(query).split(" ").filter(Boolean)
    if (!terms.length) return []
    return entries
      .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
      .sort((a, b) => {
        // العنوان المطابق من بدايته أولاً، ثم الأقصر
        const first = terms[0]
        const aStarts = normalizeArabic(a.title).startsWith(first) ? 0 : 1
        const bStarts = normalizeArabic(b.title).startsWith(first) ? 0 : 1
        return aStarts - bStarts || a.title.length - b.title.length
      })
      .slice(0, 12)
  }, [entries, query])

  useEffect(() => setActiveIndex(0), [query])

  // Ctrl+K / ⌘K: تركيز البحث من أي مكان
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  const choose = (entry: SearchEntry) => {
    onNavigate(entry.section)
    setQuery("")
    setOpen(false)
    inputRef.current?.blur()
  }

  const showPanel = open && query.trim().length > 0

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-xl border bg-muted/40 px-3 transition-all",
          open ? "border-emerald-400 bg-background shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" : "border-border hover:border-emerald-300",
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault()
              setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)))
            } else if (event.key === "ArrowUp") {
              event.preventDefault()
              setActiveIndex((index) => Math.max(index - 1, 0))
            } else if (event.key === "Enter") {
              event.preventDefault()
              const entry = results[activeIndex]
              if (entry) choose(entry)
            } else if (event.key === "Escape") {
              setOpen(false)
              inputRef.current?.blur()
            }
          }}
          placeholder="ابحث عن شاشة أو تقرير..."
          className="min-w-0 flex-1 bg-transparent text-right text-sm outline-none placeholder:text-muted-foreground"
          aria-label="بحث في النظام"
        />
        {query ? (
          <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus() }} className="rounded-md p-0.5 text-muted-foreground hover:bg-muted" aria-label="مسح">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-md border bg-background px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted-foreground 2xl:inline" dir="ltr">Ctrl K</kbd>
        )}
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border bg-popover shadow-2xl" dir="rtl">
          {results.length ? (
            <ul className="max-h-[60vh] overflow-y-auto p-1.5" role="listbox">
              {results.map((entry, index) => {
                const Icon = entry.icon
                const active = index === activeIndex
                return (
                  <li key={entry.section} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(entry)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-right transition-colors",
                        active ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100" : "hover:bg-muted",
                      )}
                    >
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", active ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground")}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{entry.title}</span>
                        {entry.path.length > 0 && <span className="block truncate text-[11px] text-muted-foreground">{entry.path.join(" › ")}</span>}
                      </span>
                      {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">لا توجد شاشات مطابقة لـ «{query.trim()}»</div>
          )}
          <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
            <span>↑↓ للتنقل · Enter للفتح · Esc للإغلاق</span>
            <span>{results.length} نتيجة</span>
          </div>
        </div>
      )}
    </div>
  )
}
