"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus, Save, Copy, Trash2, FileText, Download, Printer, Menu, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useThemeSettings } from "@/contexts/theme-context"

interface UniversalToolbarProps {
  currentRecord?: number
  totalRecords?: number
  onFirst?: () => void
  onPrevious?: () => void
  onNext?: () => void
  onLast?: () => void
  onNew?: () => void
  onSave?: () => void
  onDelete?: () => void
  onReport?: () => void
  onExportExcel?: () => void
  onPrint?: () => void
  onClone?: () => void
  isLoading?: boolean
  isSaving?: boolean
  canSave?: boolean
  canPrint?: boolean
  canDelete?: boolean
  canClone?: boolean
  isFirstRecord?: boolean
  isLastRecord?: boolean
  isNewRecord?: boolean
  labels?: { new: string; save: string; previous: string; next: string; first: string; last: string; delete: string; report: string; exportExcel: string; print: string; clone: string }
}

const defaultLabels = {
  new: "جديد", save: "حفظ", previous: "السابق", next: "التالي", first: "الأول", last: "الأخير",
  delete: "حذف", report: "استعلام", exportExcel: "تصدير إكسل", print: "طباعة", clone: "نسخ",
}

const navClass = "h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white p-0 text-slate-600 shadow-sm hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none"

export function UniversalToolbar({
  currentRecord = 1, totalRecords = 0, onFirst, onPrevious, onNext, onLast, onNew, onSave, onDelete,
  onReport, onExportExcel, onPrint, onClone, isLoading = false, isSaving = false, canSave = true,
  canPrint = true, canDelete = true, canClone = true, isFirstRecord = false, isLastRecord = false,
  isNewRecord = false, labels = defaultLabels,
}: UniversalToolbarProps) {
  const { settings } = useThemeSettings()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  const hasRecords = totalRecords > 0

  useEffect(() => {
    const element = toolbarRef.current
    if (!element) return
    const update = () => setWidth(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const compact = width < 920
  const veryCompact = width < 560
  const hasUtilities = Boolean(onPrint || onClone || onReport || onExportExcel || onDelete)
  const disablePrevious = isLoading || !hasRecords || (!isNewRecord && isFirstRecord)
  const disableNext = isLoading || !hasRecords || (!isNewRecord && isLastRecord)
  const previous = () => isNewRecord ? onLast?.() : onPrevious?.()
  const next = () => isNewRecord ? onLast?.() : onNext?.()

  const navigation = (
    <div className="universal-toolbar-navigation flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" aria-label="التنقل بين السجلات">
      {onFirst && <Button type="button" variant="ghost" title={labels.first} onClick={onFirst} disabled={disablePrevious} className={navClass}><ChevronsRight className="h-4 w-4" /></Button>}
      {onPrevious && <Button type="button" variant="ghost" title={labels.previous} onClick={previous} disabled={disablePrevious} className={navClass}><ChevronRight className="h-4 w-4" /></Button>}
      <div className="universal-toolbar-record flex h-9 min-w-[84px] items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" /> : <span className="h-2 w-2 rounded-full bg-indigo-500" />}
        <span dir="ltr">{hasRecords ? `${Math.max(1, currentRecord)} / ${totalRecords}` : "0 / 0"}</span>
      </div>
      {onNext && <Button type="button" variant="ghost" title={labels.next} onClick={next} disabled={disableNext} className={navClass}><ChevronLeft className="h-4 w-4" /></Button>}
      {onLast && <Button type="button" variant="ghost" title={labels.last} onClick={onLast} disabled={disableNext} className={navClass}><ChevronsLeft className="h-4 w-4" /></Button>}
    </div>
  )

  return (
    <div ref={toolbarRef} data-toolbar-template={settings.toolbar_style || "modern"} className="universal-toolbar relative w-full overflow-visible rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.45)]" dir="rtl">
      <div className="universal-toolbar-accent pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-l from-transparent via-indigo-400 to-transparent" />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          {onNew && <Button type="button" onClick={onNew} title={labels.new} className="universal-toolbar-new h-10 gap-2 rounded-xl bg-slate-900 px-3.5 font-bold text-white shadow-sm hover:bg-slate-800"><Plus className="h-4 w-4" />{!veryCompact && <span>{labels.new}</span>}</Button>}
          {onSave && <Button type="button" onClick={onSave} disabled={isSaving || !canSave} title={labels.save} className="universal-toolbar-save h-10 gap-2 rounded-xl bg-indigo-600 px-3.5 font-bold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{!veryCompact && <span>{isSaving ? "جاري الحفظ" : labels.save}</span>}</Button>}
        </div>

        <div className={compact ? "order-3 flex w-full justify-center border-t border-slate-100 pt-2" : "flex"}>{navigation}</div>

        <div className="universal-toolbar-utilities mr-auto flex items-center gap-1">
          {!compact && onPrint && <Button type="button" variant="ghost" onClick={onPrint} disabled={isLoading || isSaving || !canPrint} className="h-9 gap-2 rounded-lg px-3 text-slate-600 hover:bg-amber-50 hover:text-amber-700"><Printer className="h-4 w-4" />{labels.print}</Button>}
          {!compact && onClone && <Button type="button" variant="ghost" onClick={onClone} disabled={isLoading || !canClone} className="h-9 gap-2 rounded-lg px-3 text-slate-600 hover:bg-sky-50 hover:text-sky-700"><Copy className="h-4 w-4" />{labels.clone}</Button>}
          {!compact && onReport && <Button type="button" variant="ghost" onClick={onReport} className="h-9 gap-2 rounded-lg px-3 text-slate-600 hover:bg-violet-50 hover:text-violet-700"><FileText className="h-4 w-4" />{labels.report}</Button>}
          {!compact && onExportExcel && <Button type="button" variant="ghost" onClick={onExportExcel} className="h-9 gap-2 rounded-lg px-3 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"><Download className="h-4 w-4" />{labels.exportExcel}</Button>}
          {!compact && onDelete && <Button type="button" variant="ghost" onClick={onDelete} disabled={isLoading || !canDelete} className="h-9 gap-2 rounded-lg px-3 text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:text-slate-300"><Trash2 className="h-4 w-4" />{labels.delete}</Button>}

          {compact && hasUtilities && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild><Button type="button" variant="outline" className="universal-toolbar-menu h-10 gap-2 rounded-xl border-slate-200 bg-slate-50 px-3 text-slate-700 hover:bg-slate-100"><Menu className="h-4 w-4" />{!veryCompact && "الأدوات"}</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="z-[100] min-w-48 [direction:rtl]">
                {onPrint && <DropdownMenuItem disabled={isLoading || isSaving || !canPrint} onSelect={onPrint}><Printer className="ml-2 h-4 w-4" />{labels.print}</DropdownMenuItem>}
                {onClone && <DropdownMenuItem disabled={isLoading || !canClone} onSelect={onClone}><Copy className="ml-2 h-4 w-4" />{labels.clone}</DropdownMenuItem>}
                {onReport && <DropdownMenuItem onSelect={onReport}><FileText className="ml-2 h-4 w-4" />{labels.report}</DropdownMenuItem>}
                {onExportExcel && <DropdownMenuItem onSelect={onExportExcel}><Download className="ml-2 h-4 w-4" />{labels.exportExcel}</DropdownMenuItem>}
                {onDelete && <DropdownMenuSeparator />}
                {onDelete && <DropdownMenuItem disabled={isLoading || !canDelete} onSelect={onDelete} className="text-rose-600 focus:text-rose-700"><Trash2 className="ml-2 h-4 w-4" />{labels.delete}</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )
}
