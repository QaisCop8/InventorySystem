"use client"

import { Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// جدول قوائم السندات (بديل DataGridView بنفس أسلوب جدول طلبيات المبيعات): رأس ثابت، صفوف بتمرير
// فوق، نقر مزدوج أو Enter على الصف أو زر "عرض" ⇐ يفتح السند. الأعمدة بنفس تعريف scheme السابق
// (header/name/width) فيبقى محتوى كل قائمة كما هو.

export type VoucherListColumn = { header: string; name: string; width?: number | string; minWidth?: number; /** من تعريف DataGridView السابق — لا أثر له بالجدول */ isReadOnly?: boolean }

const STATUS_BADGES: Record<number, string> = {
  1: "bg-amber-50 text-amber-700 ring-amber-200",
  2: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  3: "bg-rose-50 text-rose-700 ring-rose-200",
}

export function VoucherListTable<T extends Record<string, any>>({
  rows,
  columns,
  onOpen,
  emptyText = "لا توجد نتائج",
  maxHeight = "max(420px, calc(100dvh - 340px))",
}: {
  rows: T[]
  columns: VoucherListColumn[]
  onOpen: (row: T) => void
  emptyText?: string
  maxHeight?: string
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
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" dir="rtl">
      <div className="overflow-auto" style={{ maxHeight }}>
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
        {!rows.length && <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>}
      </div>
    </div>
  )
}
