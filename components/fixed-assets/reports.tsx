"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { FileBarChart, Loader2, Printer, Search } from "lucide-react"
import { ASSET_STATUSES, DISPOSAL_TYPES } from "@/lib/fixed-assets/constants"
import {
  api, CsvButton, DataTable, day, exportCsv, Field, money, n, recordOptions, SectionCard, Select, StatusBadge, today, toOptions, transactionLabel,
  type Column, type Lookups, type Row,
} from "./shared"

type ReportKey = "register" | "movement" | "depreciation" | "acquisitions" | "additions" | "revaluations" | "transfers" | "disposals" | "by-location" | "by-cost-center" | "reconciliation"

const REPORTS: { key: ReportKey; label: string; range: boolean; hint: string }[] = [
  { key: "register", label: "سجل الأصول", range: false, hint: "التكلفة والإهلاك المتراكم والقيمة الدفترية لكل أصل في تاريخ معيّن" },
  { key: "movement", label: "حركة الأصول", range: true, hint: "رصيد افتتاحي + اقتناء + إضافات − استبعاد = رصيد ختامي لكل تصنيف" },
  { key: "depreciation", label: "الإهلاك", range: true, hint: "الإهلاك المرحّل والمخطط لكل أصل حسب الفترة" },
  { key: "acquisitions", label: "الاقتناءات", range: true, hint: "الأصول المقتناة والأرصدة الافتتاحية" },
  { key: "additions", label: "الإضافات الرأسمالية", range: true, hint: "التكاليف المضافة على الأصول القائمة" },
  { key: "revaluations", label: "إعادة التقييم والانخفاض", range: true, hint: "حركات إعادة التقييم وانخفاض القيمة" },
  { key: "transfers", label: "نقل الأصول", range: true, hint: "سجل النقل بين الفروع والمواقع والعهدة" },
  { key: "disposals", label: "الاستبعادات", range: true, hint: "الأصول المستبعدة مع الربح أو الخسارة" },
  { key: "by-location", label: "حسب الموقع", range: false, hint: "القيم الدفترية مجمّعة حسب الموقع" },
  { key: "by-cost-center", label: "حسب مركز التكلفة", range: false, hint: "القيم الدفترية مجمّعة حسب مركز التكلفة" },
  { key: "reconciliation", label: "المطابقة مع الأستاذ العام", range: false, hint: "مقارنة أرصدة الدفتر الفرعي للأصول مع حسابات الأستاذ العام" },
]

const columnsFor = (key: ReportKey, lookups: Lookups): Column[] => {
  const describeLocation = (value: Row | null | undefined) => describe(value, lookups)
  const asset: Column[] = [{ key: "asset_no", label: "رقم الأصل" }, { key: "asset_name", label: "الأصل" }, { key: "category_name", label: "التصنيف" }]
  const transaction: Column[] = [
    { key: "transaction_no", label: "رقم الحركة" },
    { key: "transaction_date", label: "التاريخ", render: row => day(row.transaction_date), csv: row => day(row.transaction_date) },
    ...asset,
  ]
  switch (key) {
    case "register": return [
      { key: "asset_no", label: "رقم الأصل" }, { key: "name", label: "الأصل" }, { key: "category_name", label: "التصنيف" },
      { key: "acquisition_date", label: "الاقتناء", render: row => day(row.acquisition_date), csv: row => day(row.acquisition_date) },
      { key: "location_name", label: "الموقع" }, { key: "cost_center_name", label: "مركز التكلفة" },
      { key: "status", label: "الحالة", render: row => <StatusBadge status={row.status} />, csv: row => (ASSET_STATUSES as Row)[row.status] },
      { key: "cost", label: "التكلفة", numeric: true, total: true },
      { key: "accumulated_depreciation", label: "الإهلاك المتراكم", numeric: true, total: true },
      { key: "net_book_value", label: "القيمة الدفترية", numeric: true, total: true },
    ]
    case "movement": return [
      { key: "category_name", label: "التصنيف" },
      { key: "opening_cost", label: "تكلفة أول المدة", numeric: true, total: true },
      { key: "acquisitions", label: "اقتناء", numeric: true, total: true },
      { key: "additions", label: "إضافات", numeric: true, total: true },
      { key: "revaluations", label: "إعادة تقييم", numeric: true, total: true },
      { key: "disposals_cost", label: "استبعاد", numeric: true, total: true },
      { key: "closing_cost", label: "تكلفة آخر المدة", numeric: true, total: true },
      { key: "opening_accumulated", label: "متراكم أول المدة", numeric: true, total: true },
      { key: "depreciation", label: "إهلاك الفترة", numeric: true, total: true },
      { key: "impairment", label: "انخفاض قيمة", numeric: true, total: true },
      { key: "disposals_accumulated", label: "متراكم المستبعد", numeric: true, total: true },
      { key: "closing_accumulated", label: "متراكم آخر المدة", numeric: true, total: true },
      { key: "nbv", label: "القيمة الدفترية", numeric: true, render: row => money(n(row.closing_cost) - n(row.closing_accumulated)), csv: row => n(row.closing_cost) - n(row.closing_accumulated) },
    ]
    case "depreciation": return [
      { key: "period", label: "الفترة" }, ...asset, { key: "cost_center_name", label: "مركز التكلفة" },
      { key: "depreciation_amount", label: "الإهلاك", numeric: true, total: true },
      { key: "accumulated_depreciation", label: "المتراكم", numeric: true },
      { key: "closing_book_value", label: "القيمة الدفترية", numeric: true },
      { key: "status", label: "الحالة", render: row => <StatusBadge status={row.status} />, csv: row => row.status },
      { key: "run_no", label: "التشغيل" }, { key: "journal_code", label: "القيد" },
    ]
    case "disposals": return [
      ...transaction,
      { key: "disposal_type", label: "النوع", render: row => (DISPOSAL_TYPES as Row)[row.disposal_type] ?? row.disposal_type, csv: row => (DISPOSAL_TYPES as Row)[row.disposal_type] },
      { key: "cost", label: "التكلفة", numeric: true, total: true, render: row => money(-n(row.cost_delta)), csv: row => -n(row.cost_delta) },
      { key: "acc", label: "المتراكم", numeric: true, render: row => money(-n(row.accumulated_delta)), csv: row => -n(row.accumulated_delta) },
      { key: "disposal_nbv", label: "القيمة الدفترية", numeric: true, total: true },
      { key: "sale_amount", label: "قيمة البيع", numeric: true, total: true },
      { key: "gain_loss", label: "ربح / خسارة", numeric: true, total: true, render: row => <span className={n(row.gain_loss) < 0 ? "text-rose-600" : "text-emerald-700"}>{money(row.gain_loss)}</span>, csv: row => row.gain_loss },
      { key: "journal_code", label: "القيد" }, { key: "notes", label: "السبب" },
    ]
    case "transfers": return [
      ...transaction,
      { key: "from", label: "من", render: row => describeLocation(row.old_value), csv: row => describeLocation(row.old_value) },
      { key: "to", label: "إلى", render: row => describeLocation(row.new_value), csv: row => describeLocation(row.new_value) },
      { key: "notes", label: "السبب" },
    ]
    case "by-location":
    case "by-cost-center": return [
      { key: "name", label: key === "by-location" ? "الموقع" : "مركز التكلفة" },
      { key: "count", label: "عدد الأصول" },
      { key: "cost", label: "التكلفة", numeric: true, total: true },
      { key: "accumulated", label: "الإهلاك المتراكم", numeric: true, total: true },
      { key: "nbv", label: "القيمة الدفترية", numeric: true, total: true },
    ]
    case "reconciliation": return [
      { key: "code", label: "الحساب" }, { key: "name", label: "اسم الحساب" },
      { key: "kind", label: "النوع", render: row => row.kind === "ASSET" ? "تكلفة الأصول" : "إهلاك متراكم", csv: row => row.kind },
      { key: "subledger", label: "الدفتر الفرعي", numeric: true, total: true },
      { key: "general_ledger", label: "الأستاذ العام", numeric: true, total: true },
      { key: "difference", label: "الفرق", numeric: true, total: true, render: row => <span className={Math.abs(n(row.difference)) > 0.009 ? "font-black text-rose-600" : "text-emerald-700"}>{money(row.difference)}</span>, csv: row => row.difference },
    ]
    default: return [
      ...transaction,
      { key: "transaction_type", label: "النوع", render: row => transactionLabel(row.transaction_type), csv: row => transactionLabel(row.transaction_type) },
      { key: "amount", label: "المبلغ", numeric: true, total: true },
      { key: "cost_delta", label: "أثر التكلفة", numeric: true, total: true },
      { key: "accumulated_delta", label: "أثر المتراكم", numeric: true, total: true },
      { key: "journal_code", label: "القيد" }, { key: "notes", label: "ملاحظات" },
    ]
  }
}

function describe(value: Row | null | undefined, lookups: Lookups) {
  if (!value) return ""
  const name = (rows: Row[], id: unknown) => rows.find(row => Number(row.id) === Number(id))?.name ?? String(id)
  const parts: string[] = []
  if (value.branch_id != null) parts.push(`فرع: ${name(lookups.branches, value.branch_id)}`)
  if (value.location_id != null) parts.push(`موقع: ${name(lookups.locations, value.location_id)}`)
  if (value.department_id != null) parts.push(`قسم: ${name(lookups.departments, value.department_id)}`)
  if (value.cost_center_id != null) parts.push(`مركز: ${name(lookups.costCenters, value.cost_center_id)}`)
  if (value.custodian_employee_id != null) parts.push(`عهدة: ${name(lookups.employees, value.custodian_employee_id)}`)
  return parts.join(" · ")
}

export function FixedAssetReports({ lookups }: { lookups: Lookups }) {
  const [report, setReport] = useState<ReportKey>("register")
  const [filters, setFilters] = useState<Row>({ as_of: today(), from: `${today().slice(0, 4)}-01-01`, to: today() })
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const meta = REPORTS.find(item => item.key === report)!
  const columns = useMemo(() => columnsFor(report, lookups), [report, lookups])
  const set = (patch: Row) => setFilters(current => ({ ...current, ...patch }))

  const run = async (key = report) => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ type: key })
      for (const [name, value] of Object.entries(filters)) if (value !== null && value !== undefined && value !== "") params.set(name, String(value))
      const data = await api<Row>(`/api/fixed-assets/reports?${params}`)
      setRows(key === "by-location" || key === "by-cost-center" ? data.groups : data.rows)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إعداد التقرير")
    } finally {
      setLoading(false)
    }
  }

  const print = () => {
    if (!rows) return
    const totals = Object.fromEntries(columns.filter(column => column.total).map(column => [column.key, rows.reduce((sum, row) => sum + n(column.csv ? column.csv(row) : row[column.key]), 0)]))
    const escape = (value: unknown) => String(value ?? "").replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] as string)
    const cell = (column: Column, row: Row) => {
      const value = column.csv ? column.csv(row) : row[column.key]
      return column.numeric ? money(value) : escape(value)
    }
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escape(meta.label)}</title><style>
      @page{size:A4 landscape;margin:10mm}body{font-family:Cairo,Tahoma,Arial,sans-serif;font-size:11px;color:#0f172a}h1{font-size:18px;margin:0 0 4px}
      p{margin:0 0 10px;color:#475569}table{width:100%;border-collapse:collapse}th{background:#0f766e;color:#fff;padding:5px;text-align:right}
      td{padding:4px 5px;border-bottom:1px solid #e2e8f0}td.n{text-align:left;direction:ltr;font-variant-numeric:tabular-nums}tfoot td{font-weight:800;background:#f1f5f9}
    </style></head><body><h1>${escape(meta.label)}</h1><p>${meta.range ? `من ${escape(filters.from)} إلى ${escape(filters.to)}` : `حتى ${escape(filters.as_of)}`}</p>
    <table><thead><tr>${columns.map(column => `<th>${escape(column.label)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(row => `<tr>${columns.map(column => `<td class="${column.numeric ? "n" : ""}">${cell(column, row)}</td>`).join("")}</tr>`).join("")}</tbody>
    <tfoot><tr>${columns.map((column, index) => `<td class="${column.numeric ? "n" : ""}">${column.total ? money(totals[column.key]) : index === 0 ? "الإجمالي" : ""}</td>`).join("")}</tr></tfoot></table></body></html>`
    const frame = document.createElement("iframe")
    Object.assign(frame.style, { position: "fixed", width: "0", height: "0", border: "0" })
    document.body.appendChild(frame)
    frame.contentDocument?.open()
    frame.contentDocument?.write(html)
    frame.contentDocument?.close()
    window.setTimeout(() => { frame.contentWindow?.print(); window.setTimeout(() => frame.remove(), 60_000) }, 300)
  }

  return <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
    <nav className="space-y-1 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900" aria-label="التقارير">
      {REPORTS.map(item => <button key={item.key} type="button" onClick={() => { setReport(item.key); setRows(null) }}
        className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-sm transition", report === item.key ? "bg-slate-900 font-bold text-white dark:bg-teal-700" : "hover:bg-slate-100 dark:hover:bg-slate-800")}>
        <FileBarChart className="h-4 w-4 shrink-0 opacity-70" />{item.label}
      </button>)}
    </nav>
    <div className="min-w-0 space-y-4">
      <SectionCard title={meta.label} actions={rows ? <><CsvButton onClick={() => exportCsv(report, columns, rows)} disabled={!rows.length} /><Button size="sm" variant="outline" onClick={print} disabled={!rows.length}><Printer className="ml-1 h-4 w-4" />طباعة</Button></> : null}>
        <p className="mb-3 text-xs text-slate-500">{meta.hint}</p>
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {meta.range ? <>
            <Field label="من تاريخ" htmlFor="fa-rep-from"><Input id="fa-rep-from" type="date" value={filters.from} onChange={event => set({ from: event.target.value })} /></Field>
            <Field label="إلى تاريخ" htmlFor="fa-rep-to"><Input id="fa-rep-to" type="date" value={filters.to} onChange={event => set({ to: event.target.value })} /></Field>
          </> : <Field label="حتى تاريخ" htmlFor="fa-rep-asof"><Input id="fa-rep-asof" type="date" value={filters.as_of} onChange={event => set({ as_of: event.target.value })} /></Field>}
          {report !== "reconciliation" && <>
            <Field label="التصنيف" htmlFor="fa-rep-cat"><Select id="fa-rep-cat" value={filters.category_id} clearable options={toOptions(lookups.categories)} onChange={value => set({ category_id: value })} /></Field>
            <Field label="الموقع" htmlFor="fa-rep-loc"><Select id="fa-rep-loc" value={filters.location_id} clearable options={toOptions(lookups.locations)} onChange={value => set({ location_id: value })} /></Field>
            <Field label="مركز التكلفة" htmlFor="fa-rep-cc"><Select id="fa-rep-cc" value={filters.cost_center_id} clearable options={toOptions(lookups.costCenters)} onChange={value => set({ cost_center_id: value })} /></Field>
            {report === "register" && <Field label="الحالة" htmlFor="fa-rep-status"><Select id="fa-rep-status" value={filters.status} clearable options={recordOptions(ASSET_STATUSES)} onChange={value => set({ status: value })} /></Field>}
          </>}
          <Button onClick={() => void run()} disabled={loading}>{loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض</Button>
        </div>
      </SectionCard>
      {error && <Alert variant="destructive" className="border-rose-200 bg-rose-50 text-rose-700"><AlertDescription>{error}</AlertDescription></Alert>}
      {rows && <DataTable rows={rows} columns={columns} empty="لا توجد بيانات لهذه الفلاتر" />}
    </div>
  </div>
}
