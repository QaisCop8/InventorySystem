"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BarChart as BarChart3,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
} from "recharts"
import {
  Download,
  FileText,
  Printer,
  Search,
  RotateCcw,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  ShoppingCart,
  DollarSign,
  Target,
  Clock,
} from "lucide-react"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"

export function OrderReports() {
  const [state, setState] = useState({
    activeTab: "pending",
    summaryData: [],
    pendingOrders: [],
    salesBySalesman: [],
    chartData: [],
    loading: true,
    error: null,
    filters: {
      fromDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
      toDate: new Date().toISOString().split("T")[0],
      customer: "all",
      salesman: "all",
      status: "all",
    },
  })

  const handleFilterChange = useCallback((key: string, value: string) => {
    setState((prev) => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
    }))
  }, [])

  const applyFilters = useCallback(() => {
    console.log("تطبيق الفلاتر:", state.filters)
  }, [state.filters])

  const resetFilters = useCallback(() => {
    setState((prev) => ({
      ...prev,
      filters: {
        fromDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
        toDate: new Date().toISOString().split("T")[0],
        customer: "all",
        salesman: "all",
        status: "all",
      },
    }))
  }, [])

  const exportReport = useCallback((format: string) => {
    console.log(`تصدير التقرير بصيغة ${format}`)
  }, [])

  const fetchReportsData = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      const response = await fetch("/api/reports/sales")
      if (!response.ok) throw new Error("Failed to fetch reports data")

      const data = await response.json()

      const summaryData = [
        {
          title: "إجمالي الطلبات",
          value: data.summary?.totalOrders?.toString() || "0",
          change: "+8%",
          icon: ShoppingCart,
          color: "text-blue-600",
          bgColor: "bg-blue-50",
        },
        {
          title: "القيمة الإجمالية",
          value: `${(data.summary?.totalRevenue || 0).toLocaleString()} شيكل`,
          change: "+12%",
          icon: DollarSign,
          color: "text-green-600",
          bgColor: "bg-green-50",
        },
        {
          title: "متوسط قيمة الطلبية",
          value: `${Math.round(data.summary?.avgOrderValue || 0).toLocaleString()} شيكل`,
          change: "+5%",
          icon: Target,
          color: "text-purple-600",
          bgColor: "bg-purple-50",
        },
        {
          title: "الطلبات المتأخرة",
          value: "12",
          change: "-3%",
          icon: Clock,
          color: "text-red-600",
          bgColor: "bg-red-50",
        },
      ]

      const transformedChartData = (data.salesData || []).map((item) => ({
        month: new Date(item.month).toLocaleDateString("ar-SA", { month: "long" }),
        sales: Number(item.total_sales),
        orders: Number(item.total_orders),
      }))

      const transformedSalesData = (data.topCustomers || []).slice(0, 3).map((customer) => ({
        name: customer.customer_name,
        orders: Number(customer.order_count),
        customers: Math.floor(Math.random() * 25) + 10,
        sales: Number(customer.total_spent),
        target: Number(customer.total_spent) * 1.2,
        achievement: Math.round((Number(customer.total_spent) / (Number(customer.total_spent) * 1.2)) * 100),
      }))

      setState((prev) => ({
        ...prev,
        summaryData,
        chartData: transformedChartData,
        salesBySalesman: transformedSalesData,
        loading: false,
      }))
    } catch (error) {
      console.error("Error fetching reports data:", error)
      setState((prev) => ({
        ...prev,
        error: "فشل في تحميل بيانات التقارير",
        loading: false,
      }))
    }
  }, [])

  useEffect(() => {
    fetchReportsData()
  }, [fetchReportsData])

  const filteredSummaryCards = useMemo(() => {
    return state.summaryData.map((item, index) => (
      <Card
        key={index}
        className="erp-card hover:shadow-lg transition-all duration-200 border-l-4"
        style={{ borderLeftColor: item.color.replace("text-", "#") }}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">{item.title}</CardTitle>
            <div className={`p-2 rounded-lg ${item.bgColor}`}>
              <item.icon className={`h-5 w-5 ${item.color}`} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold mb-1">{item.value}</div>
          <p className={`text-xs flex items-center ${item.change.startsWith("+") ? "text-green-600" : "text-red-600"}`}>
            <TrendingUp className="h-3 w-3 ml-1" />
            {item.change} من الشهر الماضي
          </p>
        </CardContent>
      </Card>
    ))
  }, [state.summaryData])

  if (state.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>جاري تحميل التقارير...</p>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-destructive">
          <AlertTriangle className="h-8 w-8 mx-auto mb-4" />
          <p>{state.error}</p>
          <Button onClick={fetchReportsData} className="mt-4">
            إعادة المحاولة
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{filteredSummaryCards}</div>

      <Card className="erp-card shadow-sm">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg">
          <CardTitle className="flex items-center text-blue-800">
            <Search className="h-5 w-5 ml-2" />
            فلاتر التقارير
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium mb-2 block text-gray-700">من تاريخ:</label>
              <Input
                type="date"
                value={state.filters.fromDate}
                onChange={(e) => handleFilterChange("fromDate", e.target.value)}
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block text-gray-700">إلى تاريخ:</label>
              <Input
                type="date"
                value={state.filters.toDate}
                onChange={(e) => handleFilterChange("toDate", e.target.value)}
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block text-gray-700">العميل:</label>
              <Select value={state.filters.customer} onValueChange={(value) => handleFilterChange("customer", value)}>
                <SelectTrigger className="focus:ring-2 focus:ring-blue-500">
                  <SelectValue placeholder="جميع العملاء" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع العملاء</SelectItem>
                  <SelectItem value="ahmed">أحمد محمد علي</SelectItem>
                  <SelectItem value="success">شركة النجاح التجارية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block text-gray-700">المندوب:</label>
              <Select value={state.filters.salesman} onValueChange={(value) => handleFilterChange("salesman", value)}>
                <SelectTrigger className="focus:ring-2 focus:ring-blue-500">
                  <SelectValue placeholder="جميع المندوبين" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المندوبين</SelectItem>
                  <SelectItem value="mohamed">محمد أحمد</SelectItem>
                  <SelectItem value="ali">علي حسن</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block text-gray-700">حالة الطلبية:</label>
              <Select value={state.filters.status} onValueChange={(value) => handleFilterChange("status", value)}>
                <SelectTrigger className="focus:ring-2 focus:ring-blue-500">
                  <SelectValue placeholder="جميع الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="pending">قيد التنفيذ</SelectItem>
                  <SelectItem value="completed">مكتملة</SelectItem>
                  <SelectItem value="cancelled">ملغاة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={applyFilters} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Search className="h-4 w-4 ml-2" />
              تطبيق الفلتر
            </Button>
            <Button
              variant="outline"
              onClick={resetFilters}
              className="border-gray-300 hover:bg-gray-50 bg-transparent"
            >
              <RotateCcw className="h-4 w-4 ml-2" />
              إعادة تعيين
            </Button>
            <Button
              variant="outline"
              onClick={() => exportReport("excel")}
              className="border-green-300 text-green-700 hover:bg-green-50"
            >
              <Download className="h-4 w-4 ml-2" />
              تصدير Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => exportReport("pdf")}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              <FileText className="h-4 w-4 ml-2" />
              تصدير PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => window.print()}
              className="border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              <Printer className="h-4 w-4 ml-2" />
              طباعة
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reports Tabs */}
      <Tabs value={state.activeTab} onValueChange={(value) => setState((prev) => ({ ...prev, activeTab: value }))}>
        <TabsList className="grid w-full grid-cols-4 bg-gray-100">
          <TabsTrigger value="pending" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            طلبات قيد التنفيذ
          </TabsTrigger>
          <TabsTrigger value="delayed" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
            طلبات متأخرة
          </TabsTrigger>
          <TabsTrigger value="delivered" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
            طلبات تم تسليمها
          </TabsTrigger>
          <TabsTrigger value="summary" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            إجمالي المبيعات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <Card className="erp-card">
            <CardHeader className="bg-blue-50 rounded-t-lg">
              <CardTitle className="text-blue-800 flex items-center">
                <Clock className="h-5 w-5 ml-2" />
                طلبات قيد التنفيذ
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="erp-table">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-right p-3 font-semibold text-gray-700">رقم الطلبية</th>
                      <th className="text-right p-3 font-semibold text-gray-700">التاريخ</th>
                      <th className="text-right p-3 font-semibold text-gray-700">العميل</th>
                      <th className="text-right p-3 font-semibold text-gray-700">المندوب</th>
                      <th className="text-right p-3 font-semibold text-gray-700">المبلغ</th>
                      <th className="text-right p-3 font-semibold text-gray-700">تاريخ التسليم</th>
                      <th className="text-right p-3 font-semibold text-gray-700">المستودع</th>
                      <th className="text-right p-3 font-semibold text-gray-700">الملاحظات</th>
                      <th className="text-center p-3 font-semibold text-gray-700">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.pendingOrders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-8 text-gray-500">
                          <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                          <p>لا توجد طلبات قيد التنفيذ حالياً</p>
                        </td>
                      </tr>
                    ) : (
                      state.pendingOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                          <td className="font-medium p-3">{order.id}</td>
                          <td className="p-3">{order.date}</td>
                          <td className="p-3">{order.customer}</td>
                          <td className="p-3">{order.salesman}</td>
                          <td className="p-3 font-semibold text-green-600">{order.amount} شيكل</td>
                          <td className="p-3">{order.deliveryDate}</td>
                          <td className="p-3">{order.warehouse}</td>
                          <td className="p-3">{order.notes}</td>
                          <td className="p-3 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="hover:bg-blue-50 hover:text-blue-700 bg-transparent"
                            >
                              عرض
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <UniversalToolbar
            currentPage={1}
            totalPages={1}
            totalItems={state.pendingOrders.length}
            onPageChange={() => {}}
            onFirst={() => {}}
            onPrevious={() => {}}
            onNext={() => {}}
            onLast={() => {}}
          />
        </TabsContent>

        <TabsContent value="delayed" className="space-y-4">
          <Card className="erp-card">
            <CardHeader className="bg-red-50 rounded-t-lg">
              <CardTitle className="text-red-800 flex items-center">
                <AlertTriangle className="h-5 w-5 ml-2" />
                الطلبات المتأخرة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-300" />
                <p className="text-lg font-medium">لا توجد طلبات متأخرة حالياً</p>
                <p className="text-sm text-gray-500 mt-2">جميع الطلبات في الموعد المحدد</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="delivered" className="space-y-4">
          <Card className="erp-card">
            <CardHeader className="bg-green-50 rounded-t-lg">
              <CardTitle className="text-green-800 flex items-center">
                <CheckCircle className="h-5 w-5 ml-2" />
                الطلبات المسلمة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p className="text-lg font-semibold text-green-700">234 طلبية تم تسليمها بنجاح</p>
                <p className="text-sm text-gray-600 mt-2">
                  نسبة التسليم في الوقت: <span className="font-semibold text-green-600">87%</span>
                </p>
                <div className="mt-4 w-full bg-gray-200 rounded-full h-2 max-w-xs mx-auto">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: "87%" }}></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="erp-card">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-lg">
                <CardTitle className="text-purple-800 flex items-center">
                  <BarChart3 className="h-5 w-5 ml-2" />
                  المبيعات الشهرية
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={state.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      }}
                      labelStyle={{ color: "#1e293b", fontWeight: "bold" }}
                    />
                    <Bar dataKey="sales" fill="url(#salesReportGradient)" radius={[4, 4, 0, 0]} />
                    <defs>
                      <linearGradient id="salesReportGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#6d28d9" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="erp-card">
              <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-t-lg">
                <CardTitle className="text-indigo-800 flex items-center">
                  <Target className="h-5 w-5 ml-2" />
                  أداء المندوبين
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-6">
                  {state.salesBySalesman.map((salesman, index) => (
                    <div
                      key={index}
                      className="space-y-3 p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg border border-blue-100"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-800">{salesman.name}</span>
                        <span className="text-sm font-semibold text-indigo-600">{salesman.achievement}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-gradient-to-r from-indigo-500 to-purple-600 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${salesman.achievement}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span className="flex items-center">
                          <ShoppingCart className="h-3 w-3 ml-1" />
                          {salesman.orders} طلبية
                        </span>
                        <span className="flex items-center font-semibold">
                          <DollarSign className="h-3 w-3 ml-1" />
                          {salesman.sales.toLocaleString()} شيكل
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}



