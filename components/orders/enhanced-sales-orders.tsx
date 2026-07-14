"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import UnifiedSalesOrder from "./unified-sales-order"
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
} from "lucide-react"
import { formatDateToBritish } from "@/lib/utils"

interface SalesOrder {
  id: number
  order_number: string
  order_date: string
  customer_name: string
  customer_id: number
  order_status: string
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

export function EnhancedSalesOrders() {
  const { user } = useAuth()
  const [state, setState] = useState({
    salesOrders: [] as SalesOrder[],
    loading: true,
    error: null,
    selectedOrder: null,
    currentView: "grid", // grid, list, kanban
    showNewOrderDialog: false,
    filters: {
      search: "",
      status: "all",
      financial_status: "all",
      salesman: "all",
      dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
      dateTo: new Date().toISOString().split("T")[0],
      customer: "all",
      workflow_status: "all",
    },
    sortBy: "created_at",
    sortOrder: "desc" as "asc" | "desc",
  })

  const filteredOrders = useMemo(() => {
    const filtered = state.salesOrders.filter((order) => {
      if (
        state.filters.search &&
        !order.customer_name?.toLowerCase().includes(state.filters.search.toLowerCase()) &&
        !order.order_number?.toLowerCase().includes(state.filters.search.toLowerCase())
      ) {
        return false
      }
      if (state.filters.status !== "all" && order.order_status !== state.filters.status) {
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
      return true
    })

    // Apply sorting
    filtered.sort((a, b) => {
      const aValue = a[state.sortBy as keyof SalesOrder]
      const bValue = b[state.sortBy as keyof SalesOrder]

      if (state.sortOrder === "asc") {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

    return filtered
  }, [state.salesOrders, state.filters, state.sortBy, state.sortOrder])

  const analytics = useMemo((): OrderAnalytics => {
    const totalOrders = state.salesOrders.length
    const pendingOrders = state.salesOrders.filter((o) => o.order_status === "pending").length
    const completedOrders = state.salesOrders.filter((o) => o.order_status === "completed").length
    const totalValue = state.salesOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
    const avgOrderValue = totalOrders > 0 ? totalValue / totalOrders : 0

    const today = new Date().toISOString().split("T")[0]
    const todayOrders = state.salesOrders.filter((o) => o.order_date === today).length

    // Mock growth calculations - in real app, compare with previous periods
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

  useEffect(() => {
    fetchSalesOrders()
  }, [])

  const fetchSalesOrders = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      const response = await fetch("/api/orders/sales")
      if (!response.ok) {
        throw new Error("فشل في تحميل طلبات المبيعات")
      }
      const data = await response.json()
      setState((prev) => ({ ...prev, salesOrders: Array.isArray(data) ? data : [] }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "حدث خطأ غير متوقع",
        salesOrders: [],
      }))
    } finally {
      setState((prev) => ({ ...prev, loading: false }))
    }
  }

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

  const resetFilters = () => {
    setState((prev) => ({
      ...prev,
      filters: {
        search: "",
        status: "all",
        financial_status: "all",
        salesman: "all",
        dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
        dateTo: new Date().toISOString().split("T")[0],
        customer: "all",
        workflow_status: "all",
      },
    }))
  }

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل طلبات المبيعات...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen" dir="rtl">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            طلبات المبيعات
          </h1>
          <p className="text-slate-600 mt-2 text-lg">إدارة وتتبع جميع طلبات المبيعات بكفاءة عالية</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="bg-white shadow-sm">
            <FileText className="ml-2 h-4 w-4" />
            تقرير
          </Button>
          <Button
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg"
            onClick={() => setState((prev) => ({ ...prev, showNewOrderDialog: true }))}
          >
            <Plus className="ml-2 h-4 w-4" />
            طلبية جديدة
          </Button>
        </div>
      </div>

      {/* Analytics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">إجمالي الطلبات</p>
                <p className="text-3xl font-bold">{analytics.totalOrders}</p>
                <div className="flex items-center mt-2">
                  <ArrowUpRight className="h-4 w-4 text-blue-200" />
                  <span className="text-blue-200 text-sm">+{analytics.weeklyGrowth}% هذا الأسبوع</span>
                </div>
              </div>
              <div className="h-12 w-12 bg-blue-400 rounded-full flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-white" />
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

        <Card className="bg-gradient-to-br from-purple-500 to-pink-500 text-white border-0 shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">إجمالي القيمة</p>
                <p className="text-3xl font-bold">{analytics.totalValue.toLocaleString()}</p>
                <div className="flex items-center mt-2">
                  <TrendingUp className="h-4 w-4 text-purple-200" />
                  <span className="text-purple-200 text-sm">متوسط {analytics.avgOrderValue.toLocaleString()} ريال</span>
                </div>
              </div>
              <div className="h-12 w-12 bg-purple-400 rounded-full flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Filters */}
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
                  placeholder="رقم الطلبية، اسم العميل، أو المندوب..."
                  value={state.filters.search}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, search: e.target.value },
                    }))
                  }
                  className="pr-10 bg-white border-slate-200 focus:border-blue-500 focus:ring-blue-500"
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

      {/* Orders Display */}
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-slate-800">قائمة الطلبات</CardTitle>
              <CardDescription className="text-slate-600">
                عرض {filteredOrders.length} من أصل {state.salesOrders.length} طلبية
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
                  <SelectItem value="customer_name-asc">اسم العميل أ-ي</SelectItem>
                  <SelectItem value="customer_name-desc">اسم العميل ي-أ</SelectItem>
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
              <h3 className="text-xl font-semibold text-slate-800 mb-2">لا توجد طلبات</h3>
              <p className="text-slate-600 mb-6">لم يتم العثور على أي طلبات تطابق معايير البحث</p>
              <Button
                className="bg-gradient-to-r from-blue-600 to-purple-600"
                onClick={() => setState((prev) => ({ ...prev, showNewOrderDialog: true }))}
              >
                <Plus className="ml-2 h-4 w-4" />
                إنشاء طلبية جديدة
              </Button>
            </div>
          ) : state.currentView === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOrders.map((order) => (
                <Card
                  key={order.id}
                  className="bg-white border border-slate-200 hover:shadow-lg transition-all duration-200 hover:border-blue-300"
                >
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-slate-800 text-lg">{order.order_number}</h3>
                        <p className="text-slate-600 text-sm">{formatDateToBritish(order.order_date)}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        {getStatusBadge(order.order_status)}
                        {order.financial_status && getFinancialStatusBadge(order.financial_status)}
                        {order.workflow_status && getWorkflowStatusBadge(order.workflow_status)}
                        {order.priority_level && getPriorityBadge(order.priority_level)}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-500" />
                        <span className="text-slate-700 font-medium">{order.customer_name}</span>
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
                            <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
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
                        <Button variant="outline" size="sm" className="bg-white">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="bg-white">
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
            // List View
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-right p-4 font-semibold text-slate-700">رقم الطلبية</th>
                    <th className="text-right p-4 font-semibold text-slate-700">التاريخ</th>
                    <th className="text-right p-4 font-semibold text-slate-700">العميل</th>
                    <th className="text-right p-4 font-semibold text-slate-700">الحالة</th>
                    <th className="text-right p-4 font-semibold text-slate-700">الحالة المالية</th>
                    <th className="text-right p-4 font-semibold text-slate-700">سير العمل</th>
                    <th className="text-right p-4 font-semibold text-slate-700">الأولوية</th>
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
                      <td className="p-4 text-slate-700">{order.customer_name}</td>
                      <td className="p-4">{getStatusBadge(order.order_status)}</td>
                      <td className="p-4">
                        {order.financial_status && getFinancialStatusBadge(order.financial_status)}
                      </td>
                      <td className="p-4">{order.workflow_status && getWorkflowStatusBadge(order.workflow_status)}</td>
                      <td className="p-4">{order.priority_level && getPriorityBadge(order.priority_level)}</td>
                      <td className="p-4">
                        <span className={`font-bold ${getPriorityColor(order.total_amount)}`}>
                          {order.total_amount?.toLocaleString()} {order.currency_code || "ريال"}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600">{order.salesman}</td>
                      <td className="p-4">
                        <div className="flex justify-center gap-2">
                          <Button variant="outline" size="sm" className="bg-white">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" className="bg-white">
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

      {/* New Order Dialog */}
      <UnifiedSalesOrder
        open={state.showNewOrderDialog}
        onOpenChange={(open) => setState((prev) => ({ ...prev, showNewOrderDialog: open }))}
        onOrderSaved={fetchSalesOrders}
      />
    </div>
  )
}
