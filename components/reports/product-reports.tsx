"use client"
import { tr } from "@/lib/i18n"
import { printReportFrom } from "@/lib/voucher-print/report-print"

import { ReportPage, ReportHeader } from "@/components/reports/report-page"

import { ReportFilters } from "@/components/reports/report-filters"

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
import { ReportGrid, type ReportGridColumn } from "@/components/reports/report-grid"

const inventorySummary = [
  {
    title: tr("إجمالي الأصناف"),
    value: "450",
    change: "+15",
    icon: Package,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    title: tr("قيمة المخزون"),
    value: "892,450 شيكل",
    change: "+8.5%",
    icon: DollarSign,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  {
    title: tr("أصناف تحت الحد الأدنى"),
    value: "12",
    change: "-3",
    icon: AlertTriangle,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
  },
  {
    title: tr("أصناف نفدت"),
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
        className="erp-card hover:shadow-lg transition-all duration-200 border-e-4"
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
            <TrendingUp className="h-3 w-3 me-1" />
            {item.change}{tr(" من الشهر الماضي")}
          </p>
        </CardContent>
      </Card>
    ))
  }, [])

  return (
    <ReportPage>
<ReportHeader title={tr("تقارير الأصناف والمخزون")} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{summaryCards}</div>

      <ReportFilters>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div>
              <Label className="text-sm font-medium mb-2 block text-gray-700">{tr("الصنف:")}</Label>
              <Input
                placeholder={tr("بحث برقم أو اسم الصنف")}
                value={state.filters.product}
                onChange={(e) => handleFilterChange("product", e.target.value)}
                className="focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block text-gray-700">{tr("المجموعة:")}</Label>
              <Select value={state.filters.category} onValueChange={(value) => handleFilterChange("category", value)}>
                <SelectTrigger className="focus:ring-2 focus:ring-purple-500">
                  <SelectValue placeholder={tr("جميع المجموعات")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tr("جميع المجموعات")}</SelectItem>
                  <SelectItem value="electronics">{tr("إلكترونيات")}</SelectItem>
                  <SelectItem value="home">{tr("أدوات منزلية")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block text-gray-700">{tr("المستودع:")}</Label>
              <Select value={state.filters.warehouse} onValueChange={(value) => handleFilterChange("warehouse", value)}>
                <SelectTrigger className="focus:ring-2 focus:ring-purple-500">
                  <SelectValue placeholder={tr("جميع المستودعات")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tr("جميع المستودعات")}</SelectItem>
                  <SelectItem value="main">{tr("المستودع الرئيسي")}</SelectItem>
                  <SelectItem value="branch">{tr("مستودع الفرع")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block text-gray-700">{tr("من تاريخ:")}</Label>
              <Input
                type="date"
                value={state.filters.fromDate}
                onChange={(e) => handleFilterChange("fromDate", e.target.value)}
                className="focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block text-gray-700">{tr("إلى تاريخ:")}</Label>
              <Input
                type="date"
                value={state.filters.toDate}
                onChange={(e) => handleFilterChange("toDate", e.target.value)}
                className="focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button data-report-apply onClick={applyFilters} className="bg-purple-600 hover:bg-purple-700 text-white">
              <Search className="h-4 w-4 me-2" />
              {tr("تطبيق الفلتر")}
            </Button>
            <Button
              variant="outline"
              onClick={resetFilters}
              className="border-gray-300 hover:bg-gray-50 bg-transparent"
            >
              <RotateCcw className="h-4 w-4 me-2" />
              {tr("إعادة تعيين")}
            </Button>
            <Button
              variant="outline"
              onClick={() => exportReport("excel")}
              className="border-green-300 text-green-700 hover:bg-green-50"
            >
              <Download className="h-4 w-4 me-2" />
              {tr("تصدير Excel")}
            </Button>
            <Button
              variant="outline"
              onClick={() => exportReport("pdf")}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              <FileText className="h-4 w-4 me-2" />
              {tr("تصدير PDF")}
            </Button>
            <Button
              variant="outline"
              onClick={event => void printReportFrom(event.currentTarget)}
              className="border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              <Printer className="h-4 w-4 me-2" />
              {tr("طباعة")}
            </Button>
          </div>
      </ReportFilters>

      <Tabs value={state.activeTab} onValueChange={(value) => setState((prev) => ({ ...prev, activeTab: value }))}>
        <TabsList className="grid w-full grid-cols-5 bg-gray-100">
          <TabsTrigger value="movement" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            {tr("حركة الصنف")}
          </TabsTrigger>
          <TabsTrigger value="balance" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            {tr("أرصدة الأصناف")}
          </TabsTrigger>
          <TabsTrigger value="batch" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
            {tr("الكميات حسب الباتش")}
          </TabsTrigger>
          <TabsTrigger value="expiry" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">
            {tr("تواريخ الصلاحية")}
          </TabsTrigger>
          <TabsTrigger value="inventory" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
            {tr("جرد المخزون")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="movement" className="space-y-4">
          <Card className="erp-card">
            <CardHeader className="bg-purple-50 rounded-t-lg">
              <CardTitle className="text-purple-800 flex items-center">
                <BarChart3 className="h-5 w-5 me-2" />
                {tr("معلومات الصنف")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-gray-50 p-4 rounded-lg">
                <div className="flex flex-col">
                  <span className="font-medium text-gray-600">{tr("الصنف:")}</span>
                  <span className="font-semibold text-gray-800">{tr("P001 - لابتوب ديل")}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-gray-600">{tr("المجموعة:")}</span>
                  <span className="font-semibold text-gray-800">{tr("إلكترونيات")}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-gray-600">{tr("الرصيد الحالي:")}</span>
                  <span className="font-semibold text-green-600">{tr("25 قطعة")}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-gray-600">{tr("متوسط السعر:")}</span>
                  <span className="font-semibold text-blue-600">{tr("2,500 شيكل")}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="erp-card">
            <CardHeader className="bg-indigo-50 rounded-t-lg">
              <CardTitle className="text-indigo-800 flex items-center">
                <Clock className="h-5 w-5 me-2" />
                {tr("حركة الصنف")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ReportGrid rows={productMovement} exportFileName={tr("حركة الصنف")}
                  columns={[
                    { key: "date", label: tr("التاريخ"), width: 110 }, { key: "type", label: tr("نوع الحركة"), width: 130 },
                    { key: "document", label: tr("رقم السند"), width: 130 }, { key: "warehouse", label: tr("المستودع"), width: 130 },
                    { key: "inQty", label: tr("الكمية الداخلة"), type: "number", width: 120, total: true },
                    { key: "outQty", label: tr("الكمية الخارجة"), type: "number", width: 120, total: true },
                    { key: "balance", label: tr("الرصيد"), type: "number", width: 120 },
                    { key: "price", label: tr("السعر"), type: "number", width: 110 },
                    { key: "total", label: tr("الإجمالي"), type: "number", width: 130, total: true },
                    { key: "notes", label: tr("الملاحظات"), width: "*", minWidth: 160 },
                  ]}/>
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
                <Package className="h-5 w-5 me-2" />
                {tr("أرصدة الأصناف")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ReportGrid rows={productBalance} exportFileName={tr("أرصدة الأصناف")}
                  columns={[
                    { key: "id", label: tr("رقم الصنف"), width: 110 }, { key: "barcode", label: tr("الباركود"), width: 130 },
                    { key: "name", label: tr("اسم الصنف"), width: "*", minWidth: 180 }, { key: "category", label: tr("المجموعة"), width: 130 },
                    { key: "warehouse", label: tr("المستودع"), width: 130 },
                    { key: "available", label: tr("الكمية المتاحة"), type: "number", width: 120, total: true },
                    { key: "reserved", label: tr("الكمية المحجوزة"), type: "number", width: 120, total: true },
                    { key: "actual", label: tr("الرصيد الفعلي"), type: "number", width: 120, total: true },
                    { key: "minLevel", label: tr("الحد الأدنى"), type: "number", width: 100 }, { key: "maxLevel", label: tr("الحد الأقصى"), type: "number", width: 100 },
                    { key: "avgCost", label: tr("متوسط التكلفة"), type: "number", width: 120 },
                    { key: "value", label: tr("القيمة"), type: "number", width: 130, total: true },
                    { key: "status", label: tr("الحالة"), width: 100 },
                  ]}/>
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
                <Archive className="h-5 w-5 me-2" />
                {tr("الكميات حسب الباتش")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 text-green-300" />
                <p className="text-lg font-medium">{tr("لا توجد أصناف بباتش نمبر")}</p>
                <p className="text-sm text-gray-500 mt-2">{tr("سيتم عرض البيانات هنا عند توفر أصناف بباتش")}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiry" className="space-y-4">
          <Card className="erp-card">
            <CardHeader className="bg-orange-50 rounded-t-lg">
              <CardTitle className="text-orange-800 flex items-center">
                <Clock className="h-5 w-5 me-2" />
                {tr("تواريخ الصلاحية")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 text-orange-300" />
                <p className="text-lg font-medium">{tr("لا توجد أصناف بتاريخ صلاحية")}</p>
                <p className="text-sm text-gray-500 mt-2">{tr("سيتم عرض البيانات هنا عند توفر أصناف بتاريخ صلاحية")}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <Card className="erp-card">
            <CardHeader className="bg-indigo-50 rounded-t-lg">
              <CardTitle className="text-indigo-800 flex items-center">
                <CheckCircle className="h-5 w-5 me-2" />
                {tr("جرد المخزون")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex gap-2 mb-6 flex-wrap">
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  <CheckCircle className="h-4 w-4 me-2" />
                  {tr("بدء جرد جديد")}
                </Button>
                <Button variant="outline" className="border-green-300 text-green-700 hover:bg-green-50 bg-transparent">
                  <Download className="h-4 w-4 me-2" />
                  {tr("تحميل نموذج الجرد")}
                </Button>
                <Button variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50 bg-transparent">
                  <FileText className="h-4 w-4 me-2" />
                  {tr("استيراد نتائج الجرد")}
                </Button>
              </div>
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-indigo-300" />
                <p className="text-lg font-medium">{tr("لم يتم بدء عملية جرد بعد")}</p>
                <p className="text-sm text-gray-500 mt-2">{tr("اضغط على \"بدء جرد جديد\" لبدء عملية الجرد")}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </ReportPage>
  )
}
