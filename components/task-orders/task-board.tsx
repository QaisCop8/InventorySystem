"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import PrimeDropdown from "@/components/common/FocusDropdown"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { NotificationCenter } from "@/components/notifications/notification-center"
import { Search, RefreshCw, Play, Pause, CheckCircle2, Undo2, ArrowRightLeft, Clock, Loader2, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDateTimeToBritish } from "@/lib/utils"
import type { TaskOpenTask, TaskOrderItemDetail, TaskSection, TaskStepInstance, TaskWorkflow, TaskWorkflowStep } from "./types"
import { ACTION_LABELS, PRIORITY_LABELS, STEP_STATUS_LABELS, STEP_TYPE_LABELS } from "./types"
import { PRIORITY_BADGE_CLASS, PRIORITY_CARD_ACCENT, STATUS_BADGE_CLASS, columnColor, elapsedSecondsSince, formatDuration, initials } from "./utils"
import { OrderItemsPanel } from "./order-items-panel"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"

const SPECIAL_STEP_TYPES = new Set(["audit", "approval", "preparation", "loading"])

type GroupedTask = TaskOpenTask & { siblingItemIds: number[] }

type Scope = "mine" | "section" | "all"

interface RealBranch {
  id: number
  branch_code: string
  branch_name: string
  status: number
}

// ترتيب أعمدة اللوحة: BFS بدءاً من خطوة البداية عبر الانتقالات — يُعطي قراءة يسار→يمين منطقية حتى
// مع تفرّع/التقاء متوازيَين؛ أي خطوة معزولة لم تُزرها BFS (لن يحدث عادة بسير عمل سليم) تُذيَّل بالنهاية.
function orderStepsForColumns(workflow: TaskWorkflow): TaskWorkflowStep[] {
  const start = workflow.steps.find((s) => s.is_start)
  if (!start) return workflow.steps
  const visited = new Set<number>([start.id])
  const ordered = [start]
  let frontier = [start.id]
  while (frontier.length > 0) {
    const next: number[] = []
    for (const stepId of frontier) {
      const outgoing = workflow.transitions.filter((t) => t.from_step_id === stepId)
      for (const t of outgoing) {
        if (visited.has(t.to_step_id)) continue
        visited.add(t.to_step_id)
        const step = workflow.steps.find((s) => s.id === t.to_step_id)
        if (step) {
          ordered.push(step)
          next.push(step.id)
        }
      }
    }
    frontier = next
  }
  for (const step of workflow.steps) {
    if (!visited.has(step.id)) ordered.push(step)
  }
  return ordered
}

export function TaskBoard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const userId = user?.id ?? null
  const isAdmin = user?.role === "مدير النظام"

  const [workflows, setWorkflows] = useState<TaskWorkflow[]>([])
  const [sections, setSections] = useState<TaskSection[]>([])
  const [branches, setBranches] = useState<RealBranch[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | "all">("all")
  const [tasks, setTasks] = useState<TaskOpenTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [scope, setScope] = useState<Scope>("mine")
  const [branchFilter, setBranchFilter] = useState<string>("all")
  const [, setTick] = useState(0)

  const [detailItemId, setDetailItemId] = useState<number | null>(null)
  const [detailItem, setDetailItem] = useState<TaskOrderItemDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [rejectingInstanceId, setRejectingInstanceId] = useState<number | null>(null)
  // مُضبَطة فقط عند الرفض من الشريط المبسَّط (خطوات تدقيق/اعتماد/تجهيز/تحميل) — تُحوِّل confirmReject
  // لرفض كل أصناف الطلبية المفتوحة بنفس الخطوة دفعة واحدة بدل صنف واحد فقط.
  const [rejectOrderContext, setRejectOrderContext] = useState<{ customerOrderId: number; stepId: number } | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [transferringInstanceId, setTransferringInstanceId] = useState<number | null>(null)
  const [transferTarget, setTransferTarget] = useState<{ sectionId: string; userId: string; reason: string }>({ sectionId: "", userId: "", reason: "" })
  const [noteDialog, setNoteDialog] = useState<{ instanceId: number; action: "stop" | "complete" | "force_complete"; label: string } | null>(null)
  const [noteDialogText, setNoteDialogText] = useState("")
  const [allLoadingChecked, setAllLoadingChecked] = useState(true)
  const [forceCloseInstanceId, setForceCloseInstanceId] = useState<number | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchWorkflows = async () => {
    try {
      const res = await fetch("/api/task-orders/workflows")
      const data = await res.json()
      const active = (Array.isArray(data) ? data : []).filter((w: TaskWorkflow) => w.is_active)
      setWorkflows(active)
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب سير العمل", variant: "destructive" })
    }
  }

  const fetchSections = async () => {
    try {
      const res = await fetch("/api/task-orders/sections")
      const data = await res.json()
      setSections(Array.isArray(data) ? data : [])
    } catch {
      // صامت
    }
  }

  const fetchBranches = async () => {
    try {
      const res = await fetch("/api/branches")
      const data = await res.json()
      setBranches(Array.isArray(data) ? data : [])
    } catch {
      // صامت
    }
  }

  const fetchTasks = async (workflowId: number | "all") => {
    setLoadingTasks(true)
    try {
      const params = workflowId === "all" ? "" : `?${new URLSearchParams({ workflow_id: String(workflowId) })}`
      const res = await fetch(`/api/task-orders/tasks${params}`)
      const data = await res.json()
      setTasks(Array.isArray(data) ? data : [])
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب المهام", variant: "destructive" })
    } finally {
      setLoadingTasks(false)
    }
  }

  useEffect(() => {
    fetchWorkflows()
    fetchSections()
    fetchBranches()
  }, [])

  useEffect(() => {
    fetchTasks(selectedWorkflowId)
    const interval = setInterval(() => fetchTasks(selectedWorkflowId), 20000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkflowId])

  const mySectionIds = useMemo(() => {
    if (!userId) return new Set<number>()
    return new Set(sections.filter((s) => s.members.some((m) => m.user_id === userId)).map((s) => s.id))
  }, [sections, userId])

  // فرع "الكل" (branch_id = null) في سير عمل أو قسم يُعامَل كمتقاطع مع كل فرع محدَّد — نفس منطق
  // التداخل الموسَّع المعتمد بإدارة سير العمل، بدل استبعاده عند اختيار فرع بعينه.
  const sectionBranchMap = useMemo(() => new Map(sections.map((s) => [s.id, s.branch_id])), [sections])

  const filteredWorkflows = useMemo(() => {
    if (branchFilter === "all") return workflows
    const branchId = Number(branchFilter)
    return workflows.filter((w) => w.branch_id === null || w.branch_id === branchId)
  }, [workflows, branchFilter])

  // "الكل" هو الافتراضي دوماً — لا يُستبدَل تلقائياً بأي سير عمل بعينه؛ فقط اختيار سير عمل محدد
  // يعود لـ"الكل" إن خرج عن نطاق فلتر الفرع الحالي.
  useEffect(() => {
    setSelectedWorkflowId((prev) => {
      if (prev === "all") return "all"
      return filteredWorkflows.some((w) => w.id === prev) ? prev : "all"
    })
  }, [branchFilter, filteredWorkflows])

  const selectedWorkflow = selectedWorkflowId === "all" ? null : workflows.find((w) => w.id === selectedWorkflowId) || null
  const orderedSteps = useMemo(() => (selectedWorkflow ? orderStepsForColumns(selectedWorkflow) : []), [selectedWorkflow])

  // ترتيب خطوات كل سير عمل نشِط مسبقاً — يُستخدَم بوضع "الكل" لتجميع المهام بحسب موضع الخطوة
  // (الأولى، الثانية...) عبر كل سير عمل معاً، بدل الاعتماد على معرّف خطوة بعينه من سير عمل واحد.
  const workflowStepOrder = useMemo(() => {
    const map = new Map<number, TaskWorkflowStep[]>()
    for (const w of workflows) map.set(w.id, orderStepsForColumns(w))
    return map
  }, [workflows])

  const visibleTasks = useMemo(() => {
    let list = tasks
    if (branchFilter !== "all") {
      const branchId = Number(branchFilter)
      list = list.filter((t) => {
        const b = sectionBranchMap.get(t.effective_section_id)
        return b === null || b === undefined || b === branchId
      })
    }
    if (scope === "mine") list = list.filter((t) => t.claimed_by_user_id === userId)
    else if (scope === "section") list = list.filter((t) => mySectionIds.has(t.effective_section_id) || t.claimed_by_user_id === userId)
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.item_code.toLowerCase().includes(q))
    }
    return list
  }, [tasks, scope, mySectionIds, userId, searchText, branchFilter, sectionBranchMap])

  interface BoardColumn {
    key: string
    label: string
    subtitle: string
    tasks: GroupedTask[]
  }

  // خطوات تدقيق/اعتماد/تجهيز/تحميل تُراجَع لكل أصناف الطلبية معاً (لوحة الأصناف الشقيقة أصلاً تعرضها
  // دفعة واحدة داخل نافذة التفاصيل) — فبطاقة واحدة بلوحة Kanban تكفي لتمثيل الطلبية كلها بهذه الخطوة،
  // لا بطاقة منفصلة لكل صنف. التجميع بحسب (step_id, customer_order_id) فقط — أصناف بلا طلبية (أُنشئت
  // مباشرة من لوحة الإدارة) أو خطوات عادية تبقى بطاقة لكل صنف كما هي.
  const groupTasksForDisplay = (list: TaskOpenTask[]): GroupedTask[] => {
    const groups = new Map<string, GroupedTask>()
    const passthrough: GroupedTask[] = []
    for (const t of list) {
      if (!SPECIAL_STEP_TYPES.has(t.step_type) || !t.customer_order_id) {
        passthrough.push({ ...t, siblingItemIds: [t.order_item_id] })
        continue
      }
      const key = `${t.step_id}:${t.customer_order_id}`
      const existing = groups.get(key)
      if (existing) existing.siblingItemIds.push(t.order_item_id)
      else groups.set(key, { ...t, siblingItemIds: [t.order_item_id] })
    }
    return [...passthrough, ...groups.values()]
  }

  // كل المهام تُعرض أولاً داخل أصناف الحالة (To Do / Paused / In Progress / Finished)
  // بدل عرض كل مرحلة عمل كعمود مستقل — بحيث تبدأ المهمة فعلياً عبر سحب بطاقة من To Do أو Paused
  // إلى In Progress، وليس عبر إظهار جميع المراحل مباشرةً في اللوحة.
  const statusSummary = useMemo(() => {
    const summary = {
      pending: { count: 0, totalSeconds: 0 },
      paused: { count: 0, totalSeconds: 0 },
      in_progress: { count: 0, totalSeconds: 0 },
      completed: { count: 0, totalSeconds: 0 },
    }

    for (const task of visibleTasks) {
      const bucket = task.status === "completed"
        ? "completed"
        : task.status === "paused"
          ? "paused"
          : task.status === "in_progress"
            ? "in_progress"
            : "pending"

      summary[bucket].count += 1
      summary[bucket].totalSeconds += task.total_duration_seconds
    }

    return summary
  }, [visibleTasks])

  const statusColumns: BoardColumn[] = useMemo(() => {
    const byStatus = {
      pending: visibleTasks.filter((t) => t.status === "pending"),
      paused: visibleTasks.filter((t) => t.status === "paused"),
      in_progress: visibleTasks.filter((t) => t.status === "in_progress"),
      completed: visibleTasks.filter((t) => t.status === "completed"),
    }

    return [
      {
        key: "pending",
        label: "مهام جديدة",
        subtitle: "كل المراحل تُعرض هنا أولاً",
        tasks: groupTasksForDisplay(byStatus.pending),
      },
      {
        key: "paused",
        label: "مهام متوقفة",
        subtitle: "مؤقتة",
        tasks: groupTasksForDisplay(byStatus.paused),
      },
      {
        key: "in_progress",
        label: "مهام جارية",
        subtitle: "اسحب من مهام جديدة أو مهام متوقفة لبدء التنفيذ",
        tasks: groupTasksForDisplay(byStatus.in_progress),
      },
      {
        key: "completed",
        label: "مهام منتهية",
        subtitle: "مكتملة",
        tasks: groupTasksForDisplay(byStatus.completed),
      },
    ]
  }, [visibleTasks])

  const openItem = async (id: number) => {
    setDetailItemId(id)
    setDetailLoading(true)
    setRejectingInstanceId(null)
    setRejectOrderContext(null)
    setTransferringInstanceId(null)
    setAllLoadingChecked(true)
    try {
      const res = await fetch(`/api/task-orders/order-items/${id}`)
      if (!res.ok) throw new Error()
      setDetailItem(await res.json())
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب تفاصيل الصنف", variant: "destructive" })
      setDetailItemId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const beginTaskFromStatusLane = async (task: GroupedTask) => {
    if (!userId) return
    if (task.status !== "pending") return

    const ok = await callInstanceAction("start", task.id)
    if (ok) {
      await fetchTasks(selectedWorkflowId)
      setDraggedTaskId(null)
    }
  }

  const refreshDetail = async () => {
    if (!detailItemId) return
    const res = await fetch(`/api/task-orders/order-items/${detailItemId}`)
    if (res.ok) setDetailItem(await res.json())
    await fetchTasks(selectedWorkflowId)
  }

  const callInstanceAction = async (path: string, instanceId: number, body: Record<string, any> = {}) => {
    if (!userId) return false
    setActionBusy(true)
    try {
      const res = await fetch(`/api/task-orders/tasks/${instanceId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "فشل تنفيذ العملية")
      await refreshDetail()
      toast({ title: "تم", description: "تم تنفيذ العملية بنجاح" })
      return true
    } catch (error: any) {
      toast({ title: "تعذّر التنفيذ", description: error?.message || "خطأ غير متوقع", variant: "destructive" })
      return false
    } finally {
      setActionBusy(false)
    }
  }

  const handleStart = (instanceId: number) => callInstanceAction("start", instanceId)
  // خطوات تدقيق/اعتماد/تجهيز/تحميل لا تعرض "بدء"/"إيقاف مؤقت" (لا تتبّع وقت عمل تفصيلي بها، فقط
  // مراجعة/تجهيز/فحص أصناف الطلبية دفعة واحدة) — زر "تم" يبدأ المهمة ضمنياً إن لم تكن قد بدأت بعد
  // ثم يُنهيها مباشرة، فيبدو للمستخدم كإجراء واحد بسيط. ولأن بطاقة اللوحة تمثِّل الطلبية كلها لا صنفاً
  // بمفرده لهذه الخطوات (انظر groupTasksForDisplay)، "تم" هنا يُنهي كل صنف مفتوح بنفس الخطوة على نفس
  // الطلبية دفعة واحدة عبر نقطة النهاية الجماعية، لا هذا الصنف وحده.
  const handleMarkDone = async (instance: TaskStepInstance, customerOrderId: number | null) => {
    if (!userId) return
    if (customerOrderId) {
      setActionBusy(true)
      try {
        const res = await fetch(`/api/task-orders/customer-orders/${customerOrderId}/steps/${instance.step_id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "فشل تنفيذ العملية")
        await refreshDetail()
        toast({ title: "تم", description: "تم إنهاء المرحلة لكل أصناف الطلبية" })
        setDetailItemId(null)
      } catch (error: any) {
        toast({ title: "تعذّر التنفيذ", description: error?.message || "خطأ غير متوقع", variant: "destructive" })
      } finally {
        setActionBusy(false)
      }
      return
    }
    if (instance.status !== "in_progress") {
      const started = await callInstanceAction("start", instance.id)
      if (!started) return
    }
    await callInstanceAction("complete", instance.id, {})
  }
  // إغلاق إجباري: يُلغي كل مهام/أصناف الطلبية بالكامل (لا هذا الصنف وحده) ويُحدِّث الطلب الفعلي
  // المرتبط بها إلى "مغلق" (orders.order_status2 = 6) — إجراء مدير النظام حصراً، لذا يُشترَط تأكيد
  // صريح عبر ConfirmDialogYesNo قبل التنفيذ.
  const confirmForceClose = async () => {
    if (!forceCloseInstanceId || !userId) return
    setActionBusy(true)
    try {
      const res = await fetch(`/api/task-orders/tasks/${forceCloseInstanceId}/force-close-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "فشل الإغلاق الإجباري")
      toast({ title: "تم", description: "تم إغلاق الطلبية بشكل إجباري" })
      setForceCloseInstanceId(null)
      await refreshDetail()
      setDetailItemId(null)
    } catch (error: any) {
      toast({ title: "تعذّر الإغلاق", description: error?.message || "خطأ غير متوقع", variant: "destructive" })
    } finally {
      setActionBusy(false)
    }
  }
  const openNoteDialog = (instanceId: number, action: "stop" | "complete" | "force_complete", label: string) => {
    setNoteDialog({ instanceId, action, label })
    setNoteDialogText("")
  }
  const confirmNoteAction = async () => {
    if (!noteDialog) return
    const path = noteDialog.action === "force_complete" ? "complete" : noteDialog.action
    const body: Record<string, any> = { note: noteDialogText.trim() || undefined }
    if (noteDialog.action === "force_complete") body.force = true
    const ok = await callInstanceAction(path, noteDialog.instanceId, body)
    if (ok) {
      setNoteDialog(null)
      setNoteDialogText("")
    }
  }
  const confirmReject = async () => {
    if (!rejectingInstanceId || !rejectNote.trim()) return
    if (rejectOrderContext) {
      if (!userId) return
      setActionBusy(true)
      try {
        const res = await fetch(
          `/api/task-orders/customer-orders/${rejectOrderContext.customerOrderId}/steps/${rejectOrderContext.stepId}/reject`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, reason: rejectNote }),
          },
        )
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "فشل تنفيذ العملية")
        await refreshDetail()
        toast({ title: "تم", description: "تم رفض كل أصناف الطلبية بهذه المرحلة" })
        setRejectingInstanceId(null)
        setRejectOrderContext(null)
        setRejectNote("")
      } catch (error: any) {
        toast({ title: "تعذّر التنفيذ", description: error?.message || "خطأ غير متوقع", variant: "destructive" })
      } finally {
        setActionBusy(false)
      }
      return
    }
    const ok = await callInstanceAction("reject", rejectingInstanceId, { reason: rejectNote })
    if (ok) {
      setRejectingInstanceId(null)
      setRejectNote("")
      setDetailItemId(null)
    }
  }
  const forceReject = (instanceId: number, reason: string) => callInstanceAction("reject", instanceId, { reason, force: true })
  const confirmTransfer = async () => {
    if (!transferringInstanceId || !transferTarget.reason.trim()) return
    const ok = await callInstanceAction("transfer", transferringInstanceId, {
      toSectionId: transferTarget.sectionId ? Number(transferTarget.sectionId) : null,
      toUserId: transferTarget.userId || null,
      reason: transferTarget.reason,
    })
    if (ok) {
      setTransferringInstanceId(null)
      setTransferTarget({ sectionId: "", userId: "", reason: "" })
    }
  }

  return (
    <div dir="rtl" className="flex min-h-[calc(100vh-104px)] flex-col gap-4 overflow-y-auto md:min-h-[calc(100vh-136px)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">لوحة تتبع الطلبيات</h1>
          <p className="text-sm text-slate-500">تتبّع أصناف الطلبية عبر مراحل سير العمل مع تسجيل الوقت لحظياً</p>
        </div>
        <div className="flex items-center gap-2">{userId && <NotificationCenter userId={userId} />}</div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">سير العمل</label>
          <div className="invoice-currency-dropdown-wrap">
            <PrimeDropdown
              value={selectedWorkflowId}
              options={[
                { id: "all", label: "الكل" },
                ...filteredWorkflows.map((w) => ({ id: w.id, label: `${w.name}${w.version > 1 ? ` (إصدار ${w.version})` : ""}` })),
              ]}
              optionLabel="label"
              optionValue="id"
              placeholder="اختر سير العمل"
              filter
              className="invoice-currency-dropdown w-full"
              panelClassName="invoice-currency-dropdown-panel"
              appendTo="self"
              onChange={(e: any) => setSelectedWorkflowId(e.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">الفرع</label>
          <div className="invoice-currency-dropdown-wrap">
            <PrimeDropdown
              value={branchFilter}
              options={[{ label: "الكل", value: "all" }, ...branches.map((b) => ({ label: b.branch_name, value: String(b.id) }))]}
              optionLabel="label"
              optionValue="value"
              placeholder="الفرع"
              filter
              className="invoice-currency-dropdown w-full"
              panelClassName="invoice-currency-dropdown-panel"
              appendTo="self"
              onChange={(e: any) => setBranchFilter(e.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">نطاق العرض</label>
          <div className="invoice-currency-dropdown-wrap">
            <PrimeDropdown
              value={scope}
              options={[
                { label: "مهامي فقط", value: "mine" },
                { label: "أقسامي", value: "section" },
                ...(isAdmin ? [{ label: "كل المهام", value: "all" }] : []),
              ]}
              optionLabel="label"
              optionValue="value"
              className="invoice-currency-dropdown w-full"
              panelClassName="invoice-currency-dropdown-panel"
              appendTo="self"
              onChange={(e: any) => setScope(e.value as Scope)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">بحث</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="بحث برقم الصنف أو العنوان" className="w-full pr-8" />
            </div>
            <Button variant="outline" size="icon" onClick={() => fetchTasks(selectedWorkflowId)} title="تحديث" className="shrink-0">
              <RefreshCw className={cn("h-4 w-4", loadingTasks && "animate-spin")} />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
            <span>مهام جديدة</span>
            <span className="font-bold text-slate-800">{statusSummary.pending.count}</span>
          </div>
          <div className="text-xs text-slate-500">Est. Time</div>
          <div className="text-lg font-bold text-slate-800">{formatDuration(statusSummary.pending.totalSeconds)}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="mb-2 flex items-center justify-between text-sm text-amber-800">
            <span>مهام متوقفة</span>
            <span className="font-bold">{statusSummary.paused.count}</span>
          </div>
          <div className="text-xs text-amber-700">Est. Time</div>
          <div className="text-lg font-bold text-amber-900">{formatDuration(statusSummary.paused.totalSeconds)}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="mb-2 flex items-center justify-between text-sm text-emerald-800">
            <span>مهام جارية</span>
            <span className="font-bold">{statusSummary.in_progress.count}</span>
          </div>
          <div className="text-xs text-emerald-700">Est. Time</div>
          <div className="text-lg font-bold text-emerald-900">{formatDuration(statusSummary.in_progress.totalSeconds)}</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div className="mb-2 flex items-center justify-between text-sm text-blue-800">
            <span>مهام منتهية</span>
            <span className="font-bold">{statusSummary.completed.count}</span>
          </div>
          <div className="text-xs text-blue-700">Est. Time</div>
          <div className="text-lg font-bold text-blue-900">{formatDuration(statusSummary.completed.totalSeconds)}</div>
        </div>
      </div>

      {statusColumns.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-slate-500">لا يوجد سير عمل نشِط بعد — أنشئ واحداً من تبويب الإدارة</CardContent>
        </Card>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-auto pb-3 lg:flex-row">
          {statusColumns.map((column, columnIndex) => {
            const columnTasks = [...column.tasks].sort((a, b) => {
              const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
              const pr = (priorityRank[a.item_priority] ?? 2) - (priorityRank[b.item_priority] ?? 2)
              if (pr !== 0) return pr
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            })
            const palette = columnColor(columnIndex)
            return (
              <div
                key={column.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault()
                  const taskId = draggedTaskId
                  if (!taskId) return
                  const task = visibleTasks.find((item) => item.id === taskId)
                  if (!task) return
                  if (column.key !== "in_progress") return
                  if (task.status !== "pending") return
                  await beginTaskFromStatusLane(task as GroupedTask)
                }}
                className={cn("flex h-full w-[85vw] shrink-0 flex-col rounded-2xl border-2 sm:w-96", palette.bg, palette.border)}
              >
                <div className={cn("flex items-center justify-between rounded-t-2xl px-4 py-3", palette.header)}>
                  <div>
                    <div className={cn("text-base font-bold", palette.text)}>{column.label}</div>
                    {column.subtitle && <div className="text-xs text-slate-500">{column.subtitle}</div>}
                  </div>
                  <Badge className={cn("h-6 min-w-6 justify-center rounded-full px-2 text-sm font-bold", palette.badge)}>{columnTasks.length}</Badge>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="flex flex-col gap-3 p-3">
                    {columnTasks.length === 0 && <div className="py-8 text-center text-sm text-slate-400">لا توجد مهام</div>}
                    {columnTasks.map((t) => {
                      const liveSeconds = t.has_running_timer ? t.total_duration_seconds + elapsedSecondsSince(t.running_since) : t.total_duration_seconds
                      return (
                        <button
                          key={t.id}
                          draggable={t.status === "pending"}
                          onDragStart={() => {
                            if (t.status !== "pending") return
                            setDraggedTaskId(t.id)
                          }}
                          onDragEnd={() => setDraggedTaskId(null)}
                          onClick={() => openItem(t.order_item_id)}
                          className={cn(
                            "text-right rounded-xl border border-r-[6px] p-5 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all",
                            PRIORITY_CARD_ACCENT[t.item_priority] || PRIORITY_CARD_ACCENT.normal,
                          )}
                        >
                          <div className="mb-2 flex items-center justify-between gap-1">
                            <span className="text-xs font-mono text-slate-500">{t.item_code}</span>
                            <Badge className={cn("border text-xs", PRIORITY_BADGE_CLASS[t.item_priority])}>{PRIORITY_LABELS[t.item_priority] || t.item_priority}</Badge>
                          </div>
                          <div className="line-clamp-2 text-lg font-bold text-slate-800">
                            {t.siblingItemIds.length > 1 ? `الطلبية — ${t.siblingItemIds.length} أصناف` : t.title}
                          </div>
                          {selectedWorkflowId === "all" && (
                            <div className="mt-1 truncate text-xs text-slate-500">
                              {t.workflow_name} · {t.step_label}
                            </div>
                          )}
                          <div className="mt-4 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Avatar className="h-9 w-9 border-2 border-white shadow">
                                <AvatarFallback className="text-xs font-semibold">{initials(t.claimed_by_name)}</AvatarFallback>
                              </Avatar>
                              <span className="max-w-[120px] truncate">{t.claimed_by_name || "غير مسند"}</span>
                            </div>
                            <div
                              className={cn(
                                "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-semibold",
                                t.has_running_timer ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600",
                              )}
                            >
                              <Clock className="h-4 w-4" />
                              {formatDuration(liveSeconds)}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            )
          })}
        </div>
      )}

      {/* نافذة تفاصيل الصنف — تعرض كل المهام (StepInstance) المفتوحة/المكتملة له معاً، لأن التفرّع
          المتوازي قد يعني أكثر من مهمة مفتوحة في آنٍ واحد بأقسام مختلفة. */}
      <Dialog open={detailItemId !== null} onOpenChange={(open) => !open && setDetailItemId(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          {detailLoading || !detailItem ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-slate-400">{detailItem.item_code}</span>
                  {detailItem.title}
                  <Badge className={cn("border", STATUS_BADGE_CLASS[detailItem.status === "in_workflow" ? "in_progress" : detailItem.status])}>
                    {detailItem.status === "completed" ? "مكتمل" : detailItem.status === "cancelled" ? "ملغى" : "جارٍ بسير العمل"}
                  </Badge>
                  <Badge className={cn("border", PRIORITY_BADGE_CLASS[detailItem.priority])}>{PRIORITY_LABELS[detailItem.priority] || detailItem.priority}</Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-400">سير العمل: </span>
                  {detailItem.workflow_name}
                </div>
                {detailItem.customer_order_code && (
                  <div>
                    <span className="text-slate-400">الطلبية: </span>
                    {detailItem.source_order_number || detailItem.customer_order_code} {detailItem.customer_name ? `(${detailItem.customer_name})` : ""}
                  </div>
                )}
                <div>
                  <span className="text-slate-400">أنشئ بواسطة: </span>
                  {detailItem.created_by_name || "-"}
                </div>
              </div>

              {detailItem.description && <p className="rounded-md bg-slate-50 p-2 text-sm text-slate-600">{detailItem.description}</p>}

              {(() => {
                const activeSpecialInstance = detailItem.instances.find(
                  (i) => ["pending", "in_progress", "paused"].includes(i.status) && SPECIAL_STEP_TYPES.has(i.step_type),
                )
                if (!activeSpecialInstance || !userId) return null
                // مطابق لشرط الوصول الخادمي (assertOrderItemStepAccess بـlib/task-orders.ts): مستلم
                // المهمة، أو عضو قسمها لخطوة "كل القسم"، أو مدير نظام — من عداهم يرى اللوحة للقراءة
                // فقط ولا يظهر له تم/رفض إطلاقاً.
                const canActOnSpecial =
                  isAdmin ||
                  activeSpecialInstance.claimed_by_user_id === userId ||
                  (activeSpecialInstance.assignment_type === "all" && mySectionIds.has(activeSpecialInstance.effective_section_id))
                const loadingBlocked = activeSpecialInstance.step_type === "loading" && !allLoadingChecked
                return (
                  <>
                    <OrderItemsPanel
                      customerOrderId={detailItem.customer_order_id}
                      stepType={activeSpecialInstance.step_type}
                      userId={userId}
                      canEdit={canActOnSpecial}
                      onAllLoadingCheckedChange={setAllLoadingChecked}
                    />

                    {canActOnSpecial && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          className="gap-1"
                          disabled={actionBusy || loadingBlocked}
                          title={loadingBlocked ? "يجب فحص كل الأصناف أولاً" : undefined}
                          onClick={() => handleMarkDone(activeSpecialInstance, detailItem.customer_order_id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> تم
                        </Button>
                        {!activeSpecialInstance.first_started_at && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 border-red-200 text-red-600 hover:bg-red-50"
                            disabled={actionBusy || !activeSpecialInstance.parent_instance_id}
                            onClick={() => {
                              setRejectingInstanceId(activeSpecialInstance.id)
                              setRejectOrderContext(
                                detailItem.customer_order_id ? { customerOrderId: detailItem.customer_order_id, stepId: activeSpecialInstance.step_id } : null,
                              )
                            }}
                          >
                            <Undo2 className="h-3.5 w-3.5" /> رفض
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-blue-600"
                            disabled={actionBusy}
                            onClick={() => setForceCloseInstanceId(activeSpecialInstance.id)}
                          >
                            <ShieldAlert className="h-3.5 w-3.5" /> إغلاق إجباري
                          </Button>
                        )}
                      </div>
                    )}

                    {rejectingInstanceId === activeSpecialInstance.id && (
                      <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-2">
                        <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="سبب إعادة المهمة للمرحلة السابقة (مطلوب)" rows={2} />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRejectingInstanceId(null)
                              setRejectOrderContext(null)
                            }}
                          >
                            إلغاء
                          </Button>
                          <Button size="sm" variant="destructive" onClick={confirmReject} disabled={actionBusy || !rejectNote.trim()}>
                            تأكيد الرفض
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}

              <Separator />

              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-600">مراحل التنفيذ</div>
                {/* خطوات تدقيق/اعتماد/تجهيز/تحميل (التي تعرض لوحة أصناف الطلبية أعلاه) لا تظهر هنا
                    إطلاقاً — إجراؤها عبر أزرار تم/رفض/إغلاق إجباري المبسّطة فقط، لا سجل المراحل
                    التفصيلي (بدء/إيقاف مؤقت/تحويل إداري...) المخصَّص للخطوات العادية. */}
                {detailItem.instances.filter((instance) => !SPECIAL_STEP_TYPES.has(instance.step_type)).map((instance) => {
                  const isOpen = ["pending", "in_progress", "paused"].includes(instance.status)
                  const canAct = isAdmin || mySectionIds.has(instance.effective_section_id)
                  const liveSeconds =
                    instance.status === "in_progress"
                      ? instance.total_duration_seconds +
                        elapsedSecondsSince(detailItem.logs.find((l) => l.step_instance_id === instance.id && l.action === "start")?.at)
                      : instance.total_duration_seconds
                  return (
                    <Card key={instance.id}>
                      <CardContent className="space-y-2 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">
                              {instance.step_label} <span className="text-xs text-slate-400">({instance.section_name})</span>
                              {instance.step_type !== "normal" && (
                                <Badge variant="outline" className="mr-1 text-[10px]">
                                  {STEP_TYPE_LABELS[instance.step_type]}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              {instance.claimed_by_name || "غير مسند"} · <Clock className="inline h-3 w-3" /> {formatDuration(liveSeconds)}
                            </div>
                          </div>
                          <Badge className={cn("border text-[10px]", STATUS_BADGE_CLASS[instance.status])}>{STEP_STATUS_LABELS[instance.status]}</Badge>
                        </div>

                        {isOpen && canAct && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {instance.status !== "in_progress" ? (
                              <Button size="sm" onClick={() => handleStart(instance.id)} disabled={actionBusy} className="gap-1">
                                <Play className="h-3.5 w-3.5" /> بدء
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => openNoteDialog(instance.id, "stop", "إيقاف مؤقت")} disabled={actionBusy} className="gap-1">
                                <Pause className="h-3.5 w-3.5" /> إيقاف مؤقت
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className="gap-1"
                              disabled={actionBusy || instance.status !== "in_progress" || (instance.step_type === "loading" && !allLoadingChecked)}
                              onClick={() => openNoteDialog(instance.id, "complete", "إنهاء")}
                              title={instance.step_type === "loading" && !allLoadingChecked ? "يجب فحص كل الأصناف أولاً" : undefined}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> إنهاء
                            </Button>
                            {!instance.first_started_at && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 border-red-200 text-red-600 hover:bg-red-50"
                                disabled={actionBusy || !instance.parent_instance_id}
                                onClick={() => setRejectingInstanceId(instance.id)}
                              >
                                <Undo2 className="h-3.5 w-3.5" /> رفض
                              </Button>
                            )}
                          </div>
                        )}

                        {isOpen && isAdmin && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-indigo-600"
                              disabled={actionBusy}
                              onClick={() => setTransferringInstanceId(instance.id)}
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" /> تحويل إداري
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-blue-600"
                              disabled={actionBusy}
                              onClick={() => openNoteDialog(instance.id, "force_complete", "إنهاء إجباري")}
                            >
                              <ShieldAlert className="h-3.5 w-3.5" /> إنهاء إجباري
                            </Button>
                            {instance.parent_instance_id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1 text-red-600"
                                disabled={actionBusy}
                                onClick={() => {
                                  const reason = window.prompt("سبب الرفض الإجباري؟")
                                  if (reason) forceReject(instance.id, reason)
                                }}
                              >
                                <ShieldAlert className="h-3.5 w-3.5" /> رفض إجباري
                              </Button>
                            )}
                          </div>
                        )}

                        {rejectingInstanceId === instance.id && (
                          <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-2">
                            <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="سبب إعادة المهمة للمرحلة السابقة (مطلوب)" rows={2} />
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setRejectingInstanceId(null)}>
                                إلغاء
                              </Button>
                              <Button size="sm" variant="destructive" onClick={confirmReject} disabled={actionBusy || !rejectNote.trim()}>
                                تأكيد الرفض
                              </Button>
                            </div>
                          </div>
                        )}

                        {transferringInstanceId === instance.id && (
                          <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50 p-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="invoice-currency-dropdown-wrap">
                                <PrimeDropdown
                                  value={transferTarget.sectionId}
                                  options={sections.map((s) => ({ id: String(s.id), name: s.name }))}
                                  optionLabel="name"
                                  optionValue="id"
                                  placeholder="قسم آخر (اختياري)"
                                  showClear
                                  filter
                                  className="invoice-currency-dropdown w-full text-xs"
                                  panelClassName="invoice-currency-dropdown-panel"
                                  appendTo="self"
                                  onChange={(e: any) => setTransferTarget((f) => ({ ...f, sectionId: e.value ?? "", userId: "" }))}
                                />
                              </div>
                              <div className="invoice-currency-dropdown-wrap">
                                <PrimeDropdown
                                  value={transferTarget.userId}
                                  options={(sections.find((s) => s.id === Number(transferTarget.sectionId))?.members || sections.find((s) => s.id === instance.effective_section_id)?.members || []).map(
                                    (m) => ({ user_id: m.user_id, full_name: m.full_name }),
                                  )}
                                  optionLabel="full_name"
                                  optionValue="user_id"
                                  placeholder="مستخدم محدد (اختياري)"
                                  showClear
                                  filter
                                  className="invoice-currency-dropdown w-full text-xs"
                                  panelClassName="invoice-currency-dropdown-panel"
                                  appendTo="self"
                                  onChange={(e: any) => setTransferTarget((f) => ({ ...f, userId: e.value ?? "" }))}
                                />
                              </div>
                            </div>
                            <Textarea
                              value={transferTarget.reason}
                              onChange={(e) => setTransferTarget((f) => ({ ...f, reason: e.target.value }))}
                              placeholder="سبب التحويل (مطلوب)"
                              rows={2}
                            />
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setTransferringInstanceId(null)}>
                                إلغاء
                              </Button>
                              <Button size="sm" onClick={confirmTransfer} disabled={actionBusy || !transferTarget.reason.trim()}>
                                تأكيد التحويل
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              <Separator />

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-600">سجلّ الأحداث</div>
                <ScrollArea className="max-h-56">
                  <div className="space-y-2 pl-2">
                    {detailItem.logs.map((log) => (
                      <div key={log.id} className="text-xs">
                        <span className="font-medium text-slate-700">{log.user_name || "النظام"}</span>{" "}
                        <span className="text-slate-500">{ACTION_LABELS[log.action] || log.action}</span>
                        {log.duration_sec > 0 && <span className="text-slate-500"> — {formatDuration(log.duration_sec)}</span>}
                        {log.note && <div className="text-slate-500">{log.note}</div>}
                        <div className="text-slate-400">{formatDateTimeToBritish(log.at)}</div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* نافذة ملاحظة عند الإيقاف المؤقت أو الإنهاء — اختيارية، لا تمنع التأكيد بلا نص. */}
      <Dialog open={noteDialog !== null} onOpenChange={(open) => !open && setNoteDialog(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{noteDialog?.label}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteDialogText}
            onChange={(e) => setNoteDialogText(e.target.value)}
            placeholder="ملاحظة (اختياري)"
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog(null)}>
              إلغاء
            </Button>
            <Button onClick={confirmNoteAction} disabled={actionBusy}>
              {actionBusy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />} تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialogYesNo
        visible={forceCloseInstanceId !== null}
        message="سيتم إلغاء كل مهام هذه الطلبية بالكامل وإغلاق الطلب الفعلي المرتبط بها نهائياً. هل تريد تأكيد الإغلاق الإجباري؟"
        onConfirm={confirmForceClose}
        onCancel={() => setForceCloseInstanceId(null)}
      />

    </div>
  )
}
