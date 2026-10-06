"use client"

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Building2, CheckCircle2, Clock3, Gauge, History, LayoutDashboard, PackageSearch, Timer } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import InternalItemImage from "./internal-item-image"
import {
  INTERNAL_ACTION_LABELS, INTERNAL_STATUS_LABELS, INTERNAL_STEPS, InternalLockedState, InternalPageHeader, InternalStepper, RefreshButton, SIDE_LABELS,
  ageLabel, formatQuantity, isStepEnabled, openInternalSection, useInternalWorkflow,
} from "./internal-workflow-shared"

type Dashboard = {
  stages: Record<number, { outgoing: number; incoming: number }>
  completedThisMonth: number
  averageHours: number
  fillRate: number
  overdueDays: number
  overdue: any[]
  trend: Array<{ day: string; created: number; completed: number }>
  topItems: any[]
  recent: any[]
  partners: Array<{ branch_id: number; outgoing: number; incoming: number }>
}

export default function InternalDashboardPage() {
  const { activeBranchId } = useAuth()
  const workflow = useInternalWorkflow()
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const sequenceRef = useRef(0)
  const allowed = workflow.permissions?.dashboard === true

  const load = async () => {
    const branchId = Number(activeBranchId || 0)
    const sequence = ++sequenceRef.current
    if (!branchId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/internal-manufacturing-requests/dashboard?_=${Date.now()}`, { cache: "no-store", headers: { "x-branch-id": String(branchId) } })
      const body = await response.json()
      if (sequence !== sequenceRef.current) return
      if (response.ok) { setData(body); setError("") } else { setData(null); setError(body.error || "تعذر تحميل لوحة المتابعة") }
    } catch (failure: any) {
      if (sequence === sequenceRef.current) setError(failure.message || "تعذر تحميل لوحة المتابعة")
    } finally {
      if (sequence === sequenceRef.current) setLoading(false)
    }
  }
  useEffect(() => { if (!workflow.loading && allowed) void load() }, [activeBranchId, workflow.loading, allowed])

  const header = <InternalPageHeader
    title="لوحة متابعة طلبات البضاعة الداخلية"
    description="صورة لحظية لطلبات فرعك الصادرة والواردة في كل مراحل السير."
    icon={LayoutDashboard}
    branchLabel={workflow.branchId ? workflow.branchName(workflow.branchId) : undefined}
    actions={<RefreshButton loading={loading} onClick={() => { void load(); void workflow.reload() }} />}
  >
    <InternalStepper settings={workflow.settings} counts={workflow.counts} permissions={workflow.permissions} current="dashboard" />
  </InternalPageHeader>

  if (!workflow.loading && !allowed) {
    return <div dir="rtl" className="space-y-4 p-3 md:p-5">{header}<InternalLockedState title="لا توجد صلاحية" message={`لا يوجد لديك صلاحية "لوحة متابعة طلبات البضاعة" في فرع ${workflow.branchName(workflow.branchId)}.`} /></div>
  }

  const steps = INTERNAL_STEPS.filter((step) => step.status > 1 && isStepEnabled(step, workflow.settings))
  const sum = (key: "outgoing" | "incoming") => Object.entries(data?.stages || {}).filter(([status]) => Number(status) >= 2 && Number(status) <= 7).reduce((total, [, value]) => total + value[key], 0)
  const maxStage = Math.max(1, ...steps.map((step) => (data?.stages[step.status]?.outgoing || 0) + (data?.stages[step.status]?.incoming || 0)))

  return <div dir="rtl" className="space-y-4 p-3 md:p-5">
    {header}
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Kpi icon={ArrowUpRight} tone="sky" label="طلبات صادرة مفتوحة" value={sum("outgoing")} hint="طلبها فرعك ولم تكتمل" />
      <Kpi icon={ArrowDownLeft} tone="violet" label="طلبات واردة مفتوحة" value={sum("incoming")} hint="مطلوبة من فرعك" />
      <Kpi icon={AlertTriangle} tone="amber" label="طلبات متأخرة" value={data?.overdue.length ?? 0} hint={`بدون حركة أكثر من ${data?.overdueDays ?? 2} يوم`} />
      <Kpi icon={CheckCircle2} tone="emerald" label="مكتملة هذا الشهر" value={data?.completedThisMonth ?? 0} />
      <Kpi icon={Timer} tone="slate" label="متوسط زمن الإنجاز" value={data ? `${formatQuantity(data.averageHours)} س` : 0} hint="آخر 30 يوماً" />
      <Kpi icon={Gauge} tone="teal" label="نسبة تلبية الكميات" value={data ? `${formatQuantity(data.fillRate)}%` : "0%"} hint="المستلم ÷ المطلوب — آخر 30 يوماً" />
    </div>

    <div className="grid gap-4 xl:grid-cols-5">
      <Panel className="xl:col-span-3" title="الطلبات في كل مرحلة" icon={LayoutDashboard}>
        <div className="space-y-2.5">
          {steps.map((step) => {
            const value = data?.stages[step.status] || { outgoing: 0, incoming: 0 }
            const acting = step.side === "supplier" ? value.incoming : value.outgoing
            const canOpen = workflow.permissions?.[step.permission]
            return <button key={step.key} type="button" disabled={!canOpen} onClick={() => openInternalSection(step.section)} className="grid w-full grid-cols-[150px_1fr_auto] items-center gap-3 rounded-lg p-1.5 text-right transition enabled:hover:bg-slate-50 disabled:cursor-default dark:enabled:hover:bg-slate-900">
              <span className="flex items-center gap-2 text-sm font-semibold"><step.icon className="h-4 w-4 text-emerald-600" />{step.short}</span>
              <span className="flex h-6 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <span className="h-full bg-sky-500" style={{ width: `${(value.outgoing / maxStage) * 100}%` }} title={`صادرة: ${value.outgoing}`} />
                <span className="h-full bg-violet-500" style={{ width: `${(value.incoming / maxStage) * 100}%` }} title={`واردة: ${value.incoming}`} />
              </span>
              <span className="min-w-[110px] text-left text-xs text-muted-foreground"><b className={`text-base ${acting ? "text-amber-700" : "text-slate-400"}`}>{acting}</b> بانتظار فرعك</span>
            </button>
          })}
          <div className="flex gap-4 pt-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />صادرة من فرعك</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />واردة إلى فرعك</span></div>
        </div>
      </Panel>
      <Panel className="xl:col-span-2" title="الحركة خلال 14 يوماً" icon={History}>
        <div className="h-[230px]" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={(data?.trend || []).map((row) => ({ ...row, label: row.day.slice(5) }))} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="imCreated" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} /><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient>
                <linearGradient id="imCompleted" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} domain={[0, (max: number) => Math.max(2, max)]} />
              <Tooltip formatter={(value: any, name: any) => [value, name === "created" ? "طلبات جديدة" : "طلبات مكتملة"]} />
              <Area type="monotone" dataKey="created" stroke="#0ea5e9" fill="url(#imCreated)" strokeWidth={2} />
              <Area type="monotone" dataKey="completed" stroke="#10b981" fill="url(#imCompleted)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="طلبات متأخرة" icon={AlertTriangle}>
        {!data?.overdue.length ? <Empty text="لا توجد طلبات متأخرة" /> : <div className="divide-y">
          {data.overdue.map((row) => {
            const step = INTERNAL_STEPS.find((candidate) => candidate.status === Number(row.internal_status))
            return <button key={row.id} type="button" onClick={() => step && workflow.permissions?.[step.permission] && openInternalSection(step.section)} className="flex w-full items-center justify-between gap-2 py-2 text-right text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
              <span className="min-w-0"><span className="block font-mono font-bold">{row.vch_code}</span><span className="block truncate text-xs text-muted-foreground">{INTERNAL_STATUS_LABELS[Number(row.internal_status)]} — {row.direction === "outgoing" ? `إلى ${workflow.branchName(row.manufacturing_branch_id)}` : `من ${workflow.branchName(row.branch_id)}`}</span></span>
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"><Clock3 className="ml-1 inline h-3 w-3" />{ageLabel(row.stage_since)}</span>
            </button>
          })}
        </div>}
      </Panel>
      <Panel title="الأصناف الأكثر طلباً (30 يوماً)" icon={PackageSearch}>
        {!data?.topItems.length ? <Empty text="لا توجد طلبات خلال آخر 30 يوماً" /> : <div className="space-y-2">
          {data.topItems.map((item, index) => {
            const max = Number(data.topItems[0]?.quantity || 1)
            return <div key={`${item.item_id}-${index}`} className="flex items-center gap-2">
              <InternalItemImage item={item} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate font-semibold">{item.item_name}</span><span className="shrink-0 font-bold">{formatQuantity(item.quantity)} <span className="text-xs font-normal text-muted-foreground">{item.unit_name}</span></span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(Number(item.quantity) / max) * 100}%` }} /></div>
              </div>
            </div>
          })}
        </div>}
      </Panel>
      <Panel title="آخر الحركات" icon={History}>
        {!data?.recent.length ? <Empty text="لا توجد حركات بعد" /> : <ol className="relative space-y-3 border-r-2 border-slate-100 pr-4">
          {data.recent.map((event) => <li key={event.id} className="relative text-sm">
            <span className={`absolute -right-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${event.action === "delete" ? "bg-red-500" : Number(event.to_status) === 8 ? "bg-emerald-500" : "bg-sky-500"}`} />
            <div className="flex items-center justify-between gap-2"><span className="font-semibold">{INTERNAL_ACTION_LABELS[event.action] || event.action} <span className="font-mono text-xs text-muted-foreground">{event.vch_code}</span></span><span className="shrink-0 text-[11px] text-muted-foreground">{ageLabel(event.created_at)}</span></div>
            <div className="text-xs text-muted-foreground">{event.user_name || "-"}</div>
          </li>)}
        </ol>}
      </Panel>
    </div>

    <Panel title="التعامل مع الفروع (90 يوماً)" icon={Building2}>
      {!data?.partners.length ? <Empty text="لا يوجد تعامل مع فروع أخرى خلال آخر 90 يوماً" /> : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {data.partners.map((partner) => <div key={partner.branch_id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
          <span className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-slate-400" />{workflow.branchName(partner.branch_id)}</span>
          <span className="flex gap-2 text-xs"><span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">طلبنا منه {partner.outgoing}</span><span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">طلب منا {partner.incoming}</span></span>
        </div>)}
      </div>}
    </Panel>
    <p className="text-center text-xs text-muted-foreground">مراحل التجهيز وتدقيق الجاهز والإرسال تُنفَّذ من {SIDE_LABELS.supplier}، وباقي المراحل من {SIDE_LABELS.requester}.</p>
  </div>
}

const TONES: Record<string, string> = {
  sky: "bg-sky-50 text-sky-700 ring-sky-100", violet: "bg-violet-50 text-violet-700 ring-violet-100", amber: "bg-amber-50 text-amber-700 ring-amber-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100", slate: "bg-slate-100 text-slate-700 ring-slate-200", teal: "bg-teal-50 text-teal-700 ring-teal-100",
}

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: ComponentType<{ className?: string }>; label: string; value: number | string; hint?: string; tone: string }) {
  return <div className="rounded-xl border bg-white p-3 shadow-sm dark:bg-slate-950">
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">{label}</span><span className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${TONES[tone]}`}><Icon className="h-4 w-4" /></span></div>
    <div className="mt-1 text-2xl font-bold">{value}</div>
    {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
  </div>
}

function Panel({ title, icon: Icon, className = "", children }: { title: string; icon: ComponentType<{ className?: string }>; className?: string; children: ReactNode }) {
  return <section className={`rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-950 ${className}`}>
    <h2 className="mb-3 flex items-center gap-2 font-bold"><Icon className="h-4 w-4 text-emerald-600" />{title}</h2>
    {children}
  </section>
}

function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{text}</div>
}
