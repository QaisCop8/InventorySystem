"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Users,
  Package,
  Search,
  Filter,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface WorkflowOrder {
  id: number
  order_id: number
  order_type: "sales" | "purchase"
  current_stage_id: number
  stage_name: string
  stage_color: string
  icon_name: string
  stage_type: "approval" | "processing" | "completion"
  requires_approval: boolean
  sequence_name: string
  partner_name: string
  total_amount: number
  order_date: string
  priority_level: "urgent" | "high" | "normal" | "low"
  is_overdue: boolean
  assigned_to_department: string
  assigned_to_user?: string
  stage_start_time: string
  hours_in_stage: number
}

interface WorkflowStatistics {
  totalOrders: number
  pendingOrders: number
  completedOrders: number
  overdueOrders: number
  averageProcessingTime: number
  departmentStats: Array<{
    department: string
    pending: number
    completed: number
    overdue: number
  }>
  stageStats: Array<{
    stage_name: string
    count: number
    avg_time: number
  }>
}

const priorityColors = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  normal: "bg-blue-500",
  low: "bg-gray-500",
}

const priorityLabels = {
  urgent: "عاجل",
  high: "عالي",
  normal: "عادي",
  low: "منخفض",
}

export function WorkflowDashboard() {
  const [orders, setOrders] = useState<WorkflowOrder[]>([])
  const [statistics, setStatistics] = useState<WorkflowStatistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all")
  const [selectedOrderType, setSelectedOrderType] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalOrders, setTotalOrders] = useState(0)
  const ordersPerPage = 20

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedDepartment !== "all") params.append("department", selectedDepartment)
      if (selectedOrderType !== "all") params.append("order_type", selectedOrderType)
      if (selectedStatus !== "all") params.append("status", selectedStatus)
      params.append("limit", ordersPerPage.toString())
      params.append("offset", ((currentPage - 1) * ordersPerPage).toString())

      const response = await fetch(`/api/workflow/orders?${params}`)
      const data = await response.json()

      if (response.ok) {
        setOrders(data.orders)
        setTotalOrders(data.total)
      }
    } catch (error) {
      console.error("Error fetching orders:", error)
    }
  }

  const fetchStatistics = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedDepartment !== "all") params.append("department", selectedDepartment)

      const response = await fetch(`/api/workflow/statistics?${params}`)
      const data = await response.json()

      if (response.ok) {
        setStatistics(data.data)
      }
    } catch (error) {
      console.error("Error fetching statistics:", error)
    }
  }

  const handleAdvanceOrder = async (orderId: number, orderType: string) => {
    try {
      const response = await fetch(`/api/workflow/orders/${orderId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType,
          performedByUser: "current_user", // يجب استبدالها بالمستخدم الحالي
          performedByDepartment: selectedDepartment,
          notes: "تم التقديم من لوحة التحكم",
        }),
      })

      if (response.ok) {
        fetchOrders()
        fetchStatistics()
      }
    } catch (error) {
      console.error("Error advancing order:", error)
    }
  }

  const handleRejectOrder = async (orderId: number, orderType: string, reason: string) => {
    try {
      const response = await fetch(`/api/workflow/orders/${orderId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType,
          performedByUser: "current_user", // يجب استبدالها بالمستخدم الحالي
          performedByDepartment: selectedDepartment,
          reason,
          notes: "تم الرفض من لوحة التحكم",
        }),
      })

      if (response.ok) {
        fetchOrders()
        fetchStatistics()
      }
    } catch (error) {
      console.error("Error rejecting order:", error)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([fetchOrders(), fetchStatistics()])
      setLoading(false)
    }
    loadData()
  }, [selectedDepartment, selectedOrderType, selectedStatus, currentPage])

  const filteredOrders = orders.filter(
    (order) =>
      searchTerm === "" ||
      order.partner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.sequence_name.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const totalPages = Math.ceil(totalOrders / ordersPerPage)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* إحصائيات سريعة */}
      {statistics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الطلبيات</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalOrders}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">قيد المعالجة</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.pendingOrders}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">مكتملة</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.completedOrders}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">متأخرة</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{statistics.overdueOrders}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders">الطلبيات</TabsTrigger>
          <TabsTrigger value="analytics">التحليلات</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          {/* فلاتر البحث */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                فلاتر البحث
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium">القسم</label>
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الأقسام</SelectItem>
                      <SelectItem value="sales">المبيعات</SelectItem>
                      <SelectItem value="purchasing">المشتريات</SelectItem>
                      <SelectItem value="warehouse">المستودع</SelectItem>
                      <SelectItem value="finance">المالية</SelectItem>
                      <SelectItem value="management">الإدارة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">نوع الطلبية</label>
                  <Select value={selectedOrderType} onValueChange={setSelectedOrderType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الأنواع</SelectItem>
                      <SelectItem value="sales">مبيعات</SelectItem>
                      <SelectItem value="purchase">مشتريات</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">الحالة</label>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الحالات</SelectItem>
                      <SelectItem value="normal">عادية</SelectItem>
                      <SelectItem value="overdue">متأخرة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">البحث</label>
                  <div className="relative">
                    <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="اسم العميل أو المورد..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pr-10"
                    />
                  </div>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={() => {
                      fetchOrders()
                      fetchStatistics()
                    }}
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    تحديث
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* قائمة الطلبيات */}
          <Card>
            <CardHeader>
              <CardTitle>الطلبيات ({totalOrders})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredOrders.map((order) => (
                  <div
                    key={`${order.order_type}-${order.order_id}`}
                    className={cn("p-4 border rounded-lg", order.is_overdue && "border-red-200 bg-red-50")}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={order.order_type === "sales" ? "default" : "secondary"}>
                            {order.order_type === "sales" ? "مبيعات" : "مشتريات"} #{order.order_id}
                          </Badge>
                          <Badge className={cn("text-white", priorityColors[order.priority_level])}>
                            {priorityLabels[order.priority_level]}
                          </Badge>
                          {order.is_overdue && (
                            <Badge variant="destructive">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              متأخر
                            </Badge>
                          )}
                        </div>

                        <div className="text-lg font-semibold">{order.partner_name}</div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>المبلغ: {order.total_amount.toLocaleString("en-US")} ريال</span>
                          <span>التاريخ: {new Date(order.order_date).toLocaleDateString("en-GB")}</span>
                          <span>في المرحلة: {Math.round(order.hours_in_stage)} ساعة</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-center">
                          <div
                            className="w-3 h-3 rounded-full mx-auto mb-1"
                            style={{ backgroundColor: order.stage_color }}
                          />
                          <div className="text-xs font-medium">{order.stage_name}</div>
                          <div className="text-xs text-muted-foreground">{order.assigned_to_department}</div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            onClick={() => handleAdvanceOrder(order.order_id, order.order_type)}
                            className="h-8"
                          >
                            <ArrowRight className="h-3 w-3 mr-1" />
                            تقديم
                          </Button>

                          {order.stage_type === "approval" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRejectOrder(order.order_id, order.order_type, "رفض من لوحة التحكم")}
                              className="h-8"
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              رفض
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* التنقل بين الصفحات */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-muted-foreground">
                    {`عرض ${(currentPage - 1) * ordersPerPage + 1} إلى ${Math.min(currentPage * ordersPerPage, totalOrders)} من ${totalOrders}`}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      السابق
                    </Button>

                    <span className="text-sm">
                      صفحة {currentPage} من {totalPages}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      التالي
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          {statistics && (
            <>
              {/* إحصائيات الأقسام */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    إحصائيات الأقسام
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {statistics.departmentStats.map((dept) => (
                      <div key={dept.department} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{dept.department}</span>
                          <span className="text-sm text-muted-foreground">{dept.pending + dept.completed} طلبية</span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div className="text-center">
                            <div className="text-yellow-600 font-medium">{dept.pending}</div>
                            <div className="text-muted-foreground">قيد المعالجة</div>
                          </div>
                          <div className="text-center">
                            <div className="text-green-600 font-medium">{dept.completed}</div>
                            <div className="text-muted-foreground">مكتملة</div>
                          </div>
                          <div className="text-center">
                            <div className="text-red-600 font-medium">{dept.overdue}</div>
                            <div className="text-muted-foreground">متأخرة</div>
                          </div>
                        </div>

                        <Progress value={(dept.completed / (dept.pending + dept.completed)) * 100} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* إحصائيات المراحل */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    إحصائيات المراحل
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {statistics.stageStats.map((stage) => (
                      <div key={stage.stage_name} className="flex justify-between items-center p-3 border rounded">
                        <div>
                          <div className="font-medium">{stage.stage_name}</div>
                          <div className="text-sm text-muted-foreground">
                            متوسط الوقت: {Math.round(stage.avg_time)} ساعة
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{stage.count}</div>
                          <div className="text-sm text-muted-foreground">طلبية</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* معلومات إضافية */}
              <Card>
                <CardHeader>
                  <CardTitle>معلومات عامة</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">متوسط وقت المعالجة</div>
                      <div className="text-2xl font-bold">{Math.round(statistics.averageProcessingTime)} ساعة</div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">معدل الإنجاز</div>
                      <div className="text-2xl font-bold">
                        {Math.round((statistics.completedOrders / statistics.totalOrders) * 100)}%
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
