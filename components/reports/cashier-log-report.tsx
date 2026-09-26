"use client"

import { useEffect, useMemo, useState } from "react"
import { RefreshCcw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportHeader, ReportPage } from "@/components/reports/report-page"
import DataGridView from "@/components/common/DataGridView"
import { ReportMultiChoice } from "@/components/reports/account-statement-report"
import { VoucherLink } from "@/components/reports/voucher-link"
import { voucherHref } from "@/lib/voucher-links"

type Option = { id: number; name: string; code?: string }
type LogRow = { id?: number; log_id?: number; row_id?: string; vch_type?: number; occurred_at: string; cashier_name: string; movement_type: string; transaction_no: string | null; notes: string | null; point_name?: string | null; shift_name?: string | null; payment_method?: string | null; item_name?: string | null; quantity?: number | null; price?: number | null; discount_percent?: number | null; item_discount_amount?: number | null; campaign_discount?: number | null; line_total?: number | null }

const ACTIONS = ["استلام عهدة", "تسليم عهدة", "حفظ فاتورة", "تعديل فاتورة", "حذف فاتورة", "حذف صنف من فاتورة", "جديد بدون تخزين", "اضافة خصم", "اضافة خصم صنف"]
const INVOICE_MOVEMENTS = ["مبيعات", "مردودات", "هدايا"]
const PAYMENT_METHODS = ["نقدي", "شيكات", "بطاقات", "ذمم"]
const dateValue = (offset = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10) }
const formatDateTime = (value: string | null | undefined) => String(value || "").replace("T", " ").slice(0, 16)

export function CashierLogReport({ reportType = "followup", enableInvoiceLinks = false, showTotals = false }: { reportType?: "followup" | "total" | "detail"; enableInvoiceLinks?: boolean; showTotals?: boolean }) {
  const detail = reportType === "detail"
  const [filters, setFilters] = useState({ from_date: dateValue(-30), to_date: dateValue(), point_ids: [] as number[], cashier_ids: [] as number[], session_ids: [] as number[], movement_types: detail || reportType === "total" ? INVOICE_MOVEMENTS : ACTIONS, payment_methods: [] as string[] })
  const [points, setPoints] = useState<Option[]>([])
  const [cashiers, setCashiers] = useState<Option[]>([])
  const [shifts, setShifts] = useState<Option[]>([])
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(false)

  const loadLookups = async () => {
    const response = await fetch("/api/pos/cashier-log?lookups=1")
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "تعذر تحميل خيارات التقرير")
    setPoints(data.points || [])
    setCashiers(data.cashiers || [])
    setShifts(data.shifts || [])
  }

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from_date: filters.from_date, to_date: filters.to_date, point_ids: filters.point_ids.join(","), cashier_ids: filters.cashier_ids.join(","), session_ids: filters.session_ids.join(","), movement_types: filters.movement_types.join(","), payment_methods: filters.payment_methods.join(","), ...(detail ? { detail: "1" } : {}), ...(reportType !== "followup" ? { invoice_report: "1" } : {}) })
      const response = await fetch(`/api/pos/cashier-log?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setRows(data.rows || [])
    } catch { setRows([]) } finally { setLoading(false) }
  }

  const resetFilters = () => {
    setFilters({
      from_date: dateValue(-30),
      to_date: dateValue(),
      point_ids: [],
      cashier_ids: [],
      session_ids: [],
      movement_types: reportType === "followup" ? ACTIONS : INVOICE_MOVEMENTS,
      payment_methods: [],
    })
  }

  useEffect(() => {
    void loadLookups().catch(() => {
      setPoints([])
      setCashiers([])
      setShifts([])
    })
    void load()
  }, [])
  const scheme = { name: detail ? "CashierLogDetailedReportTable" : "CashierLogReportTable", filter: false, showFooter: showTotals && reportType === "total", sortable: true, allowGrouping: false, columns: [
    { header: "##", name: detail ? "row_id" : "id", width: 60, visible: true },
    { header: "التاريخ", name: "occurred_at", width: 180, visible: true },
    { header: "اسم الكاشير", name: "cashier_name", width: 170, visible: true },
    { header: "نوع الحركة", name: "movement_type", width: 150, visible: true },
    { header: "رقم الحركة", name: "transaction_no", width: 150, visible: true },
    { header: "نقطة البيع", name: "point_name", width: 150, visible: true },
    { header: "الوردية", name: "shift_name", width: 180, visible: true },
    ...(detail ? [
      { header: "اسم الصنف", name: "item_name", width: 220, visible: true },
      { header: "الكمية", name: "quantity", width: 100, visible: true },
      { header: "السعر", name: "price", width: 110, visible: true },
      { header: "إجمالي الصنف", name: "line_total", width: 130, visible: true },
      { header: "طريقة الدفع", name: "payment_method", width: 130, visible: true },
    ] : []),
    ...(!detail && reportType === "total" ? [{ header: "عدد الأصناف", name: "item_count", width: 110, visible: true, dataType: "Number", aggregate: 1 }, { header: "الإجمالي", name: "total_amount", width: 130, visible: true, dataType: "Number", aggregate: 1 }, { header: "طريقة الدفع", name: "payment_method", width: 130, visible: true }] : []),
    { header: "ملاحظات", name: "notes", width: "*", minWidth: 220, visible: true },
  ] }

  const invoiceGroups = useMemo(() => {
    if (!detail) return []
    const groups = new Map<string, LogRow[]>()
    rows.forEach((row) => {
      const key = String(row.id ?? row.transaction_no ?? row.row_id ?? "")
      const group = groups.get(key) || []
      group.push(row)
      groups.set(key, group)
    })
    return Array.from(groups.values())
  }, [detail, rows])

  const displayRows = useMemo(
    () => rows.map((row, index) => ({ ...row, ser: index + 1, occurred_at: formatDateTime(row.occurred_at) })),
    [rows],
  )
  const totals = useMemo(() => rows.reduce((sum, row) => ({
    quantity: sum.quantity + Number(row.quantity || 0),
    price: sum.price + Number(row.price || 0),
    discount_percent: sum.discount_percent + Number(row.discount_percent || 0),
    item_discount_amount: sum.item_discount_amount + Number(row.item_discount_amount || 0),
    campaign_discount: sum.campaign_discount + Number(row.campaign_discount || 0),
    line_total: sum.line_total + Number(row.line_total || 0),
  }), { quantity: 0, price: 0, discount_percent: 0, item_discount_amount: 0, campaign_discount: 0, line_total: 0 }), [rows])
  const openInvoice = (row: Pick<LogRow, "id" | "transaction_no" | "vch_type">) => {
    if (!row.transaction_no || !row.id) return
    const company = sessionStorage.getItem("active_company_id")
    window.open(voucherHref(Number(row.id), Number(row.vch_type || 12), company), "_blank", "noopener,noreferrer")
  }

  const reportScheme = enableInvoiceLinks && !detail && reportType !== "followup"
    ? {
        ...scheme,
        columns: scheme.columns.map((column: any) => column.name === "transaction_no"
          ? { ...column, buttonBody: "button", title: "فتح الفاتورة", onClick: (_event: any, context: any) => openInvoice(context.row.dataItem) }
          : column),
      }
    : scheme

  return <ReportPage>
    <ReportHeader title={detail ? "تقرير حركات الكاشير تفصيلي" : reportType === "total" ? "تقرير حركات الكاشير إجمالي" : "تقرير متابعة الكاشير"} description={detail ? "تفاصيل أصناف كل حركة وفاتورة" : reportType === "total" ? "ملخص حركات الكاشير على مستوى العملية" : "متابعة جميع حركات الكاشير"} />
    <ReportFilters><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <label className="text-sm">من تاريخ<Input type="date" value={filters.from_date} onChange={event => setFilters(current => ({ ...current, from_date: event.target.value }))} /></label>
      <label className="text-sm">إلى تاريخ<Input type="date" value={filters.to_date} onChange={event => setFilters(current => ({ ...current, to_date: event.target.value }))} /></label>
      <ReportMultiChoice label="نقطة البيع" options={points} selected={filters.point_ids} onChange={point_ids => setFilters(current => ({ ...current, point_ids }))} placeholder="كل نقاط البيع" />
      <ReportMultiChoice label="الكاشير" options={cashiers} selected={filters.cashier_ids} onChange={cashier_ids => setFilters(current => ({ ...current, cashier_ids }))} placeholder="كل الكاشير" />
      {reportType !== "followup" && <ReportMultiChoice label="الوردية" options={shifts} selected={filters.session_ids} onChange={session_ids => setFilters(current => ({ ...current, session_ids }))} placeholder="جميع الورديات" />}
      <ReportMultiChoice label="نوع الحركة" options={(reportType === "followup" ? ACTIONS : INVOICE_MOVEMENTS).map((label, id) => ({ id, name: label }))} selected={filters.movement_types.map(type => (reportType === "followup" ? ACTIONS : INVOICE_MOVEMENTS).indexOf(type))} onChange={ids => setFilters(current => ({ ...current, movement_types: ids.map(id => (reportType === "followup" ? ACTIONS : INVOICE_MOVEMENTS)[id]).filter(Boolean) }))} placeholder="كل أنواع الحركات" />
      {reportType !== "followup" && <ReportMultiChoice label="طريقة الدفع" options={PAYMENT_METHODS.map((name, id) => ({ id, name }))} selected={filters.payment_methods.map(method => PAYMENT_METHODS.indexOf(method))} onChange={ids => setFilters(current => ({ ...current, payment_methods: ids.map(id => PAYMENT_METHODS[id]).filter(Boolean) }))} placeholder="كل طرق الدفع" />}
      <div className="mt-2 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 md:col-span-2 xl:col-span-5">
        <Button type="button" variant="outline" onClick={resetFilters} disabled={loading} className="min-w-32 rounded-xl border-slate-200 bg-white shadow-sm">
          <RefreshCcw className="ml-2 h-4 w-4" />
          مسح الفلاتر
        </Button>
        <Button data-report-apply onClick={() => void load()} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-600/20 hover:from-teal-700 hover:to-emerald-700">
          <Search className="ml-2 h-4 w-4" />
          عرض النتائج
        </Button>
      </div>
    </div></ReportFilters>
    {detail ? (
      <div className="h-[42vh] min-h-[280px] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1500px] border-collapse text-sm" dir="rtl">
          <thead className="sticky top-0 z-10 bg-slate-800 text-white"><tr>
            {['#', 'التاريخ', 'اسم الكاشير', 'نوع الحركة', 'رقم الحركة', 'نقطة البيع', 'الوردية', 'طريقة الدفع', 'اسم الصنف', 'الكمية', 'السعر', 'خصم الصنف %', 'خصم الصنف من الفاتورة', 'خصم الحملات', 'إجمالي الصنف', 'ملاحظات'].map((header) => <th key={header} className="border border-slate-600 px-3 py-2 text-right">{header}</th>)}
          </tr></thead>
          <tbody>{invoiceGroups.flatMap((group, groupIndex) => group.map((row, rowIndex) => {
            const merged = rowIndex === 0 ? { rowSpan: group.length } : null
            const cell = (value: unknown) => <td rowSpan={merged?.rowSpan} className="border border-slate-200 px-3 py-2 align-middle">{value || ""}</td>
            return <tr key={row.row_id || `${groupIndex}-${rowIndex}`} className="hover:bg-slate-50">
              {rowIndex === 0 && <>{cell(groupIndex + 1)}{cell(formatDateTime(row.occurred_at))}{cell(row.cashier_name)}{cell(row.movement_type)}{cell(enableInvoiceLinks && row.transaction_no && row.id ? <VoucherLink id={Number(row.id)} type={Number(row.vch_type || 12)} code={row.transaction_no} /> : row.transaction_no || "")}{cell(row.point_name)}{cell(row.shift_name)}{cell(row.payment_method)}</>}
              <td className="border border-slate-200 px-3 py-2">{row.item_name || ""}</td><td className="border border-slate-200 px-3 py-2">{row.quantity ?? ""}</td><td className="border border-slate-200 px-3 py-2">{row.price ?? ""}</td><td className="border border-slate-200 px-3 py-2">{row.discount_percent ?? 0}</td><td className="border border-slate-200 px-3 py-2">{row.item_discount_amount ?? 0}</td><td className="border border-slate-200 px-3 py-2">{row.campaign_discount ?? 0}</td><td className="border border-slate-200 px-3 py-2">{row.line_total ?? ""}</td>
              {rowIndex === 0 && cell(row.notes)}
            </tr>
          }))}</tbody>
          {showTotals && <tfoot className="sticky bottom-0 z-10 bg-emerald-50 font-semibold text-slate-800 shadow-[0_-2px_6px_rgba(15,23,42,0.12)]"><tr>
            <td colSpan={9} className="border border-emerald-200 px-3 py-2 text-right">الإجمالي</td>
            <td className="border border-emerald-200 px-3 py-2">{totals.quantity}</td>
            <td className="border border-emerald-200 px-3 py-2">{totals.price.toFixed(2)}</td>
            <td className="border border-emerald-200 px-3 py-2">{totals.discount_percent.toFixed(2)}</td>
            <td className="border border-emerald-200 px-3 py-2">{totals.item_discount_amount.toFixed(2)}</td>
            <td className="border border-emerald-200 px-3 py-2">{totals.campaign_discount.toFixed(2)}</td>
            <td className="border border-emerald-200 px-3 py-2">{totals.line_total.toFixed(2)}</td>
            <td className="border border-emerald-200 px-3 py-2"></td>
          </tr></tfoot>}
        </table>
      </div>
    ) : <DataGridView style={{ height: "42vh", minHeight: "280px", overflow: "hidden" }} idProperty="id" scheme={reportScheme} dataSource={displayRows} showContextMenu={false} dontConvertToCards isReport hideSearch allowSorting />}
  </ReportPage>
}

export function CashierTotalReport() {
  return <CashierLogReport reportType="total" enableInvoiceLinks showTotals />
}

export function CashierDetailedReport() {
  return <CashierLogReport reportType="detail" enableInvoiceLinks showTotals />
}
