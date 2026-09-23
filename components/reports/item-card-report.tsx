"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Eye, FileBarChart, Loader2, Package, Printer, RefreshCw, Search } from "lucide-react"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportMultiChoice } from "@/components/reports/account-statement-report"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { VoucherLink } from "@/components/reports/voucher-link"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { voucherHref } from "@/lib/voucher-links"
import "./item-card-report.css"

const DataGridView = dynamic<any>(() => import("@/components/common/DataGridView"), { ssr: false, loading: () => <p className="p-6 text-center text-sm">جاري تحميل الجدول...</p> })
type Product = { id: number; product_code?: string; product_name?: string; category_id?: number; main_stock_id?: number; type?: number; main_unit?: string }
type Option = { id: number; code?: string; name?: string }
type Movement = Record<string, any>
type Period = { fromDate: string; toDate: string; warehouseIds: number[]; showTransfers: boolean }
type Column = { name: string; header: string; width: number; numeric?: boolean; visible?: boolean }
const numberFormat = (value: unknown) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const emptySummary = { opening_balance: 0, closing_balance: 0, received_quantity: 0, issued_quantity: 0 }
const itemTypesList = [{ id: 1, name: "صنف" }, { id: 2, name: "خدمة" }, { id: 3, name: "أصل" }]

export function ItemCardReport() {
  const requestRef = useRef(0)
  const appliedPeriod = useRef<Period | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Option[]>([])
  const [groups, setGroups] = useState<Option[]>([])
  const [warehouseIds, setWarehouseIds] = useState<number[]>([])
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [mainStockIds, setMainStockIds] = useState<number[]>([])
  const [itemTypes, setItemTypes] = useState<number[]>([1])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [reportProducts, setReportProducts] = useState<Product[]>([])
  const [activeProduct, setActiveProduct] = useState<Product | null>(null)
  const [fromDate, setFromDate] = useState(`${new Date().getFullYear()}-01-01`)
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [showBonus, setShowBonus] = useState(false)
  const [showTransfers, setShowTransfers] = useState(false)
  const [rows, setRows] = useState<Movement[]>([])
  const [summary, setSummary] = useState(emptySummary)
  const [itemSearch, setItemSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [hasReport, setHasReport] = useState(false)
  const [error, setError] = useState("")

  const mainStockOptions = useMemo(() => groups.filter(group => products.some(product => Number(product.main_stock_id) === Number(group.id))), [groups, products])
  const eligibleProducts = useMemo(() => products.filter(product =>
    (!groupIds.length || groupIds.includes(Number(product.category_id)))
    && (!mainStockIds.length || mainStockIds.includes(Number(product.main_stock_id)))
    && (!itemTypes.length || itemTypes.includes(Number(product.type || 1)))
  ), [products, groupIds, mainStockIds, itemTypes])
  const productOptions = useMemo(() => eligibleProducts.map(product => ({ id: Number(product.id), code: product.product_code, name: product.product_name })), [eligibleProducts])
  const visibleProducts = useMemo(() => reportProducts.filter(product => `${product.product_code} ${product.product_name}`.toLowerCase().includes(itemSearch.trim().toLowerCase())), [reportProducts, itemSearch])

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/reports/item-card", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "تعذر تحميل الأصناف")
        if (controller.signal.aborted) return
        setProducts((data.products || []).map((product: Product) => ({ ...product, id: Number(product.id) })))
        setWarehouses(data.warehouses || []); setGroups(data.groups || [])
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "تعذر تحميل الأصناف") })
      .finally(() => { if (!controller.signal.aborted) setLoadingProducts(false) })
    return () => { controller.abort(); requestRef.current += 1 }
  }, [])

  const loadProduct = async (product: Product, period: Period) => {
    const requestId = ++requestRef.current
    setActiveProduct(product); setRows([]); setSummary(emptySummary); setHasReport(false)
    setLoading(true); setError("")
    try {
      const params = new URLSearchParams({ product_id: String(product.id), from_date: period.fromDate, to_date: period.toDate,
        warehouse_ids: period.warehouseIds.join(","), show_internal_transfers: period.showTransfers ? "1" : "0" })
      const response = await fetch(`/api/reports/item-card?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل بطاقة الصنف")
      if (requestId !== requestRef.current) return
      setActiveProduct({ ...product, ...data.product }); setRows(data.rows || [])
      setSummary({ opening_balance: Number(data.opening_balance || 0), closing_balance: Number(data.closing_balance || 0),
        received_quantity: Number(data.received_quantity || 0), issued_quantity: Number(data.issued_quantity || 0) })
      setHasReport(true)
    } catch (cause) {
      if (requestId === requestRef.current) setError(cause instanceof Error ? cause.message : "تعذر تحميل بطاقة الصنف")
    } finally { if (requestId === requestRef.current) setLoading(false) }
  }

  const runReport = () => {
    if (!fromDate || !toDate || fromDate > toDate) { setError("تاريخ البداية يجب أن يسبق تاريخ النهاية"); return }
    const selected = eligibleProducts.filter(product => !selectedIds.length || selectedIds.includes(product.id))
    if (!selected.length) { setError("لا توجد أصناف مطابقة للفلاتر المحددة"); return }
    const period = { fromDate, toDate, warehouseIds: [...warehouseIds], showTransfers }
    appliedPeriod.current = period
    setReportProducts(selected); setItemSearch("")
    void loadProduct(selected.find(product => product.id === activeProduct?.id) || selected[0], period)
  }
  const selectProduct = (product: Product) => {
    if (appliedPeriod.current) void loadProduct(product, appliedPeriod.current)
  }
  const openVoucher = (row: Movement) => {
    if (row.voucher_id) window.open(voucherHref(Number(row.voucher_id), Number(row.vch_type), sessionStorage.getItem("active_company_id")), "_blank", "noopener,noreferrer")
  }

  const columns = useMemo<Column[]>(() => [
    { name: "serial", header: "#", width: 50, numeric: true },
    { name: "movement_date", header: "التاريخ", width: 115 },
    { name: "voucher_type_name", header: "نوع السند", width: 165 },
    { name: "vch_code", header: "رقم السند", width: 140 },
    { name: "item_unit", header: "الوحدة", width: 90 },
    { name: "display_in", header: "وارد", width: 100, numeric: true },
    { name: "display_out", header: "صادر", width: 100, numeric: true },
    ...(showBonus ? [{ name: "bonus", header: "بونص", width: 90, numeric: true }] : []),
    { name: "balance", header: "الرصيد", width: 115, numeric: true },
    { name: "price", header: "السعر الصافي", width: 110, numeric: true },
    { name: "currency_code", header: "العملة", width: 90 },
    { name: "amount", header: "المبلغ", width: 120, numeric: true },
    { name: "account_code", header: "رقم الحساب", width: 120 },
    { name: "customer_name", header: "اسم الحساب / العميل", width: 200 },
    { name: "manual_voucher", header: "رقم السند اليدوي", width: 140 },
    { name: "store_name", header: "المستودع", width: 145 },
    { name: "notes", header: "ملاحظات", width: 240 },
    { name: "barcode", header: "الباركود", width: 160 },
    { name: "salesman_name", header: "المندوب", width: 150, visible: false },
    { name: "batch_no", header: "رقم الدفعة", width: 130, visible: false },
    { name: "expiry_date", header: "تاريخ الصلاحية", width: 130, visible: false },
    { name: "unit_factor", header: "معامل التحويل", width: 110, numeric: true, visible: false },
  ], [showBonus])
  const displayRows = useMemo<Movement[]>(() => hasReport ? [
    { id: "opening", kind: "balance", movement_date: appliedPeriod.current?.fromDate, voucher_type_name: "رصيد أول المدة", balance: summary.opening_balance },
    ...rows.map((row, index) => ({ ...row, serial: index + 1,
      display_in: showBonus ? row.paid_quantity_in : row.quantity_in,
      display_out: showBonus ? row.paid_quantity_out : row.quantity_out })),
    { id: "closing", kind: "balance", movement_date: appliedPeriod.current?.toDate, voucher_type_name: "رصيد آخر المدة", balance: summary.closing_balance },
  ] : [], [hasReport, rows, summary, showBonus])

  const cell = (row: Movement, column: Column) => {
    const value = row[column.name]
    if (column.name === "vch_code" && row.voucher_id) return <VoucherLink id={Number(row.voucher_id)} type={Number(row.vch_type)} code={String(value || row.voucher_id)} />
    if (value == null || value === "") return ""
    if (column.numeric) return <bdi className={`item-card-number ${column.name === "display_in" ? "is-in" : column.name === "display_out" ? "is-out" : ""}`}>{numberFormat(value)}</bdi>
    return <span className={row.kind === "balance" ? "font-bold" : ""}>{String(value)}</span>
  }
  const movementScheme = useMemo(() => ({ name: "ItemCardVoucherReport", filter: true, sortable: false, showFooter: false,
    columns: columns.map(column => ({ ...column, dataType: column.numeric ? "Number" : "String", format: column.numeric ? "n3" : undefined,
      align: "right", body: ({ item }: { item: Movement }) => cell(item, column) })) }), [columns])
  const itemScheme = useMemo(() => ({ name: "ItemCardProductsReport", filter: false, sortable: true, showFooter: false, columns: [
    { name: "product_code", header: "الكود", width: 90 },
    { name: "product_name", header: "الصنف", width: "*", minWidth: 125 },
    { name: "view", header: "عرض", width: 55, body: ({ item }: { item: Product }) => <button type="button" className="item-card-view" aria-label={`عرض بطاقة ${item.product_name}`} aria-pressed={item.id === activeProduct?.id} onClick={() => selectProduct(item)}><Eye size={16} /></button> },
  ] }), [activeProduct?.id])

  const handleProductSelection = (ids: number[]) => {
    // An empty selection already means "all products" when the report runs.
    setSelectedIds(ids.length === productOptions.length ? [] : ids)
  }

  const exportCsv = () => {
    const visibleColumns = columns.filter(column => column.visible !== false)
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`
    const csv = [visibleColumns.map(column => escape(column.header)).join(","),
      ...displayRows.map(row => visibleColumns.map(column => escape(row[column.name])).join(","))].join("\r\n")
    const link = document.createElement("a")
    link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }))
    link.download = `بطاقة-صنف-${activeProduct?.product_code || ""}.csv`
    link.click(); URL.revokeObjectURL(link.href)
  }

  return <ReportPage>
    <ReportHeader icon={FileBarChart} category="تقارير الأصناف" title="بطاقة صنف" description="حركة السندات والأرصدة التفصيلية لكل صنف" actions={<>
      <Button variant="outline" onClick={exportCsv} disabled={!hasReport || loading}><Download className="ml-2 h-4 w-4" />تصدير</Button>
      <Button variant="outline" onClick={() => window.print()} disabled={!hasReport || loading}><Printer className="ml-2 h-4 w-4" />طباعة</Button>
    </>} />
    <ReportFilters>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMultiChoice label="الأصناف" options={productOptions} selected={selectedIds} onChange={handleProductSelection} placeholder={loadingProducts ? "جاري تحميل الأصناف..." : "جميع الأصناف"} />
        <div className="space-y-2"><Label htmlFor="item-card-from">من تاريخ</Label><Input id="item-card-from" type="date" lang="en" dir="ltr" value={fromDate} onChange={event => setFromDate(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="item-card-to">إلى تاريخ</Label><Input id="item-card-to" type="date" lang="en" dir="ltr" value={toDate} onChange={event => setToDate(event.target.value)} /></div>
        <ReportMultiChoice label="المستودعات" options={warehouses} selected={warehouseIds} onChange={setWarehouseIds} placeholder="جميع المستودعات" />
        <ReportMultiChoice label="مجموعات الأصناف" options={groups} selected={groupIds} onChange={setGroupIds} placeholder="جميع المجموعات" />
        <ReportMultiChoice label="المخزون الرئيسي" options={mainStockOptions} selected={mainStockIds} onChange={setMainStockIds} placeholder="جميع المخازن الرئيسية" />
        <ReportMultiChoice label="نوع الصنف" options={itemTypesList} selected={itemTypes} onChange={setItemTypes} placeholder="جميع الأنواع" />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2"><Checkbox checked={showBonus} onCheckedChange={checked => setShowBonus(checked === true)} />إظهار البونص في عمود مستقل</label>
          <label className="flex items-center gap-2"><Checkbox checked={showTransfers} onCheckedChange={checked => setShowTransfers(checked === true)} />إظهار التحويلات بين المستودعات المحددة</label>
        </div>
        <Button data-report-apply onClick={runReport} disabled={loading || loadingProducts}>{loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض التقرير</Button>
      </div>
    </ReportFilters>
    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
    <div className="item-card-workspace">
      {reportProducts.length > 1 && <aside className="report-results item-card-products print:hidden">
        <div className="item-card-panel-heading"><Package size={18} /><h2>الأصناف</h2><span className="item-card-count">{numberFormat(reportProducts.length)}</span></div>
        <div className="p-3"><Input aria-label="بحث في أصناف التقرير" placeholder="بحث بالكود أو اسم الصنف" value={itemSearch} onChange={event => setItemSearch(event.target.value)} /></div>
        <DataGridView dataSource={visibleProducts} scheme={itemScheme} isReport hideSearch dontConvertToCards idProperty="id" onRowDoubleClick={selectProduct} defaultRowHeight={42} style={{ height: "100%", minHeight: 420 }} containerStyle={{ flex: 1, minHeight: 420 }} />
      </aside>}
      <section className="item-card-detail" aria-busy={loading}>
        <div className="item-card-identity">
          <div className="min-w-0"><p className="item-card-eyebrow">بطاقة حركة الصنف</p><h2>{activeProduct?.product_name || "اختر الأصناف واعرض التقرير"}</h2>
            {activeProduct && <p><bdi>{activeProduct.product_code}</bdi><span>الوحدة الرئيسية: {activeProduct.main_unit || "—"}</span><span><bdi>{appliedPeriod.current?.fromDate}</bdi> — <bdi>{appliedPeriod.current?.toDate}</bdi></span></p>}
          </div>
          <Button variant="outline" size="sm" disabled={!activeProduct || loading} onClick={() => activeProduct && selectProduct(activeProduct)}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button>
        </div>
        {reportProducts.length > 0 && <div className="item-card-mobile-picker print:hidden"><Label htmlFor="item-card-active">الصنف</Label><select id="item-card-active" value={activeProduct?.id || ""} onChange={event => { const product = reportProducts.find(item => item.id === Number(event.target.value)); if (product) selectProduct(product) }}>{reportProducts.map(product => <option key={product.id} value={product.id}>{product.product_code} — {product.product_name}</option>)}</select></div>}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <ReportSummaryCard label="رصيد أول المدة">{numberFormat(summary.opening_balance)}</ReportSummaryCard>
          <ReportSummaryCard label="إجمالي الوارد">{numberFormat(summary.received_quantity)}</ReportSummaryCard>
          <ReportSummaryCard label="إجمالي الصادر">{numberFormat(summary.issued_quantity)}</ReportSummaryCard>
          <ReportSummaryCard label="رصيد آخر المدة" highlight>{numberFormat(summary.closing_balance)}</ReportSummaryCard>
        </div>
        <section className="report-results item-card-movements">
          <div className="item-card-movement-heading"><h3>سجل الحركات <span className="item-card-count">{numberFormat(rows.length)}</span></h3><p>الكميات بوحدة السند · الرصيد والإجماليات بالوحدة الرئيسية</p></div>
          <div className="item-card-grid print:hidden">
            {loading ? <div className="item-card-empty" role="status"><Loader2 className="animate-spin" /><p>جاري تحميل حركات الصنف...</p></div> : !hasReport ? <div className="item-card-empty"><FileBarChart size={36} /><p>حدد الفترة والأصناف ثم اضغط عرض التقرير</p></div> : <>
              {!rows.length && <p className="px-4 py-2 text-xs text-muted-foreground">لا توجد حركات خلال الفترة المحددة؛ يظهر الرصيد المرحّل أدناه.</p>}
              <DataGridView dataSource={displayRows} scheme={movementScheme} isReport hideSearch dontConvertToCards idProperty="id" onRowDoubleClick={openVoucher} defaultRowHeight={38} style={{ height: "clamp(360px, 52vh, 720px)" }} containerStyle={{ minWidth: 0 }} />
            </>}
          </div>
          {hasReport && <div className="item-card-print"><table><thead><tr>{columns.filter(column => column.visible !== false).map(column => <th key={column.name}>{column.header}</th>)}</tr></thead><tbody>{displayRows.map(row => <tr key={row.id}>{columns.filter(column => column.visible !== false).map(column => <td key={column.name}>{cell(row, column)}</td>)}</tr>)}</tbody></table></div>}
          <div className="item-card-footnote print:hidden">اضغط على رقم السند أو انقر على الحركة مرتين لفتح السند.</div>
        </section>
      </section>
    </div>
  </ReportPage>
}
