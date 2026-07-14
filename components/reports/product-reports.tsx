"use client"

import { useState, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import {
  Download,
  FileText,
  Printer,
  Search,
  RotateCcw,
  Package,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  DollarSign,
  Archive,
  BarChart3,
} from "lucide-react"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"

const inventorySummary = [
  {
    title: "إجمالي الأصناف",
    value: "450",
    change: "+15",
    icon: Package,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    title: "قيمة المخزون",
    value: "892,450 شيكل",
    change: "+8.5%",
    icon: DollarSign,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  {
    title: "أصناف تحت الحد الأدنى",
    value: "12",
    change: "-3",
    icon: AlertTriangle,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
  },
  {
    title: "أصناف نفدت",
    value: "3",
    change: "-1",
    icon: Archive,
    color: "text-red-600",
    bgColor: "bg-red-50",
  },
]

const productMovement = [
  {
    date: "2024/01/01",
    type: "رصيد افتتاحي",
    document: "-",
    warehouse: "المستودع الرئيسي",
    inQty: "50",
    outQty: "-",
    balance: "50",
    price: "2,500",
    total: "125,000",
    notes: "-",
  },
  {
    date: "2024/01/05",
    type: "فاتورة مبيعات",
    document: "INV-2024-001",
    warehouse: "المستودع الرئيسي",
    inQty: "-",
    outQty: "5",
    balance: "45",
    price: "3,200",
    total: "16,000",
    notes: "عميل: أحمد علي",
  },
]

const productBalance = [
  {
    id: "P001",
    barcode: "1234567890123",
    name: "لابتوب ديل",
    category: "إلكترونيات",
    warehouse: "المستودع الرئيسي",
    available: 25,
    reserved: 5,
    actual: 20,
    minLevel: 10,
    maxLevel: 100,
    avgCost: 2500,
    value: 62500,
    status: "متوفر",
  },
  {
    id: "P002",
    barcode: "9876543210987",
    name: "طابعة HP",
    category: "إلكترونيات",
    warehouse: "المستودع الرئيسي",
    available: 3,
    reserved: 1,
    actual: 2,
    minLevel: 5,
    maxLevel: 50,
    avgCost: 800,
    value: 2400,
    status: "تحت الحد الأدنى",
  },
]

export function ProductReports() {
  const [state, setState] = useState({
    activeTab: "movement",
    filters: {
      product: "",
      category: "",
      warehouse: "",
      fromDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
      toDate: new Date().toISOString().split("T")[0],
    },
  })

  const handleFilterChange = useCallback((key: string, value: string) => {
    setState((prev) => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
    }))
  }, [])

  const applyFilters = useCallback(() => {
    console.log("تطبيق فلاتر الأصناف:", state.filters)
  }, [state.filters])

  const resetFilters = useCallback(() => {
    setState((prev) => ({
      ...prev,
      filters: {
        product: "",
        category: "",
        warehouse: "",
        fromDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
        toDate: new Date().toISOString().split("T")[0],
      },
    }))
  }, [])

  const exportReport = useCallback((format: string) => {
    console.log(`تصدير تقرير المنتجات بصيغة ${format}`)
  }, [])

  const summaryCards = useMemo(() => {
    return inventorySummary.map((item, index) => (
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
  }, [])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{summaryCards}</div>

      <Card className="erp-card shadow-sm">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-lg">
          <CardTitle className="flex items-center text-purple-800">
            <Search className="h-5 w-5 ml-2" />
            فلاتر التقارير
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div>
              <Label className="text-sm font-medium mb-2 block text-gray-700">الصنف:</Label>
              <Input
                placeholder="بحث برقم أو اسم الصنف"
                value={state.filters.product}
                onChange={(e) => handleFilterChange("product", e.target.value)}
                className="focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block text-gray-700">المجموعة:</Label>
              <Select value={state.filters.category} onValueChange={(value) => handleFilterChange("category", value)}>
                <SelectTrigger className="focus:ring-2 focus:ring-purple-500">
                  <SelectValue placeholder="جميع المجموعات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المجموعات</SelectItem>
                  <SelectItem value="electronics">إلكترونيات</SelectItem>
                  <SelectItem value="home">أدوات منزلية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block text-gray-700">المستودع:</Label>
              <Select value={state.filters.warehouse} onValueChange={(value) => handleFilterChange("warehouse", value)}>
                <SelectTrigger className="focus:ring-2 focus:ring-purple-500">
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
              <Label className="text-sm font-medium mb-2 block text-gray-700">من تاريخ:</Label>
              <Input
                type="date"
                value={state.filters.fromDate}
                onChange={(e) => handleFilterChange("fromDate", e.target.value)}
                className="focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block text-gray-700">إلى تاريخ:</Label>
              <Input
                type="date"
                value={state.filters.toDate}
                onChange={(e) => handleFilterChange("toDate", e.target.value)}
                className="focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={applyFilters} className="bg-purple-600 hover:bg-purple-700 text-white">
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

      <Tabs value={state.activeTab} onValueChange={(value) => setState((prev) => ({ ...prev, activeTab: value }))}>
        <TabsList className="grid w-full grid-cols-5 bg-gray-100">
          <TabsTrigger value="movement" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            حركة الصنف
          </TabsTrigger>
          <TabsTrigger value="balance" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            أرصدة الأصناف
          </TabsTrigger>
          <TabsTrigger value="batch" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
            الكميات حسب الباتش
          </TabsTrigger>
          <TabsTrigger value="expiry" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">
            تواريخ الصلاحية
          </TabsTrigger>
          <TabsTrigger value="inventory" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
            جرد المخزون
          </TabsTrigger>
        </TabsList>

        <TabsContent value="movement" className="space-y-4">
          <Card className="erp-card">
            <CardHeader className="bg-purple-50 rounded-t-lg">
              <CardTitle className="text-purple-800 flex items-center">
                <BarChart3 className="h-5 w-5 ml-2" />
                معلومات الصنف
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-gray-50 p-4 rounded-lg">
                <div className="flex flex-col">
                  <span className="font-medium text-gray-600">الصنف:</span>
                  <span className="font-semibold text-gray-800">P001 - لابتوب ديل</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-gray-600">المجموعة:</span>
                  <span className="font-semibold text-gray-800">إلكترونيات</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-gray-600">الرصيد الحالي:</span>
                  <span className="font-semibold text-green-600">25 قطعة</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-gray-600">متوسط السعر:</span>
                  <span className="font-semibold text-blue-600">2,500 شيكل</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="erp-card">
            <CardHeader className="bg-indigo-50 rounded-t-lg">
              <CardTitle className="text-indigo-800 flex items-center">
                <Clock className="h-5 w-5 ml-2" />
                حركة الصنف
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="erp-table">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-right p-3 font-semibold text-gray-700">التاريخ</th>
                      <th className="text-right p-3 font-semibold text-gray-700">نوع الحركة</th>
                      <th className="text-right p-3 font-semibold text-gray-700">رقم السند</th>
                      <th className="text-right p-3 font-semibold text-gray-700">المستودع</th>
                      <th className="text-right p-3 font-semibold text-gray-700">الكمية الداخلة</th>
                      <th className="text-right p-3 font-semibold text-gray-700">الكمية الخارجة</th>
                      <th className="text-right p-3 font-semibold text-gray-700">الرصيد</th>
                      <th className="text-right p-3 font-semibold text-gray-700">السعر</th>
                      <th className="text-right p-3 font-semibold text-gray-700">الإجمالي</th>
                      <th className="text-right p-3 font-semibold text-gray-700">الملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productMovement.map((movement, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3">{movement.date}</td>
                        <td className="p-3">
                          <Badge variant={movement.type === "رصيد افتتاحي" ? "secondary" : "default"}>
                            {movement.type}
                          </Badge>
                        </td>
                        <td className="p-3 font-medium">{movement.document}</td>
                        <td className="p-3">{movement.warehouse}</td>
                        <td className="p-3 text-green-600 font-semibold">{movement.inQty}</td>
                        <td className="p-3 text-red-600 font-semibold">{movement.outQty}</td>
                        <td className="p-3 font-bold text-blue-600">{movement.balance}</td>
                        <td className="p-3">{movement.price}</td>
                        <td className="p-3 font-semibold">{movement.total}</td>
                        <td className="p-3 text-gray-600">{movement.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <UniversalToolbar
            currentPage={1}
            totalPages={1}
            totalItems={productMovement.length}
            onPageChange={() => {}}
            onFirst={() => {}}
            onPrevious={() => {}}
            onNext={() => {}}
            onLast={() => {}}
          />
        </TabsContent>

        <TabsContent value="balance" className="space-y-4">
          <Card className="erp-card">
            <CardHeader className="bg-blue-50 rounded-t-lg">
              <CardTitle className="text-blue-800 flex items-center">
                <Package className="h-5 w-5 ml-2" />
                أرصدة الأصناف
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="erp-table">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-right p-3 font-semibold text-gray-700">رقم الصنف</th>
                      <th className="text-right p-3 font-semibold text-gray-700">الباركود</th>
                      <th className="text-right p-3 font-semibold text-gray-700">اسم الصنف</th>
                      <th className="text-right p-3 font-semibold text-gray-700">المجموعة</th>
                      <th className="text-right p-3 font-semibold text-gray-700">المستودع</th>
                      <th className="text-right p-3 font-semibold text-gray-700">الكمية المتاحة</th>
                      <th className="text-right p-3 font-semibold text-gray-700">الكمية المحجوزة</th>
                      <th className="text-right p-3 font-semibold text-gray-700">الرصيد الفعلي</th>
                      <th className="text-right p-3 font-semibold text-gray-700">الحد الأدنى</th>
                      <th className="text-right p-3 font-semibold text-gray-700">الحد الأقصى</th>
                      <th className="text-right p-3 font-semibold text-gray-700">متوسط التكلفة</th>
                      <th className="text-right p-3 font-semibold text-gray-700">القيمة</th>
                      <th className="text-center p-3 font-semibold text-gray-700">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productBalance.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                        <td className="font-medium p-3 text-blue-600">{product.id}</td>
                        <td className="p-3 font-mono text-sm">{product.barcode}</td>
                        <td className="p-3 font-medium">{product.name}</td>
                        <td className="p-3">{product.category}</td>
                        <td className="p-3">{product.warehouse}</td>
                        <td className="p-3 text-green-600 font-semibold">{product.available}</td>
                        <td className="p-3 text-orange-600 font-semibold">{product.reserved}</td>
                        <td className="p-3 font-bold text-blue-600">{product.actual}</td>
                        <td className="p-3">{product.minLevel}</td>
                        <td className="p-3">{product.maxLevel}</td>
                        <td className="p-3">{product.avgCost.toLocaleString()}</td>
                        <td className="p-3 font-semibold">{product.value.toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <Badge
                            variant={product.status === "متوفر" ? "default" : "destructive"}
                            className={
                              product.status === "متوفر"
                                ? "bg-green-100 text-green-800 hover:bg-green-200"
                                : "bg-red-100 text-red-800 hover:bg-red-200"
                            }
                          >
                            {product.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <UniversalToolbar
            currentPage={1}
            totalPages={1}
            totalItems={productBalance.length}
            onPageChange={() => {}}
            onFirst={() => {}}
            onPrevious={() => {}}
            onNext={() => {}}
            onLast={() => {}}
          />
        </TabsContent>

        <TabsContent value="batch" className="space-y-4">
          <Card className="erp-card">
            <CardHeader className="bg-green-50 rounded-t-lg">
              <CardTitle className="text-green-800 flex items-center">
                <Archive className="h-5 w-5 ml-2" />
                الكميات حسب الباتش
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 text-green-300" />
                <p className="text-lg font-medium">لا توجد أصناف بباتش نمبر</p>
                <p className="text-sm text-gray-500 mt-2">سيتم عرض البيانات هنا عند توفر أصناف بباتش</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiry" className="space-y-4">
          <Card className="erp-card">
            <CardHeader className="bg-orange-50 rounded-t-lg">
              <CardTitle className="text-orange-800 flex items-center">
                <Clock className="h-5 w-5 ml-2" />
                تواريخ الصلاحية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 text-orange-300" />
                <p className="text-lg font-medium">لا توجد أصناف بتاريخ صلاحية</p>
                <p className="text-sm text-gray-500 mt-2">سيتم عرض البيانات هنا عند توفر أصناف بتاريخ صلاحية</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <Card className="erp-card">
            <CardHeader className="bg-indigo-50 rounded-t-lg">
              <CardTitle className="text-indigo-800 flex items-center">
                <CheckCircle className="h-5 w-5 ml-2" />
                جرد المخزون
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex gap-2 mb-6 flex-wrap">
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  <CheckCircle className="h-4 w-4 ml-2" />
                  بدء جرد جديد
                </Button>
                <Button variant="outline" className="border-green-300 text-green-700 hover:bg-green-50 bg-transparent">
                  <Download className="h-4 w-4 ml-2" />
                  تحميل قالب الجرد
                </Button>
                <Button variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50 bg-transparent">
                  <FileText className="h-4 w-4 ml-2" />
                  استيراد نتائج الجرد
                </Button>
              </div>
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-indigo-300" />
                <p className="text-lg font-medium">لم يتم بدء عملية جرد بعد</p>
                <p className="text-sm text-gray-500 mt-2">اضغط على "بدء جرد جديد" لبدء عملية الجرد</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
