"use client"

// أدوات مشتركة لنوافذ البحث (بحث الأصناف / دليل الحسابات) — نفس التصميم ونفس سلوك لوحة المفاتيح:
//   • SearchDialogHeader: رأس مدمج بتدرّج النظام (زمردي/فيروزي).
//   • SearchFilterField: حقل فلتر مدمج (عنوان + عنصر إدخال).
//   • SearchResultsTable: جدول نتائج يُدار بلوحة المفاتيح بالكامل — أسهم للتنقل، Enter لاختيار السطر،
//     Space لتأشير السطر (عند تفعيل التأشير)، ونقر مزدوج للاختيار. focusFirstRow() يُستدعى من آخر فلتر.
//   • useEnterAsTabFilters: Enter ينتقل بين الفلاتر كـTab، ومن آخر فلتر (أو السهم للأسفل) إلى أول سطر.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export const searchInputClassName =
  "h-9 w-full rounded-lg border-slate-200 bg-slate-50/70 text-sm shadow-none transition-colors focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-100"

export function SearchDialogHeader({
  icon,
  title,
  subtitle,
  count,
  actions,
  onClose,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  count?: number | null
  actions?: ReactNode
  onClose: () => void
}) {
  return (
    <div className="relative flex shrink-0 items-center justify-between gap-3 overflow-hidden bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 px-4 py-3 text-white">
      <div className="pointer-events-none absolute -left-8 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">{icon}</span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-extrabold leading-tight">{title}</h2>
          {subtitle && <p className="hidden truncate text-[11px] text-emerald-50/85 sm:block">{subtitle}</p>}
        </div>
        {count != null && (
          <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-white/25">{count.toLocaleString()}</span>
        )}
      </div>
      <div className="relative flex shrink-0 items-center gap-1.5">
        {actions}
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          title="إغلاق (Esc)"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function SearchFilterField({ label, children, className, ...rest }: { label: ReactNode; children: ReactNode; className?: string } & Record<string, any>) {
  return (
    <div className={cn("min-w-0 space-y-1", className)} {...rest}>
      <span className="block text-[11px] font-bold text-slate-500">{label}</span>
      {children}
    </div>
  )
}

export interface SearchColumn<T> {
  key: string
  header: string
  width?: string
  align?: "start" | "center" | "end"
  className?: string
  render?: (row: T, index: number) => ReactNode
}

export interface SearchResultsTableHandle {
  focusFirstRow: () => boolean
  focus: () => void
}

interface SearchResultsTableProps<T> {
  rows: T[]
  columns: SearchColumn<T>[]
  getRowKey: (row: T, index: number) => string | number
  /** Enter أو نقر مزدوج على سطر */
  onPick: (row: T, index: number) => void
  /** تغيُّر السطر النشط (نقر أو أسهم) */
  onActiveChange?: (row: T | null, index: number) => void
  /** Space على السطر النشط (مثلاً تأشير/إلغاء تأشير) */
  onToggle?: (row: T, index: number) => void
  isRowMarked?: (row: T) => boolean
  emptyText?: ReactNode
  className?: string
  rowHeightClassName?: string
}

function SearchResultsTableInner<T>(
  {
    rows,
    columns,
    getRowKey,
    onPick,
    onActiveChange,
    onToggle,
    isRowMarked,
    emptyText = "لا توجد نتائج",
    className,
    rowHeightClassName = "h-10",
  }: SearchResultsTableProps<T>,
  ref: React.Ref<SearchResultsTableHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const onActiveChangeRef = useRef(onActiveChange)
  onActiveChangeRef.current = onActiveChange

  // نتائج جديدة (تغيير فلتر) ⇐ لا سطر نشط حتى يدخل المستخدم الجدول. المقارنة بمفاتيح الصفوف لا بهوية
  // المصفوفة: مستدعٍ يمرّر مصفوفة مُعاد بناؤها بكل تصيير (مثل slice) كان يُصفّر السطر النشط بعد كل سهم
  // (onActiveChange يُعيد تصيير المستدعي) فيعلق التنقل على السطر الأول.
  const rowsSignature = rows.map((row, index) => String(getRowKey(row, index))).join("\u0001")
  useEffect(() => {
    setActiveIndex(-1)
  }, [rowsSignature])

  const activate = useCallback(
    (index: number) => {
      if (rows.length === 0) return
      const next = Math.max(0, Math.min(rows.length - 1, index))
      setActiveIndex(next)
      onActiveChangeRef.current?.(rows[next], next)
      const element = containerRef.current?.querySelector<HTMLElement>(`[data-row-index="${next}"]`)
      element?.scrollIntoView({ block: "nearest" })
    },
    [rows],
  )

  useImperativeHandle(
    ref,
    () => ({
      focusFirstRow: () => {
        if (rows.length === 0) return false
        containerRef.current?.focus()
        activate(0)
        return true
      },
      focus: () => containerRef.current?.focus(),
    }),
    [rows, activate],
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return
    const pageSize = 10
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        activate(activeIndex < 0 ? 0 : activeIndex + 1)
        break
      case "ArrowUp":
        event.preventDefault()
        activate(activeIndex <= 0 ? 0 : activeIndex - 1)
        break
      case "PageDown":
        event.preventDefault()
        activate((activeIndex < 0 ? 0 : activeIndex) + pageSize)
        break
      case "PageUp":
        event.preventDefault()
        activate((activeIndex < 0 ? 0 : activeIndex) - pageSize)
        break
      case "Home":
        event.preventDefault()
        activate(0)
        break
      case "End":
        event.preventDefault()
        activate(rows.length - 1)
        break
      case "Enter":
        if (activeIndex < 0) return
        event.preventDefault()
        event.stopPropagation()
        onPick(rows[activeIndex], activeIndex)
        break
      case " ":
        if (!onToggle || activeIndex < 0) return
        event.preventDefault()
        onToggle(rows[activeIndex], activeIndex)
        break
    }
  }

  const alignClass = (align?: SearchColumn<T>["align"]) =>
    align === "center" ? "text-center" : align === "end" ? "text-left" : "text-right"

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="grid"
      aria-rowcount={rows.length}
      onKeyDown={handleKeyDown}
      className={cn(
        "min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white outline-none focus-visible:ring-2 focus-visible:ring-emerald-200",
        className,
      )}
    >
      {rows.length === 0 ? (
        <div className="flex h-full min-h-[160px] items-center justify-center px-4 text-center text-sm text-slate-400">{emptyText}</div>
      ) : (
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm" dir="rtl">
          <thead className="sticky top-0 z-[1]">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    "h-9 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 text-[11px] font-extrabold text-slate-500",
                    alignClass(column.align),
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const active = index === activeIndex
              const marked = isRowMarked?.(row) ?? false
              return (
                <tr
                  key={getRowKey(row, index)}
                  data-row-index={index}
                  aria-selected={active}
                  onClick={() => {
                    containerRef.current?.focus()
                    activate(index)
                  }}
                  onDoubleClick={() => onPick(row, index)}
                  className={cn(
                    "cursor-pointer transition-colors",
                    rowHeightClassName,
                    active
                      ? "bg-emerald-50 text-emerald-950 [&>td]:border-emerald-200"
                      : marked
                        ? "bg-teal-50/60"
                        : index % 2 === 1
                          ? "bg-slate-50/50 hover:bg-slate-100/70"
                          : "bg-white hover:bg-slate-100/70",
                  )}
                >
                  {columns.map((column, columnIndex) => (
                    <td
                      key={column.key}
                      className={cn(
                        "whitespace-nowrap border-b border-slate-100 px-3",
                        alignClass(column.align),
                        active && columnIndex === 0 && "shadow-[inset_-3px_0_0_0_rgb(5_150_105)]",
                        column.className,
                      )}
                    >
                      {column.render ? column.render(row, index) : String((row as any)[column.key] ?? "")}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export const SearchResultsTable = forwardRef(SearchResultsTableInner) as <T>(
  props: SearchResultsTableProps<T> & { ref?: React.Ref<SearchResultsTableHandle> },
) => ReturnType<typeof SearchResultsTableInner>

/**
 * Enter كـTab داخل حاوية الفلاتر؛ من آخر فلتر (أو ArrowDown من أي فلتر) ينتقل لأول سطر بالنتائج.
 * مُسجَّل على document بمرحلة الالتقاط — PrimeReact Dropdown يعالج Enter بنفسه على document، فأي
 * معالج داخل شجرة React يخسر السباق ويعمل مرة كل ضغطتين.
 */
export function useEnterAsTabFilters(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onReachEnd: () => void,
) {
  const onReachEndRef = useRef(onReachEnd)
  onReachEndRef.current = onReachEnd

  useEffect(() => {
    if (!active) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const container = containerRef.current
      if (!target || !container || !container.contains(target)) return
      // قائمة منسدلة مفتوحة (تنقّل بين خياراتها) — لا تدخّل
      if (target.closest(".p-dropdown-panel, .p-multiselect-panel, [role='listbox']")) return
      if (event.key !== "Enter" && event.key !== "ArrowDown") return
      if (event.key === "ArrowDown") {
        // السهم داخل منسدلة مغلقة يفتحها/يتنقّل بين خياراتها — يُترك لها
        if (target.closest(".p-dropdown, .p-multiselect")) return
        event.preventDefault()
        event.stopPropagation()
        onReachEndRef.current()
        return
      }
      if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null && !element.closest(".p-dropdown-panel, .p-multiselect-panel"))
      const currentIndex = focusable.findIndex((element) => element === target || element.contains(target))
      if (currentIndex === -1) return
      event.preventDefault()
      event.stopPropagation()
      const next = focusable[currentIndex + 1]
      if (next) next.focus()
      else onReachEndRef.current()
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [active, containerRef])
}
