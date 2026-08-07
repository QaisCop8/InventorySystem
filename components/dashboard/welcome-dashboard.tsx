"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowRight, BarChart3, BellRing, CircleDollarSign, Clock3, Package, Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Users2, Wallet2, CreditCard, FilePlus, ShoppingCart, UserPlus, PieChart as PieChartIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useExchangeRates } from "@/hooks/use-swr-data"
import { getFirstCurrencyLabel } from "@/lib/currency-display"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from "recharts"
import { QuickSalesOrder } from "@/components/quick-sales-order"

interface WelcomeDashboardProps {
  onOpenSection?: (section: string) => void
}

const quickActions = [
  { label: "طلبيات المبيعات", section: "sales-orders", icon: TrendingUp },
  { label: "الأصناف", section: "products", icon: Package },
  { label: "العملاء", section: "customers", icon: Users2 },
  { label: "الحسابات", section: "accounts", icon: Wallet2 },
]

const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
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
  const { rates: currencies } = useExchangeRates()
  const currencyLabel = getFirstCurrencyLabel(currencies)
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
  const [companyName, setCompanyName] = useState("")
  const [companyAddress, setCompanyAddress] = useState("")
  const [companyInfoLoading, setCompanyInfoLoading] = useState(true)
  const [showQuickOrder, setShowQuickOrder] = useState(false)
  const [insightsData, setInsightsData] = useState<{
    months: Array<{ monthKey: string; revenue: number; cogs: number }>
    cashBalance: number
    dailyBurn: number
  }>({ months: [], cashBalance: 0, dailyBurn: 0 })

  useEffect(() => {
    fetch("/api/dashboard/insights")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        setInsightsData({
          months: Array.isArray(data.months) ? data.months : [],
          cashBalance: Number(data.cashBalance) || 0,
          dailyBurn: Number(data.dailyBurn) || 0,
        })
      })
      .catch(() => {
        // تجاهل — تبقى بطاقات الرؤى بحالتها الافتراضية (بيانات غير كافية) إن تعذر التحميل
      })
  }, [])

  useEffect(() => {
    let isActive = true

    const applyCompanySettings = (data: any) => {
      const settings = data?.settings ?? data
      if (!isActive || !settings || typeof settings !== "object") return

      setCompanyName(String(settings.company_name ?? "").trim())
      setCompanyAddress(String(settings.company_address ?? "").trim())
    }

    const loadCompanySettings = () => {
      fetch("/api/settings/system", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then(applyCompanySettings)
        .catch(() => {
          // تجاهل — تبقى القيم الافتراضية إن تعذر تحميل إعدادات النظام
        })
        .finally(() => {
          if (isActive) setCompanyInfoLoading(false)
        })
    }

    const handleSettingsUpdate = (event: Event) => {
      const updatedSettings = (event as CustomEvent).detail
      if (updatedSettings) {
        applyCompanySettings(updatedSettings)
        setCompanyInfoLoading(false)
      } else {
        loadCompanySettings()
      }
    }

    loadCompanySettings()
    window.addEventListener("focus", loadCompanySettings)
    window.addEventListener("system-settings-updated", handleSettingsUpdate)

    return () => {
      isActive = false
      window.removeEventListener("focus", loadCompanySettings)
      window.removeEventListener("system-settings-updated", handleSettingsUpdate)
    }
  }, [])

  const loadDashboardData = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

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
      value: `${formatCurrency(salesToday)} ${currencyLabel}`.trim(),
      change: loading ? "جارٍ التحميل…" : " ",
      icon: CircleDollarSign,
      tone: "from-emerald-500 to-emerald-600",
    },
    {
      title: "الطلبات المعلقة",
      value: formatCurrency(pendingOrders),
      change: loading ? "جارٍ التحميل…" : "",
      icon: Clock3,
      tone: "from-amber-500 to-orange-500",
    },
    {
      title: "الطلبات هذا الشهر",
      value: formatCurrency(monthlyOrdersData.reduce((sum, item) => sum + item.orders, 0)),
      change: loading ? "جارٍ التحميل…" : "",
      icon: Users2,
      tone: "from-sky-500 to-blue-600",
    },
    {
      title: "إجمالي المبيعات",
      value: `${formatCurrency(monthlySalesData.reduce((sum, item) => sum + item.sales, 0))} ${currencyLabel}`.trim(),
      change: loading ? "جارٍ التحميل…" : "",
      icon: Package,
      tone: "from-violet-500 to-fuchsia-600",
    },
  ]

  const homeActions: Array<{ label: string; section: string; icon: typeof UserPlus; tone: string; onClick?: () => void }> = [
    { label: "إضافة عميل", section: "customers", icon: UserPlus, tone: "from-sky-500 to-blue-600" },
    { label: "إنشاء فاتورة", section: "sale-invoices", icon: FilePlus, tone: "from-emerald-500 to-teal-600" },
    { label: "إنشاء طلب", section: "sales-orders", icon: ShoppingCart, tone: "from-orange-500 to-amber-600", onClick: () => setShowQuickOrder(true) },
    { label: "إدخال صنف", section: "products", icon: Package, tone: "from-violet-500 to-fuchsia-600" },
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

  type InsightSeverity = "critical" | "warning" | "good" | "neutral"

  const severityStyles: Record<InsightSeverity, { emoji: string; border: string; bg: string; text: string; iconBg: string; icon: typeof TrendingUp }> = {
    critical: { emoji: "🔴", border: "border-red-200", bg: "bg-red-50", text: "text-red-700", iconBg: "bg-red-100 text-red-600", icon: AlertTriangle },
    warning: { emoji: "🟡", border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", iconBg: "bg-amber-100 text-amber-600", icon: AlertTriangle },
    good: { emoji: "🟢", border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", iconBg: "bg-emerald-100 text-emerald-600", icon: CheckCircle2 },
    neutral: { emoji: "⚪", border: "border-border/60", bg: "bg-slate-50", text: "text-slate-600", iconBg: "bg-slate-100 text-slate-500", icon: TrendingUp },
  }

  const marginMonths = insightsData.months
  const marginPct = (m?: { revenue: number; cogs: number }) =>
    m && m.revenue > 0 ? ((m.revenue - m.cogs) / m.revenue) * 100 : null
  const marginThisMonth = marginPct(marginMonths[marginMonths.length - 1])
  const marginLastMonth = marginPct(marginMonths[marginMonths.length - 2])
  const marginChangePts = marginThisMonth != null && marginLastMonth != null ? marginThisMonth - marginLastMonth : null

  const runwayDays = insightsData.dailyBurn > 0 ? Math.max(0, Math.round(insightsData.cashBalance / insightsData.dailyBurn)) : null

  const lastTwoMonthsSales = monthlySalesData.slice(-2)
  const revenueThisMonth = lastTwoMonthsSales[1]?.sales ?? 0
  const revenueLastMonth = lastTwoMonthsSales[0]?.sales ?? 0
  const revenueGrowthPct = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 : null

  const smartInsights: Array<{ severity: InsightSeverity; title: string; message: string }> = [
    (() => {
      if (loading) return { severity: "neutral" as const, title: "السيولة النقدية", message: "جارٍ تحميل بيانات السيولة…" }
      if (insightsData.dailyBurn <= 0) {
        return insightsData.cashBalance > 0
          ? { severity: "good" as const, title: "السيولة النقدية", message: "لا يوجد استهلاك نقدي ملحوظ خلال آخر 30 يوماً" }
          : { severity: "neutral" as const, title: "السيولة النقدية", message: "لا توجد بيانات كافية من سندات القبض والصرف بعد" }
      }
      if (insightsData.cashBalance <= 0) {
        return { severity: "critical" as const, title: "السيولة النقدية", message: "الرصيد النقدي التقديري صفر أو سالب — راجع سندات القبض والصرف" }
      }
      const days = runwayDays ?? 0
      const severity: InsightSeverity = days < 30 ? "critical" : days < 90 ? "warning" : "good"
      return { severity, title: "السيولة النقدية", message: `لديك سيولة تكفي لـ ${days} يوماً بمعدل الصرف الحالي` }
    })(),
    (() => {
      if (loading) return { severity: "neutral" as const, title: "هامش الربح", message: "جارٍ تحميل بيانات الهامش…" }
      if (marginThisMonth == null) {
        return { severity: "neutral" as const, title: "هامش الربح", message: "لا توجد مبيعات كافية هذا الشهر لحساب هامش الربح" }
      }
      if (marginChangePts == null) {
        return { severity: "neutral" as const, title: "هامش الربح", message: `هامش الربح الإجمالي الحالي ${marginThisMonth.toFixed(1)}%` }
      }
      if (marginChangePts <= -3) {
        return { severity: "critical" as const, title: "تحذير هامش الربح", message: `انخفض هامش الربح الإجمالي بنسبة ${Math.abs(marginChangePts).toFixed(1)}% هذا الشهر` }
      }
      if (marginChangePts >= 3) {
        return { severity: "good" as const, title: "هامش الربح", message: `تحسّن هامش الربح الإجمالي بنسبة ${marginChangePts.toFixed(1)}% هذا الشهر` }
      }
      return { severity: "warning" as const, title: "هامش الربح", message: `هامش الربح الإجمالي مستقر عند ${marginThisMonth.toFixed(1)}% هذا الشهر` }
    })(),
    (() => {
      if (loading) return { severity: "neutral" as const, title: "نمو الإيرادات", message: "جارٍ تحميل بيانات الإيرادات…" }
      if (revenueGrowthPct == null) {
        return { severity: "neutral" as const, title: "نمو الإيرادات", message: "لا توجد بيانات كافية لمقارنة نمو الإيرادات" }
      }
      if (revenueGrowthPct > 1) {
        return { severity: "good" as const, title: "نمو الإيرادات", message: `+${revenueGrowthPct.toFixed(1)}% مقارنة بالشهر الماضي` }
      }
      if (revenueGrowthPct < -1) {
        return { severity: "critical" as const, title: "تراجع الإيرادات", message: `${revenueGrowthPct.toFixed(1)}% مقارنة بالشهر الماضي` }
      }
      return { severity: "warning" as const, title: "نمو الإيرادات", message: "الإيرادات مستقرة مقارنة بالشهر الماضي" }
    })(),
  ]

  return (
    <div className="min-h-full rounded-[28px] border border-border/60 bg-white p-4 text-slate-900 shadow-sm sm:p-6 lg:p-8" dir="rtl">
      <div className="grid gap-6">
        <Card className="border-border/60 bg-white shadow-sm">
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                
                {companyInfoLoading ? (
                  <div className="mt-4 space-y-3" aria-label="جارٍ تحميل معلومات الشركة">
                    <div className="h-10 w-72 max-w-full animate-pulse rounded-xl bg-slate-200" />
                    <div className="h-5 w-96 max-w-full animate-pulse rounded-lg bg-slate-100" />
                  </div>
                ) : (
                  <>
                    <h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">
                      {companyName || "لم يتم تحديد اسم الشركة"}
                    </h2>
                    <p className="mt-2 max-w-2xl whitespace-pre-line text-sm leading-7 text-slate-600 sm:text-base">
                      {companyAddress || "لم يتم تحديد عنوان الشركة"}
                    </p>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {homeActions.slice(0, 4).map((action) => {
                  const Icon = action.icon
                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => (action.onClick ? action.onClick() : onOpenSection?.(action.section))}
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

        <Card className="border-border/60 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Sparkles className="h-5 w-5 text-slate-800" />
              لوحة الرؤى الذكية
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-6 sm:grid-cols-3">
            {smartInsights.map((insight) => {
              const style = severityStyles[insight.severity]
              const Icon = style.icon
              return (
                <div key={insight.title} className={`rounded-3xl border ${style.border} ${style.bg} p-4`}>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${style.iconBg}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-semibold text-slate-900">
                      {style.emoji} {insight.title}
                    </p>
                  </div>
                  <p className={`mt-3 text-sm leading-6 ${style.text}`}>{insight.message}</p>
                </div>
              )
            })}
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
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                    tickFormatter={(value) => formatCurrency(Number(value))}
                  />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
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
                      <p className="mt-2 text-xl font-semibold text-slate-900">{formatCurrency(item.value)}%</p>
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
                <p className="mt-1 text-3xl font-bold text-orange-600">{formatCurrency(pendingOrders)}</p>
                <p className="text-sm text-slate-500">طلبات لم يتم الانتهاء منها بعد</p>
              </div>
              <div className="rounded-3xl border border-border/60 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">الإيرادات اليوم</h3>
                <p className="mt-1 text-3xl font-bold text-emerald-600">
                  {formatCurrency(salesToday)} {currencyLabel}
                </p>
                <p className="text-sm text-slate-500">إجمالي السندات لهذا اليوم</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <QuickSalesOrder
        open={showQuickOrder}
        onOpenChange={setShowQuickOrder}
        onOrderSaved={() => loadDashboardData()}
      />
    </div>
  )
}
