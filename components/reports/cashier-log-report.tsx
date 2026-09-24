"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportHeader, ReportPage } from "@/components/reports/report-page"
import DataGridView from "@/components/common/DataGridView"
import { ReportMultiChoice } from "@/components/reports/account-statement-report"

type Option = { id: number; name: string; code?: string }
type LogRow = { id?: number; row_id?: string; occurred_at: string; cashier_name: string; movement_type: string; transaction_no: string | null; notes: string | null; item_name?: string | null; quantity?: number | null; price?: number | null; line_total?: number | null }

const ACTIONS = ["استلام عهدة", "تسليم عهدة", "حفظ فاتورة", "تعديل فاتورة", "حذف فاتورة", "حذف صنف من فاتورة", "جديد بدون تخزين", "اضافة خصم", "اضافة خصم صنف"]
const dateValue = (offset = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10) }

export function CashierLogReport({ reportType = "followup" }: { reportType?: "followup" | "total" | "detail" }) {
  const detail = reportType === "detail"
  const [filters, setFilters] = useState({ from_date: dateValue(-30), to_date: dateValue(), point_ids: [] as number[], cashier_ids: [] as number[], session_ids: [] as number[], movement_types: ACTIONS })
  const [points, setPoints] = useState<Option[]>([])
  const [cashiers, setCashiers] = useState<Option[]>([])
  const [shifts, setShifts] = useState<Option[]>([])
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = async (withLookups = false) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from_date: filters.from_date, to_date: filters.to_date, point_ids: filters.point_ids.join(","), cashier_ids: filters.cashier_ids.join(","), session_ids: filters.session_ids.join(","), movement_types: filters.movement_types.join(","), ...(detail ? { detail: "1" } : {}) })
      if (withLookups) params.set("lookups", "1")
      const response = await fetch(`/api/pos/cashier-log?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setRows(data.rows || [])
      if (withLookups) { setPoints(data.points || []); setCashiers(data.cashiers || []); setShifts(data.shifts || []) }
    } catch { setRows([]) } finally { setLoading(false) }
  }

  useEffect(() => { void load(true) }, [])
  const scheme = { name: detail ? "CashierLogDetailedReportTable" : "CashierLogReportTable", filter: false, showFooter: false, sortable: true, allowGrouping: false, columns: [
    { header: "##", name: detail ? "row_id" : "id", width: 60, visible: true },
    { header: "التاريخ", name: "occurred_at", width: 180, visible: true },
    { header: "اسم الكاشير", name: "cashier_name", width: 170, visible: true },
    { header: "نوع الحركة", name: "movement_type", width: 190, visible: true },
    { header: "رقم الحركة", name: "transaction_no", width: 150, visible: true },
    ...(detail ? [
      { header: "اسم الصنف", name: "item_name", width: 220, visible: true },
      { header: "الكمية", name: "quantity", width: 100, visible: true },
      { header: "السعر", name: "price", width: 110, visible: true },
      { header: "إجمالي الصنف", name: "line_total", width: 130, visible: true },
    ] : []),
    { header: "ملاحظات", name: "notes", width: "*", minWidth: 220, visible: true },
  ] }

  return <ReportPage>
    <ReportHeader title={detail ? "تقرير حركات الكاشير تفصيلي" : reportType === "total" ? "تقرير حركات الكاشير إجمالي" : "تقرير متابعة الكاشير"} description={detail ? "تفاصيل أصناف كل حركة وفاتورة" : reportType === "total" ? "ملخص حركات الكاشير على مستوى العملية" : "متابعة جميع حركات الكاشير"} />
    <ReportFilters><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <label className="text-sm">من تاريخ<Input type="date" value={filters.from_date} onChange={event => setFilters(current => ({ ...current, from_date: event.target.value }))} /></label>
      <label className="text-sm">إلى تاريخ<Input type="date" value={filters.to_date} onChange={event => setFilters(current => ({ ...current, to_date: event.target.value }))} /></label>
      <ReportMultiChoice label="نقطة البيع" options={points} selected={filters.point_ids} onChange={point_ids => setFilters(current => ({ ...current, point_ids }))} placeholder="كل نقاط البيع" />
      <ReportMultiChoice label="الكاشير" options={cashiers} selected={filters.cashier_ids} onChange={cashier_ids => setFilters(current => ({ ...current, cashier_ids }))} placeholder="كل الكاشير" />
      {reportType !== "followup" && <ReportMultiChoice label="الوردية" options={shifts} selected={filters.session_ids} onChange={session_ids => setFilters(current => ({ ...current, session_ids }))} placeholder="جميع الورديات" />}
      <ReportMultiChoice label="نوع الحركة" options={ACTIONS.map((label, id) => ({ id, name: label }))} selected={filters.movement_types.map(type => ACTIONS.indexOf(type))} onChange={ids => setFilters(current => ({ ...current, movement_types: ids.map(id => ACTIONS[id]).filter(Boolean) }))} placeholder="كل أنواع الحركات" />
      <Button data-report-apply className="md:col-span-2 xl:col-span-5" onClick={() => void load()} disabled={loading}><Search className="ml-2 h-4 w-4" /> بحث</Button>
    </div></ReportFilters>
    <DataGridView style={{ maxHeight: "100vh", minHeight: "50vh" }} idProperty={detail ? "row_id" : "id"} scheme={scheme} dataSource={rows} showContextMenu={false} dontConvertToCards isReport hideSearch allowSorting />
  </ReportPage>
}
