"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import {
  TrendingUp,
  TrendingDown,
  Package,
  AlertTriangle,
  DollarSign,
  BarChart3,
  Activity,
  Clock,
  Target,
  Zap,
  ArrowUp,
  ArrowDown,
  Filter,
} from "lucide-react"

interface InventoryMetrics {
  totalProducts: number
  totalValue: number
  lowStockItems: number
  outOfStockItems: number
  turnoverRate: number
  averageDaysToReorder: number
  topMovingProducts: Array<{
    name: string
    movement: number
    trend: "up" | "down"
  }>
  stockLevels: Array<{
    category: string
    current: number
    optimal: number
    status: "healthy" | "warning" | "critical"
  }>
  monthlyTrends: Array<{
    month: string
    stockValue: number
    movements: number
    orders: number
  }>
  predictiveAnalytics: {
    reorderAlerts: number
    demandForecast: Array<{
      product: string
      predictedDemand: number
      confidence: number
    }>
    seasonalTrends: Array<{
      period: string
      trend: number
      category: string
    }>
  }
}

const COLORS = ["#0070f3", "#00d9ff", "#7c3aed", "#f59e0b", "#10b981", "#ff4444"]

export function InventoryAnalytics() {
  const [timeRange, setTimeRange] = useState("30d")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<InventoryMetrics | null>(null)

  // Mock data - replace with actual API calls
  const mockMetrics: InventoryMetrics = {
    totalProducts: 1247,
    totalValue: 2847392,
    lowStockItems: 23,
    outOfStockItems: 7,
    turnoverRate: 4.2,
    averageDaysToReorder: 12,
    topMovingProducts: [
      { name: "منتج أ", movement: 245, trend: "up" },
      { name: "منتج ب", movement: 189, trend: "up" },
      { name: "منتج ج", movement: 156, trend: "down" },
      { name: "منتج د", movement: 134, trend: "up" },
    ],
    stockLevels: [
      { category: "إلكترونيات", current: 85, optimal: 100, status: "warning" },
      { category: "ملابس", current: 120, optimal: 100, status: "healthy" },
      { category: "أدوات منزلية", current: 45, optimal: 80, status: "critical" },
      { category: "كتب", current: 95, optimal: 90, status: "healthy" },
    ],
    monthlyTrends: [
      { month: "يناير", stockValue: 2100000, movements: 450, orders: 89 },
      { month: "فبراير", stockValue: 2250000, movements: 520, orders: 95 },
      { month: "مارس", stockValue: 2400000, movements: 580, orders: 102 },
      { month: "أبريل", stockValue: 2350000, movements: 610, orders: 98 },
      { month: "مايو", stockValue: 2600000, movements: 680, orders: 115 },
      { month: "يونيو", stockValue: 2847392, movements: 720, orders: 128 },
    ],
    predictiveAnalytics: {
      reorderAlerts: 15,
      demandForecast: [
        { product: "منتج أ", predictedDemand: 320, confidence: 87 },
        { product: "منتج ب", predictedDemand: 280, confidence: 92 },
        { product: "منتج ج", predictedDemand: 195, confidence: 78 },
      ],
      seasonalTrends: [
        { period: "الصيف", trend: 15, category: "إلكترونيات" },
        { period: "الشتاء", trend: -8, category: "ملابس" },
        { period: "العودة للمدارس", trend: 25, category: "كتب" },
      ],
    },
  }

  useEffect(() => {
    // Simulate API call
    const fetchMetrics = async () => {
      setLoading(true)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setMetrics(mockMetrics)
      setLoading(false)
    }
    fetchMetrics()
  }, [timeRange, selectedCategory])

  const getStatusIndicator = (status: string) => {
    switch (status) {
      case "healthy":
        return <div className="status-indicator healthy">صحي</div>
      case "warning":
        return <div className="status-indicator warning">تحذير</div>
      case "critical":
        return <div className="status-indicator critical">حرج</div>
      default:
        return <div className="status-indicator info">عادي</div>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل التحليلات...</p>
        </div>
      </div>
    )
  }

  if (!metrics) return null

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen" dir="rtl">
      {/* Header */}
      <div className="analytics-header">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            تحليلات المخزون المتقدمة
          </h1>
          <p className="text-muted-foreground mt-1">رؤى شاملة وتحليلات تنبؤية للمخزون</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40 bg-white border-blue-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">آخر 7 أيام</SelectItem>
              <SelectItem value="30d">آخر 30 يوم</SelectItem>
              <SelectItem value="90d">آخر 90 يوم</SelectItem>
              <SelectItem value="1y">آخر سنة</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="bg-white border-blue-200 hover:bg-blue-50">
            <Filter className="h-4 w-4 ml-2" />
            تصفية
          </Button>
        </div>
      </div>

      <div className="analytics-grid-4">
        <Card className="bg-gradient-to-br from-white to-blue-50 border-blue-200 shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">إجمالي المنتجات</p>
                <p className="text-3xl font-bold text-gray-900">{metrics.totalProducts.toLocaleString("en-US")}</p>
                <div className="flex items-center gap-1 text-sm">
                  <ArrowUp className="h-4 w-4 text-green-500" />
                  <span className="text-green-500 font-medium">+12%</span>
                  <span className="text-gray-500">من الشهر الماضي</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-3 rounded-full">
                <Package className="h-8 w-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white to-green-50 border-green-200 shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">قيمة المخزون</p>
                <p className="text-3xl font-bold text-gray-900">{metrics.totalValue.toLocaleString("en-US")} ر.س</p>
                <div className="flex items-center gap-1 text-sm">
                  <ArrowUp className="h-4 w-4 text-green-500" />
                  <span className="text-green-500 font-medium">+8.5%</span>
                  <span className="text-gray-500">من الشهر الماضي</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 p-3 rounded-full">
                <DollarSign className="h-8 w-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white to-yellow-50 border-yellow-200 shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-600">مخزون منخفض</p>
                <p className="text-3xl font-bold text-gray-900">{metrics.lowStockItems}</p>
                <div className="flex items-center gap-1 text-sm">
                  <ArrowDown className="h-4 w-4 text-red-500" />
                  <span className="text-red-500 font-medium">+3</span>
                  <span className="text-gray-500">من الأسبوع الماضي</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 p-3 rounded-full">
                <AlertTriangle className="h-8 w-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white to-purple-50 border-purple-200 shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">معدل الدوران</p>
                <p className="text-3xl font-bold text-gray-900">{metrics.turnoverRate}x</p>
                <div className="flex items-center gap-1 text-sm">
                  <ArrowUp className="h-4 w-4 text-green-500" />
                  <span className="text-green-500 font-medium">+0.3</span>
                  <span className="text-gray-500">من الربع الماضي</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-3 rounded-full">
                <Activity className="h-8 w-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 bg-white/80 backdrop-blur-sm border border-blue-200">
          <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="trends" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            الاتجاهات
          </TabsTrigger>
          <TabsTrigger value="predictive" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            التحليل التنبؤي
          </TabsTrigger>
          <TabsTrigger value="performance" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            الأداء
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="analytics-grid-2">
            <Card className="bg-gradient-to-br from-white to-blue-50/50 border-blue-200 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  مستويات المخزون حسب الفئة
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metrics.stockLevels}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                    <XAxis dataKey="category" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #dbeafe",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      }}
                    />
                    <Bar dataKey="current" fill="url(#blueGradient)" name="الحالي" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="optimal" fill="url(#cyanGradient)" name="المثالي" radius={[4, 4, 0, 0]} />
                    <defs>
                      <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#1d4ed8" />
                      </linearGradient>
                      <linearGradient id="cyanGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#0891b2" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-white to-green-50/50 border-green-200 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  المنتجات الأكثر حركة
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {metrics.topMovingProducts.map((product, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-gradient-to-r from-white to-green-50/30 rounded-lg border border-green-100 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-sm font-bold text-white">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{product.name}</p>
                          <p className="text-sm text-green-600 font-medium">{product.movement} حركة</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {product.trend === "up" ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                        <Badge
                          variant={product.trend === "up" ? "default" : "destructive"}
                          className={product.trend === "up" ? "bg-green-100 text-green-800 hover:bg-green-200" : ""}
                        >
                          {product.trend === "up" ? "صاعد" : "هابط"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Category Status Overview */}
          <Card className="analytics-card">
            <CardHeader>
              <CardTitle>حالة الفئات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics.stockLevels.map((category, index) => (
                  <div key={index} className="p-4 bg-muted/10 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{category.category}</h4>
                      {getStatusIndicator(category.status)}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>الحالي:</span>
                        <span className="font-medium">{category.current}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>المثالي:</span>
                        <span className="font-medium">{category.optimal}%</span>
                      </div>
                      <div className="w-full bg-muted/30 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            category.status === "healthy"
                              ? "bg-green-400"
                              : category.status === "warning"
                                ? "bg-yellow-400"
                                : "bg-red-400"
                          }`}
                          style={{ width: `${(category.current / category.optimal) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          {/* Monthly Trends */}
          <Card className="analytics-chart-container">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                الاتجاهات الشهرية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={metrics.monthlyTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="stockValue"
                    stackId="1"
                    stroke="#0070f3"
                    fill="#0070f3"
                    fillOpacity={0.3}
                    name="قيمة المخزون"
                  />
                  <Area
                    type="monotone"
                    dataKey="movements"
                    stackId="2"
                    stroke="#00d9ff"
                    fill="#00d9ff"
                    fillOpacity={0.3}
                    name="الحركات"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="predictive" className="space-y-6">
          <div className="analytics-grid-2">
            {/* Reorder Alerts */}
            <Card className="analytics-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  تنبيهات إعادة الطلب
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="analytics-metric-warning">{metrics.predictiveAnalytics.reorderAlerts}</div>
                  <p className="text-muted-foreground">منتج يحتاج إعادة طلب</p>
                  <Button className="mt-4" size="sm">
                    عرض التفاصيل
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Demand Forecast */}
            <Card className="analytics-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  توقعات الطلب
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {metrics.predictiveAnalytics.demandForecast.map((forecast, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted/10 rounded-lg">
                      <div>
                        <p className="font-medium">{forecast.product}</p>
                        <p className="text-sm text-muted-foreground">الطلب المتوقع: {forecast.predictedDemand}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">الثقة: {forecast.confidence}%</p>
                        <div className="w-16 bg-muted/30 rounded-full h-2 mt-1">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${forecast.confidence}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          {/* Performance Metrics */}
          <div className="analytics-grid-3">
            <Card className="analytics-card">
              <CardContent className="p-6 text-center">
                <Clock className="h-12 w-12 text-primary mx-auto mb-4" />
                <div className="analytics-metric-primary">{metrics.averageDaysToReorder}</div>
                <p className="text-muted-foreground">متوسط أيام إعادة الطلب</p>
              </CardContent>
            </Card>

            <Card className="analytics-card">
              <CardContent className="p-6 text-center">
                <Activity className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <div className="analytics-metric-success">{metrics.turnoverRate}x</div>
                <p className="text-muted-foreground">معدل دوران المخزون</p>
              </CardContent>
            </Card>

            <Card className="analytics-card">
              <CardContent className="p-6 text-center">
                <Target className="h-12 w-12 text-purple-400 mx-auto mb-4" />
                <div className="analytics-metric">94.2%</div>
                <p className="text-muted-foreground">دقة التوقعات</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
