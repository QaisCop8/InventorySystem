"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Download, FileBarChart, Loader2, Printer, Search } from "lucide-react"
import { ReportMultiChoice } from "@/components/reports/account-statement-report"
import { ReportFilters } from "@/components/reports/report-filters"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Product = { id: number; product_code?: string; product_name?: string }
type FilterProduct = Product & { category_id?: number; main_stock_id?: number; type?: number }
type Option = { id: number; code?: string; name?: string }
type Movement = Record<string, any>

const numberFormat = (value: unknown) => Number(value || 0).toLocaleString("ar-SA", { maximumFractionDigits: 3 })

export function ItemCardReport() {
  const reportRequestRef = useRef(0)
  const [products, setProducts] = useState<FilterProduct[]>([])
  const [warehouses, setWarehouses] = useState<Option[]>([])
  const [groups, setGroups] = useState<Option[]>([])
  const [warehouseIds, setWarehouseIds] = useState<number[]>([])
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [mainStockIds, setMainStockIds] = useState<number[]>([])
  const [itemTypes, setItemTypes] = useState<number[]>([1])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [fromDate, setFromDate] = useState(`${new Date().getFullYear()}-01-01`)
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState<Movement[]>([])
  const [opening, setOpening] = useState(0)
  const [closing, setClosing] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [showSelectedGrid, setShowSelectedGrid] = useState(false)
  const [error, setError] = useState("")
  const mainStockOptions = useMemo(() => groups.filter(group => products.some(product => Number(product.main_stock_id) === group.id)), [groups, products])
  const filteredProductOptions = useMemo(() => products.filter(product =>
    (!groupIds.length || groupIds.includes(Number(product.category_id)))
      && (!mainStockIds.length || mainStockIds.includes(Number(product.main_stock_id)))
      && (!itemTypes.length || itemTypes.includes(Number(product.type || 1)))
  ).map(product => ({ id: product.id, code: product.product_code, name: product.product_name })), [products, groupIds, mainStockIds, itemTypes])

  useEffect(() => {
    fetch("/api/reports/item-card", { cache: "no-store" })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "تعذر تحميل الأصناف")
        setProducts(data.products || [])
        setWarehouses(data.warehouses || [])
        setGroups(data.groups || [])
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : "تعذر تحميل الأصناف"))
      .finally(() => setLoadingProducts(false))
  }, [])

  const loadReport = async (requestedId?: number) => {
    const eligibleIds = new Set(filteredProductOptions.map(product => Number(product.id)))
    const productId = requestedId && eligibleIds.has(requestedId) ? requestedId : activeId && eligibleIds.has(activeId) && selectedIds.includes(activeId) ? activeId : selectedIds.find(id => eligibleIds.has(id))
    if (!productId) { setError("اختر صنفًا واحدًا على الأقل"); return }
    if (fromDate > toDate) { setError("تاريخ البداية يجب أن يسبق تاريخ النهاية"); return }
    const requestId = ++reportRequestRef.current
    setShowSelectedGrid(selectedIds.filter(id => eligibleIds.has(id)).length > 1)
    setActiveId(productId)
    setRows([]); setOpening(0); setClosing(0)
    setLoading(true); setError("")
    try {
      const params = new URLSearchParams({ product_id: String(productId), from_date: fromDate, to_date: toDate })
      if (warehouseIds.length) params.set("warehouse_ids", warehouseIds.join(","))
      const response = await fetch(`/api/reports/item-card?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل بطاقة الصنف")
      if (requestId !== reportRequestRef.current) return
      setRows(data.rows || []); setOpening(Number(data.opening_balance || 0)); setClosing(Number(data.closing_balance || 0))
    } catch (cause) { if (requestId === reportRequestRef.current) { setRows([]); setError(cause instanceof Error ? cause.message : "تعذر تحميل بطاقة الصنف") }
    } finally { if (requestId === reportRequestRef.current) setLoading(false) }
  }

  const selectedProducts = selectedIds.map(id => products.find(product => Number(product.id) === id)).filter(product => product && filteredProductOptions.some(option => option.id === product.id)) as Product[]
  const activeProduct = products.find(product => Number(product.id) === activeId)
  const exportCsv = () => {
    const columns = ["movement_date", "transaction_type", "reference_type", "reference_id", "quantity_in", "quantity_out", "unit_cost", "balance", "notes"]
    const csv = [columns.join(","), ...rows.map(row => columns.map(column => JSON.stringify(row[column] ?? "")).join(","))].join("\n")
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); link.download = `بطاقة-صنف-${activeProduct?.product_code || ""}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  const extraFilters = <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <ReportMultiChoice label="المستودعات" options={warehouses} selected={warehouseIds} onChange={setWarehouseIds} placeholder="جميع المستودعات" />
    <ReportMultiChoice label="مجموعات الأصناف" options={groups} selected={groupIds} onChange={setGroupIds} placeholder="جميع المجموعات" />
    <ReportMultiChoice label="المخزون الرئيسي" options={mainStockOptions} selected={mainStockIds} onChange={setMainStockIds} placeholder="جميع المخازن الرئيسية" />
    <ReportMultiChoice label="نوع الصنف" options={[{ id: 1, name: "صنف" }, { id: 2, name: "خدمة" }, { id: 3, name: "أصل" }]} selected={itemTypes} onChange={setItemTypes} placeholder="جميع الأنواع" />
  </div>

  return <main dir="rtl" className="accounting-report min-h-full w-full overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,.10),transparent_28%),radial-gradient(circle_at_top_left,rgba(99,102,241,.08),transparent_25%)] p-3 text-xs md:h-full md:min-h-0 sm:p-5 lg:p-7 print:h-auto print:overflow-visible print:bg-white print:p-0">
    <div className="flex min-h-full w-full flex-col gap-4 md:h-full md:min-h-0">
      <header className="relative shrink-0 overflow-hidden rounded-[28px] bg-gradient-to-l from-emerald-700 via-teal-600 to-green-500 px-5 py-5 text-white shadow-xl sm:px-7"><div className="relative flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25"><FileBarChart className="h-5 w-5" /></span><div><Badge className="mb-1 border-white/20 bg-white/15 text-white">تقارير الأصناف</Badge><h1 className="text-xl font-black">بطاقة صنف</h1><p className="mt-1 text-xs text-white/80">حركة الصنف والرصيد الافتتاحي والتراكمي خلال الفترة المحددة</p></div></div><div className="flex gap-2 print:hidden"><Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download className="ml-2 h-4 w-4" />تصدير</Button><Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => window.print()} disabled={!rows.length}><Printer className="ml-2 h-4 w-4" />طباعة</Button></div></div></header>
      <ReportFilters>{extraFilters}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><ReportMultiChoice label="الأصناف" options={filteredProductOptions} selected={selectedIds} onChange={ids => { reportRequestRef.current += 1; setLoading(false); setSelectedIds(ids); setActiveId(null); setRows([]); setOpening(0); setClosing(0); setShowSelectedGrid(false) }} placeholder={loadingProducts ? "جاري تحميل الأصناف..." : "اختر صنفًا أو أكثر"} /><div className="space-y-2"><Label>من تاريخ</Label><Input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="rounded-xl" /></div><div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="rounded-xl" /></div></div><div className="mt-4 flex justify-end border-t pt-4"><Button data-report-apply onClick={() => void loadReport()} disabled={loading || loadingProducts} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 text-white shadow-lg">{loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض التقرير</Button></div></ReportFilters>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <section className="grid shrink-0 gap-3 sm:grid-cols-2"><Card><CardContent className="p-3"><div className="text-xs text-slate-500">رصيد أول المدة</div><div className="text-xl font-bold">{numberFormat(opening)}</div></CardContent></Card><Card><CardContent className="p-3"><div className="text-xs text-slate-500">الرصيد الختامي</div><div className="text-xl font-bold">{numberFormat(closing)}</div></CardContent></Card></section>
      <section className={`grid min-h-[430px] flex-1 gap-4 ${showSelectedGrid && selectedProducts.length > 1 ? "xl:grid-cols-[320px_minmax(0,1fr)]" : "grid-cols-1"}`}>
        {showSelectedGrid && selectedProducts.length > 1 && <aside className="flex min-h-[430px] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-xl print:hidden"><div className="shrink-0 border-b bg-gradient-to-l from-teal-50 to-white p-4"><h2 className="font-black">الأصناف المحددة</h2><p className="text-xs text-muted-foreground">اختر صنفًا لعرض حركاته</p></div><div className="min-h-0 flex-1 overflow-y-auto"><table className="w-full table-fixed text-xs"><thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 to-sky-700 text-white"><tr><th className="px-3 py-2.5 text-right">اسم الصنف</th><th className="w-20 px-2 py-2.5 text-center">الإجراء</th></tr></thead><tbody>{selectedProducts.map(product => { const active = product.id === activeId; return <tr key={product.id} className={`border-b ${active ? "bg-teal-50" : "hover:bg-slate-50"}`}><td className="min-w-0 px-3 py-3"><p className="truncate font-bold" title={product.product_name}>{product.product_name}</p><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{product.product_code}</p></td><td className="px-2 py-3 text-center"><Button size="sm" variant={active ? "default" : "outline"} onClick={() => void loadReport(product.id)} className="h-8 rounded-lg px-3">{loading && active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "عرض"}</Button></td></tr>})}</tbody></table></div></aside>}
        <section className="flex min-h-[430px] min-w-0 flex-col overflow-hidden rounded-[24px] border bg-background shadow-xl"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 print:hidden"><div><h2 className="font-bold">حركات الصنف{activeProduct ? ` — ${activeProduct.product_name}` : ""}</h2><p className="text-xs text-muted-foreground">{rows.length.toLocaleString("ar")} حركة ضمن الفترة المحددة</p></div></div><div className="min-h-0 flex-1 overflow-auto overscroll-contain print:max-h-none print:overflow-visible"><table className="w-full min-w-[950px] text-xs"><thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white print:static"><tr>{["##", "التاريخ", "نوع الحركة", "المرجع", "وارد", "صادر", "الرصيد", "سعر التكلفة", "ملاحظات"].map(label => <th key={label} className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || index} className={`border-b hover:bg-teal-50/70 ${index % 2 ? "bg-slate-50/60" : ""}`}><td className="px-3 py-2.5">{index + 1}</td><td className="px-3 py-2.5">{String(row.movement_date || "").slice(0, 10)}</td><td className="px-3 py-2.5">{row.transaction_type}</td><td className="px-3 py-2.5">{row.reference_type || "-"}{row.reference_id ? ` #${row.reference_id}` : ""}</td><td className="px-3 py-2.5 text-emerald-700" dir="ltr">{row.quantity_in ? numberFormat(row.quantity_in) : "—"}</td><td className="px-3 py-2.5 text-rose-700" dir="ltr">{row.quantity_out ? numberFormat(row.quantity_out) : "—"}</td><td className="px-3 py-2.5 font-black" dir="ltr">{numberFormat(row.balance)}</td><td className="px-3 py-2.5" dir="ltr">{numberFormat(row.unit_cost)}</td><td className="px-3 py-2.5 text-muted-foreground">{row.notes || "-"}</td></tr>)}{!loading && !rows.length && <tr><td colSpan={9} className="px-4 py-16 text-center"><FileBarChart className="mx-auto mb-3 h-11 w-11 text-slate-300" /><p className="font-semibold">لا توجد حركات لعرضها</p><p className="mt-1 text-xs text-muted-foreground">اختر صنفًا ثم اضغط عرض التقرير</p></td></tr>}</tbody></table></div></section>
      </section>
    </div>
  </main>
}
