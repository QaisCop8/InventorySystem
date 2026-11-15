"use client"

import { tr } from "@/lib/i18n"
import { showAlert } from "@/components/ui/confirm-host"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"

import { ReportFilters } from "@/components/reports/report-filters"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { SearchButton } from "@/components/search/search-button"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { Download, Filter, TrendingUp, Package, AlertTriangle, CheckCircle, DollarSign, Search } from "lucide-react"
import { formatDateToBritish } from "@/lib/utils"
import { ReportGrid, type ReportGridColumn } from "@/components/reports/report-grid"

interface BatchSummary {
  statistics: {
    totalLots: number
    newLots: number
    inUseLots: number
    finishedLots: number
    damagedLots: number
    totalValue: number
  }
  product_breakdown: Array<{
    product_id: number
    product_name: string
    product_code: string
    total_lots: number
    new_lots: number
    in_use_lots: number
    finished_lots: number
    damaged_lots: number
    total_quantity: number
    available_quantity: number
    total_value: number
  }>
  expiry_breakdown: Array<{
    expiry_status: string
    lot_count: number
    total_quantity: number
    total_value: number
  }>
  recent_movements: Array<{
    transaction_type: string
    movement_count: number
    total_quantity: number
    total_value: number
  }>
}

interface BatchMovementReport {
  id: number
  lot_number: string
  product_name: string
  product_code: string
  transaction_type: string
  quantity: number
  unit_cost: number
  total_value: number
  reference_type?: string
  reference_id?: number
  notes?: string
  created_by?: string
  created_at: string
}

interface Product {
  id: number
  product_code: string
  product_name: string
}

export function BatchReports() {
  const [summary, setSummary] = useState<BatchSummary | null>(null)
  const [movements, setMovements] = useState<BatchMovementReport[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("summary")

  // Filter states
  const [filters, setFilters] = useState({
    product_id: "all",
    transaction_type: "all",
    date_from: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0], // بداية العام الحالي
    date_to: new Date().toISOString().split("T")[0], // تاريخ اليوم
    report_type: "movements",
  })

  useEffect(() => {
    fetchSummary()
    fetchProducts()
  }, [])

  useEffect(() => {
    if (activeTab === "movements") {
      fetchMovements()
    }
  }, [activeTab, filters])

  const fetchSummary = async () => {
    try {
      const response = await fetch("/api/inventory/batch-summary")
      if (response.ok) {
        const data = await response.json()
        setSummary(data)
      }
    } catch (error) {
      console.error("Error fetching batch summary:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMovements = async () => {
    try {
      console.log("[v0] Fetching movements with filters:", filters)
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value && key !== "report_type") params.append(key, value)
      })

      const response = await fetch(`/api/inventory/batch-movements?${params}`)
      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Received movements data:", data)

        if (Array.isArray(data)) {
          const processedData = data.map((item: any) => ({
            ...item,
            total_value: (item.quantity || 0) * (item.unit_cost || 0),
          }))
          setMovements(processedData)
        } else {
          console.error("[v0] Expected array but received:", typeof data, data)
          setMovements([])
        }
      } else {
        console.error("[v0] Failed to fetch movements:", response.status, response.statusText)
        setMovements([])
      }
    } catch (error) {
      console.error("Error fetching movements:", error)
      setMovements([]) // Ensure movements is always an array
    }
  }

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/inventory/products")
      if (response.ok) {
        const data = await response.json()
        setProducts(data.filter((p: any) => p.has_batch))
      }
    } catch (error) {
      console.error("Error fetching products:", error)
    }
  }

  const handleProductSelect = (product: any) => {
    setFilters((prev) => ({
      ...prev,
      product_id: product.id?.toString() || "all",
    }))
  }

  const exportReport = async (type: string) => {
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value)
      })
      params.append("export", "true")
      params.append("format", "excel")

      const response = await fetch(`/api/reports/batch-${type}?${params}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `batch-${type}-report-${new Date().toISOString().split("T")[0]}.xlsx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error("Error exporting report:", error)
      showAlert(tr("فشل في تصدير التقرير"))
    }
  }

  const getStatusColor = (status: string) => {
    const colors = {
      new: "#3b82f6",
      in_use: "#10b981",
      finished: "#6b7280",
      damaged: "#ef4444",
    }
    return colors[status as keyof typeof colors] || "#6b7280"
  }

  const getExpiryColor = (status: string) => {
    const colors = {
      expired: "#ef4444",
      expiring_soon: "#f59e0b",
      valid: "#10b981",
      no_expiry: "#6b7280",
    }
    return colors[status as keyof typeof colors] || "#6b7280"
  }

  const getMovementTypeDisplay = (type: string) => {
    const types = {
      purchase: "شراء",
      sale: "بيع",
      adjustment: "تعديل",
      transfer: "تحويل",
      return: "مرتجع",
      status_change: "تغيير حالة",
      damage: "تلف",
      close: "إغلاق",
    }
    return types[type as keyof typeof types] || type
  }

  const getExpiryStatusDisplay = (status: string) => {
    const statuses = {
      expired: "منتهي الصلاحية",
      expiring_soon: "قريب الانتهاء",
      valid: "صالح",
      no_expiry: "بدون تاريخ انتهاء",
    }
    return statuses[status as keyof typeof statuses] || status
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <ReportPage loading={loading}>
<ReportHeader title={tr("تقارير حركات الدفعات")} description={<>{tr("تقارير شاملة وإحصائيات مفصلة لحركات الدفعات")}</>} actions={<>
          <SearchButton type="products" onSelect={handleProductSelect} variant="outline" />
          <Button onClick={() => exportReport(activeTab)} variant="outline">
            <Download className="me-2 h-4 w-4" />
            {tr("تصدير التقرير")}
          </Button>
        </>} />


      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="summary">{tr("الملخص العام")}</TabsTrigger>
          <TabsTrigger value="movements">{tr("حركات الدفعات")}</TabsTrigger>
          <TabsTrigger value="expiry">{tr("تقرير الصلاحية")}</TabsTrigger>
          <TabsTrigger value="analytics">{tr("التحليلات")}</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          {summary && (
            <>
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{tr("إجمالي الدفعات")}</p>
                        <p className="text-2xl font-bold">{summary.statistics.totalLots.toLocaleString("en-US")}</p>
                      </div>
                      <Package className="h-8 w-8 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{tr("الدفعات النشطة")}</p>
                        <p className="text-2xl font-bold text-green-600">
                          {(summary.statistics.newLots + summary.statistics.inUseLots).toLocaleString("en-US")}
                        </p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{tr("الدفعات التالفة")}</p>
                        <p className="text-2xl font-bold text-red-600">
                          {summary.statistics.damagedLots.toLocaleString("en-US")}
                        </p>
                      </div>
                      <AlertTriangle className="h-8 w-8 text-red-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{tr("القيمة الإجمالية")}</p>
                        <p className="text-2xl font-bold text-blue-600">
                          ${summary.statistics.totalValue.toLocaleString("en-US")}
                        </p>
                      </div>
                      <DollarSign className="h-8 w-8 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Status Distribution Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>{tr("توزيع حالات الدفعات")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "جديد", value: summary.statistics.newLots, color: "#3b82f6" },
                            { name: "قيد الاستخدام", value: summary.statistics.inUseLots, color: "#10b981" },
                            { name: "منتهي", value: summary.statistics.finishedLots, color: "#6b7280" },
                            { name: "تالف", value: summary.statistics.damagedLots, color: "#ef4444" },
                          ]}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {[
                            { name: "جديد", value: summary.statistics.newLots, color: "#3b82f6" },
                            { name: "قيد الاستخدام", value: summary.statistics.inUseLots, color: "#10b981" },
                            { name: "منتهي", value: summary.statistics.finishedLots, color: "#6b7280" },
                            { name: "تالف", value: summary.statistics.damagedLots, color: "#ef4444" },
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Product Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>{tr("تفصيل حسب المنتج")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReportGrid rows={summary.product_breakdown} exportFileName={tr("تفصيل حسب المنتج")} height={420} columns={[
                      { key: "product", label: tr("المنتج"), width: "*", minWidth: 180, value: (p: any) => `${p.product_name} (${p.product_code})` },
                      { key: "total_lots", label: tr("إجمالي الدفعات"), type: "number", decimals: 0, width: 110, total: true },
                      { key: "new_lots", label: tr("جديد"), type: "number", decimals: 0, width: 90, total: true },
                      { key: "in_use_lots", label: tr("قيد الاستخدام"), type: "number", decimals: 0, width: 110, total: true },
                      { key: "finished_lots", label: tr("منتهي"), type: "number", decimals: 0, width: 90, total: true },
                      { key: "damaged_lots", label: tr("تالف"), type: "number", decimals: 0, width: 90, total: true },
                      { key: "available_quantity", label: tr("الكمية المتاحة"), type: "number", width: 130, total: true },
                      { key: "total_value", label: tr("القيمة الإجمالية"), type: "number", width: 140, total: true },
                    ]}/>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          {/* Filters */}
          <ReportFilters>

            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <Label>{tr("المنتج")}</Label>
                  <Select
                    value={filters.product_id}
                    onValueChange={(value) => setFilters((prev) => ({ ...prev, product_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tr("جميع المنتجات")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tr("جميع المنتجات")}</SelectItem>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id.toString()}>
                          {product.product_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{tr("نوع الحركة")}</Label>
                  <Select
                    value={filters.transaction_type}
                    onValueChange={(value) => setFilters((prev) => ({ ...prev, transaction_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tr("جميع الأنواع")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tr("جميع الأنواع")}</SelectItem>
                      <SelectItem value="purchase">{tr("شراء")}</SelectItem>
                      <SelectItem value="sale">{tr("بيع")}</SelectItem>
                      <SelectItem value="adjustment">{tr("تعديل")}</SelectItem>
                      <SelectItem value="transfer">{tr("تحويل")}</SelectItem>
                      <SelectItem value="return">{tr("مرتجع")}</SelectItem>
                      <SelectItem value="status_change">{tr("تغيير حالة")}</SelectItem>
                      <SelectItem value="damage">{tr("تلف")}</SelectItem>
                      <SelectItem value="close">{tr("إغلاق")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{tr("من تاريخ")}</Label>
                  <Input
                    type="date"
                    value={filters.date_from}
                    onChange={(e) => setFilters((prev) => ({ ...prev, date_from: e.target.value }))}
                  />
                </div>

                <div>
                  <Label>{tr("إلى تاريخ")}</Label>
                  <Input
                    type="date"
                    value={filters.date_to}
                    onChange={(e) => setFilters((prev) => ({ ...prev, date_to: e.target.value }))}
                  />
                </div>

                <div className="flex items-end">
                  <Button data-report-apply onClick={fetchMovements} className="w-full">
                    <Search className="me-2 h-4 w-4" />
                    {tr("تطبيق الفلاتر")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </ReportFilters>

          {/* Movements Table */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{tr("تقرير حركات الدفعات")}</CardTitle>
                <Badge variant="outline">{movements.length}{tr(" حركة")}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ReportGrid rows={movements} exportFileName={tr("حركات الدفعات")} columns={[
                  { key: "created_at", label: tr("التاريخ"), width: 110, value: (m: any) => formatDateToBritish(m.created_at) },
                  { key: "product", label: tr("المنتج"), width: "*", minWidth: 180, value: (m: any) => `${m.product_name} (${m.product_code})` },
                  { key: "lot_number", label: tr("رقم الدفعة"), width: 130 },
                  { key: "transaction_type", label: tr("نوع الحركة"), width: 130, value: (m: any) => getMovementTypeDisplay(m.transaction_type) },
                  { key: "quantity", label: tr("الكمية"), type: "number", width: 110, total: true },
                  { key: "unit_cost", label: tr("سعر الوحدة"), type: "number", width: 120 },
                  { key: "total_value", label: tr("القيمة الإجمالية"), type: "number", width: 140, total: true },
                  { key: "reference", label: tr("المرجع"), width: 150, value: (m: any) => m.reference_type && m.reference_id ? `${m.reference_type} #${m.reference_id}` : "" },
                  { key: "created_by", label: tr("المستخدم"), width: 120 },
                ]}/>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiry" className="space-y-4">
          {summary && (
            <>
              {/* Expiry Status Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>{tr("توزيع حالة الصلاحية")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.expiry_breakdown}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="expiry_status" tickFormatter={(value) => getExpiryStatusDisplay(value)} />
                        <YAxis />
                        <Tooltip
                          labelFormatter={(value) => getExpiryStatusDisplay(value)}
                          formatter={(value: any, name: string) => [
                            value.toLocaleString("en-US"),
                            name === "lot_count" ? "عدد الدفعات" : "القيمة الإجمالية",
                          ]}
                        />
                        <Bar dataKey="lot_count" fill="#3b82f6" name="lot_count" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Expiry Details Table */}
              <Card>
                <CardHeader>
                  <CardTitle>{tr("تفاصيل حالة الصلاحية")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReportGrid rows={summary.expiry_breakdown} exportFileName={tr("تفاصيل حالة الصلاحية")} height={360} columns={[
                      { key: "expiry_status", label: tr("حالة الصلاحية"), width: "*", minWidth: 160, value: (item: any) => getExpiryStatusDisplay(item.expiry_status) },
                      { key: "lot_count", label: tr("عدد الدفعات"), type: "number", decimals: 0, width: 120, total: true },
                      { key: "total_quantity", label: tr("إجمالي الكمية"), type: "number", width: 130, total: true },
                      { key: "total_value", label: tr("القيمة الإجمالية"), type: "number", width: 140, total: true },
                      { key: "percentage", label: tr("النسبة المئوية"), type: "number", decimals: 1, width: 120, value: (item: any) => { const totalLots = summary.expiry_breakdown.reduce((sum: number, i: any) => sum + i.lot_count, 0); return totalLots > 0 ? (item.lot_count / totalLots) * 100 : 0 } },
                    ]}/>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          {summary && (
            <>
              {/* Recent Movements Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>{tr("حركات الشهر الماضي")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.recent_movements}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="transaction_type" tickFormatter={(value) => getMovementTypeDisplay(value)} />
                        <YAxis />
                        <Tooltip
                          labelFormatter={(value) => getMovementTypeDisplay(value)}
                          formatter={(value: any, name: string) => [
                            value.toLocaleString("en-US"),
                            name === "movement_count" ? "عدد الحركات" : "إجمالي الكمية",
                          ]}
                        />
                        <Bar dataKey="movement_count" fill="#10b981" name="movement_count" />
                        <Bar dataKey="total_quantity" fill="#3b82f6" name="total_quantity" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Movement Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle>{tr("تحليل الحركات الأخيرة")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {summary.recent_movements.map((movement) => (
                      <div key={movement.transaction_type} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{getMovementTypeDisplay(movement.transaction_type)}</h4>
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{tr("عدد الحركات:")}</span>
                            <span className="font-medium">{movement.movement_count.toLocaleString("en-US")}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>{tr("إجمالي الكمية:")}</span>
                            <span className="font-medium">{movement.total_quantity.toLocaleString("en-US")}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>{tr("القيمة الإجمالية:")}</span>
                            <span className="font-medium text-green-600">${movement.total_value.toLocaleString("en-US")}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </ReportPage>
  )
}
