"use client"

import { tr, appDir } from "@/lib/i18n"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarClock, Package, RefreshCw, Search, ShoppingCart, TrendingUp } from "lucide-react"
import { VoucherListHero } from "@/components/common/voucher-list-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import Dropdown from "@/components/common/Dropdown"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/components/auth/auth-context"

type PlanningProduct = {
  id: number
  product_code: string
  product_name: string
  supplier_id: number | null
  supplier_name: string | null
  supplier_account_id: number | null
  default_store: number | null
  current_stock: number
  reserved_stock: number
  available_stock: number
  reorder_point: number
  max_stock_level: number
  last_purchase_price: number | null
  can_view_purchase_price: boolean
  purchase_currency_name: string
  unit_id: number | null
  unit_name: string | null
  sold_quantity: number
  incoming_quantity: number
}

const finite = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const formatNumber = (value: number, maximumFractionDigits = 2) =>
  value.toLocaleString("en-US", { maximumFractionDigits })

export function PurchasePlanning() {
  const { isAuthenticated, isLoading: authLoading, activeBranchId } = useAuth()
  const [products, setProducts] = useState<PlanningProduct[]>([])
  const [periodDays, setPeriodDays] = useState(90)
  const [coverageDays, setCoverageDays] = useState(30)
  const [selected, setSelected] = useState<number[]>([])
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [query, setQuery] = useState("")
  const [supplierFilter, setSupplierFilter] = useState("all")
  const [stockFilter, setStockFilter] = useState("needs-order")
  const [salesHistoryAvailable, setSalesHistoryAvailable] = useState(true)
  const [purchaseOrdersAvailable, setPurchaseOrdersAvailable] = useState(true)
  const [canCreatePurchaseOrder, setCanCreatePurchaseOrder] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError("")
    try {
      const headers = new Headers()
      if (activeBranchId != null) headers.set("x-branch-id", String(activeBranchId))
      const response = await fetch(`/api/inventory/purchase-planning?days=${periodDays}`, { cache: "no-store", headers })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || tr("تعذر تحميل بيانات التخطيط"))
      const nextProducts = Array.isArray(payload.products) ? payload.products : []
      setProducts(nextProducts)
      setPeriodDays(Number(payload.period_days) || periodDays)
      setSalesHistoryAvailable(payload.sales_history_available !== false)
      setPurchaseOrdersAvailable(payload.purchase_orders_available !== false)
      setCanCreatePurchaseOrder(payload.can_create_purchase_order === true)
      const initialSelected: number[] = []
      const nextQuantities: Record<number, number> = {}
      nextProducts.forEach((product: PlanningProduct) => {
        const quantity = suggestedQuantity(product, coverageDays, Number(payload.period_days) || periodDays)
        nextQuantities[product.id] = quantity
        if (quantity > 0) initialSelected.push(product.id)
      })
      setQuantities(nextQuantities)
      setSelected(initialSelected)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : tr("تعذر تحميل بيانات التخطيط"))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeBranchId, coverageDays, periodDays])

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      setError(tr("يجب تسجيل الدخول"))
      setLoading(false)
      return
    }
    void load()
  }, [authLoading, isAuthenticated, load])

  const suggestions = useMemo(() => products.map((product) => {
    const available = finite(product.available_stock)
    const incoming = finite(product.incoming_quantity)
    const averageDaily = finite(product.sold_quantity) / Math.max(1, periodDays)
    const targetForDemand = averageDaily * coverageDays
    const targetForReorder = finite(product.reorder_point) > 0 && available + incoming <= finite(product.reorder_point)
      ? Math.max(finite(product.max_stock_level), finite(product.reorder_point))
      : 0
    const target = Math.max(targetForDemand, targetForReorder)
    const calculatedQuantity = Math.max(0, Math.ceil((target - available - incoming) * 1000) / 1000)
    const quantity = Object.prototype.hasOwnProperty.call(quantities, product.id)
      ? Math.max(0, finite(quantities[product.id]))
      : calculatedQuantity
    return {
      ...product,
      average_daily: averageDaily,
      days_of_cover: averageDaily > 0 ? (available + incoming) / averageDaily : null,
      calculated_quantity: calculatedQuantity,
      quantity,
      estimated_value: product.can_view_purchase_price ? quantity * finite(product.last_purchase_price) : null,
    }
  }), [products, periodDays, coverageDays, quantities])

  const suppliers = useMemo(() => {
    const unique = new Map<string, string>()
    products.forEach((product) => {
      if (product.supplier_id == null) return
      unique.set(String(product.supplier_id), product.supplier_name || "مورد بدون اسم")
    })
    return Array.from(unique.entries()).sort((left, right) => left[1].localeCompare(right[1], "ar"))
  }, [products])

  const filtered = useMemo(() => suggestions.filter((product) => {
    if (supplierFilter !== "all" && String(product.supplier_id || "") !== supplierFilter) return false
    if (stockFilter === "needs-order" && product.quantity <= 0) return false
    if (stockFilter === "out" && product.available_stock > 0) return false
    if (query && !`${product.product_name} ${product.product_code}`.toLowerCase().includes(query.trim().toLowerCase())) return false
    return true
  }), [suggestions, supplierFilter, stockFilter, query])

  const selectedRows = suggestions.filter((product) => selected.includes(product.id) && product.quantity > 0)
  const selectedQuantity = selectedRows.reduce((sum, product) => sum + product.quantity, 0)
  const selectedValue = selectedRows.reduce((sum, product) => sum + (product.estimated_value || 0), 0)
  const selectedCurrencies = new Set(selectedRows.map((product) => product.purchase_currency_name || "").filter(Boolean))
  const selectedValueAvailable = selectedRows.length > 0
    && selectedRows.every((product) => product.can_view_purchase_price)
    && selectedCurrencies.size <= 1
  const selectedCurrency = selectedCurrencies.values().next().value || ""
  const productsToOrder = suggestions.filter((product) => product.quantity > 0).length
  const outOfStock = suggestions.filter((product) => product.available_stock <= 0).length

  const setQuantity = (productId: number, value: string) => {
    const parsed = value === "" ? 0 : Number(value)
    setQuantities((current) => ({ ...current, [productId]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 }))
  }

  const toggleProduct = (productId: number, checked: boolean) => {
    setSelected((current) => checked
      ? current.includes(productId) ? current : [...current, productId]
      : current.filter((id) => id !== productId))
  }

  const toggleVisible = (checked: boolean) => {
    const visibleIds = filtered.map((product) => product.id)
    setSelected((current) => checked
      ? Array.from(new Set([...current, ...visibleIds]))
      : current.filter((id) => !visibleIds.includes(id)))
  }

  const createPurchaseOrder = () => {
    setMessage("")
    if (!canCreatePurchaseOrder) {
      setMessage(tr("لا تتوفر لديك صلاحية إنشاء طلبية مشتريات على الفرع الحالي."))
      return
    }
    if (!selectedRows.length) {
      setMessage(tr("اختر صنفاً واحداً على الأقل وحدد كمية أكبر من صفر."))
      return
    }
    const supplierIds = Array.from(new Set(selectedRows.map((item) => item.supplier_id || 0)))
    if (supplierIds.length > 1) {
      setMessage(tr("اجعل الأصناف المحددة من مورد واحد لإنشاء طلبية موحدة."))
      return
    }

    const supplier = selectedRows[0]
    const items = selectedRows.map((product) => ({
      product_id: product.id,
      product_code: product.product_code,
      product_name: product.product_name,
      qnty: product.quantity,
      quantity: product.quantity,
      unit_price: finite(product.last_purchase_price),
      unit_id: product.unit_id || 0,
      unit_name: product.unit_name || "",
      store_id: product.default_store || 0,
      item_status: 1,
    }))
    const token = `purchase-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(token, JSON.stringify({
      created_at: Date.now(),
      items,
      supplier_id: supplier.supplier_id || null,
      supplier_account_id: supplier.supplier_account_id || null,
      supplier_name: supplier.supplier_name || "",
      notes: `طلبية منشأة من تخطيط المشتريات الذكي — تغطية ${coverageDays} يومًا`,
    }))
    window.open(`/?section=purchase-orders&new=1&purchase_prefill=${encodeURIComponent(token)}`, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="flex flex-col gap-5 p-1 lg:h-full lg:min-h-0 lg:overflow-hidden" dir={appDir()}>
      {/* ترويسة موحّدة مع شاشات النظام (VoucherListHero) — بلا زر إضافة */}
      <VoucherListHero
        title={tr("تخطيط المشتريات الذكي")}
        subtitle={tr("اقتراح كميات الشراء حسب حركة البيع والمخزون والطلبيات المفتوحة.")}
        category={tr("ادارة الاصناف")}
        icon={TrendingUp}
        actions={<button type="button" onClick={() => void load(true)} disabled={loading || refreshing} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/20 focus:outline-none focus:ring-4 focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{tr("تحديث البيانات")}</button>}
      />

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>}
      {!salesHistoryAvailable && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{tr("لا تتوفر لديك صلاحية عرض فواتير المبيعات؛ ستُبنى التوصيات على حد إعادة الطلب والمخزون فقط.")}</div>}
      {!purchaseOrdersAvailable && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{tr("لا تتوفر لديك صلاحية استعلام طلبيات المشتريات المفتوحة؛ لن تُحتسب الكميات الواردة.")}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{tr("أصناف مقترحة للشراء")}</CardTitle><Package className="h-4 w-4 text-emerald-600" /></CardHeader><CardContent><div className="text-2xl font-bold">{formatNumber(productsToOrder, 0)}</div><p className="text-xs text-muted-foreground">{tr("بحسب مدة التغطية المختارة")}</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{tr("أصناف نافدة أو غير متاحة")}</CardTitle><AlertTriangle className="h-4 w-4 text-rose-600" /></CardHeader><CardContent><div className="text-2xl font-bold text-rose-700">{formatNumber(outOfStock, 0)}</div><p className="text-xs text-muted-foreground">{tr("بعد خصم المحجوز من الرصيد")}</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{tr("إجمالي الكمية المحددة")}</CardTitle><ShoppingCart className="h-4 w-4 text-blue-600" /></CardHeader><CardContent><div className="text-2xl font-bold">{formatNumber(selectedQuantity)}</div><p className="text-xs text-muted-foreground">{selectedRows.length}{tr(" صنف محدد")}</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{tr("التكلفة التقديرية")}</CardTitle><TrendingUp className="h-4 w-4 text-violet-600" /></CardHeader><CardContent><div className="text-2xl font-bold">{selectedValueAvailable ? `${formatNumber(selectedValue)} ${selectedCurrency}` : tr("غير متاحة")}</div><p className="text-xs text-muted-foreground">{tr("تظهر عند توفر الأسعار وبعملة موحدة")}</p></CardContent></Card>
      </div>

      <Card className="flex flex-col lg:min-h-0 lg:flex-1">
        <CardHeader className="gap-3 pb-3 md:flex-row md:items-end md:justify-between">
          <div><CardTitle>{tr("اقتراحات التوريد")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{tr("متوسط الاستهلاك محسوب من فواتير البيع النشطة خلال آخر ")}{periodDays}{tr(" يومًا.")}</p></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground">{tr("فترة المبيعات")}
              <div className="mt-1"><Dropdown id="purchase-planning-period" value={periodDays} options={[{ value: 90, label: tr("آخر 90 يومًا") }, { value: 180, label: tr("آخر 180 يومًا") }, { value: 365, label: tr("آخر سنة") }]} optionLabel="label" optionValue="value" onChange={(event) => setPeriodDays(Number(event.value))} /></div>
            </label>
            <label className="text-xs text-muted-foreground">{tr("التغطية المطلوبة")}
              <div className="mt-1"><Dropdown id="purchase-planning-coverage" value={coverageDays} options={[{ value: 30, label: tr("30 يومًا") }, { value: 60, label: tr("60 يومًا") }, { value: 90, label: tr("90 يومًا") }]} optionLabel="label" optionValue="value" onChange={(event) => setCoverageDays(Number(event.value))} /></div>
            </label>
            <label className="relative text-xs text-muted-foreground">{tr("بحث")}
              <Search className="absolute start-3 top-8 h-4 w-4 text-muted-foreground" />
              <Input className="mt-1 h-9 ps-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("اسم الصنف أو رقمه")} />
            </label>
            <label className="text-xs text-muted-foreground">{tr("المورد")}
              <div className="mt-1"><Dropdown id="purchase-planning-supplier" value={supplierFilter} options={[{ value: "all", label: tr("كل الموردين") }, ...suppliers.map(([id, name]) => ({ value: id, label: name }))]} optionLabel="label" optionValue="value" filter onChange={(event) => setSupplierFilter(String(event.value))} /></div>
            </label>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col lg:min-h-0 lg:flex-1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{tr("عرض:")}</span>
              <div className="w-48 shrink-0"><Dropdown id="purchase-planning-stock-filter" value={stockFilter} options={[{ value: "needs-order", label: tr("المقترح شراؤها") }, { value: "all", label: tr("كل الأصناف") }, { value: "out", label: tr("النافدة أو غير المتاحة") }]} optionLabel="label" optionValue="value" onChange={(event) => setStockFilter(String(event.value))} /></div>
            </div>
            {canCreatePurchaseOrder && <Button onClick={createPurchaseOrder} disabled={loading || selectedRows.length === 0}>
              <ShoppingCart className="me-2 h-4 w-4" />{tr(" إنشاء طلبية شراء للأصناف المحددة")}
            </Button>}
          </div>
          <Table className="[&_th]:text-start" containerClassName="rounded-lg border lg:min-h-48 lg:flex-1 lg:overflow-auto">
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background"><TableRow>
              <TableHead className="w-10"><Checkbox checked={filtered.length > 0 && filtered.every((row) => selected.includes(row.id))} onCheckedChange={(checked) => toggleVisible(checked === true)} aria-label={tr("تحديد الأصناف الظاهرة")} /></TableHead>
              <TableHead>{tr("الصنف")}</TableHead><TableHead>{tr("المورد")}</TableHead><TableHead>{tr("المتاح")}</TableHead><TableHead>{tr("الوارد بطلبات مفتوحة")}</TableHead><TableHead>{tr("مبيعات الفترة")}</TableHead><TableHead>{tr("متوسط يومي")}</TableHead><TableHead>{tr("تغطية المخزون")}</TableHead><TableHead>{tr("آخر سعر شراء")}</TableHead><TableHead className="min-w-28">{tr("الكمية المقترحة")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={10} className="h-28 text-center text-muted-foreground">{tr("جارٍ إعداد خطة الشراء...")}</TableCell></TableRow>
                : filtered.length === 0 ? <TableRow><TableCell colSpan={10} className="h-28 text-center text-muted-foreground">{tr("لا توجد أصناف مطابقة للبحث والمرشحات.")}</TableCell></TableRow>
                  : filtered.map((product) => <TableRow key={product.id}>
                    <TableCell><Checkbox checked={selected.includes(product.id)} onCheckedChange={(checked) => toggleProduct(product.id, checked === true)} aria-label={tr("تحديد {0}", product.product_name)} /></TableCell>
                    <TableCell><div className="font-medium">{product.product_name}</div><div className="text-xs text-muted-foreground">{product.product_code} · {product.unit_name || "—"}</div></TableCell>
                    <TableCell>{product.supplier_name || <span className="text-muted-foreground">{tr("غير محدد")}</span>}</TableCell>
                    <TableCell><div className="font-medium">{formatNumber(finite(product.available_stock))}</div><div className="text-xs text-muted-foreground">{tr("الرصيد ")}{formatNumber(finite(product.current_stock))}{tr(" · محجوز ")}{formatNumber(finite(product.reserved_stock))}</div></TableCell>
                    <TableCell>{formatNumber(finite(product.incoming_quantity))}</TableCell>
                    <TableCell>{formatNumber(finite(product.sold_quantity))}</TableCell>
                    <TableCell>{formatNumber(product.average_daily, 3)}</TableCell>
                    <TableCell>{product.days_of_cover == null ? <Badge variant="outline">{tr("لا توجد مبيعات")}</Badge> : <span className={product.days_of_cover <= coverageDays ? "font-semibold text-amber-700" : ""}><CalendarClock className="me-1 inline h-3.5 w-3.5" />{formatNumber(product.days_of_cover)}{tr(" يوم")}</span>}</TableCell>
                    <TableCell>{product.can_view_purchase_price ? `${formatNumber(finite(product.last_purchase_price))} ${product.purchase_currency_name || ""}` : <span className="text-muted-foreground">{tr("غير متاح")}</span>}</TableCell>
                    <TableCell><Input aria-label={tr("كمية الشراء المقترحة لـ {0}", product.product_name)} type="number" min="0" step="any" className="h-8 min-w-24 text-end" dir="ltr" value={quantities[product.id] ?? product.calculated_quantity} onChange={(event) => setQuantity(product.id, event.target.value)} /></TableCell>
                  </TableRow>)}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">{tr("الكمية المقترحة تغطي الاستهلاك المتوقع للفترة المحددة، وتراعي نقطة إعادة الطلب والمخزون الوارد. راجع الكميات والمورد قبل حفظ الطلبية.")}</p>
        </CardContent>
      </Card>
    </div>
  )
}

function suggestedQuantity(product: PlanningProduct, coverageDays: number, periodDays: number) {
  const available = finite(product.available_stock)
  const incoming = finite(product.incoming_quantity)
  const averageDaily = finite(product.sold_quantity) / Math.max(1, periodDays)
  const demandTarget = averageDaily * coverageDays
  const reorderTarget = finite(product.reorder_point) > 0 && available + incoming <= finite(product.reorder_point)
    ? Math.max(finite(product.max_stock_level), finite(product.reorder_point))
    : 0
  return Math.max(0, Math.ceil((Math.max(demandTarget, reorderTarget) - available - incoming) * 1000) / 1000)
}
