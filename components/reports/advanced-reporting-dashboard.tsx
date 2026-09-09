"use client"

import { ReportFilters } from "@/components/reports/report-filters"

import { useState, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts"
import {
  Download,
  Package,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Archive,
  BarChart3,
  PieChartIcon,
  Activity,
  Users,
  ShoppingCart,
  RefreshCw,
} from "lucide-react"

// Sample data for charts
const salesTrendData = [
  { month: "يناير", sales: 45000, purchases: 32000, profit: 13000 },
  { month: "فبراير", sales: 52000, purchases: 38000, profit: 14000 },
  { month: "مارس", sales: 48000, purchases: 35000, profit: 13000 },
  { month: "أبريل", sales: 61000, purchases: 42000, profit: 19000 },
  { month: "مايو", sales: 55000, purchases: 39000, profit: 16000 },
  { month: "يونيو", sales: 67000, purchases: 45000, profit: 22000 },
]

const categoryData = [
  { name: "إلكترونيات", value: 35, color: "#8884d8" },
  { name: "أدوات منزلية", value: 25, color: "#82ca9d" },
  { name: "ملابس", value: 20, color: "#ffc658" },
  { name: "كتب", value: 12, color: "#ff7300" },
  { name: "أخرى", value: 8, color: "#00ff88" },
]

const topProductsData = [
  { name: "لابتوب ديل", sales: 45, revenue: 112500 },
  { name: "طابعة HP", sales: 32, revenue: 25600 },
  { name: "ماوس لاسلكي", sales: 78, revenue: 15600 },
  { name: "كيبورد ميكانيكي", sales: 23, revenue: 11500 },
  { name: "شاشة سامسونج", sales: 15, revenue: 37500 },
]

const inventoryStatusData = [
  { status: "متوفر", count: 245, percentage: 68 },
  { status: "تحت الحد الأدنى", count: 45, percentage: 12 },
  { status: "نفد المخزون", count: 15, percentage: 4 },
  { status: "فائض", count: 55, percentage: 16 },
]

const kpiData = [
  {
    title: "إجمالي المبيعات",
    value: "328,450",
    unit: "شيكل",
    change: "+12.5%",
    trend: "up",
    icon: DollarSign,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  {
    title: "إجمالي المشتريات",
    value: "231,200",
    unit: "شيكل",
    change: "+8.3%",
    trend: "up",
    icon: ShoppingCart,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    title: "صافي الربح",
    value: "97,250",
    unit: "شيكل",
    change: "+18.7%",
    trend: "up",
    icon: TrendingUp,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
  {
    title: "عدد العملاء النشطين",
    value: "156",
    unit: "عميل",
    change: "+5.2%",
    trend: "up",
    icon: Users,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
  },
  {
    title: "عدد الطلبيات",
    value: "89",
    unit: "طلبية",
    change: "-2.1%",
    trend: "down",
    icon: Package,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
  },
  {
    title: "متوسط قيمة الطلبية",
    value: "3,690",
    unit: "شيكل",
    change: "+15.3%",
    trend: "up",
    icon: BarChart3,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
  },
]

export function AdvancedReportingDashboard() {
  const [state, setState] = useState({
    activeTab: "overview",
    dateRange: "thisMonth",
    refreshing: false,
    filters: {
      fromDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
      toDate: new Date().toISOString().split("T")[0],
      category: "all",
      warehouse: "all",
      customer: "all",
      supplier: "all",
    },
  })

  const handleFilterChange = useCallback((key: string, value: string) => {
    setState((prev) => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
    }))
  }, [])

  const refreshData = useCallback(async () => {
    setState((prev) => ({ ...prev, refreshing: true }))
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setState((prev) => ({ ...prev, refreshing: false }))
  }, [])

  const exportReport = useCallback((format: string, reportType: string) => {
    console.log(`تصدير تقرير ${reportType} بصيغة ${format}`)
  }, [])

  const kpiCards = useMemo(() => {
    return kpiData.map((kpi, index) => (
      <Card
        key={index}
        className="erp-card hover:shadow-lg transition-all duration-200 border-l-4"
        style={{ borderLeftColor: kpi.color.replace("text-", "#") }}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
            <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold mb-1">
            {kpi.value} <span className="text-sm font-normal text-muted-foreground">{kpi.unit}</span>
          </div>
          <p className={`text-xs flex items-center ${kpi.trend === "up" ? "text-green-600" : "text-red-600"}`}>
            {kpi.trend === "up" ? <TrendingUp className="h-3 w-3 ml-1" /> : <TrendingDown className="h-3 w-3 ml-1" />}
            {kpi.change} من الشهر الماضي
          </p>
        </CardContent>
      </Card>
    ))
  }, [])

  return (
    <div className="space-y-6">
      {/* Header with filters and actions */}
      <ReportFilters>
        <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-t-lg">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center text-blue-800">
              <BarChart3 className="h-6 w-6 ml-2" />
              لوحة التقارير المتقدمة
            </CardTitle>
            <div className="flex gap-2">
              <Button data-report-apply
                onClick={refreshData}
                disabled={state.refreshing}
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-700 hover:bg-blue-50 bg-transparent"
              >
                <RefreshCw className={`h-4 w-4 ml-2 ${state.refreshing ? "animate-spin" : ""}`} />
                {state.refreshing ? "جاري التحديث..." : "تحديث البيانات"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-green-300 text-green-700 hover:bg-green-50 bg-transparent"
                onClick={() => exportReport("excel", "شامل")}
              >
                <Download className="h-4 w-4 ml-2" />
                تصدير شامل
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">من تاريخ:</Label>
              <Input
                type="date"
                value={state.filters.fromDate}
                onChange={(e) => handleFilterChange("fromDate", e.target.value)}
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">إلى تاريخ:</Label>
              <Input
                type="date"
                value={state.filters.toDate}
                onChange={(e) => handleFilterChange("toDate", e.target.value)}
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">المجموعة:</Label>
              <Select value={state.filters.category} onValueChange={(value) => handleFilterChange("category", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="جميع المجموعات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المجموعات</SelectItem>
                  <SelectItem value="electronics">إلكترونيات</SelectItem>
                  <SelectItem value="home">أدوات منزلية</SelectItem>
                  <SelectItem value="clothes">ملابس</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">المستودع:</Label>
              <Select value={state.filters.warehouse} onValueChange={(value) => handleFilterChange("warehouse", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="جميع المستودعات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المستودعات</SelectItem>
                  <SelectItem value="main">المستودع الرئيسي</SelectItem>
                  <SelectItem value="branch">مستودع الفرع</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">العميل:</Label>
              <Select value={state.filters.customer} onValueChange={(value) => handleFilterChange("customer", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="جميع العملاء" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع العملاء</SelectItem>
                  <SelectItem value="customer1">أحمد علي</SelectItem>
                  <SelectItem value="customer2">فاطمة محمد</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">المورد:</Label>
              <Select value={state.filters.supplier} onValueChange={(value) => handleFilterChange("supplier", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="جميع الموردين" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الموردين</SelectItem>
                  <SelectItem value="supplier1">شركة التقنية</SelectItem>
                  <SelectItem value="supplier2">مؤسسة الجودة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </ReportFilters>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{kpiCards}</div>

      {/* Main Dashboard Tabs */}
      <Tabs value={state.activeTab} onValueChange={(value) => setState((prev) => ({ ...prev, activeTab: value }))}>
        <TabsList className="grid w-full grid-cols-6 bg-gray-100">
          <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="sales" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
            المبيعات
          </TabsTrigger>
          <TabsTrigger value="purchases" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            المشتريات
          </TabsTrigger>
          <TabsTrigger value="inventory" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">
            المخزون
          </TabsTrigger>
          <TabsTrigger value="financial" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
            المالية
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
            التحليلات
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales Trend Chart */}
            <Card className="erp-card">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-t-lg">
                <CardTitle className="flex items-center text-blue-800">
                  <TrendingUp className="h-5 w-5 ml-2" />
                  اتجاه المبيعات والمشتريات
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={salesTrendData}>
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
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stackId="1"
                      stroke="#3b82f6"
                      fill="url(#salesAreaGradient)"
                      name="المبيعات"
                    />
                    <Area
                      type="monotone"
                      dataKey="purchases"
                      stackId="1"
                      stroke="#10b981"
                      fill="url(#purchasesAreaGradient)"
                      name="المشتريات"
                    />
                    <defs>
                      <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="purchasesAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Category Distribution */}
            <Card className="erp-card">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-t-lg">
                <CardTitle className="flex items-center text-purple-800">
                  <PieChartIcon className="h-5 w-5 ml-2" />
                  توزيع المبيعات حسب المجموعة
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => {
                        const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      })}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Top Products and Inventory Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Products */}
            <Card className="erp-card">
              <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-lg">
                <CardTitle className="flex items-center text-green-800">
                  <Package className="h-5 w-5 ml-2" />
                  أفضل المنتجات مبيعاً
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {topProductsData.map((product, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-100"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-sm">{index + 1}</span>
                        </div>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-gray-600">{product.sales} قطعة</p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-green-600">{product.revenue.toLocaleString()} شيكل</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Inventory Status */}
            <Card className="erp-card">
              <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-t-lg">
                <CardTitle className="flex items-center text-orange-800">
                  <Archive className="h-5 w-5 ml-2" />
                  حالة المخزون
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {inventoryStatusData.map((status, index) => {
                    const colors = ["bg-green-500", "bg-yellow-500", "bg-red-500", "bg-blue-500"]
                    return (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{status.status}</span>
                          <span className="text-sm text-gray-600">{status.count} صنف</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`${colors[index]} h-2 rounded-full transition-all duration-500`}
                            style={{ width: `${status.percentage}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 text-left">{status.percentage}%</div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Sales Tab */}
        <TabsContent value="sales" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="erp-card">
              <CardHeader className="bg-gradient-to-r from-green-50 to-teal-50 rounded-t-lg">
                <CardTitle className="flex items-center text-green-800">
                  <BarChart3 className="h-5 w-5 ml-2" />
                  تحليل المبيعات الشهرية
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesTrendData}>
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
                    />
                    <Legend />
                    <Bar dataKey="sales" fill="url(#salesBarGradient)" name="المبيعات" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" fill="url(#profitBarGradient)" name="الربح" radius={[4, 4, 0, 0]} />
                    <defs>
                      <linearGradient id="salesBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                      <linearGradient id="profitBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#1d4ed8" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="erp-card">
              <CardHeader>
                <CardTitle className="flex items-center text-blue-800">
                  <Activity className="h-5 w-5 ml-2" />
                  أداء المبيعات اليومي
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 text-blue-300" />
                  <p className="text-lg font-medium">تحليل المبيعات اليومية</p>
                  <p className="text-sm text-gray-500 mt-2">سيتم عرض البيانات التفصيلية هنا</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Other tabs with placeholder content */}
        <TabsContent value="purchases" className="space-y-6">
          <Card className="erp-card">
            <CardHeader>
              <CardTitle className="flex items-center text-purple-800">
                <ShoppingCart className="h-5 w-5 ml-2" />
                تقارير المشتريات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-purple-300" />
                <p className="text-lg font-medium">تقارير المشتريات المتقدمة</p>
                <p className="text-sm text-gray-500 mt-2">قريباً - تحليلات شاملة للمشتريات</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          <Card className="erp-card">
            <CardHeader>
              <CardTitle className="flex items-center text-orange-800">
                <Package className="h-5 w-5 ml-2" />
                تحليلات المخزون
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 text-orange-300" />
                <p className="text-lg font-medium">تحليلات المخزون المتقدمة</p>
                <p className="text-sm text-gray-500 mt-2">قريباً - تقارير شاملة للمخزون</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="space-y-6">
          <Card className="erp-card">
            <CardHeader>
              <CardTitle className="flex items-center text-teal-800">
                <DollarSign className="h-5 w-5 ml-2" />
                التقارير المالية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-4 text-teal-300" />
                <p className="text-lg font-medium">التقارير المالية المتقدمة</p>
                <p className="text-sm text-gray-500 mt-2">قريباً - تحليلات مالية شاملة</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card className="erp-card">
            <CardHeader>
              <CardTitle className="flex items-center text-indigo-800">
                <BarChart3 className="h-5 w-5 ml-2" />
                التحليلات المتقدمة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-indigo-300" />
                <p className="text-lg font-medium">التحليلات والذكاء الاصطناعي</p>
                <p className="text-sm text-gray-500 mt-2">قريباً - تحليلات ذكية وتوقعات</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
