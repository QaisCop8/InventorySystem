"use client"
import { amountFractionOptions } from "@/lib/decimals"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Boxes, Factory, ListTree, PackagePlus, Printer, Search, type LucideIcon } from "lucide-react"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// تقارير الانتاج (app/api/reports/production): مكوّن واحد بعدة أنواع — كل نوع شاشة وصلاحية مستقلة.
type View = "detailed" | "produced" | "raw" | "vouchers"
type Column = { key: string; label: string; align?: "end" | "center"; format?: "money" | "qty" | "int" | "role" | "status"; sum?: boolean }

const STATUS_OPTIONS = [{ id: 2, name: "معتمد" }, { id: 1, name: "غير معتمد" }] as unknown as ReportOption[]
const CONFIG: Record<View, { title: string; description: string; icon: LucideIcon; columns: Column[]; valueKey: string }> = {
  detailed: {
    title: "تقرير الانتاج تفصيلي", icon: ListTree, valueKey: "value",
    description: "سطر لكل صنف في كل سند انتاج — المواد المنتجة والمواد الخام بالكمية وسعر الشراء والقيمة",
    columns: [
      { key: "code", label: "رقم السند" }, { key: "vch_date", label: "التاريخ" }, { key: "status", label: "الحالة", align: "center", format: "status" },
      { key: "branch_name", label: "الفرع" }, { key: "role", label: "النوع", align: "center", format: "role" },
      { key: "product_code", label: "رمز الصنف" }, { key: "product_name", label: "الصنف" }, { key: "unit_name", label: "الوحدة" },
      { key: "warehouse_name", label: "المستودع" }, { key: "quantity", label: "الكمية", align: "end", format: "qty" },
      { key: "price", label: "السعر", align: "end", format: "money" }, { key: "value", label: "القيمة", align: "end", format: "money" },
    ],
  },
  produced: {
    title: "المواد المنتجة حسب الصنف", icon: PackagePlus, valueKey: "value",
    description: "إجمالي الكميات المنتجة لكل صنف وقيمتها ومتوسط تكلفتها وعدد سندات الانتاج",
    columns: [
      { key: "product_code", label: "رمز الصنف" }, { key: "product_name", label: "الصنف" }, { key: "unit_name", label: "الوحدة" },
      { key: "vouchers", label: "عدد السندات", align: "center", format: "int", sum: true }, { key: "quantity", label: "الكمية المنتجة", align: "end", format: "qty", sum: true },
      { key: "avg_price", label: "متوسط السعر", align: "end", format: "money" }, { key: "value", label: "القيمة", align: "end", format: "money", sum: true },
    ],
  },
  raw: {
    title: "استهلاك المواد الخام حسب الصنف", icon: Boxes, valueKey: "value",
    description: "إجمالي ما صُرف من كل مادة خام في سندات الانتاج بالكمية والقيمة",
    columns: [
      { key: "product_code", label: "رمز الصنف" }, { key: "product_name", label: "المادة الخام" }, { key: "unit_name", label: "الوحدة" },
      { key: "vouchers", label: "عدد السندات", align: "center", format: "int", sum: true }, { key: "quantity", label: "الكمية المستهلكة", align: "end", format: "qty", sum: true },
      { key: "avg_price", label: "متوسط السعر", align: "end", format: "money" }, { key: "value", label: "القيمة", align: "end", format: "money", sum: true },
    ],
  },
  vouchers: {
    title: "تكلفة سندات الانتاج", icon: Factory, valueKey: "produced_value",
    description: "لكل سند انتاج: قيمة المواد المنتجة مقابل قيمة المواد الخام المستهلكة والفرق",
    columns: [
      { key: "code", label: "رقم السند" }, { key: "vch_date", label: "التاريخ" }, { key: "status", label: "الحالة", align: "center", format: "status" },
      { key: "branch_name", label: "الفرع" }, { key: "produced_names", label: "المواد المنتجة" },
      { key: "finished_store_name", label: "مستودع المواد الجاهزة" }, { key: "raw_store_name", label: "مستودع المواد الخام" },
      { key: "produced_quantity", label: "الكمية المنتجة", align: "end", format: "qty", sum: true },
      { key: "produced_value", label: "قيمة المنتَج", align: "end", format: "money", sum: true },
      { key: "raw_value", label: "قيمة الخام", align: "end", format: "money", sum: true },
      { key: "difference", label: "الفرق", align: "end", format: "money", sum: true },
    ],
  },
}

const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const qty = (value: unknown) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const alignClass = (align?: Column["align"]) => (align === "end" ? "text-left" : align === "center" ? "text-center" : "text-right")
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`
const today = () => new Date().toISOString().slice(0, 10)

function cell(column: Column, row: Record<string, any>) {
  const value = row[column.key]
  switch (column.format) {
    case "money": return <span dir="ltr" className={`font-mono ${column.key === "difference" && Number(value) < 0 ? "text-rose-700" : ""}`}>{money(value)}</span>
    case "qty": return <span dir="ltr" className="font-mono">{qty(value)}</span>
    case "int": return <span className="font-mono">{Number(value || 0)}</span>
    case "role": return Number(value) === 1
      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">منتَج</span>
      : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">خام</span>
    case "status": return Number(value) === 2
      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">معتمد</span>
      : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">غير معتمد</span>
    default: return value === null || value === undefined || value === "" ? "—" : String(value)
  }
}

export function ProductionReport({ view }: { view: View }) {
  const config = CONFIG[view]
  const [meta, setMeta] = useState<{ branches: ReportOption[]; warehouses: ReportOption[] }>({ branches: [], warehouses: [] })
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), branchIds: [] as number[], warehouseIds: [] as number[], statuses: [2] as number[], q: "" })
  const [rows, setRows] = useState<Record<string, any>[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/reports/production?view=${view}&meta=1`, { cache: "no-store" }).then((response) => response.json())
      .then((data) => setMeta({ branches: data.branches || [], warehouses: data.warehouses || [] })).catch(() => undefined)
  }, [view])

  const run = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const query = new URLSearchParams({
        view, from_date: filters.from, to_date: filters.to, branch_ids: filters.branchIds.join(","), warehouse_ids: filters.warehouseIds.join(","),
        statuses: filters.statuses.join(","), q: filters.q,
      })
      const response = await fetch(`/api/reports/production?${query}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setRows(data.rows || [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل التقرير")
    } finally { setLoading(false) }
  }, [filters, view])

  const totals = useMemo(() => {
    const result: Record<string, number> = {}
    for (const column of config.columns) if (column.sum || column.key === config.valueKey) result[column.key] = (rows || []).reduce((sum, row) => sum + Number(row[column.key] || 0), 0)
    if (view === "detailed") {
      result.produced = (rows || []).filter((row) => Number(row.role) === 1).reduce((sum, row) => sum + Number(row.value || 0), 0)
      result.raw = (rows || []).filter((row) => Number(row.role) === 2).reduce((sum, row) => sum + Number(row.value || 0), 0)
    }
    return result
  }, [rows, config, view])
  const Icon = config.icon

  return (
    <ReportPage loading={loading}>
      <ReportHeader
        icon={Icon}
        category="تقارير الانتاج"
        title={config.title}
        description={config.description}
        actions={<Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!rows?.length}><Printer className="ml-2 h-4 w-4" />طباعة</Button>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" dir="ltr" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" dir="ltr" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="rounded-xl" /></div>
          <ReportMultiChoice label="الفرع" options={meta.branches} selected={filters.branchIds} onChange={(branchIds) => setFilters({ ...filters, branchIds })} placeholder="كل الفروع" />
          <ReportMultiChoice label="المستودع" options={meta.warehouses} selected={filters.warehouseIds} onChange={(warehouseIds) => setFilters({ ...filters, warehouseIds })} placeholder="كل المستودعات" />
          <ReportMultiChoice label="حالة السند" options={STATUS_OPTIONS} selected={filters.statuses} onChange={(statuses) => setFilters({ ...filters, statuses })} placeholder="المعتمدة" />
          <div className="space-y-2"><Label>الصنف أو رقم السند</Label><Input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} className="rounded-xl" placeholder="بحث" /></div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button data-report-apply onClick={() => void run()} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600"><Search className="ml-2 h-4 w-4" />عرض النتائج</Button>
        </div>
      </ReportFilters>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

      {rows && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ReportSummaryCard label="عدد الأسطر">{String(rows.length)}</ReportSummaryCard>
            {view === "detailed" ? (
              <>
                <ReportSummaryCard label="قيمة المواد المنتجة">{money(totals.produced)}</ReportSummaryCard>
                <ReportSummaryCard label="قيمة المواد الخام">{money(totals.raw)}</ReportSummaryCard>
              </>
            ) : (
              <ReportSummaryCard label={view === "raw" ? "قيمة المواد المستهلكة" : "قيمة المواد المنتجة"}>{money(totals[config.valueKey])}</ReportSummaryCard>
            )}
            {view === "vouchers" && <ReportSummaryCard label="قيمة المواد الخام">{money(totals.raw_value)}</ReportSummaryCard>}
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>{config.columns.map((column) => <th key={column.key} className={`whitespace-nowrap p-2 ${alignClass(column.align)}`}>{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.length === 0
                  ? <tr><td colSpan={config.columns.length} className="p-8 text-center text-muted-foreground">لا توجد بيانات للفترة والفلاتر المحددة</td></tr>
                  : rows.map((row, index) => (
                    <tr key={index} className="border-t hover:bg-emerald-50/40">
                      {config.columns.map((column) => <td key={column.key} className={`p-2 ${alignClass(column.align)}`}>{cell(column, row)}</td>)}
                    </tr>
                  ))}
              </tbody>
              {rows.length > 0 && config.columns.some((column) => column.sum) && (
                <tfoot className="border-t-2 bg-slate-50 font-bold">
                  <tr>
                    {config.columns.map((column, index) => (
                      <td key={column.key} className={`p-2 ${alignClass(column.align)}`}>
                        {index === 0 ? "الإجمالي" : column.sum ? (column.format === "money" ? <span dir="ltr" className="font-mono">{money(totals[column.key])}</span> : column.format === "int" ? totals[column.key] : <span dir="ltr" className="font-mono">{qty(totals[column.key])}</span>) : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </ReportPage>
  )
}

export const ProductionDetailedReport = () => <ProductionReport view="detailed" />
export const ProductionProducedReport = () => <ProductionReport view="produced" />
export const ProductionRawReport = () => <ProductionReport view="raw" />
export const ProductionVouchersReport = () => <ProductionReport view="vouchers" />
