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
import { VoucherListTable, VoucherSearchButton, listToday, listYearStart, searchOnEnter } from "@/components/common/voucher-list-table"
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
import { SalesVoucherBoard, BoardSelectFilter } from "@/components/sales/sales-voucher-board"
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
      dateFrom: listYearStart(),
      dateTo: listToday(),
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
  const runSearch = async (override?: typeof filterDraft) => {
    if (searching) return
    const applied = override ?? filterDraft
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

    // الفترة الافتراضية من 1/1 للسنة الحالية حتى اليوم (كانت تُستبدل بتاريخ أقدم طلبية)
    void firstDate
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
        dateFrom: listYearStart(),
        dateTo: listToday(),
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
    <div className="voucher-list-page w-full max-w-full space-y-6" dir={appDir()}>
      {state.error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{state.error}</div>}
      {/* Header Section — نفس ترويسة شاشات الحركات (VoucherListHero) */}
      <VoucherListHero variant="board"
        title={isPurchase ? tr("طلبيات المشتريات") : tr("طلبيات المبيعات")}
        subtitle={isPurchase ? tr("إدارة وتتبع جميع طلبيات المشتريات بكفاءة عالية") : tr("إدارة وتتبع جميع طلبيات المبيعات بكفاءة عالية")}
        category={tr("الطلبيات")}
        icon={ShoppingCart}
        addLabel={tr("طلبية جديدة")}
        onNew={() => setState((prev) => ({ ...prev, showNewOrderDialog: true, selectedOrder: null, fromSearch: false }))}
      />

      {/* تصميم 2026-11-21: نفس لوحة فواتير المبيعات (components/sales/sales-voucher-board) — البحث الذكي في خانة البحث */}
      <SalesVoucherBoard
        title={isPurchase ? tr("طلبيات المشتريات") : tr("طلبيات المبيعات")}
        rows={filteredOrders.map((order: any) => {
          const status = Number(order.order_status)
          return {
            id: Number(order.id), vch_code: order.order_number, vch_date: String(order.order_date || "").slice(0, 10), amount: Number(order.total_amount || 0),
            party: order.customer_name, currency: order.currency_code || "",
            note: [order.customer_order_no && tr("طلبية العميل {0}", order.customer_order_no), order.reference_number && tr("السند اليدوي {0}", order.reference_number), order.received_by && tr("استلمها {0}", order.received_by)].filter(Boolean).join(" · ") || undefined,
            voucher_status: ({ 1: tr("غير جاهزة"), 2: tr("جاهزة"), 3: tr("مرسلة جزئيا"), 4: tr("مرسلة كليا"), 5: tr("ملغاة") } as Record<number, string>)[status] || "",
            tone: status === 5 ? "cancelled" as const : status === 4 ? "approved" as const : status === 3 ? "linked" as const : "draft" as const,
            extra: order.source_draft_id ? <button type="button" disabled={draftLoading} onClick={() => void openSourceDraft(order)}><FileText size={13} />{tr("فتح المسودة")}</button> : undefined,
          }
        })}
        totalCount={state.salesOrders.length}
        partyLabel={isPurchase ? tr("المورد") : tr("العميل")}
        loading={state.loading || searching}
        searchPlaceholder={tr("رقم الطلبية، اسم العميل، السند اليدوي...")}
        draft={{ code: filterDraft.search, dateFrom: filterDraft.dateFrom, dateTo: filterDraft.dateTo }}
        setDraft={(update) => setFilterDraft((prev) => { const next = update({ code: prev.search, dateFrom: prev.dateFrom, dateTo: prev.dateTo }); return { ...prev, search: next.code, dateFrom: next.dateFrom, dateTo: next.dateTo } })}
        onSearch={(next) => void runSearch(next ? { ...filterDraft, search: next.code, dateFrom: next.dateFrom, dateTo: next.dateTo } : undefined)}
        onOpen={(row) => { const order = filteredOrders.find((item: any) => Number(item.id) === Number(row.id)); if (order) handleSearchOrder(order) }}
        extraFilters={<>
          <BoardSelectFilter label={tr("حالة الطلبية")} value={filterDraft.status} onChange={(value) => setDraftFilter({ status: value })}
            options={[{ value: "0", label: tr("كل الحالات") }, { value: "1", label: tr("غير جاهزة") }, { value: "2", label: tr("جاهزة") }, { value: "3", label: tr("مرسلة جزئيا") }, { value: "4", label: tr("مرسلة كليا") }]} />
          <BoardSelectFilter label={tr("قرار الإدارة")} value={filterDraft.order_source} onChange={(value) => setDraftFilter({ order_source: value })}
            options={[{ value: "0", label: tr("كل قرارات الإدارة") }, { value: "1", label: tr("مقبول") }, { value: "2", label: tr("مرفوض") }, { value: "3", label: tr("مؤجل") }, { value: "4", label: tr("معتمدة") }, { value: "5", label: tr("مدققة") }]} />
        </>}
      />

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



