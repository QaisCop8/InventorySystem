"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Package,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  Plus,
  Eye,
  BarChart3,
  Clock,
  DollarSign,
  Users,
  Truck,
} from "lucide-react"

interface MobileDashboardProps {
  onSectionChange: (section: string) => void
}

export function MobileDashboard({ onSectionChange }: MobileDashboardProps) {
  const [activeTab, setActiveTab] = useState("overview")

  // Mock data - replace with actual data from your hooks
  const stats = {
    totalProducts: 1247,
    lowStock: 23,
    outOfStock: 7,
    pendingSales: 15,
    pendingPurchases: 8,
    totalValue: 2847392,
    recentOrders: [
      { id: "SO-001", customer: "شركة الأمل", amount: 15000, status: "pending" },
      { id: "SO-002", customer: "مؤسسة النور", amount: 8500, status: "completed" },
      { id: "PO-001", supplier: "مورد الخليج", amount: 25000, status: "pending" },
    ],
    lowStockProducts: [
      { name: "منتج أ", current: 5, minimum: 20 },
      { name: "منتج ب", current: 2, minimum: 15 },
      { name: "منتج ج", current: 8, minimum: 25 },
    ],
  }

  const quickActions = [
    {
      title: "طلبية مبيعات جديدة",
      icon: ShoppingCart,
      action: () => onSectionChange("sales-orders"),
      color: "bg-blue-500",
    },
    { title: "طلبية شراء جديدة", icon: Truck, action: () => onSectionChange("purchase-orders"), color: "bg-green-500" },
    { title: "إضافة منتج", icon: Package, action: () => onSectionChange("products"), color: "bg-purple-500" },
    {
      title: "التحليلات",
      icon: BarChart3,
      action: () => onSectionChange("inventory-analytics"),
      color: "bg-orange-500",
    },
  ]

  return (
    <div className="space-y-4 p-4" dir="rtl">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
        <p className="text-muted-foreground">نظرة سريعة على نشاط النظام</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {quickActions.map((action, index) => (
          <Button
            key={index}
            onClick={action.action}
            className={`${action.color} hover:opacity-90 h-20 flex flex-col items-center justify-center gap-2 text-white`}
          >
            <action.icon className="h-6 w-6" />
            <span className="text-xs font-medium text-center">{action.title}</span>
          </Button>
        ))}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="mobile-card">
          <CardContent className="p-4 text-center">
            <Package className="h-8 w-8 text-primary mx-auto mb-2" />
            <div className="text-2xl font-bold text-primary">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">إجمالي المنتجات</p>
          </CardContent>
        </Card>

        <Card className="mobile-card">
          <CardContent className="p-4 text-center">
            <DollarSign className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <div className="text-lg font-bold text-green-500">{(stats.totalValue / 1000000).toFixed(1)}م</div>
            <p className="text-xs text-muted-foreground">قيمة المخزون</p>
          </CardContent>
        </Card>

        <Card className="mobile-card">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-8 w-8 text-orange-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-orange-500">{stats.lowStock}</div>
            <p className="text-xs text-muted-foreground">مخزون منخفض</p>
          </CardContent>
        </Card>

        <Card className="mobile-card">
          <CardContent className="p-4 text-center">
            <Clock className="h-8 w-8 text-blue-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-blue-500">{stats.pendingSales + stats.pendingPurchases}</div>
            <p className="text-xs text-muted-foreground">طلبيات معلقة</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed information */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="overview" className="text-xs">
            نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="orders" className="text-xs">
            الطلبيات
          </TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs">
            التنبيهات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="mobile-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">الإحصائيات السريعة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">طلبيات المبيعات المعلقة</span>
                <Badge variant="secondary">{stats.pendingSales}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">طلبيات المشتريات المعلقة</span>
                <Badge variant="secondary">{stats.pendingPurchases}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">منتجات نفد مخزونها</span>
                <Badge variant="destructive">{stats.outOfStock}</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Card className="mobile-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">الطلبيات الأخيرة</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <div className="space-y-3">
                  {stats.recentOrders.map((order, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{order.id}</div>
                        <div className="text-xs text-muted-foreground">
                          {order.id.startsWith("SO") ? order.customer : order.supplier}
                        </div>
                        <div className="text-sm font-medium">{order.amount.toLocaleString("en-US")} ر.س</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={order.status === "completed" ? "default" : "secondary"}>
                          {order.status === "completed" ? "مكتملة" : "معلقة"}
                        </Badge>
                        <Button size="sm" variant="outline">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card className="mobile-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                تنبيهات المخزون
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <div className="space-y-3">
                  {stats.lowStockProducts.map((product, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm">{product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          الحالي: {product.current} | الحد الأدنى: {product.minimum}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-orange-600 border-orange-600">
                          منخفض
                        </Badge>
                        <Button size="sm" variant="outline" onClick={() => onSectionChange("purchase-orders")}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Navigation */}
      <Card className="mobile-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">الوصول السريع</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => onSectionChange("products")} className="h-12 flex flex-col gap-1">
              <Package className="h-5 w-5" />
              <span className="text-xs">المنتجات</span>
            </Button>
            <Button variant="outline" onClick={() => onSectionChange("customers")} className="h-12 flex flex-col gap-1">
              <Users className="h-5 w-5" />
              <span className="text-xs">العملاء</span>
            </Button>
            <Button variant="outline" onClick={() => onSectionChange("suppliers")} className="h-12 flex flex-col gap-1">
              <Truck className="h-5 w-5" />
              <span className="text-xs">الموردين</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => onSectionChange("inventory-analytics")}
              className="h-12 flex flex-col gap-1"
            >
              <TrendingUp className="h-5 w-5" />
              <span className="text-xs">التحليلات</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
