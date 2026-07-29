"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { NotificationCenter } from "@/components/notifications/notification-center"
import { BatchPrintDialog } from "@/components/inventory/batch-print-dialog"
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts"
import { Clock, AlertTriangle, CheckCircle, Package, Search, Play, X, Eye } from "lucide-react"
import { cn } from "@/lib/utils"

interface DashboardStats {
  stageStats: any[]
  generalStats: {
    total_orders: number
    sales_orders: number
    purchase_orders: number
    overdue_orders: number
    completed_orders: number
    avg_stage_duration: number
  }
  recentOrders: any[]
  overdueOrders: any[]
  dailyStats: any[]
}

interface Order {
  id: number
  order_id: number
  order_type: string
  order_number: string
  current_stage_id: number
  stage_name: string
  stage_color: string
  icon_name: string
  partner_name: string
  total_amount: number
  priority_level: string
  is_overdue: boolean
  hours_in_stage: number
  stage_start_time: string
}

const COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"]

export function OrderTrackingDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardStats | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all")
  const [selectedStage, setSelectedStage] = useState<string>("all")
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // جلب بيانات لوحة التحكم
  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedDepartment !== "all") params.append("department", selectedDepartment)

      const response = await fetch(`/api/workflow/dashboard?${params}`)
      const data = await response.json()

      if (response.ok) {
        setDashboardData(data)
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  // جلب الطلبيات
  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedStage !== "all") params.append("stage_id", selectedStage)
      if (selectedDepartment !== "all") params.append("department", selectedDepartment)
      if (orderTypeFilter !== "all") params.append("order_type", orderTypeFilter)
      if (statusFilter !== "all") params.append("status", statusFilter)
      params.append("limit", "50")

      const response = await fetch(`/api/workflow/orders?${params}`)
      const data = await response.json()

      if (response.ok) {
        setOrders(Array.isArray(data.orders) ? data.orders : [])
      } else {
        setOrders([])
        console.error("Error fetching orders:", data.error)
      }
    } catch (error) {
      console.error("Error fetching orders:", error)
      setOrders([])
    }
  }

  // تقدم الطلبية
  const advanceOrder = async (orderId: number, orderType: string) => {
    try {
      const response = await fetch(`/api/workflow/orders/${orderId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType,
          performedByUser: "المستخدم الحالي",
          performedByDepartment: selectedDepartment || "عام",
          notes: "تم التقدم من لوحة التحكم",
        }),
      })

      if (response.ok) {
        await fetchOrders()
        await fetchDashboardData()
      }
    } catch (error) {
      console.error("Error advancing order:", error)
    }
  }

  // تحديث أولوية الطلبية
  const updatePriority = async (orderId: number, orderType: string, priority: string) => {
    try {
      const response = await fetch(`/api/workflow/orders/${orderId}/priority`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderType, priority_level: priority }),
      })

      if (response.ok) {
        await fetchOrders()
      }
    } catch (error) {
      console.error("Error updating priority:", error)
    }
  }

  // رفض الطلبية
  const rejectOrder = async (orderId: number, orderType: string, reason: string) => {
    try {
      const response = await fetch(`/api/workflow/orders/${orderId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType,
          performedByUser: "المستخدم الحالي",
          performedByDepartment: selectedDepartment || "عام",
          reason,
          notes: "تم الرفض من لوحة التحكم",
        }),
      })

      if (response.ok) {
        await fetchOrders()
        await fetchDashboardData()
      }
    } catch (error) {
      console.error("Error rejecting order:", error)
    }
  }

  // الحصول على لون الأولوية
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800 border-red-200"
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200"
      case "normal":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "low":
        return "bg-gray-100 text-gray-800 border-gray-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  // تصفية الطلبيات
  const filteredOrders = Array.isArray(orders)
    ? orders.filter((order) => {
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          return (
            order.order_number.toLowerCase().includes(query) ||
            order.partner_name?.toLowerCase().includes(query) ||
            order.stage_name.toLowerCase().includes(query)
          )
        }
        return true
      })
    : []

  useEffect(() => {
    fetchDashboardData()
  }, [selectedDepartment])

  useEffect(() => {
    fetchOrders()
  }, [selectedStage, selectedDepartment, orderTypeFilter, statusFilter])

  if (loading && !dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="p-6 dir-rtl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-primary">لوحة تحكم متابعة الطلبيات</h1>
          <p className="text-muted-foreground">متابعة شاملة لجميع الطلبيات ومراحل العمل</p>
        </div>
        <div className="flex items-center gap-4">
          <NotificationCenter department={selectedDepartment} />
          <BatchPrintDialog />
          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="جميع الأقسام" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الأقسام</SelectItem>
              <SelectItem value="المبيعات">المبيعات</SelectItem>
              <SelectItem value="المشتريات">المشتريات</SelectItem>
              <SelectItem value="المحاسبة">المحاسبة</SelectItem>
              <SelectItem value="المستودعات">المستودعات</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* إحصائيات سريعة */}
      {dashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">إجمالي الطلبيات</p>
                  <p className="text-2xl font-bold">{dashboardData.generalStats.total_orders}</p>
                </div>
                <Package className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">طلبيات متأخرة</p>
                  <p className="text-2xl font-bold text-red-600">{dashboardData.generalStats.overdue_orders}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">طلبيات مكتملة</p>
                  <p className="text-2xl font-bold text-green-600">{dashboardData.generalStats.completed_orders}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">متوسط المدة</p>
                  <p className="text-2xl font-bold">
                    {Math.round(dashboardData.generalStats.avg_stage_duration || 0)}س
                  </p>
                </div>
                <Clock className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="stages">المراحل</TabsTrigger>
          <TabsTrigger value="orders">الطلبيات</TabsTrigger>
          <TabsTrigger value="analytics">التحليلات</TabsTrigger>
        </TabsList>

        {/* نظرة عامة */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* الطلبيات الحديثة */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  الطلبيات الحديثة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80">
                  <div className="space-y-3">
                    {dashboardData?.recentOrders.map((order) => (
                      <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: order.stage_color }} />
                          <div>
                            <p className="font-medium">{order.order_number}</p>
                            <p className="text-sm text-muted-foreground">{order.partner_name}</p>
                          </div>
                        </div>
                        <div className="text-left">
                          <Badge variant="outline">{order.stage_name}</Badge>
                          <p className="text-sm text-muted-foreground mt-1">{Math.round(order.hours_in_stage)}س</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* الطلبيات المتأخرة */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  الطلبيات المتأخرة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80">
                  <div className="space-y-3">
                    {dashboardData?.overdueOrders.map((order) => (
                      <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg bg-red-50">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <div>
                            <p className="font-medium">{order.order_number}</p>
                            <p className="text-sm text-muted-foreground">{order.partner_name}</p>
                          </div>
                        </div>
                        <div className="text-left">
                          <Badge variant="destructive">{order.stage_name}</Badge>
                          <p className="text-sm text-red-600 mt-1">متأخر {Math.round(order.hours_overdue)}س</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* المراحل */}
        <TabsContent value="stages" className="space-y-6">
          {dashboardData && dashboardData.stageStats && Array.isArray(dashboardData.stageStats) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {dashboardData.stageStats.map((stage) => (
                <Card key={stage.stage_name} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: stage.stage_color }} />
                        <h3 className="font-semibold">{stage.stage_name}</h3>
                      </div>
                      <Badge variant="outline">{stage.order_count} طلبية</Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>متأخرة:</span>
                        <span className="text-red-600">{stage.overdue_count}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>متوسط المدة:</span>
                        <span>{Math.round(stage.avg_hours_in_stage || 0)}س</span>
                      </div>
                    </div>

                    <Progress
                      value={stage.overdue_count > 0 ? (stage.overdue_count / stage.order_count) * 100 : 0}
                      className="mt-4"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {(!dashboardData || !dashboardData.stageStats || !Array.isArray(dashboardData.stageStats)) && (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground">لا توجد بيانات مراحل متاحة</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* الطلبيات */}
        <TabsContent value="orders" className="space-y-6">
          {/* فلاتر */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-64">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="البحث في الطلبيات..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-10"
                    />
                  </div>
                </div>

                <Select value={selectedStage} onValueChange={setSelectedStage}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="جميع المراحل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المراحل</SelectItem>
                    {dashboardData?.stageStats &&
                      Array.isArray(dashboardData.stageStats) &&
                      dashboardData.stageStats.map((stage) => (
                        <SelectItem key={stage.stage_name} value={stage.stage_name}>
                          {stage.stage_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="نوع الطلبية" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الأنواع</SelectItem>
                    <SelectItem value="sales">أوامر البيع</SelectItem>
                    <SelectItem value="purchase">أوامر الشراء</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    <SelectItem value="normal">عادية</SelectItem>
                    <SelectItem value="overdue">متأخرة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* قائمة الطلبيات */}
          <Card>
            <CardHeader>
              <CardTitle>الطلبيات ({filteredOrders.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className={cn(
                      "flex items-center justify-between p-4 border rounded-lg transition-colors",
                      order.is_overdue ? "bg-red-50 border-red-200" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: order.stage_color }} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{order.order_number}</p>
                          <Select
                            value={order.priority_level}
                            onValueChange={(value) => updatePriority(order.order_id, order.order_type, value)}
                          >
                            <SelectTrigger className={cn("h-6 w-24 px-2 text-xs", getPriorityColor(order.priority_level))}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="urgent">عاجلة</SelectItem>
                              <SelectItem value="high">عالية</SelectItem>
                              <SelectItem value="normal">عادية</SelectItem>
                              <SelectItem value="low">منخفضة</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-sm text-muted-foreground">{order.partner_name}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <Badge variant="outline">{order.stage_name}</Badge>
                        <p className="text-sm text-muted-foreground mt-1">{Math.round(order.hours_in_stage)}س</p>
                      </div>

                      <div className="text-left">
                        <p className="font-medium">
                          {order.total_amount?.toLocaleString("ar-SA", {
                            style: "currency",
                            currency: "SAR",
                          })}
                        </p>
                        <p className="text-sm text-muted-foreground">{order.order_type === "sales" ? "بيع" : "شراء"}</p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => advanceOrder(order.order_id, order.order_type)}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rejectOrder(order.order_id, order.order_type, "رفض من لوحة التحكم")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* التحليلات */}
        <TabsContent value="analytics" className="space-y-6">
          {dashboardData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* إحصائيات المراحل */}
              <Card>
                <CardHeader>
                  <CardTitle>توزيع الطلبيات حسب المراحل</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboardData.stageStats &&
                  Array.isArray(dashboardData.stageStats) &&
                  dashboardData.stageStats.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={dashboardData.stageStats}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ stage_name, order_count }) => `${stage_name}: ${order_count}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="order_count"
                        >
                          {dashboardData.stageStats.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px]">
                      <p className="text-muted-foreground">لا توجد بيانات للعرض</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* الأداء اليومي */}
              <Card>
                <CardHeader>
                  <CardTitle>الأداء اليومي</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dashboardData.dailyStats}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="total_actions" stroke="#3B82F6" name="إجمالي الإجراءات" />
                      <Line type="monotone" dataKey="advances" stroke="#10B981" name="تقدم" />
                      <Line type="monotone" dataKey="rejections" stroke="#EF4444" name="رفض" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
