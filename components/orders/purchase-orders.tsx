"use client"

import { confirmYesNo } from "@/components/ui/confirm-host"
import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { UnifiedPurchaseOrder } from "./unified-purchase-order"
import { SearchButton } from "@/components/search/search-button"
import { useRecordNavigation } from "@/hooks/use-record-navigation"
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  MoreHorizontal,
  Truck,
  TrendingUp,
  Clock,
  CheckCircle,
  Calendar,
  DollarSign,
  ArrowUpRight,
  FileText,
  Package,
} from "lucide-react"
import { formatDateToBritish } from "@/lib/utils"
import { ReportGenerator } from "@/components/ui/report-generator" // Declare the ReportGenerator import

interface OrderItem {
  id: string
  item_status: string
  barcode: string
  product_code: string
  product_name: string
  warehouse: string
  quantity: number
  bonus_quantity: number
  unit: string
  unit_price: number
  total_price: number
  expiry_date: string
  batch_number: string
  bonus: number
  length: number
  width: number
  count: number
  color: string
  discount: number
  item_notes: string
}

interface Supplier {
  id: number
  supplier_code: string
  supplier_name: string
  email: string
  mobile1: string
}

interface Product {
  id: number
  product_code: string
  product_name: string
  main_unit: string
  last_purchase_price: number
  current_stock: number
}

interface PurchaseOrder {
  id?: number
  order_number: string
  order_date: string
  supplier_name: string
  workflow_status: string
  total_amount: number
  salesman: string
  delivery_datetime?: string
  workflow_sequence_id?: number
  currency_code?: string
  exchange_rate?: number
  notes?: string
  created_at?: string
  updated_at?: string
  current_stage?: string
  priority_level?: string
  order_status?: string
  financial_status?: string
  order_source?: string
}

const reportColumns = [
  { key: "order_number", label: "رقم الطلبية", width: "120px" },
  { key: "order_date", label: "التاريخ", width: "120px" },
  { key: "supplier_name", label: "اسم المورد", width: "200px" },
  { key: "workflow_status", label: "الحالة", width: "100px" },
  { key: "total_amount", label: "المبلغ الإجمالي", width: "120px" },
  { key: "salesman", label: "المندوب", width: "120px" },
]

export function PurchaseOrders() {
  const { user } = useAuth()
  const [state, setState] = useState({
    purchaseOrders: [] as PurchaseOrder[],
    suppliers: [] as Supplier[],
    products: [] as Product[],
    loading: true,
    error: null as string | null,
    showOrderDialog: false,
    selectedOrder: null as PurchaseOrder | null,
    showReport: false,
    showSearch: false,
    currentView: "grid" as "grid" | "list",
    filters: {
      search: "",
      status: "all",
      salesman: "all",
      dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
      dateTo: new Date().toISOString().split("T")[0],
      supplier: "all",
      workflow_status: "all",
      financial_status: "all",
      order_source: "all",
    },
    sortBy: "created_at",
    sortOrder: "desc" as "asc" | "desc",
  })

  const createNewOrder = (): PurchaseOrder => ({
    order_number: "",
    order_date: new Date().toISOString().split("T")[0],
    supplier_name: "",
    workflow_status: "pending",
    total_amount: 0,
    salesman: user?.fullName || "",
  })

  const {
    currentRecord,
    currentIndex,
    isNew,
    isLoading: navLoading,
    totalRecords,
    goToFirst,
    goToPrevious,
    goToNext,
    goToLast,
    createNew,
    saveRecord,
    deleteRecord,
    canSave,
    canDelete,
    isFirstRecord,
    isLastRecord,
  } = useRecordNavigation({
    data: state.purchaseOrders,
    onSave: handleSaveOrder,
    onDelete: handleDeleteOrder,
    createNewRecord: createNewOrder,
  })

  const filteredOrders = useMemo(() => {
    const filtered = state.purchaseOrders.filter((order) => {
      if (
        state.filters.search &&
        !order.supplier_name?.toLowerCase().includes(state.filters.search.toLowerCase()) &&
        !order.order_number?.toLowerCase().includes(state.filters.search.toLowerCase())
      ) {
        return false
      }
      if (state.filters.status !== "all" && order.workflow_status !== state.filters.status) {
        return false
      }
      if (state.filters.financial_status !== "all" && order.financial_status !== state.filters.financial_status) {
        return false
      }
      if (state.filters.salesman !== "all" && order.salesman !== state.filters.salesman) {
        return false
      }
      if (state.filters.dateFrom && order.order_date < state.filters.dateFrom) {
        return false
      }
      if (state.filters.dateTo && order.order_date > state.filters.dateTo) {
        return false
      }
      if (state.filters.workflow_status !== "all" && order.workflow_status !== state.filters.workflow_status) {
        return false
      }
      if (state.filters.order_source !== "all" && order.order_source !== state.filters.order_source) {
        return false
      }
      return true
    })

    filtered.sort((a, b) => {
      const aValue = a[state.sortBy as keyof PurchaseOrder]
      const bValue = b[state.sortBy as keyof PurchaseOrder]

      if (state.sortOrder === "asc") {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

    return filtered
  }, [state.purchaseOrders, state.filters, state.sortBy, state.sortOrder])

  const analytics = useMemo((): any => {
    const totalOrders = state.purchaseOrders.length
    const pendingOrders = state.purchaseOrders.filter((o) => o.workflow_status === "pending").length
    const completedOrders = state.purchaseOrders.filter((o) => o.workflow_status === "completed").length
    const totalValue = state.purchaseOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
    const avgOrderValue = totalOrders > 0 ? totalValue / totalOrders : 0

    const today = new Date().toISOString().split("T")[0]
    const todayOrders = state.purchaseOrders.filter((o) => o.order_date === today).length

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
  }, [state.purchaseOrders])

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: {
        label: "قيد التنفيذ",
        variant: "secondary",
        className: "bg-amber-100 text-amber-800 border-amber-200",
      },
      completed: {
        label: "مكتملة",
        variant: "secondary",
        className: "bg-emerald-100 text-emerald-800 border-emerald-200",
      },
      cancelled: { label: "ملغاة", variant: "secondary", className: "bg-red-100 text-red-800 border-red-200" },
      processing: {
        label: "قيد المعالجة",
        variant: "secondary",
        className: "bg-blue-100 text-blue-800 border-blue-200",
      },
    }

    const config = statusConfig[status as keyof typeof statusConfig] || {
      label: status,
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
      paid: { label: "مدفوع", className: "bg-green-100 text-green-800 border-green-200" },
      partial: { label: "مدفوع جزئياً", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
      unpaid: { label: "غير مدفوع", className: "bg-red-100 text-red-800 border-red-200" },
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

  const getPriorityColor = (amount: number) => {
    if (amount > 10000) return "text-red-600"
    if (amount > 5000) return "text-amber-600"
    return "text-green-600"
  }

  const getOrderSourceBadge = (source: string) => {
    const sourceConfig = {
      manual: { label: "إدخال يدوي", className: "bg-blue-100 text-blue-800 border-blue-200" },
      supplier_portal: { label: "من الموردين", className: "bg-green-100 text-green-800 border-green-200" },
      api_import: { label: "استيراد API", className: "bg-purple-100 text-purple-800 border-purple-200" },
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

  const resetFilters = () => {
    setState((prev) => ({
      ...prev,
      filters: {
        search: "",
        status: "all",
        salesman: "all",
        dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
        dateTo: new Date().toISOString().split("T")[0],
        supplier: "all",
        workflow_status: "all",
        financial_status: "all",
        order_source: "all",
      },
    }))
  }

  async function handleSaveOrder(order: PurchaseOrder, isNewRecord: boolean): Promise<void> {
    if (!order.supplier_name.trim()) {
      throw new Error("اسم المورد مطلوب")
    }

    if (!order.order_number.trim()) {
      throw new Error("رقم الطلبية مطلوب")
    }

    const method = isNewRecord ? "POST" : "PUT"
    const url = isNewRecord ? "/api/purchase-orders" : `/api/purchase-orders/${order.id}`

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(order),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || "فشل في حفظ بيانات الطلبية")
    }

    await fetchPurchaseOrders()
  }

  async function handleDeleteOrder(order: PurchaseOrder): Promise<void> {
    if (!(await confirmYesNo("هل أنت متأكد من حذف هذه الطلبية؟"))) {
      throw new Error("تم إلغاء العملية")
    }

    const response = await fetch(`/api/purchase-orders/${order.id}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      throw new Error("فشل في حذف الطلبية")
    }

    await fetchPurchaseOrders()
  }

  const handleReport = () => {
    setState((prev) => ({ ...prev, showReport: true }))
  }

  const handleExportExcel = async () => {
    setState((prev) => ({ ...prev, showReport: true }))
  }

  const handlePrint = () => {
    setState((prev) => ({ ...prev, showReport: true }))
  }

  const handleFirstWithDialog = () => {
    goToFirst()
    if (!state.showOrderDialog) {
      setState((prev) => ({ ...prev, showOrderDialog: true }))
    }
  }

  const handlePreviousWithDialog = () => {
    goToPrevious()
    if (!state.showOrderDialog) {
      setState((prev) => ({ ...prev, showOrderDialog: true }))
    }
  }

  const handleNextWithDialog = () => {
    goToNext()
    if (!state.showOrderDialog) {
      setState((prev) => ({ ...prev, showOrderDialog: true }))
    }
  }

  const handleLastWithDialog = () => {
    goToLast()
    if (!state.showOrderDialog) {
      setState((prev) => ({ ...prev, showOrderDialog: true }))
    }
  }

  const fetchPurchaseOrders = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      const response = await fetch("/api/purchase-orders")
      if (!response.ok) {
        throw new Error("فشل في تحميل طلبات الشراء")
      }
      const data = await response.json()
      setState((prev) => ({ ...prev, purchaseOrders: Array.isArray(data) ? data : [] }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "حدث خطأ غير متوقع",
        purchaseOrders: [],
      }))
    } finally {
      setState((prev) => ({ ...prev, loading: false }))
    }
  }

  const fetchSuppliers = async () => {
    try {
      const response = await fetch("/api/suppliers")
      if (response.ok) {
        const data = await response.json()
        setState((prev) => ({ ...prev, suppliers: Array.isArray(data) ? data : [] }))
      }
    } catch (error) {
      console.error("Error fetching suppliers:", error)
      setState((prev) => ({ ...prev, suppliers: [] }))
    }
  }

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/inventory/products")
      if (response.ok) {
        const data = await response.json()
        setState((prev) => ({ ...prev, products: Array.isArray(data) ? data : [] }))
      }
    } catch (error) {
      console.error("Error fetching products:", error)
      setState((prev) => ({ ...prev, products: [] }))
    }
  }

  const handleNewOrder = () => {
    createNew()
    setState((prev) => ({
      ...prev,
      showOrderDialog: true,
      selectedOrder: null,
    }))
  }

  const handleEditOrder = (order: PurchaseOrder) => {
    setState((prev) => ({
      ...prev,
      showOrderDialog: true,
      selectedOrder: order,
    }))
  }

  const handleSearchOrder = (order: PurchaseOrder) => {
    setState((prev) => ({
      ...prev,
      showOrderDialog: true,
      selectedOrder: order,
      showSearch: false,
    }))
  }

  useEffect(() => {
    fetchPurchaseOrders()
    fetchSuppliers()
    fetchProducts()
  }, [])

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل طلبات الشراء...</p>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-lg text-red-600">{state.error}</div>
        <Button onClick={fetchPurchaseOrders} variant="outline">
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-50 to-purple-50 min-h-screen" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            طلبات الشراء
          </h1>
          <p className="text-slate-600 mt-2 text-lg">إدارة وتتبع جميع طلبات الشراء من الموردين</p>
        </div>
        <div className="flex gap-3">
          <SearchButton type="purchases" onSelectPurchaseOrder={handleSearchOrder} variant="outline" size="default" />
          <Button variant="outline" className="bg-white shadow-sm" onClick={handleReport}>
            <FileText className="ml-2 h-4 w-4" />
            تقرير
          </Button>
          <Button
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg"
            onClick={handleNewOrder}
          >
            <Plus className="ml-2 h-4 w-4" />
            طلبية جديدة
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">إجمالي الطلبات</p>
                <p className="text-3xl font-bold">{analytics.totalOrders}</p>
                <div className="flex items-center mt-2">
                  <ArrowUpRight className="h-4 w-4 text-purple-200" />
                  <span className="text-purple-200 text-sm">+{analytics.weeklyGrowth}% هذا الأسبوع</span>
                </div>
              </div>
              <div className="h-12 w-12 bg-purple-400 rounded-full flex items-center justify-center">
                <Package className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white border-0 shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100 text-sm font-medium">قيد التنفيذ</p>
                <p className="text-3xl font-bold">{analytics.pendingOrders}</p>
                <div className="flex items-center mt-2">
                  <Clock className="h-4 w-4 text-amber-200" />
                  <span className="text-amber-200 text-sm">يحتاج متابعة</span>
                </div>
              </div>
              <div className="h-12 w-12 bg-amber-400 rounded-full flex items-center justify-center">
                <Clock className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500 to-green-500 text-white border-0 shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm font-medium">مكتملة</p>
                <p className="text-3xl font-bold">{analytics.completedOrders}</p>
                <div className="flex items-center mt-2">
                  <CheckCircle className="h-4 w-4 text-emerald-200" />
                  <span className="text-emerald-200 text-sm">
                    معدل الإنجاز {Math.round((analytics.completedOrders / analytics.totalOrders) * 100)}%
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 bg-emerald-400 rounded-full flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-pink-500 to-rose-500 text-white border-0 shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-pink-100 text-sm font-medium">إجمالي القيمة</p>
                <p className="text-3xl font-bold">{analytics.totalValue.toLocaleString()}</p>
                <div className="flex items-center mt-2">
                  <TrendingUp className="h-4 w-4 text-pink-200" />
                  <span className="text-pink-200 text-sm">متوسط {analytics.avgOrderValue.toLocaleString()} ريال</span>
                </div>
              </div>
              <div className="h-12 w-12 bg-pink-400 rounded-full flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <Filter className="h-5 w-5" />
            البحث والتصفية المتقدمة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
            <div className="lg:col-span-2">
              <Label className="text-slate-700 font-medium">البحث الذكي</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="رقم الطلبية، اسم المورد، أو المندوب..."
                  value={state.filters.search}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, search: e.target.value },
                    }))
                  }
                  className="pr-10 bg-white border-slate-200 focus:border-purple-500 focus:ring-purple-500"
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-700 font-medium">حالة الطلبية</Label>
              <Select
                value={state.filters.status}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, status: value },
                  }))
                }
              >
                <SelectTrigger className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="pending">قيد التنفيذ</SelectItem>
                  <SelectItem value="processing">قيد المعالجة</SelectItem>
                  <SelectItem value="completed">مكتملة</SelectItem>
                  <SelectItem value="cancelled">ملغاة</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-700 font-medium">الحالة المالية</Label>
              <Select
                value={state.filters.financial_status}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, financial_status: value },
                  }))
                }
              >
                <SelectTrigger className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="paid">مدفوع</SelectItem>
                  <SelectItem value="partial">مدفوع جزئياً</SelectItem>
                  <SelectItem value="unpaid">غير مدفوع</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-700 font-medium">حالة سير العمل</Label>
              <Select
                value={state.filters.workflow_status}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, workflow_status: value },
                  }))
                }
              >
                <SelectTrigger className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="في الانتظار">في الانتظار</SelectItem>
                  <SelectItem value="قيد المراجعة">قيد المراجعة</SelectItem>
                  <SelectItem value="تم الموافقة">تم الموافقة</SelectItem>
                  <SelectItem value="مرفوض">مرفوض</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-700 font-medium">من تاريخ</Label>
              <Input
                type="date"
                value={state.filters.dateFrom}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, dateFrom: e.target.value },
                  }))
                }
                className="bg-white border-slate-200"
              />
            </div>

            <div>
              <Label className="text-slate-700 font-medium">إلى تاريخ</Label>
              <Input
                type="date"
                value={state.filters.dateTo}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, dateTo: e.target.value },
                  }))
                }
                className="bg-white border-slate-200"
              />
            </div>

            <div>
              <Label className="text-slate-700 font-medium">مصدر الطلبية</Label>
              <Select
                value={state.filters.order_source}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, order_source: value },
                  }))
                }
              >
                <SelectTrigger className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المصادر</SelectItem>
                  <SelectItem value="manual">إدخال يدوي</SelectItem>
                  <SelectItem value="supplier_portal">من الموردين</SelectItem>
                  <SelectItem value="api_import">استيراد API</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-200">
            <div className="flex gap-2">
              <Button
                variant={state.currentView === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setState((prev) => ({ ...prev, currentView: "grid" }))}
              >
                شبكة
              </Button>
              <Button
                variant={state.currentView === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setState((prev) => ({ ...prev, currentView: "list" }))}
              >
                قائمة
              </Button>
            </div>

            <Button variant="outline" onClick={resetFilters} className="bg-white">
              إعادة تعيين
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-slate-800">قائمة الطلبات</CardTitle>
              <CardDescription className="text-slate-600">
                عرض {filteredOrders.length} من أصل {state.purchaseOrders.length} طلبية
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
                  <SelectItem value="created_at-desc">الأحدث أولاً</SelectItem>
                  <SelectItem value="created_at-asc">الأقدم أولاً</SelectItem>
                  <SelectItem value="total_amount-desc">الأعلى قيمة</SelectItem>
                  <SelectItem value="total_amount-asc">الأقل قيمة</SelectItem>
                  <SelectItem value="supplier_name-asc">اسم المورد أ-ي</SelectItem>
                  <SelectItem value="supplier_name-desc">اسم المورد ي-أ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto h-24 w-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <Package className="h-12 w-12 text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-800 mb-2">لا توجد طلبات</h3>
              <p className="text-slate-600 mb-6">لم يتم العثور على أي طلبات تطابق معايير البحث</p>
              <Button className="bg-gradient-to-r from-purple-600 to-pink-600" onClick={handleNewOrder}>
                <Plus className="ml-2 h-4 w-4" />
                إنشاء طلبية جديدة
              </Button>
            </div>
          ) : state.currentView === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOrders.map((order) => (
                <Card
                  key={order.id}
                  className="bg-white border border-slate-200 hover:shadow-lg transition-all duration-200 hover:border-purple-300"
                >
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-slate-800 text-lg">{order.order_number}</h3>
                        <p className="text-slate-600 text-sm">{formatDateToBritish(order.order_date)}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        {getStatusBadge(order.workflow_status || order.order_status || "pending")}
                        {order.financial_status && getFinancialStatusBadge(order.financial_status)}
                        {order.workflow_status && getWorkflowStatusBadge(order.workflow_status)}
                        {order.priority_level && getPriorityBadge(order.priority_level)}
                        {order.order_source && getOrderSourceBadge(order.order_source)}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-slate-500" />
                        <span className="text-slate-700 font-medium">{order.supplier_name}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-slate-500" />
                        <span className={`font-bold text-lg ${getPriorityColor(order.total_amount)}`}>
                          {order.total_amount?.toLocaleString()} {order.currency_code || "ريال"}
                        </span>
                      </div>

                      {order.salesman && (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs bg-purple-100 text-purple-700">
                              {order.salesman.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-slate-600 text-sm">{order.salesman}</span>
                        </div>
                      )}

                      {order.delivery_datetime && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-slate-500" />
                          <span className="text-slate-600 text-sm">
                            تسليم: {formatDateToBritish(order.delivery_datetime)}
                          </span>
                        </div>
                      )}

                      {order.current_stage && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-slate-500" />
                          <span className="text-slate-600 text-sm">المرحلة: {order.current_stage}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-white"
                          onClick={() => handleSearchOrder(order)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="bg-white" onClick={() => handleEditOrder(order)}>
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
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-right p-4 font-semibold text-slate-700">رقم الطلبية</th>
                    <th className="text-right p-4 font-semibold text-slate-700">التاريخ</th>
                    <th className="text-right p-4 font-semibold text-slate-700">المورد</th>
                    <th className="text-right p-4 font-semibold text-slate-700">الحالة</th>
                    <th className="text-right p-4 font-semibold text-slate-700">الحالة المالية</th>
                    <th className="text-right p-4 font-semibold text-slate-700">سير العمل</th>
                    <th className="text-right p-4 font-semibold text-slate-700">الأولوية</th>
                    <th className="text-right p-4 font-semibold text-slate-700">المصدر</th>
                    <th className="text-right p-4 font-semibold text-slate-700">المبلغ</th>
                    <th className="text-right p-4 font-semibold text-slate-700">المندوب</th>
                    <th className="text-center p-4 font-semibold text-slate-700">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-medium text-slate-800">{order.order_number}</td>
                      <td className="p-4 text-slate-600">{formatDateToBritish(order.order_date)}</td>
                      <td className="p-4 text-slate-700">{order.supplier_name}</td>
                      <td className="p-4">
                        {getStatusBadge(order.workflow_status || order.order_status || "pending")}
                      </td>
                      <td className="p-4">
                        {order.financial_status && getFinancialStatusBadge(order.financial_status)}
                      </td>
                      <td className="p-4">{order.workflow_status && getWorkflowStatusBadge(order.workflow_status)}</td>
                      <td className="p-4">{order.priority_level && getPriorityBadge(order.priority_level)}</td>
                      <td className="p-4">{order.order_source && getOrderSourceBadge(order.order_source)}</td>
                      <td className="p-4">
                        <span className={`font-bold ${getPriorityColor(order.total_amount)}`}>
                          {order.total_amount?.toLocaleString()} {order.currency_code || "ريال"}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600">{order.salesman}</td>
                      <td className="p-4">
                        <div className="flex justify-center gap-2">
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
                            onClick={() => handleEditOrder(order)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report Generator */}
      <ReportGenerator
        title="تقرير طلبات الشراء"
        data={state.purchaseOrders}
        columns={reportColumns}
        isOpen={state.showReport}
        onClose={() => setState((prev) => ({ ...prev, showReport: false }))}
      />

      {/* Purchase Order Dialog */}
      <UnifiedPurchaseOrder
        open={state.showOrderDialog}
        onOpenChange={(open) => {
          if (!open) {
            setState((prev) => ({ ...prev, showOrderDialog: false, selectedOrder: null }))
          }
        }}
        order={currentRecord || state.selectedOrder}
        allOrders={state.purchaseOrders}
        onOrderSaved={() => {
          fetchPurchaseOrders()
        }}
        onCancel={() => setState((prev) => ({ ...prev, showOrderDialog: false, selectedOrder: null }))}
      />
    </div>
  )
}
