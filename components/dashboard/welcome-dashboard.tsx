"use client"

import { useEffect, useState } from "react"
import { ArrowRight, BarChart3, BellRing, CircleDollarSign, Clock3, Package, Sparkles, TrendingUp, Users2, Wallet2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"

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

  return (
    <div className="min-h-full rounded-[28px] border border-border/60 bg-white p-4 text-slate-900 shadow-sm sm:p-6 lg:p-8" dir="rtl">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/60 bg-white shadow-sm">
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="rounded-full border-border/60 bg-slate-100 px-3 py-1 text-sm text-slate-700">
                <Sparkles className="ml-1 h-4 w-4" />
                لوحة تحكم حديثة
              </Badge>
              <Badge variant="secondary" className="rounded-full bg-emerald-50 text-emerald-700">
                نظام أساسي متكامل
              </Badge>
            </div>

            <div className="space-y-3">
              <h2 className="text-3xl font-bold sm:text-4xl">مرحبًا بك في أساس Accounting System</h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                راقب الأداء المالي والمخزني والعمليات التشغيلية من شاشة واحدة، وابدأ أي مهمة من خلال أزرار الوصول السريع.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => onOpenSection?.("sales-orders")}
                className="bg-white text-slate-900 hover:bg-slate-100"
              >
                فتح المبيعات
                <ArrowRight className="mr-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenSection?.("products")}
                className="border-border/60 bg-slate-50 text-slate-700 hover:bg-slate-100"
              >
                إدارة الأصناف
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-slate-50 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">اليوم</p>
                <h3 className="text-xl font-semibold">{new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" })}</h3>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                <BellRing className="h-5 w-5" />
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-white p-4">
              <p className="text-sm text-slate-500">أهم التحديثات</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li className="flex items-center justify-between">
                  <span>تحديثات المخزون</span>
                  <span className="text-emerald-600">محدث</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>الطلبات المعلقة</span>
                  <span className="text-amber-600">18</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>التحليلات المالية</span>
                  <span className="text-sky-600">جاهز</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title} className="border-border/60 bg-white shadow-sm">
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

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="border-border/60 bg-white shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <BarChart3 className="h-5 w-5 text-emerald-600" />
                {ordersDailyView ? `تفاصيل الأيام - ${ordersSelectedMonthLabel}` : "الطلبات حسب الشهر"}
              </CardTitle>
              <div className="flex items-center gap-2">
                {ordersDailyView && (
                  <Button variant="outline" size="sm" onClick={() => setOrdersDailyView(false)} className="border-border/60 bg-white text-slate-700 hover:bg-slate-100">
                    العودة للشهر
                  </Button>
                )}
                <select
                  value={ordersSelectedMonth || ""}
                  onChange={(event) => handleOrdersMonthSelect(event.target.value || null)}
                  className="rounded-lg border border-border/60 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  {monthlyOrdersData.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.month}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              {ordersDailyView ? (
                <BarChart data={dailyOrdersData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#10b981" radius={[8, 8, 0, 0]} />
                </BarChart>
              ) : (
                <BarChart data={monthlyOrdersData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#10b981" radius={[8, 8, 0, 0]} onClick={(payload) => handleOrdersMonthSelect(payload?.payload?.key || null)} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <TrendingUp className="h-5 w-5 text-sky-600" />
                {salesDailyView ? `تفاصيل الأيام - ${salesSelectedMonthLabel}` : "المبيعات حسب الشهر"}
              </CardTitle>
              <div className="flex items-center gap-2">
                {salesDailyView && (
                  <Button variant="outline" size="sm" onClick={() => setSalesDailyView(false)} className="border-border/60 bg-white text-slate-700 hover:bg-slate-100">
                    العودة للشهر
                  </Button>
                )}
                <span className="text-sm text-slate-500">{salesSelectedMonthLabel ? `تفاصيل ${salesSelectedMonthLabel}` : "اختر شهراً"}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              {salesDailyView ? (
                <LineChart data={dailySalesData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              ) : (
                <LineChart data={monthlySalesData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={(props) => (
                      <circle
                        {...props}
                        r={4}
                        onClick={() => handleSalesMonthSelect(props.payload?.key || null)}
                        className="cursor-pointer"
                      />
                    )}
                    activeDot={{ r: 6, onClick: (props: any) => handleSalesMonthSelect(props.payload?.key || null) }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-border/60 bg-slate-50 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <BarChart3 className="h-5 w-5 text-sky-600" />
              النشاط الأخير
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activityItems.map((item) => (
              <div key={item.title} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-white p-3">
                <div className={`mt-1 h-2.5 w-2.5 rounded-full ${item.accent}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              الوصول السريع
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Button
                  key={action.section}
                  variant="outline"
                  onClick={() => onOpenSection?.(action.section)}
                  className="flex h-20 items-center justify-between border-border/60 bg-slate-50 text-right text-slate-700 hover:bg-slate-100"
                >
                  <span className="text-sm font-medium">{action.label}</span>
                  <Icon className="h-5 w-5 text-slate-300" />
                </Button>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
