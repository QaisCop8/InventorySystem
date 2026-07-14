"use client"

import { useEffect, useState } from "react"
import { ArrowRight, BarChart3, BellRing, CircleDollarSign, Clock3, Package, Sparkles, TrendingUp, Users2, Wallet2, CreditCard, FilePlus, ShoppingCart, UserPlus, PieChart as PieChartIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from "recharts"

interface WelcomeDashboardProps {
  onOpenSection?: (section: string) => void
}

const quickActions = [
  { label: "طلبيات المبيعات", section: "sales-orders", icon: TrendingUp },
  { label: "المنتجات", section: "products", icon: Package },
  { label: "العملاء", section: "customers", icon: Users2 },
  { label: "الحسابات", section: "accounts", icon: Wallet2 },
]

const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ar-SA", {
    maximumFractionDigits: 0,
  }).format(value)

const getMonthBucket = (dateText?: string) => {
  if (!dateText) return null

  const parsedDate = new Date(dateText)
  if (Number.isNaN(parsedDate.getTime())) return null

  return {
    month: monthNames[parsedDate.getMonth()],
    key: `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`,
  }
}

const buildMonthlyOrdersData = (orders: any[]) => {
  const buckets = new Map<string, { key: string; month: string; orders: number }>()
  const now = new Date()

  for (let index = 5; index >= 0; index -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - index, 1)
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`
    buckets.set(key, { key, month: monthNames[monthDate.getMonth()], orders: 0 })
  }

  orders.forEach((order) => {
    const bucket = getMonthBucket(order.order_date || order.created_at)
    if (!bucket) return

    const existing = buckets.get(bucket.key)
    if (existing) existing.orders += 1
  })

  return Array.from(buckets.values())
}

const buildMonthlySalesData = (vouchers: any[]) => {
  const buckets = new Map<string, { key: string; month: string; sales: number }>()
  const now = new Date()

  for (let index = 5; index >= 0; index -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - index, 1)
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`
    buckets.set(key, { key, month: monthNames[monthDate.getMonth()], sales: 0 })
  }

  vouchers.forEach((voucher) => {
    const bucket = getMonthBucket(voucher.voucher_date || voucher.order_date || voucher.created_at)
    if (!bucket) return

    const existing = buckets.get(bucket.key)
    if (existing) existing.sales += Number(voucher.total_amount || 0)
  })

  return Array.from(buckets.values())
}

const buildDailyOrdersData = (orders: any[], monthKey?: string) => {
  if (!monthKey) return []

  const buckets = new Map<string, { day: string; orders: number }>()

  orders.forEach((order) => {
    const bucket = getMonthBucket(order.order_date || order.created_at)
    if (!bucket || bucket.key !== monthKey) return

    const dateValue = order.order_date || order.created_at
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return

    const dayKey = String(date.getDate()).padStart(2, "0")
    const current = buckets.get(dayKey) || { day: dayKey, orders: 0 }
    current.orders += 1
    buckets.set(dayKey, current)
  })

  return Array.from(buckets.values()).sort((a, b) => Number(a.day) - Number(b.day))
}

const buildDailySalesData = (vouchers: any[], monthKey?: string) => {
  if (!monthKey) return []

  const buckets = new Map<string, { day: string; sales: number }>()

  vouchers.forEach((voucher) => {
    const bucket = getMonthBucket(voucher.voucher_date || voucher.order_date || voucher.created_at)
    if (!bucket || bucket.key !== monthKey) return

    const dateValue = voucher.voucher_date || voucher.order_date || voucher.created_at
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return

    const dayKey = String(date.getDate()).padStart(2, "0")
    const current = buckets.get(dayKey) || { day: dayKey, sales: 0 }
    current.sales += Number(voucher.total_amount || 0)
    buckets.set(dayKey, current)
  })

  return Array.from(buckets.values()).sort((a, b) => Number(a.day) - Number(b.day))
}

const buildDailyCombinedData = (orders: any[], vouchers: any[], monthKey?: string) => {
  if (!monthKey) return []

  const ordersBuckets = new Map<string, { day: string; orders: number }>()
  const salesBuckets = new Map<string, { day: string; sales: number }>()

  orders.forEach((order) => {
    const bucket = getMonthBucket(order.order_date || order.created_at)
    if (!bucket || bucket.key !== monthKey) return

    const dateValue = order.order_date || order.created_at
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return

    const dayKey = String(date.getDate()).padStart(2, "0")
    const current = ordersBuckets.get(dayKey) || { day: dayKey, orders: 0 }
    current.orders += 1
    ordersBuckets.set(dayKey, current)
  })

  vouchers.forEach((voucher) => {
    const bucket = getMonthBucket(voucher.voucher_date || voucher.order_date || voucher.created_at)
    if (!bucket || bucket.key !== monthKey) return

    const dateValue = voucher.voucher_date || voucher.order_date || voucher.created_at
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return

    const dayKey = String(date.getDate()).padStart(2, "0")
    const current = salesBuckets.get(dayKey) || { day: dayKey, sales: 0 }
    current.sales += Number(voucher.total_amount || 0)
    salesBuckets.set(dayKey, current)
  })

  const allDays = new Set([...ordersBuckets.keys(), ...salesBuckets.keys()])

  return Array.from(allDays)
    .sort((a, b) => Number(a) - Number(b))
    .map((day) => ({
      day,
      orders: ordersBuckets.get(day)?.orders || 0,
      sales: salesBuckets.get(day)?.sales || 0,
    }))
}

export default function WelcomeDashboard({ onOpenSection }: WelcomeDashboardProps) {
  const [monthlyOrdersData, setMonthlyOrdersData] = useState<Array<{ key: string; month: string; orders: number }>>([])
  const [monthlySalesData, setMonthlySalesData] = useState<Array<{ key: string; month: string; sales: number }>>([])
  const [ordersData, setOrdersData] = useState<any[]>([])
  const [vouchersData, setVouchersData] = useState<any[]>([])
  const [ordersSelectedMonth, setOrdersSelectedMonth] = useState<string | null>(null)
  const [salesSelectedMonth, setSalesSelectedMonth] = useState<string | null>(null)
  const [ordersDailyView, setOrdersDailyView] = useState(false)
  const [salesDailyView, setSalesDailyView] = useState(false)
  const [salesToday, setSalesToday] = useState(0)
  const [pendingOrders, setPendingOrders] = useState(0)
  const [activityItems, setActivityItems] = useState([
    { title: "جارٍ تحميل أحدث النشاط…", time: "الآن", accent: "bg-sky-500" },
  ])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true)

        const [ordersResponse, vouchersResponse] = await Promise.all([
          fetch("/api/orders/sales?type=1"),
          fetch("/api/vouchers/sales?type=5"),
        ])

        if (!ordersResponse.ok || !vouchersResponse.ok) {
          throw new Error("تعذر تحميل بيانات لوحة التحكم")
        }

        const ordersData = await ordersResponse.json()
        const vouchersData = await vouchersResponse.json()
        const orders = Array.isArray(ordersData) ? ordersData : []
        const vouchers = Array.isArray(vouchersData) ? vouchersData : []

        setOrdersData(orders)
        setVouchersData(vouchers)
        const nextMonthlyOrders = buildMonthlyOrdersData(orders)
        const nextMonthlySales = buildMonthlySalesData(vouchers)
        setMonthlyOrdersData(nextMonthlyOrders)
        setMonthlySalesData(nextMonthlySales)
        const initialMonth = nextMonthlySales[nextMonthlySales.length - 1]?.key || null
        setOrdersSelectedMonth((current) => current || initialMonth)
        setSalesSelectedMonth((current) => current || initialMonth)
        setOrdersDailyView(false)
        setSalesDailyView(false)

        const today = new Date().toISOString().split("T")[0]
        const todaySales = vouchers.reduce((sum, voucher) => {
          const dateValue = voucher.voucher_date || voucher.order_date || voucher.created_at
          return dateValue?.startsWith(today) ? sum + Number(voucher.total_amount || 0) : sum
        }, 0)
        setSalesToday(todaySales)

        const pending = orders.filter((order) => {
          const status = String(order.order_status ?? "").toLowerCase()
          return status === "0" || status === "1" || status === "pending" || status === "notcompleted" || status === "not_completed"
        }).length
        setPendingOrders(pending)

        const latestActivity = [
          ...orders.slice(0, 2).map((order) => ({
            title: `طلبية ${order.order_number || ""}`.trim() || "تم تحديث طلبية",
            time: order.order_date || "حديثاً",
            accent: "bg-emerald-500",
          })),
          ...vouchers.slice(0, 1).map((voucher) => ({
            title: `سند ${voucher.voucher_code || voucher.order_number || "جديد"}`,
            time: voucher.voucher_date || voucher.order_date || "حديثاً",
            accent: "bg-sky-500",
          })),
        ]

        setActivityItems(latestActivity.length ? latestActivity : [
          { title: "لا توجد سجلات حديثة بعد", time: "حديثاً", accent: "bg-violet-500" },
        ])
      } catch (error) {
        console.error("Failed to load dashboard data", error)
        setMonthlyOrdersData([])
        setMonthlySalesData([])
        setSalesToday(0)
        setPendingOrders(0)
        setActivityItems([{ title: "تعذر تحميل البيانات الحالية", time: "حديثاً", accent: "bg-amber-500" }])
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [])

  const dailyOrdersData = buildDailyOrdersData(ordersData, ordersSelectedMonth)
  const dailySalesData = buildDailySalesData(vouchersData, salesSelectedMonth)
  const ordersSelectedMonthLabel = monthlyOrdersData.find((item) => item.key === ordersSelectedMonth)?.month || monthlySalesData.find((item) => item.key === ordersSelectedMonth)?.month || ""
  const salesSelectedMonthLabel = monthlyOrdersData.find((item) => item.key === salesSelectedMonth)?.month || monthlySalesData.find((item) => item.key === salesSelectedMonth)?.month || ""

  const handleOrdersMonthSelect = (monthKey: string | null) => {
    setOrdersSelectedMonth(monthKey)
    setOrdersDailyView(Boolean(monthKey))
  }

  const handleSalesMonthSelect = (monthKey: string | null) => {
    setSalesSelectedMonth(monthKey)
    setSalesDailyView(Boolean(monthKey))
  }

  const statCards = [
    {
      title: "المبيعات اليوم",
      value: `${formatCurrency(salesToday)} ر.س`,
      change: loading ? "جارٍ التحميل…" : "+من السندات",
      icon: CircleDollarSign,
      tone: "from-emerald-500 to-emerald-600",
    },
    {
      title: "الطلبات المعلقة",
      value: pendingOrders.toString(),
      change: loading ? "جارٍ التحميل…" : "من الطلبات",
      icon: Clock3,
      tone: "from-amber-500 to-orange-500",
    },
    {
      title: "الطلبات هذا الشهر",
      value: monthlyOrdersData.reduce((sum, item) => sum + item.orders, 0).toString(),
      change: loading ? "جارٍ التحميل…" : "من جدول الطلبات",
      icon: Users2,
      tone: "from-sky-500 to-blue-600",
    },
    {
      title: "إجمالي المبيعات",
      value: `${formatCurrency(monthlySalesData.reduce((sum, item) => sum + item.sales, 0))} ر.س`,
      change: loading ? "جارٍ التحميل…" : "من جدول السندات",
      icon: Package,
      tone: "from-violet-500 to-fuchsia-600",
    },
  ]

  const homeActions = [
    { label: "إضافة عميل", section: "customers", icon: UserPlus, tone: "from-sky-500 to-blue-600" },
    { label: "إنشاء فاتورة", section: "sale-invoices", icon: FilePlus, tone: "from-emerald-500 to-teal-600" },
    { label: "إنشاء طلب", section: "sales-orders", icon: ShoppingCart, tone: "from-orange-500 to-amber-600" },
    { label: "إدخال منتج", section: "products", icon: Package, tone: "from-violet-500 to-fuchsia-600" },
    { label: "إدخال دفع", section: "accounts", icon: CreditCard, tone: "from-emerald-500 to-green-600" },
    { label: "الحسابات", section: "accounts", icon: Wallet2, tone: "from-sky-500 to-indigo-600" },
    { label: "تقارير المبيعات", section: "order-reports", icon: BarChart3, tone: "from-amber-500 to-orange-500" },
    { label: "عملاء نشطون", section: "customers", icon: TrendingUp, tone: "from-pink-500 to-rose-500" },
  ]

  const pieDataCategories = [
    { name: "استثماري", value: 40 },
    { name: "تشغيل", value: 25 },
    { name: "صيانة", value: 20 },
    { name: "أخرى", value: 15 },
  ]

  const pieDataCustomers = [
    { name: "العملاء نشطون", value: 45 },
    { name: "العملاء جدد", value: 30 },
    { name: "العملاء متكررون", value: 25 },
  ]

  const pieColors = ["#0ea5e9", "#10b981", "#f59e0b", "#d946ef"]

  return (
    <div className="min-h-full rounded-[28px] border border-border/60 bg-white p-4 text-slate-900 shadow-sm sm:p-6 lg:p-8" dir="rtl">
      <div className="grid gap-6">
        <Card className="border-border/60 bg-white shadow-sm">
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Badge className="rounded-full border-border/60 bg-slate-100 px-3 py-1 text-sm text-slate-700">
                  <Sparkles className="ml-1 h-4 w-4" />
                  لوحة تحكم الأساس
                </Badge>
                <h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">رأس الصفحة الرئيسية</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  تصفح أهم العمليات التشغيلية والمبيعات والمخزون من لوحة واحدة مع الوصول السريع للأقسام الرئيسية.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {homeActions.slice(0, 4).map((action) => {
                  const Icon = action.icon
                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => onOpenSection?.(action.section)}
                      className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-border/60 bg-slate-50 px-4 py-4 text-center text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                    >
                      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${action.tone} text-white`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      {action.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {statCards.map((card) => {
                const Icon = card.icon
                return (
                  <Card key={card.title} className="border-border/60 bg-slate-50 shadow-sm">
                    <CardContent className="p-4">
                      <div className={`inline-flex rounded-2xl bg-gradient-to-r ${card.tone} p-2 text-white`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="mt-4">
                        <p className="text-sm text-slate-600">{card.title}</p>
                        <div className="mt-1 flex items-end justify-between gap-2">
                          <span className="text-2xl font-bold">{card.value}</span>
                          <span className="text-sm text-emerald-600">{card.change}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <Card className="border-border/60 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <BarChart3 className="h-5 w-5 text-slate-800" />
                نظرة عامة على المبيعات
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySalesData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="sales" fill="#2563eb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <PieChartIcon className="h-5 w-5 text-slate-800" />
                توزيع النشاط
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieDataCategories} innerRadius={52} outerRadius={90} dataKey="value" stroke="none">
                    {pieDataCategories.map((entry, index) => (
                      <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" align="center" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-border/60 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <TrendingUp className="h-5 w-5 text-slate-800" />
                أعلى العملاء نشاطًا
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 p-6">
              {pieDataCustomers.map((item, index) => (
                <div key={item.name} className="rounded-3xl border border-border/60 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-500">{item.name}</p>
                      <p className="mt-2 text-xl font-semibold text-slate-900">{item.value}%</p>
                    </div>
                    <div className={`h-3 w-16 rounded-full bg-gradient-to-r ${pieColors[index % pieColors.length]} `} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-slate-50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <BellRing className="h-5 w-5 text-slate-800" />
                تحديثات عاجلة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-6">
              <div className="rounded-3xl border border-border/60 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">الطلبات المعلقة</h3>
                <p className="mt-1 text-3xl font-bold text-orange-600">{pendingOrders}</p>
                <p className="text-sm text-slate-500">طلبات لم يتم الانتهاء منها بعد</p>
              </div>
              <div className="rounded-3xl border border-border/60 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">الإيرادات اليوم</h3>
                <p className="mt-1 text-3xl font-bold text-emerald-600">{formatCurrency(salesToday)} ر.س</p>
                <p className="text-sm text-slate-500">إجمالي السندات لهذا اليوم</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
