"use client"

import { useEffect, useMemo, useState, type TouchEvent } from "react"
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
import {
  Search, RefreshCw, Play, Pause, CheckCircle2, Undo2, ArrowRightLeft, Clock, Loader2, ShieldAlert,
  KanbanSquare, Inbox, AlarmClock, GripVertical, Building2, Layers, FileText, Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDateTimeToBritish } from "@/lib/utils"
import type { TaskOpenTask, TaskOrderItemDetail, TaskSection, TaskStepInstance, TaskWorkflow, TaskWorkflowStep } from "./types"
import { ACTION_LABELS, PRIORITY_LABELS, STEP_STATUS_LABELS, STEP_TYPE_LABELS } from "./types"
import { PRIORITY_BADGE_CLASS, PRIORITY_CARD_ACCENT, STATUS_BADGE_CLASS, columnColor, elapsedSecondsSince, formatDuration, initials } from "./utils"
import { OrderItemsPanel } from "./order-items-panel"
import AttachmentManager from "@/components/common/AttachmentManager"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"

const SPECIAL_STEP_TYPES = new Set(["audit", "approval", "preparation", "loading"])

type GroupedTask = TaskOpenTask & { siblingItemIds: number[] }

type Scope = "mine" | "section" | "all"

const COMPLETED_DAYS_OPTIONS = [
  { value: 1, label: "اليوم" },
  { value: 3, label: "3 أيام" },
  { value: 7, label: "أسبوع" },
  { value: 30, label: "شهر" },
]

// حالة SLA لمهمة مفتوحة: due_at يُحسَب بالخادم (إنشاء المهمة + sla_hours للخطوة). كان sla_hours
// يُعرَّف بإدارة سير العمل ولا يظهر في أي مكان باللوحة إطلاقاً.
function slaInfo(task: { due_at?: string | null; status: string }): { overdue: boolean; label: string } | null {
  if (!task.due_at || task.status === "completed") return null
  const diffSeconds = Math.floor((new Date(task.due_at).getTime() - Date.now()) / 1000)
  if (Number.isNaN(diffSeconds)) return null
  const abs = Math.abs(diffSeconds)
  const days = Math.floor(abs / 86400)
  const hours = Math.floor((abs % 86400) / 3600)
  const minutes = Math.floor((abs % 3600) / 60)
  const span = days > 0 ? `${days} يوم ${hours} س` : hours > 0 ? `${hours} س ${minutes} د` : `${minutes} د`
  return diffSeconds < 0 ? { overdue: true, label: `متأخرة ${span}` } : { overdue: false, label: `متبقٍ ${span}` }
}

const STATUS_COLUMN_STYLE: Record<string, { bar: string; chip: string; icon: any; empty: string }> = {
  pending: { bar: "bg-slate-400", chip: "bg-slate-100 text-slate-700", icon: Inbox, empty: "لا توجد مهام جديدة" },
  paused: { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-800", icon: Pause, empty: "لا توجد مهام متوقفة" },
  in_progress: { bar: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800", icon: Play, empty: "اسحب مهمة إلى هنا لبدء العمل" },
  completed: { bar: "bg-sky-500", chip: "bg-sky-100 text-sky-800", icon: CheckCircle2, empty: "لا توجد مهام منتهية بالفترة" },
}

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
  const [completedDays, setCompletedDays] = useState(3)
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [forceRejectInstanceId, setForceRejectInstanceId] = useState<number | null>(null)
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
  const [noteDialog, setNoteDialog] = useState<{ instanceId: number; action: "stop" | "complete" | "force_complete" | "start"; label: string } | null>(null)
  const [noteDialogExtra, setNoteDialogExtra] = useState<{ needStartFirst?: boolean } | null>(null)
  const [noteDialogText, setNoteDialogText] = useState("")
  const [allLoadingChecked, setAllLoadingChecked] = useState(true)
  const [forceCloseInstanceId, setForceCloseInstanceId] = useState<number | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [dragTouchState, setDragTouchState] = useState<{ taskId: number; clientX: number; clientY: number; hasMoved: boolean } | null>(null)

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
      const params = new URLSearchParams({ completed_days: String(completedDays) })
      if (workflowId !== "all") params.set("workflow_id", String(workflowId))
      const res = await fetch(`/api/task-orders/tasks?${params}`)
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
  }, [selectedWorkflowId, completedDays])

  const mySectionIds = useMemo(() => {
    if (!userId) return new Set<number>()
    return new Set(sections.filter((s) => s.members.some((m) => Number(m.user_id) === Number(userId))).map((s) => s.id))
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
    if (scope === "mine") list = list.filter((t) => Number(t.claimed_by_user_id) === Number(userId))
    else if (scope === "section") list = list.filter((t) => mySectionIds.has(t.effective_section_id) || Number(t.claimed_by_user_id) === Number(userId))
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.item_code.toLowerCase().includes(q) ||
          (t.customer_name || "").toLowerCase().includes(q) ||
          (t.source_order_number || "").toLowerCase().includes(q),
      )
    }
    if (overdueOnly) list = list.filter((t) => slaInfo(t)?.overdue)
    return list
  }, [tasks, scope, mySectionIds, userId, searchText, branchFilter, sectionBranchMap, overdueOnly])

  const overdueCount = visibleTasks.filter((t) => slaInfo(t)?.overdue).length

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
      if (!(SPECIAL_STEP_TYPES.has(t.step_type) || t.show_all_items || t.print_barcode) || !t.customer_order_id) {
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
        subtitle: "بانتظار الاستلام والبدء",
        tasks: groupTasksForDisplay(byStatus.pending),
      },
      {
        key: "paused",
        label: "مهام متوقفة",
        subtitle: "أُوقف العمل عليها مؤقتاً",
        tasks: groupTasksForDisplay(byStatus.paused),
      },
      {
        key: "in_progress",
        label: "مهام جارية",
        subtitle: "العداد يعمل الآن",
        tasks: groupTasksForDisplay(byStatus.in_progress),
      },
      {
        key: "completed",
        label: "مهام منتهية",
        subtitle: `خلال ${COMPLETED_DAYS_OPTIONS.find((o) => o.value === completedDays)?.label || ""}`,
        tasks: groupTasksForDisplay(byStatus.completed),
      },
    ]
  }, [visibleTasks, completedDays])

  const openItem = async (id: number) => {
    setDetailItemId(id)
    setDetailLoading(true)
    setRejectingInstanceId(null)
    setRejectOrderContext(null)
    setTransferringInstanceId(null)
    setForceRejectInstanceId(null)
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

  const refreshDetail = async () => {
    if (detailItemId === null) return
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/task-orders/order-items/${detailItemId}`)
      if (!res.ok) throw new Error()
      setDetailItem(await res.json())
    } catch {
      toast({ title: "خطأ", description: "فشل في تحديث تفاصيل الصنف", variant: "destructive" })
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
      setDragTouchState(null)
    }
  }

  const completeTaskFromStatusLane = async (task: GroupedTask) => {
    if (!userId) return
    if (task.status !== "in_progress") return

    const ok = await callInstanceAction("complete", task.id, {})
    if (ok) {
      await fetchTasks(selectedWorkflowId)
      setDraggedTaskId(null)
      setDragTouchState(null)
    }
  }

  const handleTouchTaskStart = (event: TouchEvent<HTMLButtonElement>, task: GroupedTask) => {
    if (!["pending", "in_progress"].includes(task.status)) return
    event.preventDefault()
    const touch = event.touches[0]
    if (!touch) return
    setDraggedTaskId(task.id)
    setDragTouchState({ taskId: task.id, clientX: touch.clientX, clientY: touch.clientY, hasMoved: false })
  }

  const getTouchDropColumnKey = (event: TouchEvent<HTMLElement>) => {
    const touch = event.changedTouches?.[0]
    if (!touch) return null
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
    if (!targetElement) return null
    return targetElement.closest<HTMLElement>("[data-task-column-key]")?.dataset.taskColumnKey ?? null
  }

  const handleTouchTaskMove = (event: TouchEvent<HTMLButtonElement>, task: GroupedTask) => {
    if (!["pending", "paused", "in_progress"].includes(task.status) || draggedTaskId !== task.id) return
    const touch = event.touches[0]
    if (!touch) return
    setDragTouchState((current) => {
      if (!current || current.taskId !== task.id) return current
      const deltaX = touch.clientX - current.clientX
      const deltaY = touch.clientY - current.clientY
      const moved = Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8
      return { taskId: task.id, clientX: touch.clientX, clientY: touch.clientY, hasMoved: moved || current.hasMoved }
    })
  }

  const handleTouchTaskEnd = async (event: TouchEvent<HTMLElement>, columnKey: string) => {
    if (!draggedTaskId) return
    event.preventDefault()
    const targetColumnKey = getTouchDropColumnKey(event) ?? columnKey
    const task = visibleTasks.find((item) => item.id === draggedTaskId)
    if (!task) {
      setDraggedTaskId(null)
      setDragTouchState(null)
      return
    }

    if (targetColumnKey === "in_progress" && ["pending", "paused"].includes(task.status)) {
      openNoteDialog(task.id, "start", "بدء المهمة")
      setNoteDialogExtra(null)
      return
    }

    if (targetColumnKey === "paused" && task.status === "in_progress") {
      openNoteDialog(task.id, "stop", "إيقاف المهمة")
      setNoteDialogExtra(null)
      return
    }

    if (targetColumnKey === "completed" && task.status === "in_progress") {
      openNoteDialog(task.id, "complete", "إنهاء المهمة")
      setNoteDialogExtra(null)
      return
    }

    // paused -> completed: require start then complete
    if (targetColumnKey === "completed" && task.status === "paused") {
      setNoteDialogExtra({ needStartFirst: true })
      openNoteDialog(task.id, "complete", "إنهاء المهمة")
      return
    }

    setDraggedTaskId(null)
    setDragTouchState(null)
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
      await fetchTasks(selectedWorkflowId)
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
  const openNoteDialog = (instanceId: number, action: "stop" | "complete" | "force_complete" | "start", label: string) => {
    setNoteDialog({ instanceId, action, label })
    setNoteDialogText("")
  }
  const confirmNoteAction = async () => {
    if (!noteDialog) return
    const body: Record<string, any> = { note: noteDialogText.trim() || undefined }
    setActionBusy(true)
    try {
      if (noteDialog.action === "start") {
        const ok = await callInstanceAction("start", noteDialog.instanceId, body)
        if (ok) {
          setNoteDialog(null)
          setNoteDialogText("")
          setNoteDialogExtra(null)
        }
        return
      }

      if (noteDialog.action === "complete") {
        // If we need to start first (paused -> completed), start then complete
        if (noteDialogExtra?.needStartFirst) {
          const started = await callInstanceAction("start", noteDialog.instanceId, body)
          if (!started) throw new Error("فشل بدء المهمة")
          const completed = await callInstanceAction("complete", noteDialog.instanceId, body)
          if (!completed) throw new Error("فشل إنهاء المهمة")
          setNoteDialog(null)
          setNoteDialogText("")
          setNoteDialogExtra(null)
          return
        }

        const ok = await callInstanceAction("complete", noteDialog.instanceId, body)
        if (ok) {
          setNoteDialog(null)
          setNoteDialogText("")
          setNoteDialogExtra(null)
        }
        return
      }

      const path = noteDialog.action === "force_complete" ? "complete" : noteDialog.action
      if (noteDialog.action === "force_complete") body.force = true
      const ok = await callInstanceAction(path, noteDialog.instanceId, body)
      if (ok) {
        setNoteDialog(null)
        setNoteDialogText("")
        setNoteDialogExtra(null)
      }
    } catch (error: any) {
      // callInstanceAction already toasts on error; nothing extra required
      setNoteDialogExtra(null)
    } finally {
      setActionBusy(false)
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

  // بطاقات خطوات التدقيق/الاعتماد/التجهيز/التحميل تمثّل الطلبية كلها (انظر groupTasksForDisplay) —
  // سحبها كان يبدأ/يُنهي مهمة صنف واحد فقط من الطلبية؛ إجراؤها الصحيح "تم" الجماعي من نافذة التفاصيل.
  const isDraggableTask = (t: TaskOpenTask) =>
    ["pending", "paused", "in_progress"].includes(t.status) &&
    !((SPECIAL_STEP_TYPES.has(t.step_type) || t.show_all_items || t.print_barcode) && t.customer_order_id)

  const statCards = [
    { key: "pending", label: "مهام جديدة", value: statusSummary.pending.count, seconds: statusSummary.pending.totalSeconds, icon: Inbox, tone: "text-slate-600 bg-slate-100" },
    { key: "in_progress", label: "مهام جارية", value: statusSummary.in_progress.count, seconds: statusSummary.in_progress.totalSeconds, icon: Play, tone: "text-emerald-700 bg-emerald-100" },
    { key: "paused", label: "مهام متوقفة", value: statusSummary.paused.count, seconds: statusSummary.paused.totalSeconds, icon: Pause, tone: "text-amber-700 bg-amber-100" },
    { key: "completed", label: "منتهية بالفترة", value: statusSummary.completed.count, seconds: statusSummary.completed.totalSeconds, icon: CheckCircle2, tone: "text-sky-700 bg-sky-100" },
  ]

  return (
    <div dir="rtl" className="flex min-h-[calc(100vh-104px)] flex-col gap-4 md:min-h-[calc(100vh-136px)]">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 px-5 py-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <KanbanSquare className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold sm:text-2xl">لوحة متابعة الطلبات</h1>
              <p className="text-xs text-emerald-50/90 sm:text-sm">تتبّع أصناف الطلبيات عبر مراحل سير العمل مع تسجيل وقت التنفيذ لحظياً</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => fetchTasks(selectedWorkflowId)}
              disabled={loadingTasks}
              className="h-10 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <RefreshCw className={cn("ml-2 h-4 w-4", loadingTasks && "animate-spin")} />
              تحديث
            </Button>
            {userId && (
              <div className="rounded-xl bg-white/95 text-slate-700 shadow-sm">
                <NotificationCenter userId={userId} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {statCards.map((card) => (
          <div key={card.key} className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">{card.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{card.value}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                <Clock className="h-3 w-3" /> {formatDuration(card.seconds)}
              </p>
            </div>
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", card.tone)}>
              <card.icon className="h-5 w-5" />
            </span>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setOverdueOnly((v) => !v)}
          className={cn(
            "col-span-2 flex items-center justify-between rounded-2xl border p-4 text-right shadow-sm transition lg:col-span-1",
            overdueOnly ? "border-red-300 bg-red-50 ring-2 ring-red-200" : "bg-white hover:border-red-200 hover:bg-red-50/40",
          )}
          title="عرض المهام المتأخرة عن مدة الإنجاز (SLA) فقط"
        >
          <div>
            <p className="text-xs font-medium text-slate-500">متأخرة عن SLA</p>
            <p className={cn("mt-1 text-2xl font-bold", overdueCount > 0 ? "text-red-600" : "text-slate-800")}>{overdueCount}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{overdueOnly ? "إلغاء التصفية" : "اضغط للتصفية"}</p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-600">
            <AlarmClock className="h-5 w-5" />
          </span>
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-3 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1.4fr_1fr]">
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1 text-xs font-medium text-slate-500"><Layers className="h-3.5 w-3.5" /> سير العمل</label>
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
            <label className="flex items-center gap-1 text-xs font-medium text-slate-500"><Building2 className="h-3.5 w-3.5" /> الفرع</label>
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
            <label className="flex items-center gap-1 text-xs font-medium text-slate-500"><Search className="h-3.5 w-3.5" /> بحث</label>
            <div className="relative">
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="رقم الصنف، العنوان، العميل أو رقم الطلبية"
                className="h-10 w-full rounded-xl pr-8"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1 text-xs font-medium text-slate-500"><CheckCircle2 className="h-3.5 w-3.5" /> المنتهية خلال</label>
            <div className="flex h-10 items-center gap-1 rounded-xl bg-slate-100 p-1">
              {COMPLETED_DAYS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCompletedDays(option.value)}
                  className={cn(
                    "h-full flex-1 rounded-lg text-xs font-semibold transition",
                    completedDays === option.value ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed pt-3">
          <span className="flex items-center gap-1 text-xs font-medium text-slate-500"><Users className="h-3.5 w-3.5" /> نطاق العرض:</span>
          {[
            { label: "مهامي", value: "mine" as Scope },
            { label: "أقسامي", value: "section" as Scope },
            ...(isAdmin ? [{ label: "كل المهام", value: "all" as Scope }] : []),
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setScope(option.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-bold transition",
                scope === option.value ? "bg-emerald-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {option.label}
            </button>
          ))}
          {scope === "mine" && (
            <span className="text-[11px] text-slate-400">المهام غير المستلَمة بعد تظهر في "أقسامي"</span>
          )}
        </div>
      </div>

      {workflows.length === 0 && !loadingTasks ? (
        <Card className="rounded-2xl">
          <CardContent className="py-10 text-center text-slate-500">لا يوجد سير عمل نشِط بعد — أنشئ واحداً من شاشة إدارة الأقسام وسير العمل</CardContent>
        </Card>
      ) : (
        <div className="flex min-h-[420px] flex-1 flex-col gap-4 overflow-x-auto pb-3 lg:flex-row">
          {statusColumns.map((column) => {
            const columnTasks = [...column.tasks].sort((a, b) => {
              const aOverdue = slaInfo(a)?.overdue ? 0 : 1
              const bOverdue = slaInfo(b)?.overdue ? 0 : 1
              if (aOverdue !== bOverdue) return aOverdue - bOverdue
              const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
              const pr = (priorityRank[a.item_priority] ?? 2) - (priorityRank[b.item_priority] ?? 2)
              if (pr !== 0) return pr
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            })
            const style = STATUS_COLUMN_STYLE[column.key]
            const ColumnIcon = style.icon
            const draggedTask = draggedTaskId ? visibleTasks.find((item) => item.id === draggedTaskId) : null
            const isDropTarget =
              !!draggedTask &&
              ((column.key === "in_progress" && ["pending", "paused"].includes(draggedTask.status)) ||
                (column.key === "paused" && draggedTask.status === "in_progress") ||
                (column.key === "completed" && ["in_progress", "paused"].includes(draggedTask.status)))
            return (
              <div
                key={column.key}
                data-task-column-key={column.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault()
                  const taskId = draggedTaskId
                  if (!taskId) return
                  const task = visibleTasks.find((item) => item.id === taskId)
                  if (!task) return
                  if (column.key === "in_progress" && ["pending", "paused"].includes(task.status)) {
                    setNoteDialogExtra(null)
                    openNoteDialog(task.id, "start", "بدء المهمة")
                    return
                  }
                  if (column.key === "paused" && task.status === "in_progress") {
                    setNoteDialogExtra(null)
                    openNoteDialog(task.id, "stop", "إيقاف المهمة")
                    return
                  }
                  if (column.key === "completed" && task.status === "in_progress") {
                    setNoteDialogExtra(null)
                    openNoteDialog(task.id, "complete", "إنهاء المهمة")
                    return
                  }
                  // paused -> completed: بدء ثم إنهاء بتأكيد واحد
                  if (column.key === "completed" && task.status === "paused") {
                    setNoteDialogExtra({ needStartFirst: true })
                    openNoteDialog(task.id, "complete", "إنهاء المهمة")
                  }
                }}
                onTouchEnd={(e) => void handleTouchTaskEnd(e, column.key)}
                onTouchCancel={() => {
                  setDraggedTaskId(null)
                  setDragTouchState(null)
                }}
                className={cn(
                  "flex h-full w-[85vw] shrink-0 flex-col overflow-hidden rounded-2xl border bg-slate-50/70 shadow-sm transition sm:w-[340px] lg:w-auto lg:min-w-[280px] lg:flex-1",
                  isDropTarget && "border-emerald-400 bg-emerald-50/60 ring-2 ring-emerald-200",
                )}
              >
                <div className={cn("h-1 w-full", style.bar)} />
                <div className="flex items-center justify-between border-b bg-white px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", style.chip)}>
                      <ColumnIcon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-sm font-bold text-slate-800">{column.label}</div>
                      {column.subtitle && <div className="text-[11px] text-slate-400">{column.subtitle}</div>}
                    </div>
                  </div>
                  <span className={cn("min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-bold", style.chip)}>{columnTasks.length}</span>
                </div>
                <ScrollArea
                  className="min-h-0 flex-1"
                  onTouchEnd={(e) => void handleTouchTaskEnd(e, column.key)}
                  onTouchCancel={() => {
                    setDraggedTaskId(null)
                    setDragTouchState(null)
                  }}
                >
                  <div className="flex flex-col gap-2.5 p-3">
                    {columnTasks.length === 0 && (
                      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
                        <ColumnIcon className="h-5 w-5 text-slate-300" />
                        {style.empty}
                      </div>
                    )}
                    {columnTasks.map((t) => {
                      const liveSeconds = t.has_running_timer ? t.total_duration_seconds + elapsedSecondsSince(t.running_since) : t.total_duration_seconds
                      const draggable = isDraggableTask(t)
                      const sla = slaInfo(t)
                      const isGroup = t.siblingItemIds.length > 1
                      return (
                        <button
                          key={`${t.id}-${t.siblingItemIds.length}`}
                          draggable={draggable}
                          onDragStart={() => {
                            if (!draggable) return
                            setDraggedTaskId(t.id)
                            setDragTouchState(null)
                          }}
                          onDragEnd={() => {
                            setDraggedTaskId(null)
                            setDragTouchState(null)
                          }}
                          onTouchStart={(e) => draggable && handleTouchTaskStart(e, t as GroupedTask)}
                          onTouchMove={(e) => draggable && handleTouchTaskMove(e, t as GroupedTask)}
                          onTouchEnd={() => {
                            if (dragTouchState?.taskId !== t.id) {
                              setDraggedTaskId(null)
                              setDragTouchState(null)
                            }
                          }}
                          onTouchCancel={() => {
                            setDraggedTaskId(null)
                            setDragTouchState(null)
                          }}
                          onClick={() => {
                            if (dragTouchState?.taskId === t.id && dragTouchState.hasMoved) {
                              setDragTouchState(null)
                              return
                            }
                            openItem(t.order_item_id)
                          }}
                          style={{ touchAction: draggable ? "none" : "auto" }}
                          className={cn(
                            "group relative w-full rounded-xl border border-r-4 bg-white p-3.5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                            PRIORITY_CARD_ACCENT[t.item_priority]?.split(" ")[0] || "border-r-blue-500",
                            sla?.overdue && "ring-1 ring-red-200",
                            draggedTaskId === t.id && "opacity-50",
                          )}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-1">
                            <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                              {draggable && <GripVertical className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-400" />}
                              {t.item_code}
                            </span>
                            <Badge className={cn("border px-1.5 py-0 text-[10px]", PRIORITY_BADGE_CLASS[t.item_priority])}>{PRIORITY_LABELS[t.item_priority] || t.item_priority}</Badge>
                          </div>
                          <div className="line-clamp-2 text-sm font-bold leading-6 text-slate-800">
                            {isGroup ? `الطلبية — ${t.siblingItemIds.length} أصناف` : t.title}
                          </div>
                          {(t.customer_name || t.source_order_number) && (
                            <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                              <FileText className="h-3 w-3 shrink-0" />
                              {t.source_order_number}
                              {t.customer_name ? ` · ${t.customer_name}` : ""}
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{t.step_label}</span>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{t.section_name}</span>
                            {selectedWorkflowId === "all" && (
                              <span className="truncate rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">{t.workflow_name}</span>
                            )}
                            {sla && (
                              <span
                                className={cn(
                                  "flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                                  sla.overdue ? "bg-red-100 text-red-700" : "bg-amber-50 text-amber-700",
                                )}
                              >
                                <AlarmClock className="h-3 w-3" /> {sla.label}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                            <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                              <Avatar className="h-7 w-7 border border-white shadow-sm">
                                <AvatarFallback className="bg-emerald-100 text-[10px] font-semibold text-emerald-800">{initials(t.claimed_by_name)}</AvatarFallback>
                              </Avatar>
                              <span className="max-w-[120px] truncate">{t.claimed_by_name || "غير مسند"}</span>
                            </div>
                            <div
                              className={cn(
                                "flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[11px] font-semibold",
                                t.has_running_timer ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600",
                              )}
                            >
                              <Clock className={cn("h-3 w-3", t.has_running_timer && "animate-pulse")} />
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
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-0" dir="rtl">
          {detailLoading || !detailItem ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              <DialogHeader className="space-y-0 rounded-t-2xl bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 px-5 py-4 text-white">
                <DialogTitle className="flex flex-wrap items-center gap-2 text-white">
                  <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-xs">{detailItem.item_code}</span>
                  <span className="text-lg font-extrabold">{detailItem.title}</span>
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-1.5 pt-2">
                  <Badge className="border-0 bg-white/90 text-emerald-800">
                    {detailItem.status === "completed" ? "مكتمل" : detailItem.status === "cancelled" ? "ملغى" : "جارٍ بسير العمل"}
                  </Badge>
                  <Badge className={cn("border", PRIORITY_BADGE_CLASS[detailItem.priority])}>{PRIORITY_LABELS[detailItem.priority] || detailItem.priority}</Badge>
                  {detailItem.qty != null && <Badge className="border-0 bg-white/15 text-white">الكمية: {Number(detailItem.qty)}</Badge>}
                </div>
              </DialogHeader>

              <div className="space-y-4 px-5 pb-5">
              <div className="grid grid-cols-1 gap-2 rounded-xl border bg-slate-50/60 p-3 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-[11px] text-slate-400">سير العمل</div>
                  <div className="font-semibold text-slate-700">{detailItem.workflow_name}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">الطلبية</div>
                  <div className="font-semibold text-slate-700">
                    {detailItem.customer_order_code ? detailItem.source_order_number || detailItem.customer_order_code : "-"}
                    {detailItem.customer_name ? <span className="font-normal text-slate-500"> · {detailItem.customer_name}</span> : null}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">أنشئ بواسطة</div>
                  <div className="font-semibold text-slate-700">{detailItem.created_by_name || "-"}</div>
                </div>
              </div>

              {detailItem.description && <p className="rounded-md bg-slate-50 p-2 text-sm text-slate-600">{detailItem.description}</p>}

              {(() => {
                const activeSpecialInstance = detailItem.instances.find(
                  (i) => ["pending", "in_progress", "paused"].includes(i.status) && (SPECIAL_STEP_TYPES.has(i.step_type) || !!i.show_all_items || !!i.print_barcode || !!i.attachment_required),
                )
                if (!activeSpecialInstance || !userId) return null
                // مطابق لشرط الوصول الخادمي (assertOrderItemStepAccess بـlib/task-orders.ts): مستلم
                // المهمة، أو عضو قسمها لخطوة "كل القسم"، أو مدير نظام — من عداهم يرى اللوحة للقراءة
                // فقط ولا يظهر له تم/رفض إطلاقاً.
                const canActOnSpecial =
                  isAdmin ||
                  Number(activeSpecialInstance.claimed_by_user_id) === Number(userId) ||
                  (activeSpecialInstance.assignment_type === "all" && mySectionIds.has(activeSpecialInstance.effective_section_id))
                const loadingBlocked = activeSpecialInstance.step_type === "loading" && !allLoadingChecked
                return (
                  <>
                    {activeSpecialInstance.attachment_required && (
                      <AttachmentManager modelName="task_order_item" recordId={detailItem.id} uploadedBy={Number(userId)} />
                    )}
                    <OrderItemsPanel
                      customerOrderId={detailItem.customer_order_id}
                      stepType={activeSpecialInstance.step_type}
                      showAllItems={activeSpecialInstance.show_all_items}
                      printBarcode={activeSpecialInstance.print_barcode}
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
                                  setRejectNote("")
                                  setForceRejectInstanceId(instance.id)
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

                        {forceRejectInstanceId === instance.id && (
                          <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-2.5">
                            <div className="text-xs font-semibold text-red-700">رفض إجباري (إداري) — تُعاد المهمة للمرحلة السابقة حتى لو بدأ العمل عليها</div>
                            <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="سبب الرفض الإجباري (مطلوب)" rows={2} autoFocus />
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setForceRejectInstanceId(null)}>
                                إلغاء
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={actionBusy || !rejectNote.trim()}
                                onClick={async () => {
                                  const ok = await forceReject(instance.id, rejectNote.trim())
                                  if (ok) {
                                    setForceRejectInstanceId(null)
                                    setRejectNote("")
                                  }
                                }}
                              >
                                تأكيد الرفض الإجباري
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
            <Button variant="outline" onClick={() => { setNoteDialog(null); setNoteDialogExtra(null); }}>
              إلغاء
            </Button>
            <Button onClick={confirmNoteAction} disabled={actionBusy}>
              {actionBusy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />} {(noteDialog?.action === "start" || noteDialog?.action === "complete" || noteDialog?.action === "stop" || noteDialog?.action === "force_complete") ? "تم" : "تأكيد"}
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
