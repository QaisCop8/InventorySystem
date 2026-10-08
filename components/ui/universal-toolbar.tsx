"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus, Save, Copy, Trash2, FileText, Download, Printer, Menu, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import "./universal-toolbar.css"
import { useThemeSettings } from "@/contexts/theme-context"
import { useWorkspaceTabActive } from "@/contexts/workspace-tab-context"
import { HOTKEY_LABELS, registerHotkeyScope, type HotkeyAction } from "@/lib/hotkeys"

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
  showUtilityLabels?: boolean
  isFirstRecord?: boolean
  isLastRecord?: boolean
  isNewRecord?: boolean
  labels?: { new: string; save: string; previous: string; next: string; first: string; last: string; delete: string; report: string; exportExcel: string; print: string; clone: string }
  /**
   * الاختصارات الموحّدة (F3 حفظ، F9 حذف، F4 نسخ، F5 جديد، Ctrl+P طباعة، F6 استعلام، PageUp/PageDown تنقل)
   * تستدعي نفس أفعال الأزرار. تمرير دالة هنا يستبدل فعل مفتاح لهذه الشاشة، وnull يعطّله.
   */
  hotkeys?: Partial<Record<HotkeyAction, (() => void) | null>>
  /** تعطيل كل اختصارات هذا الشريط (شاشة مضمّنة داخل أخرى لا يجب أن تستقبل المفاتيح) */
  disableHotkeys?: boolean
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
  isNewRecord = false, labels = defaultLabels, showUtilityLabels = false, hotkeys, disableHotkeys = false,
}: UniversalToolbarProps) {
  const { settings } = useThemeSettings()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  const hasRecords = totalRecords > 0
  const tabActive = useWorkspaceTabActive()

  // نفس شروط تفعيل الأزرار — الاختصار لا يعمل حين يكون زره معطّلاً
  const navigationBusyNow = isLoading || isSaving
  const actionsRef = useRef<Record<HotkeyAction, (() => void) | undefined>>({} as any)
  actionsRef.current = {
    save: onSave && !navigationBusyNow && canSave ? onSave : undefined,
    delete: onDelete && !navigationBusyNow && canDelete ? onDelete : undefined,
    clone: onClone && !navigationBusyNow && canClone ? onClone : undefined,
    new: onNew && !navigationBusyNow ? onNew : undefined,
    print: onPrint && !navigationBusyNow && canPrint ? onPrint : undefined,
    report: onReport && !navigationBusyNow ? onReport : undefined,
    first: onFirst && !navigationBusyNow && totalRecords > 0 && (isNewRecord || !isFirstRecord) ? onFirst : undefined,
    previous: onPrevious && !navigationBusyNow && totalRecords > 0 && (isNewRecord || !isFirstRecord) ? () => (isNewRecord ? onLast?.() : onPrevious()) : undefined,
    next: onNext && !navigationBusyNow && totalRecords > 0 && (isNewRecord || !isLastRecord) ? () => (isNewRecord ? onFirst?.() : onNext()) : undefined,
    last: onLast && !navigationBusyNow && totalRecords > 0 && (isNewRecord || !isLastRecord) ? onLast : undefined,
  }
  const overridesRef = useRef(hotkeys)
  overridesRef.current = hotkeys
  const disabledRef = useRef(disableHotkeys)
  disabledRef.current = disableHotkeys
  useEffect(() => registerHotkeyScope({
    element: () => toolbarRef.current,
    isActive: () => tabActive.current && !disabledRef.current,
    handler: (action) => {
      const override = overridesRef.current?.[action]
      if (override === null) return undefined
      if (override) return actionsRef.current[action] ? override : undefined
      return actionsRef.current[action]
    },
  }), [tabActive])
  const hint = (label: string, action: HotkeyAction) => `${label} (${HOTKEY_LABELS[action]})`

  useEffect(() => {
    const element = toolbarRef.current
    if (!element) return
    const update = () => setWidth(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const template = settings.toolbar_style || "modern"
  const iconOnly = template === "compact" && !showUtilityLabels
  const compact = width < (iconOnly ? 620 : 920)
  const veryCompact = width < 560
  const hasUtilities = Boolean(onPrint || onClone || onReport || onExportExcel || onDelete)
  const navigationBusy = isLoading || isSaving
  const previous = () => isNewRecord ? onLast?.() : onPrevious?.()
  const next = () => isNewRecord ? onFirst?.() : onNext?.()

  const navigation = (
    <div className="universal-toolbar-navigation flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" aria-label="التنقل بين السجلات">
      {onFirst && <Button type="button" variant="ghost" title={hint(labels.first, "first")} onClick={onFirst} disabled={navigationBusy || !hasRecords || (!isNewRecord && isFirstRecord)} aria-label={labels.first} className={navClass}><ChevronsRight className="h-4 w-4" /></Button>}
      {onPrevious && <Button type="button" variant="ghost" title={hint(labels.previous, "previous")} onClick={previous} disabled={navigationBusy || !hasRecords || (!isNewRecord && isFirstRecord)} aria-label={labels.previous} className={navClass}><ChevronRight className="h-4 w-4" /></Button>}
      <div className="universal-toolbar-record flex h-9 min-w-[84px] items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" /> : <span className="h-2 w-2 rounded-full bg-indigo-500" />}
        <span dir="ltr">{hasRecords ? `${Math.max(1, currentRecord)} / ${totalRecords}` : "0 / 0"}</span>
      </div>
      {onNext && <Button type="button" variant="ghost" title={hint(labels.next, "next")} onClick={next} disabled={navigationBusy || !hasRecords || (!isNewRecord && isLastRecord)} aria-label={labels.next} className={navClass}><ChevronLeft className="h-4 w-4" /></Button>}
      {onLast && <Button type="button" variant="ghost" title={hint(labels.last, "last")} onClick={onLast} disabled={navigationBusy || !hasRecords || (!isNewRecord && isLastRecord)} aria-label={labels.last} className={navClass}><ChevronsLeft className="h-4 w-4" /></Button>}
    </div>
  )

  return (
    <div ref={toolbarRef} data-toolbar-template={template} data-toolbar-narrow={compact} data-toolbar-show-utility-labels={showUtilityLabels || undefined} className="universal-toolbar relative w-full overflow-visible rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.45)]" dir="rtl">
      <div className="universal-toolbar-accent pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-l from-transparent via-indigo-400 to-transparent" />
      <div className="universal-toolbar-layout flex min-w-0 flex-wrap items-center gap-2">
        <div className="universal-toolbar-primary flex shrink-0 items-center gap-2">
          {onNew && <Button type="button" onClick={onNew} disabled={navigationBusy} aria-label={labels.new} title={hint(labels.new, "new")} className="universal-toolbar-new h-10 gap-2 rounded-xl bg-slate-900 px-3.5 font-bold text-white shadow-sm hover:bg-slate-800"><Plus className="h-4 w-4" />{!veryCompact && !iconOnly && <span>{labels.new}</span>}</Button>}
          {onSave && <Button type="button" onClick={onSave} disabled={navigationBusy || !canSave} aria-label={labels.save} title={hint(labels.save, "save")} className="universal-toolbar-save h-10 gap-2 rounded-xl bg-indigo-600 px-3.5 font-bold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{!veryCompact && !iconOnly && <span>{isSaving ? "جاري الحفظ" : labels.save}</span>}</Button>}
        </div>

        <div className={`universal-toolbar-nav-wrap ${compact ? "order-3 flex w-full justify-center border-t border-slate-100 pt-2" : "flex"}`}>{navigation}</div>

        <div className="universal-toolbar-utilities mr-auto flex items-center gap-1">
          {!compact && onPrint && <Button type="button" variant="ghost" aria-label={labels.print} title={hint(labels.print, "print")} onClick={onPrint} disabled={isLoading || isSaving || !canPrint} className="h-9 gap-2 rounded-lg px-3 text-slate-600 hover:bg-amber-50 hover:text-amber-700"><Printer className="h-4 w-4" />{!iconOnly && <span>{labels.print}</span>}</Button>}
          {!compact && onClone && <Button type="button" variant="ghost" aria-label={labels.clone} title={hint(labels.clone, "clone")} onClick={onClone} disabled={navigationBusy || !canClone} className="h-9 gap-2 rounded-lg px-3 text-slate-600 hover:bg-sky-50 hover:text-sky-700"><Copy className="h-4 w-4" />{!iconOnly && <span>{labels.clone}</span>}</Button>}
          {!compact && onReport && <Button type="button" variant="ghost" title={hint(labels.report, "report")} aria-label={labels.report} disabled={navigationBusy} onClick={onReport} className="h-9 gap-2 rounded-lg px-3 text-slate-600 hover:bg-violet-50 hover:text-violet-700"><FileText className="h-4 w-4" />{!iconOnly && <span>{labels.report}</span>}</Button>}
          {!compact && onExportExcel && <Button type="button" variant="ghost" title={labels.exportExcel} aria-label={labels.exportExcel} disabled={navigationBusy} onClick={onExportExcel} className="h-9 gap-2 rounded-lg px-3 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"><Download className="h-4 w-4" />{!iconOnly && <span>{labels.exportExcel}</span>}</Button>}
          {!compact && onDelete && <Button type="button" variant="ghost" aria-label={labels.delete} title={hint(labels.delete, "delete")} onClick={onDelete} disabled={isLoading || isSaving || !canDelete} className="h-9 gap-2 rounded-lg px-3 text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:text-slate-300"><Trash2 className="h-4 w-4" />{!iconOnly && <span>{labels.delete}</span>}</Button>}

          {compact && hasUtilities && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild><Button type="button" variant="outline" className="universal-toolbar-menu h-10 gap-2 rounded-xl border-slate-200 bg-slate-50 px-3 text-slate-700 hover:bg-slate-100"><Menu className="h-4 w-4" />{!veryCompact && "الأدوات"}</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="z-[100] min-w-48 [direction:rtl]">
                {onPrint && <DropdownMenuItem disabled={isLoading || isSaving || !canPrint} onSelect={onPrint}><Printer className="ml-2 h-4 w-4" />{labels.print}</DropdownMenuItem>}
                {onClone && <DropdownMenuItem disabled={navigationBusy || !canClone} onSelect={onClone}><Copy className="ml-2 h-4 w-4" />{labels.clone}</DropdownMenuItem>}
                {onReport && <DropdownMenuItem disabled={navigationBusy} onSelect={onReport}><FileText className="ml-2 h-4 w-4" />{labels.report}</DropdownMenuItem>}
                {onExportExcel && <DropdownMenuItem disabled={navigationBusy} onSelect={onExportExcel}><Download className="ml-2 h-4 w-4" />{labels.exportExcel}</DropdownMenuItem>}
                {onDelete && <DropdownMenuSeparator />}
                {onDelete && <DropdownMenuItem disabled={isLoading || isSaving || !canDelete} onSelect={onDelete} className="text-rose-600 focus:text-rose-700"><Trash2 className="ml-2 h-4 w-4" />{labels.delete}</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )
}
