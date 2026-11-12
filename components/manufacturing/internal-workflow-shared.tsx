"use client"

import { tr, appDir } from "@/lib/i18n"
import "@/components/common/voucher-list-theme.css"
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react"
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, FilePlus2, LayoutDashboard, Lock, PackageCheck, RefreshCw, Send, ShieldCheck, Truck, User, Warehouse } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth/auth-context"
import InternalItemImage from "./internal-item-image"

export type InternalPermissionKey = "dashboard" | "create" | "edit" | "delete" | "requestAudit" | "prepare" | "readyAudit" | "send" | "receive" | "receivedAudit" | "archive" | "settings"
// autoReceive = "استلام البضاعة تلقائي": التجهيز آخر مرحلة (ينشئ الارسالية الداخلية ويغلق الطلب)
export type InternalSettings = { requestAudit: boolean; preparation: boolean; readyAudit: boolean; send: boolean; receive: boolean; receivedAudit: boolean; autoReceive?: boolean }
export type InternalStepKey = "request" | "requestAudit" | "preparation" | "readyAudit" | "send" | "receive" | "receivedAudit"
export type InternalStageAction = "requestAudit" | "prepare" | "readyAudit" | "send" | "receive" | "receivedAudit"

export type InternalStep = {
  key: InternalStepKey
  status: number
  title: string
  short: string
  description: string
  section: string
  icon: ComponentType<{ className?: string }>
  side: "requester" | "supplier"
  permission: InternalPermissionKey
  setting?: keyof InternalSettings
  action?: InternalStageAction
  verb?: string
  done?: string
}

// مصدر واحد لتعريف مراحل سير طلب البضاعة الداخلي — تستخدمه كل الشاشات (المراحل، لوحة المتابعة، الإعدادات).
export const INTERNAL_STEPS: InternalStep[] = [
  { key: "request", status: 1, title: tr("طلب بضاعة داخلي"), short: "الطلب", description: tr("إنشاء طلبات البضاعة من الفروع الأخرى ومتابعتها."), section: "internal-manufacturing-request", icon: FilePlus2, side: "requester", permission: "create" },
  { key: "requestAudit", status: 2, title: tr("تدقيق طلب البضاعة"), short: "تدقيق الطلب", description: tr("مراجعة أصناف الطلب وكمياته قبل إرساله للفرع المطلوب منه البضاعة."), section: "internal-manufacturing-request-audit", icon: ShieldCheck, side: "requester", permission: "requestAudit", setting: "requestAudit", action: "requestAudit", verb: "تدقيق الطلب", done: "تم تدقيق الطلب" },
  { key: "preparation", status: 3, title: tr("تجهيز الطلبات"), short: "التجهيز", description: tr("إدخال الكميات المجهزة فعلياً لكل صنف في الطلبات الواردة لفرعك."), section: "internal-manufacturing-preparation", icon: PackageCheck, side: "supplier", permission: "prepare", setting: "preparation", action: "prepare", verb: "تجهيز الطلب", done: "تم تجهيز الطلب" },
  { key: "readyAudit", status: 4, title: tr("تدقيق الطلبات الجاهزة"), short: "تدقيق الجاهز", description: tr("مطابقة الكميات المجهزة قبل الإرسال وتصحيحها عند الحاجة."), section: "internal-manufacturing-ready-audit", icon: ClipboardCheck, side: "supplier", permission: "readyAudit", setting: "readyAudit", action: "readyAudit", verb: "اعتماد التدقيق", done: "تم تدقيق الطلب الجاهز" },
  { key: "send", status: 5, title: tr("إرسال الطلبات"), short: "الإرسال", description: tr("تأكيد خروج البضاعة المجهزة إلى الفرع مقدم الطلب."), section: "internal-manufacturing-send", icon: Send, side: "supplier", permission: "send", setting: "send", action: "send", verb: "إرسال الطلب", done: "تم إرسال الطلب" },
  { key: "receive", status: 6, title: tr("استلام الطلبات"), short: "الاستلام", description: tr("إدخال الكميات المستلمة فعلياً — يُنشأ سند الإرسالية الداخلية تلقائياً."), section: "internal-manufacturing-receive", icon: Truck, side: "requester", permission: "receive", setting: "receive", action: "receive", verb: "استلام الطلب", done: "تم استلام الطلب" },
  { key: "receivedAudit", status: 7, title: tr("تدقيق البضاعة المستلمة"), short: "تدقيق المستلم", description: tr("المراجعة النهائية للبضاعة المستلمة وإغلاق الطلب."), section: "internal-manufacturing-received-audit", icon: CheckCircle2, side: "requester", permission: "receivedAudit", setting: "receivedAudit", action: "receivedAudit", verb: "إغلاق الطلب", done: "تم إغلاق الطلب" },
]

export const INTERNAL_STATUS_LABELS: Record<number, string> = { 1: tr("مسودة"), 2: tr("بانتظار التدقيق"), 3: tr("بانتظار التجهيز"), 4: tr("بانتظار تدقيق الجاهز"), 5: tr("بانتظار الإرسال"), 6: tr("بانتظار الاستلام"), 7: tr("بانتظار تدقيق المستلم"), 8: tr("مكتمل") }
export const INTERNAL_ACTION_LABELS: Record<string, string> = { create: tr("إنشاء الطلب"), update: tr("تعديل الطلب"), delete: tr("حذف الطلب"), requestAudit: tr("تدقيق الطلب"), prepare: tr("تجهيز الطلب"), readyAudit: tr("تدقيق الجاهز"), send: tr("إرسال الطلب"), receive: tr("استلام الطلب"), receivedAudit: tr("إغلاق الطلب") }
export const SIDE_LABELS = { requester: tr("فرع مقدم الطلب"), supplier: tr("الفرع المطلوب منه البضاعة") } as const

/** هل المرحلة ضمن السير؟ مع "استلام البضاعة تلقائي" لا مراحل بعد التجهيز. */
export const isAfterAutoReceive = (step: InternalStep, settings: InternalSettings | null) => Boolean(settings?.autoReceive) && step.status > 3
export const isStepEnabled = (step: InternalStep, settings: InternalSettings | null) => !isAfterAutoReceive(step, settings) && (!step.setting || !settings || settings[step.setting] !== false)
export const openInternalSection = (section: string) => window.dispatchEvent(new CustomEvent("OPEN_SECTION", { detail: { section } }))

export const formatQuantity = (value: unknown) => {
  const number = Number(value || 0)
  return Number.isInteger(number) ? String(number) : number.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
}

export function ageLabel(value: unknown) {
  const time = new Date(String(value || "")).getTime()
  if (!Number.isFinite(time)) return "-"
  const hours = Math.max(0, (Date.now() - time) / 3_600_000)
  if (hours < 1) return tr("منذ أقل من ساعة")
  if (hours < 24) return tr("منذ {0} ساعة", Math.floor(hours))
  const days = Math.floor(hours / 24)
  return days === 1 ? tr("منذ يوم") : days === 2 ? tr("منذ يومين") : tr("منذ {0} أيام", days)
}
export const isOverdue = (value: unknown, days = 2) => {
  const time = new Date(String(value || "")).getTime()
  return Number.isFinite(time) && Date.now() - time > days * 86_400_000
}

type WorkflowContext = {
  loading: boolean
  branchId: number
  permissions: Record<InternalPermissionKey, boolean> | null
  settings: InternalSettings | null
  counts: Record<number, number>
  branchName: (id: unknown) => string
  warehouseName: (id: unknown) => string
  branches: any[]
  warehouses: any[]
  reload: () => Promise<void>
}

// صلاحيات المستخدم في الفرع النشط + الإعدادات + أسماء الفروع والمستودعات؛ تُعاد عند تغيير الفرع.
export function useInternalWorkflow(): WorkflowContext {
  const { activeBranchId } = useAuth()
  const branchId = Number(activeBranchId || 0)
  const [state, setState] = useState<{ permissions: WorkflowContext["permissions"]; settings: InternalSettings | null; counts: Record<number, number> }>({ permissions: null, settings: null, counts: {} })
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const sequenceRef = useRef(0)

  const reload = useCallback(async () => {
    const sequence = ++sequenceRef.current
    if (!branchId) { setState({ permissions: null, settings: null, counts: {} }); setLoading(false); return }
    setLoading(true)
    try {
      const response = await fetch(`/api/internal-manufacturing-requests/permissions?_=${Date.now()}`, { cache: "no-store", headers: { "x-branch-id": String(branchId) } })
      const data = await response.json()
      if (sequence !== sequenceRef.current) return
      if (response.ok) setState({ permissions: data.permissions, settings: data.settings, counts: data.counts || {} })
    } catch { /* الصفحة تعرض حالة "لا صلاحية" عند تعذر التحميل */ } finally {
      if (sequence === sequenceRef.current) setLoading(false)
    }
  }, [branchId])

  useEffect(() => { void reload() }, [reload])
  useEffect(() => {
    Promise.all([fetch("/api/branches"), fetch("/api/warehouses")]).then(async ([branchResponse, warehouseResponse]) => {
      const [branchData, warehouseData] = await Promise.all([branchResponse.json(), warehouseResponse.json()])
      setBranches(Array.isArray(branchData) ? branchData : [])
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : [])
    }).catch(() => undefined)
  }, [])

  const branchName = useCallback((id: unknown) => branches.find((branch) => Number(branch.id) === Number(id))?.branch_name || (id ? String(id) : "-"), [branches])
  const warehouseName = useCallback((id: unknown) => { const warehouse = warehouses.find((item) => Number(item.id) === Number(id)); return warehouse?.warehouse_name || warehouse?.name || (id ? String(id) : "-") }, [warehouses])
  return { loading, branchId, ...state, branchName, warehouseName, branches, warehouses, reload }
}

// شريط مراحل السير — نفسه في رأس كل شاشة، وبحجم مصغّر داخل نافذة الطلب لإظهار موقعه الحالي.
export function InternalStepper({ settings, counts, permissions, current, compact = false, requestStatus }: { settings: InternalSettings | null; counts?: Record<number, number>; permissions?: WorkflowContext["permissions"]; current?: InternalStepKey | "dashboard"; compact?: boolean; requestStatus?: number }) {
  const steps = INTERNAL_STEPS.filter((step) => isStepEnabled(step, settings))
  return <div className="internal-stepper flex items-stretch gap-1 overflow-x-auto pb-1" dir={appDir()}>
    {steps.map((step, index) => {
      const Icon = step.icon
      const active = current === step.key || (requestStatus != null && requestStatus === step.status)
      const passed = requestStatus != null && requestStatus > step.status
      const allowed = !permissions || permissions[step.permission]
      const count = counts?.[step.status]
      const tone = active ? "border-emerald-500 bg-emerald-600 text-white shadow-sm" : passed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"
      const content = <>
        <span className={`flex shrink-0 items-center justify-center rounded-full ${compact ? "h-6 w-6" : "h-8 w-8"} ${active ? "bg-white/20" : passed ? "bg-emerald-100" : "bg-slate-100"}`}>{passed ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span>
        <span className="min-w-0 text-start leading-tight">
          <span className={`block whitespace-nowrap font-semibold ${compact ? "text-[11px]" : "text-xs"}`}>{step.short}</span>
          {!compact && <span className={`block whitespace-nowrap text-[10px] ${active ? "text-emerald-50" : "text-muted-foreground"}`}>{SIDE_LABELS[step.side]}</span>}
        </span>
        {!compact && count != null && step.status > 1 && <span className={`ms-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? "bg-white text-emerald-700" : count ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{count}</span>}
        {!compact && !allowed && <Lock className="h-3 w-3 shrink-0 opacity-60" />}
      </>
      return <div key={step.key} className="flex items-center gap-1">
        {compact || !allowed || active
          ? <div className={`flex min-w-max items-center gap-2 rounded-lg border px-2 py-1.5 ${tone} ${!allowed && !compact ? "opacity-60" : ""}`}>{content}</div>
          : <button type="button" onClick={() => openInternalSection(step.section)} className={`flex min-w-max items-center gap-2 rounded-lg border px-2 py-1.5 transition hover:border-emerald-400 hover:shadow-sm ${tone}`}>{content}</button>}
        {index < steps.length - 1 && <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
      </div>
    })}
  </div>
}

export function InternalPageHeader({ title, description, icon: Icon, sideLabel, branchLabel, actions, children }: { title: string; description: string; icon: ComponentType<{ className?: string }>; sideLabel?: string; branchLabel?: string; actions?: ReactNode; children?: ReactNode }) {
  // نفس رأس صفحات النظام (page-hero الأخضر بنص أبيض — مثل العملاء)، والمحتوى الإضافي (children) بشريط أبيض تحته
  return <div className="overflow-hidden rounded-2xl border border-emerald-700/20 bg-white shadow-sm dark:bg-slate-950">
    <div className="page-hero relative overflow-hidden px-5 py-5 sm:px-7">
      <div className="pointer-events-none absolute -end-16 -top-24 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur"><Icon className="h-7 w-7" /></span>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-white drop-shadow-sm sm:text-3xl">{title}</h1>
            <p className="mt-1 text-sm text-emerald-50/85">{description}</p>
            {(sideLabel || branchLabel) && <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {branchLabel && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-white ring-1 ring-white/25"><Building2 className="h-3.5 w-3.5" />{tr("الفرع النشط: ")}<b>{branchLabel}</b></span>}
              {sideLabel && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-white ring-1 ring-white/25">{sideLabel}</span>}
            </div>}
          </div>
        </div>
        {actions && <div className="hero-actions flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
    {children && <div className="border-t bg-slate-50/70 px-4 py-3 dark:bg-slate-900/40">{children}</div>}
  </div>
}

export function InternalLockedState({ title, message }: { title: string; message: string }) {
  return <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 px-6 py-14 text-center">
    <Lock className="mx-auto mb-3 h-10 w-10 text-amber-600" />
    <h2 className="text-lg font-bold text-amber-900">{title}</h2>
    <p className="mx-auto mt-1 max-w-lg text-sm text-amber-800">{message}</p>
  </div>
}

export function RefreshButton({ loading, onClick }: { loading?: boolean; onClick: () => void }) {
  return <Button variant="outline" onClick={onClick} disabled={loading}><RefreshCw className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{tr("تحديث")}</Button>
}

// بطاقة الطلب الموحدة في كل المراحل.
export function InternalRequestCard({ request, branchName, warehouseName, actionLabel, onOpen, highlightBranchId }: { request: any; branchName: (id: unknown) => string; warehouseName: (id: unknown) => string; actionLabel: string; onOpen: () => void; highlightBranchId?: number }) {
  const since = request.stage_since || request.vch_date
  const late = Number(request.internal_status) < 8 && isOverdue(since)
  const items: any[] = request.items || []
  const incoming = highlightBranchId != null && Number(request.manufacturing_branch_id) === Number(highlightBranchId)
  return <div className={`group flex flex-col rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md dark:bg-slate-950 ${late ? "border-amber-300" : "border-slate-200"}`}>
    <button type="button" onClick={onOpen} className="flex flex-1 flex-col gap-3 p-4 text-start">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-base font-bold tracking-wide text-slate-900 dark:text-slate-100">{request.vch_code}</div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{String(request.vch_date).slice(0, 10)}</div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${late ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}><Clock3 className="h-3 w-3" />{ageLabel(since)}</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-900">
        <div className="min-w-0 flex-1"><div className="text-[10px] text-muted-foreground">{tr("من (مقدم الطلب)")}</div><div className={`truncate font-semibold ${!incoming && highlightBranchId != null ? "text-emerald-700" : ""}`}>{branchName(request.branch_id)}</div><div className="truncate text-muted-foreground"><Warehouse className="me-1 inline h-3 w-3" />{warehouseName(request.to_store_id)}</div></div>
        <ArrowLeft className="h-4 w-4 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1"><div className="text-[10px] text-muted-foreground">{tr("إلى (المطلوب منه)")}</div><div className={`truncate font-semibold ${incoming ? "text-emerald-700" : ""}`}>{branchName(request.manufacturing_branch_id)}</div><div className="truncate text-muted-foreground"><Warehouse className="me-1 inline h-3 w-3" />{warehouseName(request.destination_warehouse_id)}</div></div>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-muted-foreground"><User className="h-3.5 w-3.5" />{request.requester_name || "-"}</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">{items.length}{tr(" أصناف")}</span>
      </div>
      {items.length > 0 && <div className="flex items-center gap-1.5">
        {items.slice(0, 5).map((item) => <InternalItemImage key={item.id} item={item} size="sm" />)}
        {items.length > 5 && <span className="flex h-10 w-10 items-center justify-center rounded border bg-slate-50 text-xs font-bold text-slate-500">+{items.length - 5}</span>}
      </div>}
    </button>
    <div className="border-t p-2"><Button className="w-full" variant="secondary" onClick={onOpen}>{actionLabel}</Button></div>
  </div>
}
