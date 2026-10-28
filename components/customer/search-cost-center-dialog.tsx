"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { CheckCircle2, CornerDownLeft, FolderTree, Search, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export interface CostCenterItem {
  id: number
  name: string
  cost_type_id: number
  cost_type_name: string
  parent_id?: number | null
  parent_name?: string | null
  level: number
  status: number
  state_status?: string
  created_at?: string
  updated_at?: string
}

interface SearchCostCenterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type?: {
    id: number
    name: string
  }
  costCenters: CostCenterItem[]
  onSelect?: (center: CostCenterItem) => void
}

/**
 * بحث مراكز التكلفة لنوع محدد. لوحة المفاتيح: Enter في البحث ⇐ الانتقال للقائمة (كـ Tab)، الأسهم للتنقل،
 * Enter على المركز ⇐ اختياره (موافق)، Esc ⇐ إغلاق. النقر يحدد والنقر المزدوج يختار مباشرة.
 */
export default function SearchCostCenterDialog({ open, onOpenChange, type, costCenters, onSelect }: SearchCostCenterDialogProps) {
  const [filter, setFilter] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const okRef = useRef<HTMLButtonElement | null>(null)
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (open) {
      setFilter("")
      setActiveIndex(0)
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open])

  const filteredCenters = useMemo(() => {
    if (!type) return []
    const term = filter.trim().toLowerCase()
    return costCenters
      .filter((center) => center.cost_type_id === type.id && Number(center.status ?? 1) !== 3)
      .filter((center) => !term || center.name.toLowerCase().includes(term) || String(center.id) === term || String(center.parent_name || "").toLowerCase().includes(term))
      .sort((a, b) => (a.id || 0) - (b.id || 0))
  }, [costCenters, filter, type])

  useEffect(() => { setActiveIndex(0) }, [filter])
  useEffect(() => { rowRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" }) }, [activeIndex])

  const active = filteredCenters[activeIndex] || null

  const choose = (center: CostCenterItem | null) => {
    if (!center) return
    onSelect?.(center)
    onOpenChange(false)
  }

  const focusRow = (index: number) => {
    const next = Math.max(0, Math.min(filteredCenters.length - 1, index))
    setActiveIndex(next)
    rowRefs.current[next]?.focus()
  }

  // Enter كـ Tab: من البحث إلى أول مركز (أو موافق إن كانت النتيجة واحدة يختارها مباشرة)
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      if (filteredCenters.length === 1) choose(filteredCenters[0])
      else if (filteredCenters.length) focusRow(0)
    } else if (event.key === "ArrowDown" && filteredCenters.length) {
      event.preventDefault()
      focusRow(0)
    }
  }

  const onRowKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") { event.preventDefault(); focusRow(index + 1) }
    else if (event.key === "ArrowUp") { event.preventDefault(); if (index === 0) searchRef.current?.focus(); else focusRow(index - 1) }
    else if (event.key === "Home") { event.preventDefault(); focusRow(0) }
    else if (event.key === "End") { event.preventDefault(); focusRow(filteredCenters.length - 1) }
    else if (event.key === "Enter") { event.preventDefault(); choose(filteredCenters[index]) }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      // كتابة حرف أثناء التنقل تعود للبحث
      searchRef.current?.focus()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="flex max-h-[85vh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <div className="border-b bg-gradient-to-l from-emerald-600 to-teal-600 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25"><Target className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1 text-right">
              <DialogTitle className="text-lg font-bold text-white">بحث مراكز التكلفة</DialogTitle>
              <DialogDescription className="text-xs text-emerald-50/90">اختر مركز تكلفة من النوع المحدد</DialogDescription>
            </div>
            <span className="ml-8 shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/25">النوع: {type?.name || "—"}</span>
          </div>
        </div>

        <div className="border-b bg-muted/30 p-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="ابحث باسم المركز أو رقمه أو المركز الرئيسي..."
              className="h-11 pr-9 text-right"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{filteredCenters.length} مركز</span>
            <span className="flex items-center gap-1"><kbd className="rounded border bg-background px-1">Enter</kbd> للانتقال/الاختيار · <kbd className="rounded border bg-background px-1">↑↓</kbd> للتنقل · <kbd className="rounded border bg-background px-1">Esc</kbd> للإغلاق</span>
          </div>
        </div>

        <div ref={listRef} className="min-h-[220px] flex-1 overflow-y-auto p-2" role="listbox" aria-label="مراكز التكلفة">
          {filteredCenters.length === 0 ? (
            <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <FolderTree className="h-10 w-10 text-emerald-500/70" />
              {type ? (filter ? "لا توجد نتائج مطابقة" : "لا توجد مراكز تكلفة لهذا النوع") : "اختر نوع مركز التكلفة أولاً"}
            </div>
          ) : (
            filteredCenters.map((center, index) => {
              const selected = index === activeIndex
              const level = Math.max(1, Math.trunc(Number(center.level) || 1))
              return (
                <button
                  key={center.id}
                  ref={(element) => { rowRefs.current[index] = element }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => setActiveIndex(index)}
                  onDoubleClick={() => choose(center)}
                  onKeyDown={(event) => onRowKeyDown(event, index)}
                  onFocus={() => setActiveIndex(index)}
                  className={`mb-1 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-right transition focus:outline-none ${selected ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200 dark:border-emerald-700 dark:bg-emerald-950/40 dark:ring-emerald-900" : "border-transparent hover:bg-muted"}`}
                  style={{ paddingRight: `${0.75 + (level - 1) * 1}rem` }}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${selected ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>{center.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{center.name}</span>
                    {center.parent_name && <span className="block truncate text-xs text-muted-foreground">ضمن: {center.parent_name}</span>}
                  </span>
                  <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">المستوى {level}</span>
                  {selected && <CornerDownLeft className="h-4 w-4 shrink-0 text-emerald-600" />}
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-3">
          <span className="min-w-0 truncate text-xs text-muted-foreground">{active ? <>المحدد: <b className="text-foreground">{active.name}</b></> : "لم يتم تحديد مركز"}</span>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button ref={okRef} onClick={() => choose(active)} disabled={!active} className="min-w-24 gap-1.5"><CheckCircle2 className="h-4 w-4" />موافق</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
