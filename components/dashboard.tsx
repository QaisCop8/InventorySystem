"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Plus, ShoppingCart, Clock, CheckCircle, AlertCircle, BarChart3 } from "lucide-react"
import UnifiedSalesOrder from "./orders/unified-sales-order"
import { useDashboardStats, useExchangeRates } from "@/hooks/use-swr-data"
import { LoadingCard } from "@/components/ui/loading-spinner"
import { ErrorBoundary } from "@/components/error-boundary"
import { QuickAccessFavorites } from "@/components/dashboard/quick-access-favorites"
import { getFirstCurrencyLabel } from "@/lib/currency-display"

const salesData = [
  { month: "يناير", sales: 4000, orders: 24 },
  { month: "فبراير", sales: 3000, orders: 18 },
  { month: "مارس", sales: 5000, orders: 32 },
  { month: "أبريل", sales: 4500, orders: 28 },
  { month: "مايو", sales: 6000, orders: 38 },
  { month: "يونيو", sales: 5500, orders: 35 },
]

const formatEnglishNumber = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)

function DashboardContent() {
  const [showUnifiedOrder, setShowUnifiedOrder] = useState(false)
  const { stats, isLoading, isError, refresh } = useDashboardStats()
  const { rates: currencies } = useExchangeRates()
  const currencyLabel = getFirstCurrencyLabel(currencies)

  const updateOrderStatus = async (orderType: string, orderId: number, newStatus: string) => {
    try {
      const response = await fetch("/api/orders/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType,
          orderId,
          newStatus,
          reason: "تحديث من لوحة التحكم",
          changedBy: "المستخدم الحالي",
        }),
      })

      if (response.ok) {
        refresh() // Refresh data using SWR
      }
    } catch (error) {
      console.error("Error updating order status:", error)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: "معلق", variant: "secondary" as const, icon: Clock },
      approved: { label: "معتمد", variant: "default" as const, icon: CheckCircle },
      completed: { label: "مكتمل", variant: "default" as const, icon: CheckCircle },
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    )
  }

  if (isLoading) {
    return <LoadingCard title="جاري تحميل لوحة التحكم..." description="يرجى الانتظار..." />
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4" dir="rtl">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <h3 className="text-lg font-medium">خطأ في تحميل البيانات</h3>
        <p className="text-sm text-muted-foreground">حدث خطأ أثناء تحميل بيانات لوحة التحكم</p>
        <Button onClick={() => refresh()} variant="outline">
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <QuickAccessFavorites />

      <div className="flex gap-4 mb-6">
        <Button onClick={() => setShowUnifiedOrder(true)} className="erp-btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          طلبية مبيعات جديدة
        </Button>
        <Button variant="outline" className="flex items-center gap-2 bg-transparent">
          <ShoppingCart className="h-4 w-4" />
          عرض جميع الطلبيات
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="erp-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">طلبيات المبيعات المعلقة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatEnglishNumber(stats?.salesStats.pending_sales || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              من إجمالي {formatEnglishNumber(stats?.salesStats.total_sales_orders || 0)} طلبية
            </p>
          </CardContent>
        </Card>

        <Card className="erp-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">طلبيات المشتريات المعلقة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatEnglishNumber(stats?.purchaseStats.pending_purchases || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              من إجمالي {formatEnglishNumber(stats?.purchaseStats.total_purchase_orders || 0)} طلبية
            </p>
          </CardContent>
        </Card>

        <Card className="erp-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي قيمة المبيعات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {(stats?.salesStats.total_sales_value !== null
                ? stats?.salesStats.total_sales_value
                : 0
              ).toLocaleString("en-US")}{" "}
              {currencyLabel}
            </div>
            <p className="text-xs text-muted-foreground">
              طلبيات مكتملة: {formatEnglishNumber(stats?.salesStats.completed_sales || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="erp-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي قيمة المشتريات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {(stats?.purchaseStats.total_purchase_value !== null
                ? stats?.purchaseStats.total_purchase_value
                : 0
              ).toLocaleString("en-US")}{" "}
              {currencyLabel}
            </div>
            <p className="text-xs text-muted-foreground">
              طلبيات مكتملة: {formatEnglishNumber(stats?.purchaseStats.completed_purchases || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="erp-card">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg">
          <CardTitle className="text-blue-800 flex items-center">
            <BarChart3 className="h-5 w-5 ml-2" />
            تقرير المبيعات الشهرية
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={{ stroke: "#e2e8f0" }}
                tickFormatter={(value) => formatEnglishNumber(Number(value))}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                }}
                labelStyle={{ color: "#1e293b", fontWeight: "bold" }}
                formatter={(value) => formatEnglishNumber(Number(value))}
              />
              <Bar dataKey="sales" fill="url(#salesGradient)" radius={[4, 4, 0, 0]} />
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#1d4ed8" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="erp-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              طلبيات المبيعات المعلقة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.pendingSalesOrders.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">لا توجد طلبيات معلقة</p>
              ) : (
                stats?.pendingSalesOrders.map((order, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <div className="font-medium">{order.order_number}</div>
                      <div className="text-sm text-muted-foreground">{order.customer_name}</div>
                      <div className="text-sm font-medium">
                        {(order.total_amount !== null ? order.total_amount : 0).toLocaleString("en-US")} {currencyLabel}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(order.workflow_status)}
                      {order.workflow_status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() =>
                            updateOrderStatus("sales", Number.parseInt(order.order_number.replace("O", "")), "approved")
                          }
                          className="h-7 px-2 text-xs"
                        >
                          اعتماد
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="erp-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              طلبيات المشتريات المعلقة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.pendingPurchaseOrders.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">لا توجد طلبيات معلقة</p>
              ) : (
                stats?.pendingPurchaseOrders.map((order, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <div className="font-medium">{order.order_number}</div>
                      <div className="text-sm text-muted-foreground">{order.supplier_name}</div>
                      <div className="text-sm font-medium">
                        {(order.total_amount !== null ? order.total_amount : 0).toLocaleString("en-US")} {currencyLabel}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(order.workflow_status)}
                      {order.workflow_status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() =>
                            updateOrderStatus(
                              "purchase",
                              Number.parseInt(order.order_number.replace("T", "")),
                              "approved",
                            )
                          }
                          className="h-7 px-2 text-xs"
                        >
                          اعتماد
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <UnifiedSalesOrder open={showUnifiedOrder} onOpenChange={setShowUnifiedOrder} onOrderSaved={refresh} />
    </div>
  )
}

export function Dashboard() {
  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  )
}
