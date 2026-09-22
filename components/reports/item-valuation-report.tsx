"use client"

import { ReportPage, ReportHeader } from "@/components/reports/report-page"

import { useState } from "react"
import { Download, FileBarChart, Loader2, Printer, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import Dropdown from "@/components/common/Dropdown"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"

const numberFormat = (value: unknown) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })

export function ItemValuationReport() {
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState("")
  const [priceWay, setPriceWay] = useState("average")
  const [withZeros, setWithZeros] = useState(false)
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const loadReport = async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch(`/api/reports/item-valuation?to_date=${toDate}&search=${encodeURIComponent(search)}&price_way=${priceWay}&with_zeros=${withZeros ? 1 : 0}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل تقييم البضاعة")
      setRows(data.rows || [])
    } catch (cause) {
      setRows([]); setError(cause instanceof Error ? cause.message : "تعذر تحميل تقييم البضاعة")
    } finally { setLoading(false) }
  }

  const exportCsv = () => {
    const columns = ["product_code", "product_name", "main_unit", "category", "balance", "valuation_price", "valuation_amount"]
    const csv = [columns.join(","), ...rows.map(row => columns.map(column => JSON.stringify(row[column] ?? "")).join(","))].join("\n")
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); link.download = `تقييم-البضاعة-${toDate}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0)
  const totalValue = rows.reduce((sum, row) => sum + Number(row.valuation_amount || 0), 0)

  return <ReportPage>

      <ReportHeader icon={FileBarChart} category="تقارير الأصناف" title={<>تقييم المخزون بتاريخ معين</>} description={<>تقييم كمية المخزون وقيمته حسب تاريخ القطع</>} actions={<><Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download className="ml-2 h-4 w-4" />تصدير</Button><Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => window.print()} disabled={!rows.length}><Printer className="ml-2 h-4 w-4" />طباعة</Button></>} />
      <ReportFilters><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div><Label>إلى تاريخ</Label><Input type="date" lang="en" dir="ltr" value={toDate} onChange={event => setToDate(event.target.value)} className="rounded-xl" /></div><div><Label>رقم/اسم الصنف</Label><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="بحث في الأصناف" className="rounded-xl" /></div><div><Label>طريقة التقييم</Label><Select value={priceWay} onValueChange={setPriceWay}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="average">متوسط تكلفة الوارد</SelectItem><SelectItem value="last">آخر سعر شراء</SelectItem></SelectContent></Select></div><label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={withZeros} onCheckedChange={value => setWithZeros(value === true)} />إظهار الأرصدة الصفرية</label></div><div className="mt-4 flex justify-end border-t pt-4"><Button data-report-apply onClick={loadReport} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-lg">{loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض التقرير</Button></div></ReportFilters>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <section className="grid shrink-0 grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4"><ReportSummaryCard label="عدد الأصناف">{rows.length.toLocaleString("en-US")}</ReportSummaryCard><ReportSummaryCard label="إجمالي الرصيد">{numberFormat(totalQuantity)}</ReportSummaryCard><ReportSummaryCard label="قيمة المخزون" highlight>{numberFormat(totalValue)}</ReportSummaryCard><ReportSummaryCard label="متوسط قيمة الصنف">{numberFormat(rows.length ? totalValue / rows.length : 0)}</ReportSummaryCard></section>
      <section className="report-results"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-bold">نتائج تقييم البضاعة</h2><p className="text-xs text-muted-foreground">{rows.length.toLocaleString("en-US")} سجل</p></div><div className="relative w-full sm:w-80"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="ابحث داخل النتائج..." className="rounded-xl bg-muted/40 pr-9" /></div></div><div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 bg-gradient-to-l from-indigo-700 via-blue-700 to-violet-700 text-white"><tr>{["##", "كود الصنف", "الصنف", "الكمية", "الوحدة", "المجموعة", "سعر التقييم", "قيمة المخزون"].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className={`border-b hover:bg-indigo-50/70 ${index % 2 ? "bg-slate-50/60" : ""}`}><td className="px-3 py-3">{index + 1}</td><td className="px-3 py-3 font-mono font-bold text-teal-700">{row.product_code}</td><td className="px-3 py-3 font-semibold">{row.product_name}</td><td className="px-3 py-3 font-bold" dir="ltr">{numberFormat(row.balance)}</td><td className="px-3 py-3">{row.main_unit || "-"}</td><td className="px-3 py-3">{row.category || "-"}</td><td className="px-3 py-3" dir="ltr">{numberFormat(row.valuation_price)}</td><td className="px-3 py-3 font-black text-teal-700" dir="ltr">{numberFormat(row.valuation_amount)}</td></tr>)}{!loading && !rows.length && <tr><td colSpan={8} className="px-4 py-16 text-center"><FileBarChart className="mx-auto mb-3 h-11 w-11 text-slate-300" /><p className="font-semibold">لا توجد نتائج لعرضها</p><p className="mt-1 text-xs text-muted-foreground">اختر الفلاتر ثم اضغط عرض التقرير</p></td></tr>}</tbody></table></div></section>

  </ReportPage>
}
