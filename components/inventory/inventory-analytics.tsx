"use client"
import { tr, appDir } from "@/lib/i18n"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart,
  Bar,
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

const inventoryData = [
  { name: "المنتج أ", stock: 120, sold: 80, category: "إلكترونيات" },
  { name: "المنتج ب", stock: 85, sold: 65, category: "ملابس" },
  { name: "المنتج ج", stock: 200, sold: 120, category: "أدوات منزلية" },
  { name: "المنتج د", stock: 45, sold: 90, category: "كتب" },
  { name: "المنتج هـ", stock: 160, sold: 110, category: "رياضة" },
]

const categoryData = [
  { name: "إلكترونيات", value: 35, color: "#3b82f6" },
  { name: "ملابس", value: 25, color: "#10b981" },
  { name: "أدوات منزلية", value: 20, color: "#f59e0b" },
  { name: "كتب", value: 10, color: "#ef4444" },
  { name: "رياضة", value: 10, color: "#8b5cf6" },
]

const trendData = [
  { month: "يناير", inventory: 1200, sales: 800 },
  { month: "فبراير", inventory: 1350, sales: 950 },
  { month: "مارس", inventory: 1100, sales: 1200 },
  { month: "أبريل", inventory: 1400, sales: 1100 },
  { month: "مايو", inventory: 1250, sales: 1300 },
  { month: "يونيو", inventory: 1500, sales: 1150 },
]

export function InventoryAnalytics() {
  console.log("[v0] InventoryAnalytics component rendered")

  return (
    <div className="space-y-6" dir={appDir()}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
        <h1 className="text-2xl font-bold mb-2">{tr("تحليلات المخزون")}</h1>
        <p className="text-blue-100">{tr("تحليل شامل لحالة المخزون والمبيعات")}</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tr("إجمالي المخزون")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">610</div>
            <p className="text-xs text-muted-foreground">{tr("قطعة")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tr("المبيعات الشهرية")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">465</div>
            <p className="text-xs text-muted-foreground">{tr("قطعة مباعة")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tr("معدل الدوران")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">76%</div>
            <p className="text-xs text-muted-foreground">{tr("شهرياً")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tr("المخزون المنخفض")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">3</div>
            <p className="text-xs text-muted-foreground">{tr("منتجات")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory vs Sales Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{tr("المخزون مقابل المبيعات")}</CardTitle>
            <CardDescription>{tr("مقارنة بين كمية المخزون والمبيعات لكل منتج")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={inventoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="stock" fill="#3b82f6" name="المخزون" />
                <Bar dataKey="sold" fill="#10b981" name="المبيعات" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>{tr("توزيع الفئات")}</CardTitle>
            <CardDescription>{tr("نسبة المخزون حسب الفئة")}</CardDescription>
          </CardHeader>
          <CardContent>
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
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Trend Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>{tr("اتجاه المخزون والمبيعات")}</CardTitle>
          <CardDescription>{tr("تطور المخزون والمبيعات على مدار الأشهر الماضية")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="inventory" stroke="#3b82f6" strokeWidth={2} name="المخزون" />
              <Line type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2} name="المبيعات" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detailed Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle>{tr("تفاصيل المخزون")}</CardTitle>
          <CardDescription>{tr("جدول مفصل بحالة كل منتج")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-start p-2">{tr("المنتج")}</th>
                  <th className="text-start p-2">{tr("الفئة")}</th>
                  <th className="text-start p-2">{tr("المخزون")}</th>
                  <th className="text-start p-2">{tr("المبيعات")}</th>
                  <th className="text-start p-2">{tr("الحالة")}</th>
                </tr>
              </thead>
              <tbody>
                {inventoryData.map((item, index) => (
                  <tr key={index} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{item.name}</td>
                    <td className="p-2">{item.category}</td>
                    <td className="p-2">{item.stock}</td>
                    <td className="p-2">{item.sold}</td>
                    <td className="p-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          item.stock > 100
                            ? "bg-green-100 text-green-800"
                            : item.stock > 50
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {item.stock > 100 ? tr("جيد") : item.stock > 50 ? tr("متوسط") : tr("منخفض")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
