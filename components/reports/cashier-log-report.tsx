"use client"

import { tr, appDir } from "@/lib/i18n"
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
import { ReportGrid, type ReportGridColumn } from "@/components/reports/report-grid"

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
    if (!response.ok) throw new Error(data.error || tr("تعذر تحميل خيارات التقرير"))
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
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل التقرير"))
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
    { header: tr("التاريخ"), name: "occurred_at", width: 180, visible: true },
    { header: tr("اسم الكاشير"), name: "cashier_name", width: 170, visible: true },
    { header: tr("نوع الحركة"), name: "movement_type", width: 150, visible: true },
    { header: tr("رقم الحركة"), name: "transaction_no", width: 150, visible: true },
    { header: tr("نقطة البيع"), name: "point_name", width: 150, visible: true },
    { header: tr("الوردية"), name: "shift_name", width: 180, visible: true },
    ...(detail ? [
      { header: tr("اسم الصنف"), name: "item_name", width: 220, visible: true },
      { header: tr("الكمية"), name: "quantity", width: 100, visible: true },
      { header: tr("السعر"), name: "price", width: 110, visible: true },
      { header: tr("إجمالي الصنف"), name: "line_total", width: 130, visible: true },
      { header: tr("طريقة الدفع"), name: "payment_method", width: 130, visible: true },
    ] : []),
    ...(!detail && reportType === "total" ? [{ header: tr("عدد الأصناف"), name: "item_count", width: 110, visible: true, dataType: "Number", aggregate: 1 }, { header: tr("الإجمالي"), name: "total_amount", width: 130, visible: true, dataType: "Number", aggregate: 1 }, { header: tr("طريقة الدفع"), name: "payment_method", width: 130, visible: true }] : []),
    { header: tr("ملاحظات"), name: "notes", width: "*", minWidth: 220, visible: true },
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
          ? { ...column, buttonBody: "button", title: tr("فتح الفاتورة"), onClick: (_event: any, context: any) => openInvoice(context.row.dataItem) }
          : column),
      }
    : scheme

  return <ReportPage loading={loading}>
    <ReportHeader title={detail ? tr("تقرير حركات الكاشير تفصيلي") : reportType === "total" ? tr("تقرير حركات الكاشير إجمالي") : tr("تقرير متابعة الكاشير")} description={detail ? tr("تفاصيل أصناف كل حركة وفاتورة") : reportType === "total" ? tr("ملخص حركات الكاشير على مستوى العملية") : tr("متابعة جميع حركات الكاشير")} />
    <ReportFilters><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <label className="text-sm">{tr("من تاريخ")}<Input type="date" value={filters.from_date} onChange={event => setFilters(current => ({ ...current, from_date: event.target.value }))} /></label>
      <label className="text-sm">{tr("إلى تاريخ")}<Input type="date" value={filters.to_date} onChange={event => setFilters(current => ({ ...current, to_date: event.target.value }))} /></label>
      <ReportMultiChoice label={tr("نقطة البيع")} options={points} selected={filters.point_ids} onChange={point_ids => setFilters(current => ({ ...current, point_ids }))} placeholder={tr("كل نقاط البيع")} />
      <ReportMultiChoice label={tr("الكاشير")} options={cashiers} selected={filters.cashier_ids} onChange={cashier_ids => setFilters(current => ({ ...current, cashier_ids }))} placeholder={tr("كل الكاشير")} />
      {reportType !== "followup" && <ReportMultiChoice label={tr("الوردية")} options={shifts} selected={filters.session_ids} onChange={session_ids => setFilters(current => ({ ...current, session_ids }))} placeholder={tr("جميع الورديات")} />}
      <ReportMultiChoice label={tr("نوع الحركة")} options={(reportType === "followup" ? ACTIONS : INVOICE_MOVEMENTS).map((label, id) => ({ id, name: label }))} selected={filters.movement_types.map(type => (reportType === "followup" ? ACTIONS : INVOICE_MOVEMENTS).indexOf(type))} onChange={ids => setFilters(current => ({ ...current, movement_types: ids.map(id => (reportType === "followup" ? ACTIONS : INVOICE_MOVEMENTS)[id]).filter(Boolean) }))} placeholder={tr("كل أنواع الحركات")} />
      {reportType !== "followup" && <ReportMultiChoice label={tr("طريقة الدفع")} options={PAYMENT_METHODS.map((name, id) => ({ id, name }))} selected={filters.payment_methods.map(method => PAYMENT_METHODS.indexOf(method))} onChange={ids => setFilters(current => ({ ...current, payment_methods: ids.map(id => PAYMENT_METHODS[id]).filter(Boolean) }))} placeholder={tr("كل طرق الدفع")} />}
      <div className="mt-2 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 md:col-span-2 xl:col-span-5">
        <Button type="button" variant="outline" onClick={resetFilters} disabled={loading} className="min-w-32 rounded-xl border-slate-200 bg-white shadow-sm">
          <RefreshCcw className="me-2 h-4 w-4" />
          {tr("مسح الفلاتر")}
        </Button>
        <Button data-report-apply onClick={() => void load()} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-600/20 hover:from-teal-700 hover:to-emerald-700">
          <Search className="me-2 h-4 w-4" />
          {tr("عرض النتائج")}
        </Button>
      </div>
    </div></ReportFilters>
    {detail ? (
      <ReportGrid
          rows={invoiceGroups.flatMap((group, groupIndex) => group.map((row: any, rowIndex: number) => ({ ...row, __first: rowIndex === 0, __invoice: groupIndex + 1 })))}
          exportFileName={tr("سجل حركات الكاشير")} height="max(320px, 42vh)" showSerial={false}
          columns={[
            { key: "invoice_no", label: "#", width: 60, value: (row: any) => row.__first ? String(row.__invoice) : "" },
            { key: "occurred_at", label: tr("التاريخ"), width: 160, value: (row: any) => row.__first ? formatDateTime(row.occurred_at) : "" },
            { key: "cashier_name", label: tr("اسم الكاشير"), width: 140, value: (row: any) => row.__first ? row.cashier_name || "" : "" },
            { key: "movement_type", label: tr("نوع الحركة"), width: 120, value: (row: any) => row.__first ? row.movement_type || "" : "" },
            { key: "transaction_no", label: tr("رقم الحركة"), width: 140, value: (row: any) => row.__first ? row.transaction_no || "" : "", render: (row: any) => !row.__first ? "" : enableInvoiceLinks && row.transaction_no && row.id ? <VoucherLink id={Number(row.id)} type={Number(row.vch_type || 12)} code={row.transaction_no} /> : row.transaction_no || "" },
            { key: "point_name", label: tr("نقطة البيع"), width: 130, value: (row: any) => row.__first ? row.point_name || "" : "" },
            { key: "shift_name", label: tr("الوردية"), width: 110, value: (row: any) => row.__first ? row.shift_name || "" : "" },
            { key: "payment_method", label: tr("طريقة الدفع"), width: 120, value: (row: any) => row.__first ? row.payment_method || "" : "" },
            { key: "item_name", label: tr("اسم الصنف"), width: "*", minWidth: 200 },
            { key: "quantity", label: tr("الكمية"), type: "number", width: 100, total: showTotals ? totals.quantity : undefined },
            { key: "price", label: tr("السعر"), type: "number", width: 110, total: showTotals ? totals.price : undefined },
            { key: "discount_percent", label: tr("خصم الصنف %"), type: "number", width: 110, total: showTotals ? totals.discount_percent : undefined },
            { key: "item_discount_amount", label: tr("خصم الصنف من الفاتورة"), type: "number", width: 150, total: showTotals ? totals.item_discount_amount : undefined },
            { key: "campaign_discount", label: tr("خصم الحملات"), type: "number", width: 120, total: showTotals ? totals.campaign_discount : undefined },
            { key: "line_total", label: tr("إجمالي الصنف"), type: "number", width: 130, total: showTotals ? totals.line_total : undefined },
            { key: "notes", label: tr("ملاحظات"), width: 180, value: (row: any) => row.__first ? row.notes || "" : "" },
          ]}/>
    ) : <DataGridView style={{ height: "42vh", minHeight: "280px", overflow: "hidden" }} idProperty="id" scheme={reportScheme} dataSource={displayRows} showContextMenu={false} dontConvertToCards isReport hideSearch allowSorting />}
  </ReportPage>
}

export function CashierTotalReport() {
  return <CashierLogReport reportType="total" enableInvoiceLinks showTotals />
}

export function CashierDetailedReport() {
  return <CashierLogReport reportType="detail" enableInvoiceLinks showTotals />
}
