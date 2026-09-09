"use client"

import { ReportFilters } from "@/components/reports/report-filters"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Package, Search, Filter, Download, AlertTriangle, CheckCircle, Clock } from "lucide-react"
import { BatchPrintDialog } from "@/components/inventory/batch-print-dialog"

interface LotInventoryItem {
  lot_id: number
  lot_number: string
  product_code: string
  product_name: string
  manufacturing_date?: string
  expiry_date?: string
  expiry_status: "منتهي الصلاحية" | "قريب الانتهاء" | "صالح"
  initial_quantity: number
  current_quantity: number
  reserved_quantity: number
  available_quantity: number
  unit_cost: number
  total_value: number
  supplier_name?: string
  status_display: string
  status: "new" | "in_use" | "finished" | "damaged"
  status_changed_at?: string
  status_changed_by?: string
  status_notes?: string
  created_at: string
  updated_at: string
}

interface Supplier {
  id: number
  supplier_name: string
}

interface Product {
  id: number
  product_code: string
  product_name: string
}

export function LotInventoryReport() {
  const [reportData, setReportData] = useState<LotInventoryItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    product_id: "",
    supplier_id: "",
    expiry_status: "",
    lot_status: "",
    lot_number: "",
    search: "",
  })

  useEffect(() => {
    fetchReportData()
    fetchSuppliers()
    fetchProducts()
  }, [])

  useEffect(() => {
    fetchReportData()
  }, [filters])

  const fetchReportData = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value)
      })

      const response = await fetch(`/api/reports/lot-inventory?${params}`)
      if (!response.ok) {
        throw new Error("فشل في تحميل تقرير المخزون حسب الدفعات")
      }

      const data = await response.json()
      setReportData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع")
    } finally {
      setLoading(false)
    }
  }

  const fetchSuppliers = async () => {
    try {
      const response = await fetch("/api/suppliers")
      if (response.ok) {
        const data = await response.json()
        setSuppliers(data)
      }
    } catch (error) {
      console.error("Error fetching suppliers:", error)
    }
  }

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/inventory/products")
      if (response.ok) {
        const data = await response.json()
        setProducts(data)
      }
    } catch (error) {
      console.error("Error fetching products:", error)
    }
  }

  const statistics = useMemo(() => {
    const totalLots = reportData.length
    const expiredLots = reportData.filter((item) => item.expiry_status === "منتهي الصلاحية").length
    const expiringSoonLots = reportData.filter((item) => item.expiry_status === "قريب الانتهاء").length
    const newLots = reportData.filter((item) => item.status === "new").length
    const inUseLots = reportData.filter((item) => item.status === "in_use").length
    const finishedLots = reportData.filter((item) => item.status === "finished").length
    const damagedLots = reportData.filter((item) => item.status === "damaged").length
    const totalValue = reportData.reduce((sum, item) => sum + item.total_value, 0)
    const totalQuantity = reportData.reduce((sum, item) => sum + item.current_quantity, 0)

    return {
      totalLots,
      expiredLots,
      expiringSoonLots,
      newLots,
      inUseLots,
      finishedLots,
      damagedLots,
      totalValue,
      totalQuantity,
    }
  }, [reportData])

  const getExpiryStatusBadge = (status: string) => {
    switch (status) {
      case "منتهي الصلاحية":
        return <Badge className="bg-red-100 text-red-800">منتهي الصلاحية</Badge>
      case "قريب الانتهاء":
        return <Badge className="bg-yellow-100 text-yellow-800">قريب الانتهاء</Badge>
      case "صالح":
        return <Badge className="bg-green-100 text-green-800">صالح</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getLotStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge className="bg-blue-100 text-blue-800">جديد</Badge>
      case "in_use":
        return <Badge className="bg-green-100 text-green-800">قيد الاستخدام</Badge>
      case "finished":
        return <Badge className="bg-gray-100 text-gray-800">منتهي</Badge>
      case "damaged":
        return <Badge className="bg-red-100 text-red-800">تالف/مغلق</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const exportToExcel = () => {
    // تصدير البيانات إلى Excel
    console.log("Exporting lot inventory report to Excel")
  }

  const resetFilters = () => {
    setFilters({
      product_id: "",
      supplier_id: "",
      expiry_status: "",
      lot_status: "",
      lot_number: "",
      search: "",
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل تقرير المخزون حسب الدفعات...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 bg-background min-h-screen" dir="rtl">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">تقرير المخزون حسب الدفعات</h1>
          <p className="text-muted-foreground mt-1">عرض تفصيلي لجميع دفعات المنتجات في المخزون</p>
        </div>
        <div className="flex gap-2">
          <BatchPrintDialog />
          <Button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700">
            <Download className="ml-2 h-4 w-4" />
            تصدير Excel
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">دفعات جديدة</p>
                <p className="text-2xl font-bold text-blue-900">{statistics.newLots}</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">قيد الاستخدام</p>
                <p className="text-2xl font-bold text-green-900">{statistics.inUseLots}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-gray-50 to-gray-100 border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">منتهية</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.finishedLots}</p>
              </div>
              <Clock className="h-8 w-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-red-50 to-red-100 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">تالفة/مغلقة</p>
                <p className="text-2xl font-bold text-red-900">{statistics.damagedLots}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <ReportFilters>

        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
            <div>
              <Label>البحث العام</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="اسم المنتج أو رقم الدفعة"
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  className="pr-10"
                />
              </div>
            </div>

            <div>
              <Label>المنتج</Label>
              <Select
                value={filters.product_id}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, product_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="جميع المنتجات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المنتجات</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id.toString()}>
                      {product.product_name} ({product.product_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>المورد</Label>
              <Select
                value={filters.supplier_id}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, supplier_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="جميع الموردين" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الموردين</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id.toString()}>
                      {supplier.supplier_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>حالة الصلاحية</Label>
              <Select
                value={filters.expiry_status}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, expiry_status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="جميع الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="expired">منتهية الصلاحية</SelectItem>
                  <SelectItem value="expiring_soon">قريبة الانتهاء</SelectItem>
                  <SelectItem value="valid">صالحة</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>حالة الدفعة</Label>
              <Select
                value={filters.lot_status}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, lot_status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="جميع الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="new">جديد</SelectItem>
                  <SelectItem value="in_use">قيد الاستخدام</SelectItem>
                  <SelectItem value="finished">منتهي</SelectItem>
                  <SelectItem value="damaged">تالف/مغلق</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>رقم الدفعة</Label>
              <Input
                placeholder="رقم الدفعة"
                value={filters.lot_number}
                onChange={(e) => setFilters((prev) => ({ ...prev, lot_number: e.target.value }))}
              />
            </div>

            <div className="flex items-end">
              <Button variant="outline" onClick={resetFilters}>
                إعادة تعيين
              </Button>
            </div>
          </div>
        </CardContent>
      </ReportFilters>

      {/* Report Table */}
      <Card>
        <CardHeader>
          <CardTitle>تفاصيل الدفعات</CardTitle>
          <CardDescription>عرض {reportData.length} دفعة</CardDescription>
        </CardHeader>
        <CardContent>
          {reportData.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد دفعات</h3>
              <p className="text-muted-foreground">لم يتم العثور على أي دفعات تطابق معايير البحث</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-right p-3 font-semibold">رقم الدفعة</th>
                    <th className="text-right p-3 font-semibold">المنتج</th>
                    <th className="text-right p-3 font-semibold">المورد</th>
                    <th className="text-right p-3 font-semibold">حالة الدفعة</th>
                    <th className="text-right p-3 font-semibold">تاريخ الإنتاج</th>
                    <th className="text-right p-3 font-semibold">تاريخ الانتهاء</th>
                    <th className="text-right p-3 font-semibold">حالة الصلاحية</th>
                    <th className="text-right p-3 font-semibold">الكمية الحالية</th>
                    <th className="text-right p-3 font-semibold">الكمية المتاحة</th>
                    <th className="text-right p-3 font-semibold">تكلفة الوحدة</th>
                    <th className="text-right p-3 font-semibold">إجمالي القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((item) => (
                    <tr key={item.lot_id} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-medium">{item.lot_number}</td>
                      <td className="p-3">
                        <div>
                          <div className="font-medium">{item.product_name}</div>
                          <div className="text-sm text-muted-foreground">{item.product_code}</div>
                        </div>
                      </td>
                      <td className="p-3">{item.supplier_name || "غير محدد"}</td>
                      <td className="p-3">{getLotStatusBadge(item.status)}</td>
                      <td className="p-3">{item.manufacturing_date || "غير محدد"}</td>
                      <td className="p-3">{item.expiry_date || "غير محدد"}</td>
                      <td className="p-3">{getExpiryStatusBadge(item.expiry_status)}</td>
                      <td className="p-3 font-medium">{item.current_quantity.toLocaleString()}</td>
                      <td className="p-3 font-medium text-green-600">{item.available_quantity.toLocaleString()}</td>
                      <td className="p-3">{item.unit_cost.toFixed(2)} ريال</td>
                      <td className="p-3 font-medium">{item.total_value.toLocaleString()} ريال</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
