"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import UnifiedSalesOrder from "./unified-sales-order"
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  ShoppingCart,
  TrendingUp,
  Clock,
  CheckCircle,
  BarChart3,
  Grid3X3,
  List,
  Calendar,
  User,
  DollarSign,
  ArrowUpRight,
  Activity,
  Target,
} from "lucide-react"
import { formatDateToBritish } from "@/lib/utils"

interface SalesOrder {
  id: number
  order_number: string
  order_date: string
  customer_name: string
  order_status: string
  total_amount: number
  salesman: string
  priority?: string
  workflow_stage?: string
}

export function ModernSalesOrders() {
  const { user } = useAuth()
  const [state, setState] = useState({
    salesOrders: [] as SalesOrder[],
    loading: true,
    error: null,
    showNewOrderDialog: false,
    currentView: "cards" as "cards" | "list" | "analytics",
    filters: {
      search: "",
      status: "all",
      priority: "all",
      salesman: "all",
      dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
      dateTo: new Date().toISOString().split("T")[0],
      workflow: "all",
    },
  })

  const filteredOrders = useMemo(() => {
    return state.salesOrders.filter((order) => {
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
      if (state.filters.dateFrom && order.order_date < state.filters.dateFrom) {
        return false
      }
      if (state.filters.dateTo && order.order_date > state.filters.dateTo) {
        return false
      }
      return true
    })
  }, [state.salesOrders, state.filters])

  const analytics = useMemo(() => {
    const totalOrders = state.salesOrders.length
    const pendingOrders = state.salesOrders.filter((o) => o.order_status === "pending").length
    const completedOrders = state.salesOrders.filter((o) => o.order_status === "completed").length
    const cancelledOrders = state.salesOrders.filter((o) => o.order_status === "cancelled").length
    const totalValue = state.salesOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
    const avgOrderValue = totalOrders > 0 ? totalValue / totalOrders : 0
    const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0
    const todayOrders = state.salesOrders.filter(
      (o) => new Date(o.order_date).toDateString() === new Date().toDateString(),
    ).length

    return {
      totalOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      totalValue,
      avgOrderValue,
      completionRate,
      todayOrders,
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
      pending: { label: "قيد التنفيذ", className: "bg-amber-100 text-amber-800 border-amber-200" },
      completed: { label: "مكتملة", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
      cancelled: { label: "ملغاة", className: "bg-red-100 text-red-800 border-red-200" },
      processing: { label: "قيد المعالجة", className: "bg-blue-100 text-blue-800 border-blue-200" },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || {
      label: status,
      className: "bg-gray-100 text-gray-800",
    }
    return <Badge className={`${config.className} font-medium`}>{config.label}</Badge>
  }

  const getPriorityBadge = (priority: string) => {
    const priorityConfig = {
      high: { label: "عالية", className: "bg-red-50 text-red-700 border-red-200" },
      medium: { label: "متوسطة", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
      low: { label: "منخفضة", className: "bg-green-50 text-green-700 border-green-200" },
    }
    const config = priorityConfig[priority as keyof typeof priorityConfig] || {
      label: "عادية",
      className: "bg-gray-50 text-gray-700",
    }
    return (
      <Badge variant="outline" className={`${config.className} text-xs`}>
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
        priority: "all",
        salesman: "all",
        dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
        dateTo: new Date().toISOString().split("T")[0],
        workflow: "all",
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
        <div className="space-y-1">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            طلبات المبيعات المتطورة
          </h1>
          <p className="text-muted-foreground text-lg">لوحة تحكم شاملة لإدارة وتتبع جميع طلبات المبيعات</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setState((prev) => ({ ...prev, showNewOrderDialog: true }))}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
            size="lg"
          >
            <Plus className="ml-2 h-5 w-5" />
            طلبية جديدة
          </Button>
        </div>
      </div>

      {/* Advanced Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-blue-100 text-sm font-medium">إجمالي الطلبات</p>
                <p className="text-3xl font-bold">{analytics.totalOrders}</p>
                <div className="flex items-center text-blue-100 text-xs">
                  <ArrowUpRight className="h-3 w-3 ml-1" />
                  اليوم: {analytics.todayOrders}
                </div>
              </div>
              <div className="bg-white/20 p-3 rounded-full">
                <ShoppingCart className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-amber-100 text-sm font-medium">قيد التنفيذ</p>
                <p className="text-3xl font-bold">{analytics.pendingOrders}</p>
                <div className="flex items-center text-amber-100 text-xs">
                  <Clock className="h-3 w-3 ml-1" />
                  {analytics.totalOrders > 0 ? Math.round((analytics.pendingOrders / analytics.totalOrders) * 100) : 0}%
                </div>
              </div>
              <div className="bg-white/20 p-3 rounded-full">
                <Clock className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500 to-green-500 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-emerald-100 text-sm font-medium">مكتملة</p>
                <p className="text-3xl font-bold">{analytics.completedOrders}</p>
                <div className="flex items-center text-emerald-100 text-xs">
                  <Target className="h-3 w-3 ml-1" />
                  معدل الإنجاز: {Math.round(analytics.completionRate)}%
                </div>
              </div>
              <div className="bg-white/20 p-3 rounded-full">
                <CheckCircle className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-pink-500 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-purple-100 text-sm font-medium">إجمالي القيمة</p>
                <p className="text-3xl font-bold">{analytics.totalValue.toLocaleString()}</p>
                <div className="flex items-center text-purple-100 text-xs">
                  <DollarSign className="h-3 w-3 ml-1" />
                  متوسط: {Math.round(analytics.avgOrderValue).toLocaleString()}
                </div>
              </div>
              <div className="bg-white/20 p-3 rounded-full">
                <TrendingUp className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Filters */}
      <Card className="shadow-lg border-0">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50">
          <CardTitle className="flex items-center gap-2 text-slate-700">
            <Filter className="h-5 w-5" />
            البحث والتصفية المتقدمة
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            <div className="col-span-2">
              <Label className="text-sm font-medium text-slate-700">البحث الشامل</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="رقم الطلبية، اسم العميل، أو المندوب..."
                  value={state.filters.search}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, search: e.target.value },
                    }))
                  }
                  className="pr-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">حالة الطلبية</Label>
              <Select
                value={state.filters.status}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, status: value },
                  }))
                }
              >
                <SelectTrigger className="border-slate-200 focus:border-blue-400">
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
              <Label className="text-sm font-medium text-slate-700">الأولوية</Label>
              <Select
                value={state.filters.priority}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, priority: value },
                  }))
                }
              >
                <SelectTrigger className="border-slate-200 focus:border-blue-400">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأولويات</SelectItem>
                  <SelectItem value="high">عالية</SelectItem>
                  <SelectItem value="medium">متوسطة</SelectItem>
                  <SelectItem value="low">منخفضة</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">إلى تاريخ</Label>
              <Input
                type="date"
                value={state.filters.dateTo}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, dateTo: e.target.value },
                  }))
                }
                className="border-slate-200 focus:border-blue-400"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">من تاريخ</Label>
              <Input
                type="date"
                value={state.filters.dateFrom}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    filters: { ...prev.filters, dateFrom: e.target.value },
                  }))
                }
                className="border-slate-200 focus:border-blue-400"
              />
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={resetFilters}
                className="w-full border-slate-200 hover:bg-slate-50 bg-transparent"
              >
                إعادة تعيين
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View Tabs */}
      <Tabs
        value={state.currentView}
        onValueChange={(value) => setState((prev) => ({ ...prev, currentView: value as any }))}
      >
        <div className="flex items-center justify-between">
          <TabsList className="bg-white shadow-sm border">
            <TabsTrigger value="cards" className="flex items-center gap-2">
              <Grid3X3 className="h-4 w-4" />
              عرض البطاقات
            </TabsTrigger>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              عرض القائمة
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              التحليلات
            </TabsTrigger>
          </TabsList>

          <div className="text-sm text-muted-foreground bg-white px-3 py-2 rounded-lg border shadow-sm">
            عرض {filteredOrders.length} من أصل {state.salesOrders.length} طلبية
          </div>
        </div>

        <TabsContent value="cards" className="space-y-6">
          {filteredOrders.length === 0 ? (
            <Card className="border-dashed border-2 border-slate-200">
              <CardContent className="text-center py-12">
                <ShoppingCart className="mx-auto h-16 w-16 text-slate-400 mb-4" />
                <h3 className="text-xl font-semibold text-slate-700 mb-2">لا توجد طلبات</h3>
                <p className="text-slate-500 mb-6">لم يتم العثور على أي طلبات تطابق معايير البحث</p>
                <Button
                  onClick={() => setState((prev) => ({ ...prev, showNewOrderDialog: true }))}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  <Plus className="ml-2 h-4 w-4" />
                  إنشاء طلبية جديدة
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOrders.map((order) => (
                <Card
                  key={order.id}
                  className="hover:shadow-lg transition-all duration-200 border-0 shadow-md bg-white"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-bold text-slate-800">{order.order_number}</CardTitle>
                      <div className="flex gap-2">
                        {order.priority && getPriorityBadge(order.priority)}
                        {getStatusBadge(order.order_status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-500" />
                        <span className="text-slate-600">{formatDateToBritish(order.order_date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-500" />
                        <span className="text-slate-600 truncate">{order.customer_name}</span>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-3 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-600">المبلغ الإجمالي</span>
                        <span className="text-lg font-bold text-slate-800">
                          {order.total_amount?.toLocaleString()} ريال
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <User className="h-4 w-4" />
                        {order.salesman}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="hover:bg-blue-50 bg-transparent">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="hover:bg-purple-50 bg-transparent">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="list" className="space-y-6">
          <Card className="shadow-lg border-0">
            <CardContent className="p-0">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="mx-auto h-16 w-16 text-slate-400 mb-4" />
                  <h3 className="text-xl font-semibold text-slate-700 mb-2">لا توجد طلبات</h3>
                  <p className="text-slate-500 mb-6">لم يتم العثور على أي طلبات تطابق معايير البحث</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-slate-50 to-blue-50">
                      <tr>
                        <th className="text-right p-4 font-semibold text-slate-700 border-b">رقم الطلبية</th>
                        <th className="text-right p-4 font-semibold text-slate-700 border-b">التاريخ</th>
                        <th className="text-right p-4 font-semibold text-slate-700 border-b">اسم العميل</th>
                        <th className="text-right p-4 font-semibold text-slate-700 border-b">الحالة</th>
                        <th className="text-right p-4 font-semibold text-slate-700 border-b">الأولوية</th>
                        <th className="text-right p-4 font-semibold text-slate-700 border-b">المبلغ الإجمالي</th>
                        <th className="text-right p-4 font-semibold text-slate-700 border-b">المندوب</th>
                        <th className="text-right p-4 font-semibold text-slate-700 border-b">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order, index) => (
                        <tr
                          key={order.id}
                          className={`border-b hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-all duration-150 ${
                            index % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                          }`}
                        >
                          <td className="p-4 font-bold text-blue-600">{order.order_number}</td>
                          <td className="p-4 text-slate-600">{formatDateToBritish(order.order_date)}</td>
                          <td className="p-4 font-medium text-slate-800">{order.customer_name}</td>
                          <td className="p-4">{getStatusBadge(order.order_status)}</td>
                          <td className="p-4">
                            {order.priority ? (
                              getPriorityBadge(order.priority)
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-4 font-bold text-slate-800">{order.total_amount?.toLocaleString()} ريال</td>
                          <td className="p-4 text-slate-600">{order.salesman}</td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="hover:bg-blue-50 hover:border-blue-200 bg-transparent"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="hover:bg-purple-50 hover:border-purple-200 bg-transparent"
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-lg border-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-700">
                  <BarChart3 className="h-5 w-5" />
                  توزيع حالات الطلبات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                    <span className="font-medium text-amber-800">قيد التنفيذ</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-900">{analytics.pendingOrders}</span>
                      <div className="w-16 bg-amber-200 rounded-full h-2">
                        <div
                          className="bg-amber-500 h-2 rounded-full"
                          style={{
                            width: `${analytics.totalOrders > 0 ? (analytics.pendingOrders / analytics.totalOrders) * 100 : 0}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                    <span className="font-medium text-emerald-800">مكتملة</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-900">{analytics.completedOrders}</span>
                      <div className="w-16 bg-emerald-200 rounded-full h-2">
                        <div
                          className="bg-emerald-500 h-2 rounded-full"
                          style={{
                            width: `${analytics.totalOrders > 0 ? (analytics.completedOrders / analytics.totalOrders) * 100 : 0}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <span className="font-medium text-red-800">ملغاة</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-red-900">{analytics.cancelledOrders}</span>
                      <div className="w-16 bg-red-200 rounded-full h-2">
                        <div
                          className="bg-red-500 h-2 rounded-full"
                          style={{
                            width: `${analytics.totalOrders > 0 ? (analytics.cancelledOrders / analytics.totalOrders) * 100 : 0}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-700">
                  <Activity className="h-5 w-5" />
                  مؤشرات الأداء الرئيسية
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-blue-700 font-medium">معدل الإنجاز</span>
                      <span className="text-2xl font-bold text-blue-900">{Math.round(analytics.completionRate)}%</span>
                    </div>
                  </div>
                  <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-purple-700 font-medium">متوسط قيمة الطلبية</span>
                      <span className="text-2xl font-bold text-purple-900">
                        {Math.round(analytics.avgOrderValue).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-green-700 font-medium">طلبات اليوم</span>
                      <span className="text-2xl font-bold text-green-900">{analytics.todayOrders}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <UnifiedSalesOrder
        open={state.showNewOrderDialog}
        onOpenChange={(open) => setState((prev) => ({ ...prev, showNewOrderDialog: open }))}
        onOrderSaved={fetchSalesOrders}
      />
    </div>
  )
}
