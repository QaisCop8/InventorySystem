"use client"
import { tr } from "@/lib/i18n"
import { amountNumberFormat } from "@/lib/decimals"

import { useCallback, useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { AlertTriangle, ClipboardList, Factory, Layers, Loader2, Printer, RefreshCw, Scale } from "lucide-react"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { VizCard, VizEmpty, VizKpi, VizRankBars, VizTooltip } from "@/components/reports/statistical-dashboards"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// لوحة الانتاج (app/api/reports/production?view=dashboard): مؤشرات الفترة، الانتاج اليومي (قيمة المنتَج مقابل الخام)،
// توزيع الكلفة حسب النوع، أعلى المنتجات قيمةً، أوامر الانتاج المفتوحة/المتأخرة، وانحراف الاستهلاك عن الوصفة.
// الألوان من رموز .viz-root (globals.css) المعتمدة لِلوحات الاحصائية: سلسلة 1 أزرق، سلسلة 2 برتقالي.

type Data = {
  from: string; to: string
  kpis: { vouchers: number; products: number; produced_quantity: number; produced_value: number; raw_value: number; extra_costs: number; raw_share: number; variance_value: number; variance_percent: number }
  cost_breakdown: { cost_type: string; amount: number }[]
  daily: { day: string; produced_value: number; raw_value: number; vouchers: number }[]
  top_products: { product_name: string; quantity: number; value: number }[]
  orders: { open_orders?: number; in_progress?: number; late_orders?: number; completed_orders?: number }
}

const money = amountNumberFormat("en-US")
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
const S1 = "var(--viz-series-1)", S2 = "var(--viz-series-2)"
const AXIS = { stroke: "var(--viz-axis)", fontSize: 11, tickLine: false } as const
const COST_NAMES: Record<string, string> = { raw: "المواد الخام", labor: "أجور عمال", overhead: "مصاريف تشغيل", packaging: "تغليف وتعبئة", other: "أخرى" }
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`
const today = () => new Date().toISOString().slice(0, 10)
const openSection = (section: string) => window.dispatchEvent(new CustomEvent("OPEN_SECTION", { detail: { section } }))

export function ProductionDashboard() {
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), branchIds: [] as number[] })
  const [branches, setBranches] = useState<ReportOption[]>([])
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/reports/production?view=dashboard&meta=1", { cache: "no-store" }).then((response) => response.json())
      .then((meta) => setBranches(meta.branches || [])).catch(() => undefined)
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const query = new URLSearchParams({ view: "dashboard", from_date: filters.from, to_date: filters.to, branch_ids: filters.branchIds.join(","), statuses: "2" })
      const response = await fetch(`/api/reports/production?${query}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || tr("تعذر تحميل لوحة الانتاج"))
      setData(body)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr("تعذر تحميل لوحة الانتاج"))
    } finally { setLoading(false) }
  }, [filters])
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const k = data?.kpis
  const costs = (data?.cost_breakdown || []).map((row) => ({ name: tr(COST_NAMES[row.cost_type] || row.cost_type), amount: row.amount })).sort((a, b) => b.amount - a.amount)
  const totalCost = costs.reduce((sum, row) => sum + row.amount, 0)

  return (
    <ReportPage loading={loading}>
      <ReportHeader
        icon={Factory}
        category={tr("تقارير الانتاج")}
        title={tr("لوحة الانتاج")}
        description={tr("ما أُنتج وبكم كلّف وأين الهدر — سندات الانتاج المعتمدة في الفترة")}
        actions={<Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!data}><Printer className="me-2 h-4 w-4" />{tr("طباعة")}</Button>}
      />
      <div className="flex shrink-0 flex-wrap items-end gap-3 rounded-2xl border bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="space-y-1.5"><Label>{tr("من تاريخ")}</Label><Input type="date" dir="ltr" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="w-44 max-w-full rounded-xl" /></div>
        <div className="space-y-1.5"><Label>{tr("إلى تاريخ")}</Label><Input type="date" dir="ltr" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="w-44 max-w-full rounded-xl" /></div>
        <div className="w-64 max-w-full"><ReportMultiChoice label={tr("الفروع")} options={branches} selected={filters.branchIds} onChange={(branchIds) => setFilters({ ...filters, branchIds })} placeholder={tr("جميع الفروع")} /></div>
        <Button data-report-apply onClick={() => void load()} disabled={loading} className="rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600">
          {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RefreshCw className="me-2 h-4 w-4" />}{tr("تحديث")}
        </Button>
      </div>
      {error && <p className="shrink-0 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className={`viz-root flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-6 transition-opacity ${loading && data ? "pointer-events-none opacity-60" : ""}`}>
        {!data || !k ? (!error && <div className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <VizKpi label="قيمة الانتاج" value={money.format(k.produced_value)} icon={Factory} hint={`${k.vouchers} ${tr("سند")} · ${k.products} ${tr("صنف")}`} />
              <VizKpi label="كلفة المواد الخام" value={money.format(k.raw_value)} icon={Layers} hint={`${k.raw_share.toFixed(1)}% ${tr("من قيمة الانتاج")}`} />
              <VizKpi label="التكاليف الإضافية" value={money.format(k.extra_costs)} icon={ClipboardList} hint={tr("أجور، تشغيل، تغليف")} />
              <VizKpi label="انحراف الاستهلاك" value={money.format(k.variance_value)} icon={Scale}
                tone={k.variance_value > 0 ? "bad" : k.variance_value < 0 ? "good" : undefined}
                hint={k.variance_value === 0 ? tr("مطابق للوصفة") : `${k.variance_percent > 0 ? "+" : ""}${k.variance_percent.toFixed(1)}% ${k.variance_value > 0 ? tr("هدر زائد عن الوصفة") : tr("أقل من الوصفة")}`} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <button type="button" onClick={() => openSection("production-orders")} className="text-start"><VizKpi label="أوامر انتاج مفتوحة" value={String(data.orders.open_orders ?? 0)} icon={ClipboardList} hint={`${data.orders.in_progress ?? 0} ${tr("قيد التنفيذ")}`} /></button>
              <button type="button" onClick={() => openSection("production-orders")} className="text-start"><VizKpi label="أوامر متأخرة" value={String(data.orders.late_orders ?? 0)} icon={AlertTriangle} tone={(data.orders.late_orders ?? 0) > 0 ? "bad" : "good"} hint={(data.orders.late_orders ?? 0) > 0 ? tr("تجاوزت تاريخ التسليم") : tr("لا يوجد تأخير")} /></button>
              <VizKpi label="الكمية المنتجة" value={compact.format(k.produced_quantity)} hint={tr("بالوحدات الرئيسية لكل الأصناف")} />
              <button type="button" onClick={() => openSection("production-orders")} className="text-start"><VizKpi label="أوامر منتهية بالفترة" value={String(data.orders.completed_orders ?? 0)} hint={tr("اكتمل انتاجها")} /></button>
            </div>

            <VizCard title="الانتاج اليومي" subtitle="قيمة المواد المنتجة مقابل كلفة المواد الخام لكل يوم" legend={[{ label: "قيمة المنتَج", color: S1 }, { label: "كلفة الخام", color: S2 }]}>
              {data.daily.length ? (
                <div style={{ height: 280 }} dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.daily} barGap={2}>
                      <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                      <XAxis dataKey="day" {...AXIS} axisLine={false} tickFormatter={(value: string) => value.slice(5)} />
                      <YAxis {...AXIS} axisLine={false} width={56} tickFormatter={(value) => compact.format(Number(value))} />
                      <Tooltip cursor={{ fill: "var(--viz-hover)" }} content={<VizTooltip />} />
                      <Bar dataKey="produced_value" name={tr("قيمة المنتَج")} fill={S1} radius={[4, 4, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="raw_value" name={tr("كلفة الخام")} fill={S2} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <VizEmpty />}
            </VizCard>

            <div className="grid gap-4 xl:grid-cols-2">
              <VizCard title="توزيع كلفة الانتاج" subtitle={totalCost ? `${tr("الإجمالي")} ${money.format(totalCost)}` : undefined}>
                <VizRankBars rows={costs} dataKey="amount" name="المبلغ" color={S1} height={Math.max(160, costs.length * 44)} />
              </VizCard>
              <VizCard title="أعلى المنتجات قيمةً" subtitle="قيمة الانتاج المعتمد في الفترة">
                <VizRankBars rows={data.top_products.map((row) => ({ name: row.product_name, value: row.value }))} dataKey="value" name="قيمة الانتاج" color={S1} height={Math.max(160, data.top_products.length * 40)} />
              </VizCard>
            </div>
          </>
        )}
      </div>
    </ReportPage>
  )
}
