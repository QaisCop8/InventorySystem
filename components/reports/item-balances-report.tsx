"use client"

import { ReportPage, ReportHeader } from "@/components/reports/report-page"

import { useState } from "react"
import { Download, FileBarChart, Loader2, Printer, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"

const numberFormat = (value: unknown) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })

export function ItemBalancesReport() {
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState("")
  const [withZeros, setWithZeros] = useState(false)
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const loadReport = async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch(`/api/reports/item-balances?to_date=${toDate}&search=${encodeURIComponent(search)}&with_zeros=${withZeros ? 1 : 0}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل أرصدة الأصناف")
      setRows(data.rows || [])
    } catch (cause) {
      setRows([]); setError(cause instanceof Error ? cause.message : "تعذر تحميل أرصدة الأصناف")
    } finally { setLoading(false) }
  }

  const exportCsv = () => {
    const columns = ["product_code", "product_name", "main_unit", "category", "balance", "received_quantity", "issued_quantity", "last_movement_at"]
    const csv = [columns.join(","), ...rows.map(row => columns.map(column => JSON.stringify(row[column] ?? "")).join(","))].join("\n")
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); link.download = `أرصدة-الأصناف-${toDate}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  const totalBalance = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0)
  const totalReceived = rows.reduce((sum, row) => sum + Number(row.received_quantity || 0), 0)
  const totalIssued = rows.reduce((sum, row) => sum + Number(row.issued_quantity || 0), 0)

  return <ReportPage>

      <ReportHeader icon={FileBarChart} category="تقارير الأصناف" title={<>أرصدة المخزون بتاريخ معين</>} description={<>عرض أرصدة الأصناف وحركات المخزون حتى التاريخ المحدد</>} actions={<><Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download className="ml-2 h-4 w-4" />تصدير</Button><Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => window.print()} disabled={!rows.length}><Printer className="ml-2 h-4 w-4" />طباعة</Button></>} />
      <ReportFilters><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div><Label>إلى تاريخ</Label><Input type="date" lang="en" dir="ltr" value={toDate} onChange={event => setToDate(event.target.value)} className="rounded-xl" /></div><div><Label>رقم/اسم الصنف</Label><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="بحث في الأصناف" className="rounded-xl" /></div><label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={withZeros} onCheckedChange={value => setWithZeros(value === true)} />إظهار الأرصدة الصفرية</label></div><div className="mt-4 flex justify-end border-t pt-4"><Button data-report-apply onClick={loadReport} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 text-white shadow-lg">{loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض التقرير</Button></div></ReportFilters>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <section className="grid shrink-0 grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4"><ReportSummaryCard label="عدد الأصناف">{rows.length.toLocaleString("en-US")}</ReportSummaryCard><ReportSummaryCard label="إجمالي الرصيد">{numberFormat(totalBalance)}</ReportSummaryCard><ReportSummaryCard label="إجمالي الوارد">{numberFormat(totalReceived)}</ReportSummaryCard><ReportSummaryCard label="إجمالي الصادر">{numberFormat(totalIssued)}</ReportSummaryCard></section>
      <section className="report-results"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-bold">نتائج أرصدة الأصناف</h2><p className="text-xs text-muted-foreground">{rows.length.toLocaleString("en-US")} سجل</p></div><div className="relative w-full sm:w-80"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="ابحث داخل النتائج..." className="rounded-xl bg-muted/40 pr-9" /></div></div><div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[950px] text-sm"><thead className="sticky top-0 bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white"><tr>{["##", "كود الصنف", "الصنف", "الرصيد", "الوحدة", "المجموعة", "الوارد", "الصادر", "آخر حركة"].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className={`border-b hover:bg-teal-50/70 ${index % 2 ? "bg-slate-50/60" : ""}`}><td className="px-3 py-3">{index + 1}</td><td className="px-3 py-3 font-mono font-bold text-teal-700">{row.product_code}</td><td className="px-3 py-3 font-semibold">{row.product_name}</td><td className="px-3 py-3 font-bold" dir="ltr">{numberFormat(row.balance)}</td><td className="px-3 py-3">{row.main_unit || "-"}</td><td className="px-3 py-3">{row.category || "-"}</td><td className="px-3 py-3 text-emerald-700" dir="ltr">{numberFormat(row.received_quantity)}</td><td className="px-3 py-3 text-rose-700" dir="ltr">{numberFormat(row.issued_quantity)}</td><td className="px-3 py-3">{String(row.last_movement_at || "").slice(0, 10) || "-"}</td></tr>)}{!loading && !rows.length && <tr><td colSpan={9} className="px-4 py-16 text-center"><FileBarChart className="mx-auto mb-3 h-11 w-11 text-slate-300" /><p className="font-semibold">لا توجد نتائج لعرضها</p><p className="mt-1 text-xs text-muted-foreground">اختر الفلاتر ثم اضغط عرض التقرير</p></td></tr>}</tbody></table></div></section>

  </ReportPage>
}
