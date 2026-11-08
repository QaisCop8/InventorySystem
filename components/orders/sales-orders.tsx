"use client"

import { tr, appDir } from "@/lib/i18n"
import { useState, useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/components/auth/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import UnifiedSalesOrder from "./unified-sales-order"
import { DraftOrderForm } from "@/components/order-drafts/draft-order-form"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SearchButton } from "@/components/search/search-button"
import { VoucherSearchButton, searchOnEnter } from "@/components/common/voucher-list-table"
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  MoreHorizontal,
  ShoppingCart,
  TrendingUp,
  Clock,
  CheckCircle,
  Calendar,
  User,
  DollarSign,
  ArrowUpRight,
  FileText,
  Loader2,
} from "lucide-react"
import { formatDateToBritish } from "@/lib/utils"
import { VoucherListHero } from "@/components/common/voucher-list-shell"
import Util from "../common/Util"
interface OrdersProps {
  isPurchase?: boolean;
}
interface SalesOrder {
  id: number
  order_number: string
  order_date: string
  customer_name: string
  customer_id: number
  order_status: number
  financial_status: string
  total_amount: number
  salesman: string
  delivery_datetime: string
  workflow_sequence_id: number
  currency_code: string
  exchange_rate: number
  notes: string
  created_at: string
  updated_at: string
  workflow_status?: string
  current_stage?: string
  priority_level?: string
  order_source?: string
  order_decision?: string
  delivery_date: string,
  currency_id: number,
  reference_number: string,
  received_by: string,
  customer_order_no: string,
  ser: number
  source_draft_id?: number | null
  source_draft_number?: string | null
}

interface OrderAnalytics {
  totalOrders: number
  pendingOrders: number
  completedOrders: number
  totalValue: number
  avgOrderValue: number
  todayOrders: number
  weeklyGrowth: number
  monthlyGrowth: number
}

export function SalesOrders({ isPurchase }: OrdersProps) {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [sourceDraft, setSourceDraft] = useState<any>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState("")

  const openSourceDraft = async (order: SalesOrder) => {
    if (!order.source_draft_id) return
    setDraftLoading(true)
    setDraftError("")
    try {
      const response = await fetch(`/api/order-drafts/${order.source_draft_id}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل المسودة"))
      setSourceDraft(data)
    } catch (error: any) {
      setDraftError(error.message || tr("تعذر تحميل المسودة"))
    } finally {
      setDraftLoading(false)
    }
  }
  type ViewType = "grid" | "list" | "kanban";
  const getSavedView = (): ViewType => {
    if (typeof window === "undefined") return "list"
    const saved = window.localStorage.getItem("currentView") as ViewType | null
    return saved === "grid" || saved === "list" || saved === "kanban" ? saved : "list"
  }

  const [state, setState] = useState<{
    fromSearch: boolean | undefined
    salesOrders: SalesOrder[];
    loading: boolean;
    error: string | null;
    selectedOrder: SalesOrder | null;
    currentView: "grid" | "list" | "kanban";
    showNewOrderDialog: boolean;
    filters: {
      search: string;
      status: string;
      financial_status: string;
      salesman: string;
      dateFrom: string;
      dateTo: string;
      customer: string;
      workflow_status: string;
      order_source: string;
    };
    sortBy: string;
    sortOrder: "asc" | "desc";
  }>({
    fromSearch: false,
    salesOrders: [],
    loading: true,
    error: null, // ✅ string or null
    selectedOrder: null,
    currentView: getSavedView(),
    showNewOrderDialog: false,
    filters: {
      search: "",
      status: "0",
      financial_status: "0",
      salesman: "all",
      dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
      dateTo: new Date().toISOString().split("T")[0],
      customer: "all",
      workflow_status: "0",
      order_source: "0",
    },
    sortBy: "created_at",
    sortOrder: "desc",
  })


  const filteredOrders = useMemo(() => {

    const filtered = state.salesOrders.filter((order) => {
      if (
        state.filters.search &&
        !order.customer_name?.toLowerCase().includes(state.filters.search.toLowerCase()) &&
        !order.order_number?.toLowerCase().includes(state.filters.search.toLowerCase()) &&
        !order.reference_number?.toLowerCase().includes(state.filters.search.toLowerCase()) &&
        !order.received_by?.toLowerCase().includes(state.filters.search.toLowerCase()) &&
        !order.customer_order_no?.toLowerCase().includes(state.filters.search.toLowerCase())
      ) {
        return false
      }
      if (Number(state.filters.status) !== 0 && Number(order.order_status) !== Number(state.filters.status)) {
        return false
      }
      if (Number(state.filters.financial_status) !== 0 && Number(order.financial_status) !== Number(state.filters.financial_status)) {
        return false
      }
      if (state.filters.salesman !== "all" && order.salesman !== state.filters.salesman) {
        return false
      }
      const orderDate = new Date(order.order_date);
      const fromDate = state.filters.dateFrom ? new Date(state.filters.dateFrom) : null;
      const toDate = state.filters.dateTo ? new Date(state.filters.dateTo) : null;

      // remove time part
      orderDate.setHours(0, 0, 0, 0);
      if (fromDate) fromDate.setHours(0, 0, 0, 0);
      if (toDate) toDate.setHours(0, 0, 0, 0);

      if (fromDate && orderDate < fromDate) {
        return false;
      }

      if (toDate && orderDate > toDate) {
        return false;
      }
      if (state.filters.order_source !== "0" && Number(order.order_decision) !== Number(state.filters.order_source)) {
        return false
      }
      return true
    })

    filtered.sort((a, b) => {
      let aValue = a[state.sortBy as keyof SalesOrder]
      let bValue = b[state.sortBy as keyof SalesOrder]

      // Force total_amount to be a number
      if (state.sortBy === "total_amount") {
        aValue = Number(aValue)
        bValue = Number(bValue)
      } else {
        // Convert other types to string for safe comparison
        aValue = typeof aValue === "number" ? aValue : String(aValue)
        bValue = typeof bValue === "number" ? bValue : String(bValue)
      }

      if (state.sortOrder === "asc") {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0
      }
    })



    return filtered
  }, [state.salesOrders, state.filters, state.sortBy, state.sortOrder])

  // الحقول تعدّل مسودة فقط؛ زر «بحث» (أو Enter) يعيد جلب الطلبيات ثم يطبّقها. أي تغيير على الفلاتر المطبّقة
  // (إعادة تعيين/تاريخ البداية الافتراضي) ينعكس على المسودة.
  const [filterDraft, setFilterDraft] = useState(state.filters)
  const [searching, setSearching] = useState(false)
  useEffect(() => { setFilterDraft(state.filters) }, [state.filters])
  const runSearch = async () => {
    if (searching) return
    const applied = filterDraft
    setSearching(true)
    try {
      await fetchSalesOrders()
      setState((prev) => ({ ...prev, filters: applied }))
    } finally {
      setSearching(false)
    }
  }
  const setDraftFilter = (patch: Partial<typeof filterDraft>) => setFilterDraft((prev) => ({ ...prev, ...patch }))

  // تاريخ البداية الافتراضي = أقدم طلبية — عند أول تحميل فقط (لا يُلغي تاريخاً اختاره المستخدم عند إعادة الجلب)
  const initialDateFromAppliedRef = useRef(false)
  useEffect(() => {

    const orders = state.salesOrders || [];
    if (orders.length === 0 || initialDateFromAppliedRef.current) return;
    initialDateFromAppliedRef.current = true
    const firstDate = new Date(
      Math.min(...orders.map(o => new Date(o.order_date).getTime()))
    )
      .toISOString()
      .split("T")[0];

    setState((prev) => ({
      ...prev,
      filters: { ...prev.filters, dateFrom: firstDate },
    }))
  }, [state.salesOrders]);


  const analytics = useMemo((): OrderAnalytics => {
    const totalOrders = state.salesOrders.length
    const pendingOrders = state.salesOrders.filter((o) => Number(o.order_status) !== 4).length
    const completedOrders = state.salesOrders.filter((o) => Number(o.order_status) === 4).length
    const totalValue = state.salesOrders.reduce((sum, o) => {
      const amount = Number(o.total_amount) || 0;
      const rate = Number(o.exchange_rate) || 1;

      return sum + amount * rate;
    }, 0);
    const avgOrderValue = totalOrders > 0 ? totalValue / totalOrders : 0

    const today = new Date().toISOString().split("T")[0]
    const todayOrders = state.salesOrders.filter((o) => o.order_date === today).length

    const weeklyGrowth = 12.5
    const monthlyGrowth = 8.3

    return {
      totalOrders,
      pendingOrders,
      completedOrders,
      totalValue,
      avgOrderValue,
      todayOrders,
      weeklyGrowth,
      monthlyGrowth,
    }
  }, [state.salesOrders])
  const hasFetched = useRef(false);
  const openedOrderFromReportRef = useRef(0)
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchSalesOrders()
    console.log("AAAAA")
  }, [])
  useEffect(() => {
    if (!isPurchase) return
    const token = searchParams.get("purchase_prefill")
    if (!token) return
    try {
      const raw = localStorage.getItem(token)
      if (!raw) return
      const payload = JSON.parse(raw)
      localStorage.removeItem(token)
      setState((prev) => ({ ...prev, showNewOrderDialog: true, fromSearch: false, selectedOrder: { id: 0, order_number: "", order_date: new Date().toISOString(), customer_name: payload.supplier_name || "", customer_id: Number(payload.supplier_account_id) || 0, total_amount: 0, order_status: 1, financial_status: "unpaid", salesman: "", delivery_date: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), printed: 0, is_exported: 0, items: payload.items || [], general_notes: payload.notes || (payload.source_draft_number ? `احتياج مواد للمسودة ${payload.source_draft_number}` : "احتياج مواد تصنيع") } as any }))
    } catch (error) {
      console.error("Failed to load purchase shortage prefill", error)
    }
  }, [isPurchase, searchParams])
  useEffect(() => {
    if (state.showNewOrderDialog === false) fetchSalesOrders()
  }, [state.showNewOrderDialog])
  useEffect(() => {
    if (isPurchase || !state.salesOrders.length) return
    const orderId = Number(searchParams.get("open_order_id") || 0)
    if (!orderId || openedOrderFromReportRef.current === orderId) return
    const order = state.salesOrders.find((item) => Number(item.id) === orderId)
    if (!order) return
    openedOrderFromReportRef.current = orderId
    setState((prev) => ({ ...prev, showNewOrderDialog: true, selectedOrder: order, fromSearch: true }))
  }, [isPurchase, searchParams, state.salesOrders])

  const fetchSalesOrders = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(`/api/orders/sales?type=${isPurchase ? 2 : 1}`);
      console.log("response  ", response)
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || (!isPurchase ? tr("فشل في تحميل طلبيات المبيعات") : tr("فشل في تحميل طلبيات المشتريات")));
      }

      const numberedData = Array.isArray(data)
        ? data.map((order, index) => ({ ...order, ser: index + 1 }))
        : [];
      setState(prev => ({
        ...prev,
        salesOrders: numberedData,
      }));

    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : tr("حدث خطأ غير متوقع"),
        salesOrders: [],
      }));
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };




  const getStatusBadge = (status: string) => {
    const statusConfig = {
      notCompleted: {
        label: tr("غير جاهزة"),
        variant: "secondary",
        className: "bg-amber-100 text-amber-800 border-amber-200",
      },
      Completed: {
        label: tr("جاهزة"),
        variant: "secondary",
        className: "bg-emerald-100 text-emerald-800 border-emerald-200",
      },
      cancelled: { label: tr("ملغاة"), variant: "secondary", className: "bg-red-100 text-red-800 border-red-200" },
      sentPartially: {
        label: tr("مرسلة جزئيا"),
        variant: "secondary",
        className: "bg-blue-100 text-blue-800 border-blue-200",
      },
      sent: {
        label: tr("مرسلة كليا"),
        variant: "secondary",
        className: "bg-blue-100 text-blue-800 border-blue-200",
      },
    }
    let status_name = ''
    if (status === '1') {
      status_name = 'notCompleted'

    }
    else if (status === '2') {
      status_name = 'Completed'

    }
    else if (status === '3') {
      status_name = 'sentPartially'
    }
    else if (status === '4') {
      status_name = 'sent'
    }
    else if (status === '5') {
      status_name = 'cancelled'
    }
    const config = statusConfig[status_name as keyof typeof statusConfig] || {
      label: status_name,
      variant: "secondary",
      className: "",
    }

    return (
      <Badge variant={config.variant as any} className={config.className}>
        {config.label}
      </Badge>
    )
  }

  const getFinancialStatusBadge = (status: string) => {
    const statusConfig = {
      paid: { label: tr("مدفوع"), className: "bg-green-100 text-green-800 border-green-200" },
      partial: { label: tr("مدفوع جزئياً"), className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
      unpaid: { label: tr("غير مدفوع"), className: "bg-red-100 text-red-800 border-red-200" },
    }

    const config = statusConfig[status as keyof typeof statusConfig] || { label: status, className: "" }

    return (
      <Badge variant="secondary" className={config.className}>
        {config.label}
      </Badge>
    )
  }

  const getWorkflowStatusBadge = (status: string) => {
    const statusConfig = {
      "في الانتظار": { className: "bg-gray-100 text-gray-800 border-gray-200" },
      "قيد المراجعة": { className: "bg-blue-100 text-blue-800 border-blue-200" },
      "تم الموافقة": { className: "bg-green-100 text-green-800 border-green-200" },
      مرفوض: { className: "bg-red-100 text-red-800 border-red-200" },
    }

    const config = statusConfig[status as keyof typeof statusConfig] || { className: "" }

    return (
      <Badge variant="secondary" className={config.className}>
        {status}
      </Badge>
    )
  }

  const getPriorityBadge = (priority: string) => {
    const priorityConfig = {
      عالي: { className: "bg-red-100 text-red-800 border-red-200" },
      متوسط: { className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
      منخفض: { className: "bg-green-100 text-green-800 border-green-200" },
    }

    const config = priorityConfig[priority as keyof typeof priorityConfig] || { className: "" }

    return (
      <Badge variant="secondary" className={config.className}>
        {priority}
      </Badge>
    )
  }

  const getOrderSourceBadge = (source: string) => {
    const sourceConfig = {
      manual: { label: tr("إدخال يدوي"), className: "bg-blue-100 text-blue-800 border-blue-200" },
      customer_portal: { label: tr("من العملاء"), className: "bg-green-100 text-green-800 border-green-200" },
      api_import: { label: tr("استيراد API"), className: "bg-purple-100 text-purple-800 border-purple-200" },
    }

    const config = sourceConfig[source as keyof typeof sourceConfig] || {
      label: source,
      className: "bg-gray-100 text-gray-800 border-gray-200",
    }

    return (
      <Badge variant="secondary" className={config.className}>
        {config.label}
      </Badge>
    )
  }

  const getPriorityColor = (amount: number) => {
    if (amount > 10000) return "text-red-600"
    if (amount > 5000) return "text-amber-600"
    return "text-green-600"
  }
  const handleViewChange = (view: "grid" | "list") => {
    setState((prev) => ({ ...prev, currentView: view }));
    localStorage.setItem("currentView", view);
  };
  const resetFilters = () => {
    setState((prev) => ({
      ...prev,
      filters: {
        search: "",
        status: "0",
        financial_status: "0",
        salesman: "all",
        dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
        dateTo: new Date().toISOString().split("T")[0],
        customer: "all",
        workflow_status: "0",
        order_source: "0",
      },
    }))
  }

  const handleSearchOrder = (order: SalesOrder) => {
    setState((prev) => ({
      ...prev,
      showNewOrderDialog: true,
      selectedOrder: order,
      fromSearch: true,
    }))
  }
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 9; // adjust as needed

  const totalPages = Math.ceil(filteredOrders.length / pageSize);

  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredOrders]);
  // الدخول لشاشة طلبية المشتريات يفحصه TransactionAccessGate (app/page.tsx) بصلاحية "الدخول لشاشة طلبية مشتريات".
  // كان هنا فحص قديم بمعرّف الصلاحية 12 ("الدخول لشاشة طلبيات المشتريات") — تحذفه مزامنة الصلاحيات كمكرر
  // (LEGACY_DUPLICATE_PERMISSION_NAMES) فكان يمنع الجميع من الشاشة.
  // التحميل الأول فقط يملأ الصفحة؛ إعادة الجلب (بحث/بعد الحفظ) تُظهر طبقة تحميل فوق القائمة فتبقى الفلاتر ظاهرة
  if (state.loading && !state.salesOrders.length && !searching) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir={appDir()}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{tr("جاري تحميل البيانات...")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-full space-y-6" dir={appDir()}>
      {state.error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{state.error}</div>}
      {/* Header Section — نفس ترويسة شاشات الحركات (VoucherListHero) */}
      <VoucherListHero
        title={isPurchase ? tr("طلبيات المشتريات") : tr("طلبيات المبيعات")}
        subtitle={isPurchase ? tr("إدارة وتتبع جميع طلبيات المشتريات بكفاءة عالية") : tr("إدارة وتتبع جميع طلبيات المبيعات بكفاءة عالية")}
        category={tr("الطلبيات")}
        icon={ShoppingCart}
        addLabel={tr("طلبية جديدة")}
        onNew={() => setState((prev) => ({ ...prev, showNewOrderDialog: true, selectedOrder: null, fromSearch: false }))}
      />

      {/* Analytics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-700 text-sm font-medium">{tr("إجمالي الطلبيات")}</p>
                <p className="text-3xl font-bold text-blue-900">{analytics.totalOrders}</p>
                <div className="flex items-center mt-2">
                  <ArrowUpRight className="h-4 w-4 text-blue-500" />
                  <span className="text-blue-600 text-xs">+{analytics.weeklyGrowth}{tr("% هذا الأسبوع")}</span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/70 ring-1 ring-blue-200 flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-700 text-sm font-medium">{tr("قيد التنفيذ")}</p>
                <p className="text-3xl font-bold text-amber-900">{analytics.pendingOrders}</p>
                <div className="flex items-center mt-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-amber-600 text-xs">{tr("يحتاج متابعة")}</span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/70 ring-1 ring-amber-200 flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-700 text-sm font-medium">{tr("مكتملة")}</p>
                <p className="text-3xl font-bold text-emerald-900">{analytics.completedOrders}</p>
                <div className="flex items-center mt-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="text-emerald-600 text-xs">
                    {tr("معدل الإنجاز ")}{analytics.totalOrders ? Math.round((analytics.completedOrders / analytics.totalOrders) * 100) : 0}%
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/70 ring-1 ring-emerald-200 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-700 text-sm font-medium">{tr("إجمالي القيمة")}</p>
                <p className="text-3xl font-bold text-purple-900">{analytics.totalValue.toLocaleString("en-US")}</p>
                <div className="flex items-center mt-2">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                  <span className="text-purple-600 text-xs">{tr("متوسط ")}{analytics.avgOrderValue.toLocaleString("en-US")} </span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/70 ring-1 ring-purple-200 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Filters */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <Filter className="h-5 w-5" />
            {tr("البحث والتصفية المتقدمة")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4" onKeyDown={searchOnEnter(() => void runSearch())}>
            <div className="lg:col-span-2">
              <Label className="text-slate-700 font-medium">{tr("البحث الذكي")}</Label>
              <div className="relative">
                <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder={tr("رقم الطلبية، اسم العميل، السند اليدوي , استلمت بواسطة...")}
                  value={filterDraft.search}
                  onChange={(e) => setDraftFilter({ search: e.target.value })}
                  className="ps-10 bg-white border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-700 font-medium">{tr("حالة الطلبية")}</Label>
              <Select
                value={filterDraft.status}
                onValueChange={(value) => setDraftFilter({ status: value })}
              >
                <SelectTrigger className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{tr("جميع الحالات")}</SelectItem>
                  <SelectItem value="1">{tr("غير جاهزة")}</SelectItem>
                  <SelectItem value="2">{tr("جاهزة")}</SelectItem>
                  <SelectItem value="3">{tr("مرسلة جزئيا")}</SelectItem>
                  <SelectItem value="4">{tr("مرسلة كليا")}</SelectItem>

                </SelectContent>
              </Select>
            </div>



            <div>
              <Label className="text-slate-700 font-medium">{tr("قرار الإدارة")}</Label>
              <Select
                value={filterDraft.order_source}
                onValueChange={(value) => setDraftFilter({ order_source: value })}
              >
                <SelectTrigger className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{tr("جميع الحالات")}</SelectItem>
                  <SelectItem value="1">{tr("مقبول")}</SelectItem>
                  <SelectItem value="2">{tr("مرفوض")}</SelectItem>
                  <SelectItem value="3">{tr("مؤجل")}</SelectItem>
                  <SelectItem value="4">{tr("معتمدة")}</SelectItem>
                  <SelectItem value="5">{tr("مدققة")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-700 font-medium">{tr("من تاريخ")}</Label>
              <Input
                type="date"
                value={filterDraft.dateFrom}
                onChange={(e) => setDraftFilter({ dateFrom: e.target.value })}
                className="bg-white border-slate-200"
              />
            </div>

            <div>
              <Label className="text-slate-700 font-medium">{tr("إلى تاريخ")}</Label>
              <Input
                type="date"
                value={filterDraft.dateTo}
                onChange={(e) => setDraftFilter({ dateTo: e.target.value })}
                className="bg-white border-slate-200"
              />
            </div>
          </div>

          <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-200">
            <div className="flex gap-2">
              <Button
                variant={state.currentView === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => handleViewChange("grid")}
              >
                {tr("شبكة")}
              </Button>
              <Button
                variant={state.currentView === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => handleViewChange("list")}
              >
                {tr("قائمة")}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={resetFilters} className="bg-white">
                {tr("إعادة تعيين")}
              </Button>
              <VoucherSearchButton onClick={() => void runSearch()} loading={searching} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Display */}
      <Card className="relative shadow-sm" aria-busy={state.loading}>
        {state.loading && (
          <div role="status" aria-live="polite" className="absolute inset-0 z-[2] flex items-start justify-center rounded-[inherit] bg-white/70 pt-24 backdrop-blur-[1px] dark:bg-slate-900/70">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              {tr("جاري تحميل البيانات...")}
            </div>
          </div>
        )}
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-slate-800">{tr("قائمة الطلبيات")}</CardTitle>
              <CardDescription className="text-slate-600">
                {tr("عرض ")}{filteredOrders.length}{tr(" من أصل ")}{state.salesOrders.length}{tr(" طلبية")}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select
                value={`${state.sortBy}-${state.sortOrder}`}
                onValueChange={(value) => {
                  const [sortBy, sortOrder] = value.split("-")
                  setState((prev) => ({ ...prev, sortBy, sortOrder: sortOrder as "asc" | "desc" }))
                }}
              >
                <SelectTrigger className="w-48 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at-desc">{tr("الأحدث أولاً")}</SelectItem>
                  <SelectItem value="created_at-asc">{tr("الأقدم أولاً")}</SelectItem>
                  <SelectItem value="total_amount-desc">{tr("الأعلى قيمة")}</SelectItem>
                  <SelectItem value="total_amount-asc">{tr("الأقل قيمة")}</SelectItem>
                  <SelectItem value="customer_name-asc">{tr("اسم العميل أ-ي")}</SelectItem>
                  <SelectItem value="customer_name-desc">{tr("اسم العميل ي-أ")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto h-24 w-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <ShoppingCart className="h-12 w-12 text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-800 mb-2">{tr("لا توجد طلبيات")}</h3>
              <p className="text-slate-600 mb-6">
                {tr("لم يتم العثور على أي طلبات تطابق معايير البحث")}
              </p>
              <Button
                className="flex items-center gap-2"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    showNewOrderDialog: true,
                    selectedOrder: null,
                    fromSearch: false,
                  }))
                }
              >
                <Plus className="me-2 h-4 w-4" />
                {tr("إنشاء طلبية جديدة")}
              </Button>
            </div>
          ) : state.currentView === "grid" ? (
            <>
              {/* GRID VIEW */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedOrders.map((order) => (
                  <Card
                    key={order.id}
                    className="border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-md"
                  >
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-bold text-slate-800 text-lg">
                            {order.order_number}
                          </h3>
                          <p className="text-slate-600 text-sm">
                            {formatDateToBritish(order.order_date)}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2">
                          {getStatusBadge(String(order.order_status))}
                          {order.financial_status &&
                            getFinancialStatusBadge(order.financial_status)}
                          {order.workflow_status &&
                            getWorkflowStatusBadge(order.workflow_status)}
                          {order.priority_level &&
                            getPriorityBadge(order.priority_level)}
                          {order.order_source &&
                            getOrderSourceBadge(order.order_source)}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-500" />
                          <span className="text-slate-700 font-medium">
                            {order.customer_name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-slate-500" />
                          <span
                            className={`font-bold text-lg ${getPriorityColor(
                              order.total_amount
                            )}`}
                          >
                            {order.total_amount?.toLocaleString("en-US")}{" "}
                            {order.currency_code || ""}
                          </span>
                        </div>

                        {order.salesman && (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                                {order.salesman.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-slate-600 text-sm">
                              {order.salesman}
                            </span>
                          </div>
                        )}

                        {order.delivery_datetime && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-slate-500" />
                            <span className="text-slate-600 text-sm">
                              {tr("تسليم: ")}{formatDateToBritish(order.delivery_datetime)}
                            </span>
                          </div>
                        )}

                        {order.current_stage && (
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-slate-500" />
                            <span className="text-slate-600 text-sm">
                              {tr("المرحلة: ")}{order.current_stage}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100">
                        <div className="flex gap-2">
                          {order.source_draft_id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              disabled={draftLoading}
                              onClick={() => void openSourceDraft(order)}
                            >
                              <FileText className="me-1 h-4 w-4" />
                              {tr("فتح المسودة")}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="bg-white"
                            onClick={() => handleSearchOrder(order)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="bg-white"
                            onClick={() => handleSearchOrder(order)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* LIST VIEW */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-start p-4">##</th>
                      <th className="text-start p-4">{tr("رقم الطلبية")}</th>
                      <th className="text-start p-4">{tr("التاريخ")}</th>
                      <th className="text-start p-4">{tr("العميل")}</th>
                      <th className="text-start p-4">{tr("الحالة")}</th>
                      <th className="text-start p-4">{tr("السند اليدوي")}</th>
                      <th className="text-start p-4">{tr("رقم طلبية العميل")}</th>
                      <th className="text-start p-4">{tr("المبلغ")}</th>
                      <th className="text-start p-4">{tr("استلمت بواسطة")}</th>
                      <th className="text-center p-4">{tr("الإجراءات")}</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b border-slate-100 hover:bg-slate-50/50"
                      >
                        <td className="p-4">{order.ser}</td>
                        <td className="p-4">{order.order_number}</td>
                        <td className="p-4">
                          {formatDateToBritish(order.order_date)}
                        </td>
                        <td className="p-4">{order.customer_name}</td>
                        <td className="p-4">
                          {getStatusBadge(String(order.order_status))}
                        </td>
                        <td className="p-4">{order.reference_number}</td>
                        <td className="p-4">{order.customer_order_no}</td>
                        <td className="p-4">
                          <span
                            className={`font-bold ${getPriorityColor(
                              order.total_amount
                            )}`}
                          >
                            {order.total_amount?.toLocaleString("en-US")}{" "}
                            {order.currency_code || ""}
                          </span>
                        </td>
                        <td className="p-4">{order.received_by}</td>

                        <td className="p-4">
                          <div className="flex justify-center gap-2">
                            {order.source_draft_id && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                disabled={draftLoading}
                                onClick={() => void openSourceDraft(order)}
                              >
                                <FileText className="me-1 h-4 w-4" />
                                {tr("فتح المسودة")}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSearchOrder(order)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSearchOrder(order)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* PAGINATION CONTROLS */}
          {filteredOrders.length > pageSize && (
            <div className="flex justify-center items-center gap-3 mt-6">
              <Button
                variant="outline"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                {tr("السابق")}
              </Button>

              <div className="text-sm text-slate-600">
                {tr("صفحة ")}{currentPage}{tr(" من ")}{totalPages}
              </div>

              <Button
                variant="outline"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                {tr("التالي")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Order Dialog */}
      {state.showNewOrderDialog && (
        <UnifiedSalesOrder
          open={state.showNewOrderDialog}
          onOpenChange={(open) =>
            setState((prev) => ({
              ...prev,
              showNewOrderDialog: open,
              selectedOrder: null,
              fromSearch: false,
            }))
          }
          order={state.selectedOrder}
          fromSearch={state.fromSearch}
          allOrders={state.salesOrders as any}
          onOrderSaved={() => fetchSalesOrders()}
          vch_type={isPurchase ? 2 : 1}
          onCancel={() => {
            setState((prev) => ({
              ...prev,
              showNewOrderDialog: false,
              selectedOrder: null,
              fromSearch: false,
            }));
          }}
        />
      )}
      <Dialog open={!!sourceDraft} onOpenChange={(open) => !open && setSourceDraft(null)}>
        <DialogContent className="max-h-[94vh] w-[calc(100%-1rem)] max-w-[1400px] overflow-x-hidden overflow-y-auto p-0" dir={appDir()}>
          <DialogHeader className="sticky top-0 z-10 border-b bg-background px-6 py-4">
            <DialogTitle>{tr("المسودة الأصلية ")}{sourceDraft?.draft_number}</DialogTitle>
          </DialogHeader>
          {sourceDraft && <DraftOrderForm initialDraft={sourceDraft} readOnly />}
        </DialogContent>
      </Dialog>
      {draftError && (
        <div className="fixed bottom-5 end-5 z-[100] rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg">
          {draftError}
        </div>
      )}
    </div>
  )
}



