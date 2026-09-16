"use client"

import { useState } from "react"
import { Download, FileBarChart, Loader2, Printer, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"

const numberFormat = (value: unknown) => Number(value || 0).toLocaleString("ar-SA", { maximumFractionDigits: 3 })

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

  return <main dir="rtl" className="min-h-full w-full overflow-y-auto bg-[linear-gradient(145deg,rgba(248,250,252,.96),rgba(240,253,250,.75),rgba(238,242,255,.75))] p-3 sm:p-5 lg:p-7 print:bg-white print:p-0">
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <header className="relative overflow-hidden rounded-[30px] bg-gradient-to-l from-indigo-600 to-violet-600 p-6 text-white shadow-2xl sm:p-8"><div className="relative flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"><FileBarChart className="h-7 w-7" /></span><div><Badge className="mb-2 border-white/20 bg-white/15 text-white">تقارير الأصناف</Badge><h1 className="text-2xl font-black sm:text-3xl">تقييم البضاعة بتاريخ معين</h1><p className="mt-1 text-sm text-white/80">تقييم كمية المخزون وقيمته حسب تاريخ القطع</p></div></div><div className="flex gap-2 print:hidden"><Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download className="ml-2 h-4 w-4" />تصدير</Button><Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => window.print()} disabled={!rows.length}><Printer className="ml-2 h-4 w-4" />طباعة</Button></div></div></header>
      <ReportFilters><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div><Label>إلى تاريخ</Label><Input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="rounded-xl" /></div><div><Label>رقم/اسم الصنف</Label><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="بحث في الأصناف" className="rounded-xl" /></div><div><Label>طريقة التقييم</Label><Select value={priceWay} onValueChange={setPriceWay}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="average">متوسط تكلفة الوارد</SelectItem><SelectItem value="last">آخر سعر شراء</SelectItem></SelectContent></Select></div><label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={withZeros} onCheckedChange={value => setWithZeros(value === true)} />إظهار الأرصدة الصفرية</label></div><div className="mt-4 flex justify-end border-t pt-4"><Button data-report-apply onClick={loadReport} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-lg">{loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض التقرير</Button></div></ReportFilters>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <section className="grid shrink-0 grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4"><ReportSummaryCard label="عدد الأصناف">{rows.length.toLocaleString("ar")}</ReportSummaryCard><ReportSummaryCard label="إجمالي الرصيد">{numberFormat(totalQuantity)}</ReportSummaryCard><ReportSummaryCard label="قيمة المخزون" highlight>{numberFormat(totalValue)}</ReportSummaryCard><ReportSummaryCard label="متوسط قيمة الصنف">{numberFormat(rows.length ? totalValue / rows.length : 0)}</ReportSummaryCard></section>
      <section className="flex min-h-[430px] flex-col overflow-hidden rounded-[26px] border bg-background shadow-xl"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-bold">نتائج تقييم البضاعة</h2><p className="text-xs text-muted-foreground">{rows.length.toLocaleString("ar")} سجل</p></div><div className="relative w-full sm:w-80"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="ابحث داخل النتائج..." className="rounded-xl bg-muted/40 pr-9" /></div></div><div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 bg-gradient-to-l from-indigo-700 via-blue-700 to-violet-700 text-white"><tr>{["##", "كود الصنف", "الصنف", "الكمية", "الوحدة", "المجموعة", "سعر التقييم", "قيمة المخزون"].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className={`border-b hover:bg-indigo-50/70 ${index % 2 ? "bg-slate-50/60" : ""}`}><td className="px-3 py-3">{index + 1}</td><td className="px-3 py-3 font-mono font-bold text-indigo-700">{row.product_code}</td><td className="px-3 py-3 font-semibold">{row.product_name}</td><td className="px-3 py-3 font-bold" dir="ltr">{numberFormat(row.balance)}</td><td className="px-3 py-3">{row.main_unit || "-"}</td><td className="px-3 py-3">{row.category || "-"}</td><td className="px-3 py-3" dir="ltr">{numberFormat(row.valuation_price)}</td><td className="px-3 py-3 font-black text-indigo-700" dir="ltr">{numberFormat(row.valuation_amount)}</td></tr>)}{!loading && !rows.length && <tr><td colSpan={8} className="px-4 py-16 text-center"><FileBarChart className="mx-auto mb-3 h-11 w-11 text-slate-300" /><p className="font-semibold">لا توجد نتائج لعرضها</p><p className="mt-1 text-xs text-muted-foreground">اختر الفلاتر ثم اضغط عرض التقرير</p></td></tr>}</tbody></table></div></section>
    </div>
  </main>
}
