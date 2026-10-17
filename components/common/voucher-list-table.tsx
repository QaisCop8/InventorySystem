"use client"

import { useCallback, useState, type KeyboardEvent } from "react"
import { Eye, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// بحث قوائم السندات: الحقول تُعدِّل مسودة فقط، وزر «بحث» (أو Enter داخل الحقول) يعيد جلب القائمة من الخادم
// ثم يطبّق المسودة — مع حالة تحميل تُعرض في الجدول («جاري تحميل البيانات...»).
export function useVoucherListSearch<F extends Record<string, string>>(initial: F) {
  const [draft, setDraft] = useState<F>(initial)
  const [filters, setFilters] = useState<F>(initial)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async (fetchList: () => Promise<unknown>, apply?: F) => {
    setLoading(true)
    try { await fetchList() } finally {
      if (apply) setFilters(apply)
      setLoading(false)
    }
  }, [])
  return { draft, setDraft, filters, loading, load }
}

export function VoucherSearchButton({ onClick, loading = false, className }: { onClick: () => void; loading?: boolean; className?: string }) {
  return (
    <Button type="button" onClick={onClick} disabled={loading} className={cn("h-10 gap-2 px-6", className)}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      بحث
    </Button>
  )
}

export const searchOnEnter = (run: () => void) => (event: KeyboardEvent<HTMLElement>) => {
  if (event.key === "Enter") { event.preventDefault(); run() }
}

// جدول قوائم السندات (بديل DataGridView بنفس أسلوب جدول طلبيات المبيعات): رأس ثابت، صفوف بتمرير
// فوق، نقر مزدوج أو Enter على الصف أو زر "عرض" ⇐ يفتح السند. الأعمدة بنفس تعريف scheme السابق
// (header/name/width) فيبقى محتوى كل قائمة كما هو.

export type VoucherListColumn = { header: string; name: string; width?: number | string; minWidth?: number; /** من تعريف DataGridView السابق — لا أثر له بالجدول */ isReadOnly?: boolean }

const STATUS_BADGES: Record<number, string> = {
  1: "bg-amber-50 text-amber-700 ring-amber-200",
  2: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  3: "bg-red-600 text-white ring-red-700 !text-[13px] !font-extrabold",
}

export function VoucherListTable<T extends Record<string, any>>({
  rows,
  columns,
  onOpen,
  emptyText = "لا توجد نتائج",
  maxHeight = "max(420px, calc(100dvh - 340px))",
  loading = false,
}: {
  rows: T[]
  columns: VoucherListColumn[]
  onOpen: (row: T) => void
  emptyText?: string
  maxHeight?: string
  loading?: boolean
}) {
  const cellValue = (row: T, column: VoucherListColumn) => {
    const value = row[column.name]
    if (column.name === "display_status" || column.name === "status_name") {
      if (value == null || value === "") return "—"
      const tone = STATUS_BADGES[Number(row.status)] || "bg-slate-100 text-slate-600 ring-slate-200"
      return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold ring-1", tone)}>{value}</span>
    }
    if (column.name === "vch_code") return <span className="font-mono font-bold text-emerald-700">{value}</span>
    if (/amount|total/.test(column.name)) return <span className="font-semibold tabular-nums" dir="ltr">{value ?? "—"}</span>
    return value == null || value === "" ? "—" : String(value)
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white" dir="rtl" aria-busy={loading}>
      {loading && (
        <div role="status" aria-live="polite" className="absolute inset-0 z-[2] flex items-start justify-center bg-white/70 pt-16 backdrop-blur-[1px] dark:bg-slate-900/70">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            جاري تحميل البيانات...
          </div>
        </div>
      )}
      <div className="overflow-auto" style={{ maxHeight, minHeight: loading && !rows.length ? 200 : undefined }}>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 z-[1]">
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="w-12 p-3 text-right text-xs font-bold">#</th>
              {columns.map((column) => (
                <th
                  key={column.name}
                  className="whitespace-nowrap p-3 text-right text-xs font-bold"
                  style={typeof column.width === "number" ? { width: column.width } : column.minWidth ? { minWidth: column.minWidth } : undefined}
                >
                  {column.header}
                </th>
              ))}
              <th className="w-20 p-3 text-center text-xs font-bold">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id ?? index}
                tabIndex={0}
                title="انقر نقراً مزدوجاً لفتح السند"
                onDoubleClick={() => onOpen(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    onOpen(row)
                  }
                }}
                className="cursor-pointer border-b border-slate-100 outline-none transition-colors hover:bg-emerald-50/50 focus-visible:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300"
              >
                <td className="p-3 text-xs text-slate-400">{index + 1}</td>
                {columns.map((column) => (
                  <td key={column.name} className="max-w-[320px] truncate p-3 text-slate-700">
                    {cellValue(row, column)}
                  </td>
                ))}
                <td className="p-2 text-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 rounded-lg"
                    onClick={(event) => { event.stopPropagation(); onOpen(row) }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    عرض
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !loading && <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>}
      </div>
    </div>
  )
}
