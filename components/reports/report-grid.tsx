"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useMemo, useRef, type ReactNode } from "react"
import DataGridView from "@/components/common/DataGridView"

// شبكة التقارير الموحّدة: كل جداول التقارير تُعرض عبر DataGridView (Wijmo) — تمرير افتراضي سريع لآلاف الأسطر، وقائمة
// الزر الأيمن (ترتيب، تثبيت، ملاءمة العرض، اختيار الأعمدة، تجميع، تصدير) وصف مجاميع بالأسفل.

export type ReportGridColumn<T = any> = {
  key: string
  label: string
  width?: number | string
  minWidth?: number
  /** number: محاذاة ومجموع رقمي؛ text افتراضي */
  type?: "number" | "text"
  /** قيمة محسوبة للعرض/التصدير/الترتيب بدل row[key] */
  value?: (row: T) => unknown
  /** محتوى خاص للخلية (شارة، رابط سند...) — القيمة value/row[key] تبقى للترتيب والتصدير */
  render?: (row: T) => ReactNode
  /** true = مجموع العمود بالأسفل؛ قيمة = نص/رقم ثابت بخلية المجموع */
  total?: boolean | number | string
  /** عدد الخانات العشرية للأرقام (افتراضي إعدادات النظام) */
  decimals?: number
  visible?: boolean
}

type Props<T> = {
  rows: T[]
  columns: ReportGridColumn<T>[]
  /** ارتفاع الشبكة (افتراضي: ما تبقى من الشاشة) */
  height?: number | string
  onRowDoubleClick?: (row: T) => void
  exportFileName?: string
  /** صنف CSS لكل صف (رصيد سابق، مجموع فرعي...) */
  rowClassName?: (row: T) => string | undefined
  /** نص خلية المجموع بالعمود الأول */
  totalLabel?: string
  showSerial?: boolean
  emptyText?: string
  className?: string
}

const ROW_CLASS = "__reportRowClass"

export function ReportGrid<T extends Record<string, any>>({
  rows, columns, height, onRowDoubleClick, exportFileName, rowClassName,
  totalLabel = tr("الإجمالي"), showSerial = true, emptyText, className,
}: Props<T>) {
  const gridRef = useRef<any>(null)
  const visibleColumns = columns.filter((column) => column.visible !== false)
  const hasTotals = visibleColumns.some((column) => column.total !== undefined && column.total !== false)

  const dataSource = useMemo(() => rows.map((row, index) => {
    const next: Record<string, any> = { ...row, __ser: String(index + 1) } // نص: الشبكة تنسّق الأرقام بخانات عشرية
    for (const column of visibleColumns) {
      const name = column.value ? `__${column.key}` : column.key
      const raw = column.value ? column.value(row) : row[column.key]
      // أرقام الخادم تصل نصوصاً ("198.000") — تُحوَّل لأرقام للترتيب والتصدير والمجاميع
      next[name] = column.type === "number" ? (raw == null || raw === "" ? null : Number(raw)) : raw
    }
    if (rowClassName) next[ROW_CLASS] = rowClassName(row) || ""
    return next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, columns, rowClassName])

  // مجموع الأعمدة (total: true) يُحسب هنا — مجموع Wijmo يتجاهل القيم القادمة نصوصاً فيظهر صفراً
  const sums = useMemo(() => {
    const result: Record<string, number> = {}
    for (const column of visibleColumns) {
      if (column.total !== true || column.type !== "number") continue
      const name = column.value ? `__${column.key}` : column.key
      result[column.key] = dataSource.reduce((sum, row) => sum + (Number(row[name]) || 0), 0)
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, columns])

  const scheme = useMemo(() => {
    // عمود الترقيم يبقى مع وجود مجاميع (يحمل نص «الإجمالي»)
    const serial = showSerial || hasTotals ? [{
      // رأس فارغ: DataGridView ينسّق قيمة المجموع كرقم إن كان للعمود رأس (فيظهر NaN لنص «الإجمالي»)
      header: " ", name: "__ser", width: 64, isReadOnly: true, align: "center",
      ...(hasTotals ? { isFooterCustomValue: true, footerCustomValue: totalLabel } : {}),
    }] : []
    return {
      name: "ReportGrid",
      showFooter: hasTotals,
      columns: [...serial, ...visibleColumns.map((column) => {
        const name = column.value ? `__${column.key}` : column.key
        const isNumber = column.type === "number"
        const customTotal = column.total !== undefined && column.total !== false
        const footerValue = column.total === true ? sums[column.key] ?? 0 : column.total
        return {
          header: column.label, name, width: column.width ?? "*", minWidth: column.minWidth ?? (isNumber ? 110 : 120), isReadOnly: true,
          dataType: isNumber ? "Number" : undefined,
          format: isNumber ? `n${column.decimals ?? 2}` : undefined,
          ...(customTotal ? { isFooterCustomValue: true, footerCustomValue: footerValue } : {}),
          body: column.render ? (cell: any) => column.render!(cell.item ?? cell.row?.dataItem) : undefined,
        }
      })],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, showSerial, hasTotals, totalLabel, sums])

  // تلوين الصفوف الخاصة (رصيد سابق/مجموع فرعي) بصنف CSS من rowClassName
  useEffect(() => {
    if (!rowClassName) return
    let grid: any = null
    let handler: any = null
    const attach = () => {
      grid = gridRef.current?.control
      if (!grid) return false
      handler = (sender: any, event: any) => {
        if (event.panel !== sender.cells) return
        const item = sender.rows[event.row]?.dataItem
        const css = item?.[ROW_CLASS]
        event.cell.classList.remove("report-row-opening", "report-row-subtotal", "report-row-total", "report-row-muted")
        if (css) for (const name of String(css).split(/\s+/).filter(Boolean)) event.cell.classList.add(name)
      }
      grid.formatItem.addHandler(handler)
      grid.invalidate()
      return true
    }
    if (attach()) return () => grid?.formatItem.removeHandler(handler)
    const timer = window.setInterval(() => { if (attach()) window.clearInterval(timer) }, 50)
    return () => { window.clearInterval(timer); if (grid && handler) grid.formatItem.removeHandler(handler) }
  }, [rowClassName])

  return (
    // بلا ارتفاع صريح: الشبكة تملأ المساحة المتبقية في حاويتها (flex) — الارتفاع المحسوب من الشاشة كان أطول من المساحة
    // فيُقصّ أسفلها مع شريط التمرير العمودي (يختفي مقبضه)
    <div className={`report-grid relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white ${className || ""}`}
      style={height !== undefined ? { height } : { flex: "1 1 0", minHeight: 360, height: "100%" }} dir={appDir()}>
      <DataGridView
        innerRef={gridRef}
        scheme={scheme}
        dataSource={dataSource}
        idProperty="__ser"
        isReport
        defaultRowHeight={38}
        dontConvertToCards
        exportFileName={exportFileName}
        allowExcelExport
        onRowDoubleClick={onRowDoubleClick ? (item: any) => onRowDoubleClick(item as T) : undefined}
        containerStyle={{ height: "100%", minHeight: 0 }}
        style={{ height: "100%", minHeight: 0 }}
      />
      {!rows.length && emptyText && (
        <div className="pointer-events-none absolute inset-x-0 top-24 text-center text-sm text-muted-foreground">{emptyText}</div>
      )}
    </div>
  )
}
