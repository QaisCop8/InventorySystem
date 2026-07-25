"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { NotificationCenter } from "@/components/notifications/notification-center"
import { Search, RefreshCw, Play, Pause, CheckCircle2, Undo2, ArrowRightLeft, Clock, Loader2, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDateTimeToBritish } from "@/lib/utils"
import type { TaskOpenTask, TaskOrderItemDetail, TaskSection, TaskWorkflow, TaskWorkflowStep } from "./types"
import { ACTION_LABELS, PRIORITY_LABELS, STEP_STATUS_LABELS } from "./types"
import { PRIORITY_BADGE_CLASS, PRIORITY_CARD_ACCENT, STATUS_BADGE_CLASS, columnColor, elapsedSecondsSince, formatDuration, initials } from "./utils"

type Scope = "mine" | "section" | "all"

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
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [tasks, setTasks] = useState<TaskOpenTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [scope, setScope] = useState<Scope>("section")
  const [, setTick] = useState(0)

  const [detailItemId, setDetailItemId] = useState<number | null>(null)
  const [detailItem, setDetailItem] = useState<TaskOrderItemDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [rejectingInstanceId, setRejectingInstanceId] = useState<number | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [transferringInstanceId, setTransferringInstanceId] = useState<number | null>(null)
  const [transferTarget, setTransferTarget] = useState<{ sectionId: string; userId: string; reason: string }>({ sectionId: "", userId: "", reason: "" })
  const [noteDialog, setNoteDialog] = useState<{ instanceId: number; action: "stop" | "complete" | "force_complete"; label: string } | null>(null)
  const [noteDialogText, setNoteDialogText] = useState("")

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchWorkflows = async () => {
    try {
      const [wfRes, tasksRes] = await Promise.all([fetch("/api/task-orders/workflows"), fetch("/api/task-orders/tasks")])
      const data = await wfRes.json()
      const active = (Array.isArray(data) ? data : []).filter((w: TaskWorkflow) => w.is_active)
      setWorkflows(active)

      // الاختيار الافتراضي يُفضِّل سير العمل الذي يملك مهاماً مفتوحة فعلياً حالياً بدل الأول أبجدياً/
      // إصداراً — وإلا تبقى أصناف أُنشئت للتو (كأصناف طلبيات المبيعات المفتوحة آلياً على سير عمل
      // "عام" قد لا يكون الأول بالترتيب) غير مرئية إطلاقاً حتى يُبدِّل المستخدم سير العمل يدوياً.
      const allTasks = tasksRes.ok ? await tasksRes.json() : []
      const openCounts = new Map<number, number>()
      if (Array.isArray(allTasks)) {
        for (const t of allTasks) openCounts.set(t.workflow_id, (openCounts.get(t.workflow_id) || 0) + 1)
      }
      const busiestWorkflowId = active.reduce<number | null>((best, w) => {
        const count = openCounts.get(w.id) || 0
        const bestCount = best !== null ? openCounts.get(best) || 0 : -1
        return count > bestCount ? w.id : best
      }, null)

      setSelectedWorkflowId((prev) => {
        if (prev && active.some((w) => w.id === prev)) return prev
        if (busiestWorkflowId && (openCounts.get(busiestWorkflowId) || 0) > 0) return busiestWorkflowId
        return active[0]?.id ?? null
      })
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

  const fetchTasks = async (workflowId: number | null) => {
    if (!workflowId) {
      setTasks([])
      return
    }
    setLoadingTasks(true)
    try {
      const params = new URLSearchParams({ workflow_id: String(workflowId) })
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

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId) || null
  const orderedSteps = useMemo(() => (selectedWorkflow ? orderStepsForColumns(selectedWorkflow) : []), [selectedWorkflow])

  const visibleTasks = useMemo(() => {
    let list = tasks
    if (scope === "mine") list = list.filter((t) => t.claimed_by_user_id === userId)
    else if (scope === "section") list = list.filter((t) => mySectionIds.has(t.effective_section_id) || t.claimed_by_user_id === userId)
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.item_code.toLowerCase().includes(q))
    }
    return list
  }, [tasks, scope, mySectionIds, userId, searchText])

  const openItem = async (id: number) => {
    setDetailItemId(id)
    setDetailLoading(true)
    setRejectingInstanceId(null)
    setTransferringInstanceId(null)
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
    const ok = await callInstanceAction("reject", rejectingInstanceId, { reason: rejectNote })
    if (ok) {
      setRejectingInstanceId(null)
      setRejectNote("")
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
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">لوحة تتبع الطلبيات</h1>
          <p className="text-sm text-slate-500">تتبّع أصناف الطلبية عبر مراحل سير العمل مع تسجيل الوقت لحظياً</p>
        </div>
        <div className="flex items-center gap-2">{userId && <NotificationCenter userId={userId} />}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedWorkflowId ? String(selectedWorkflowId) : ""} onValueChange={(v) => setSelectedWorkflowId(Number(v))}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="اختر سير العمل" />
          </SelectTrigger>
          <SelectContent>
            {workflows.map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>
                {w.name} {w.version > 1 ? `(إصدار ${w.version})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mine">مهامي فقط</SelectItem>
            <SelectItem value="section">أقسامي</SelectItem>
            {isAdmin && <SelectItem value="all">كل المهام</SelectItem>}
          </SelectContent>
        </Select>

        <div className="relative w-64">
          <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="بحث برقم الصنف أو العنوان" className="pr-8" />
        </div>

        <Button variant="outline" size="icon" onClick={() => fetchTasks(selectedWorkflowId)} title="تحديث">
          <RefreshCw className={cn("h-4 w-4", loadingTasks && "animate-spin")} />
        </Button>
      </div>

      {!selectedWorkflow ? (
        <Card>
          <CardContent className="py-10 text-center text-slate-500">لا يوجد سير عمل نشِط بعد — أنشئ واحداً من تبويب الإدارة</CardContent>
        </Card>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3">
          {orderedSteps.map((step, stepIndex) => {
            const columnTasks = visibleTasks
              .filter((t) => t.step_id === step.id)
              .sort((a, b) => {
                const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
                const pr = (priorityRank[a.item_priority] ?? 2) - (priorityRank[b.item_priority] ?? 2)
                if (pr !== 0) return pr
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              })
            const palette = columnColor(stepIndex)
            return (
              <div key={step.id} className={cn("flex w-96 shrink-0 flex-col rounded-2xl border-2", palette.bg, palette.border)}>
                <div className={cn("flex items-center justify-between rounded-t-2xl px-4 py-3", palette.header)}>
                  <div>
                    <div className={cn("text-base font-bold", palette.text)}>{step.label}</div>
                    <div className="text-xs text-slate-500">
                      {step.section_name}
                      {step.join_type !== "none" && ` · التقاء ${step.join_type === "and" ? "الكل" : "أي فرع"}`}
                      {step.sla_hours ? ` · SLA ${step.sla_hours}س` : ""}
                    </div>
                  </div>
                  <Badge className={cn("h-6 min-w-6 justify-center rounded-full px-2 text-sm font-bold", palette.badge)}>{columnTasks.length}</Badge>
                </div>
                <ScrollArea className="max-h-[70vh]">
                  <div className="flex flex-col gap-3 p-3">
                    {columnTasks.length === 0 && <div className="py-8 text-center text-sm text-slate-400">لا توجد مهام</div>}
                    {columnTasks.map((t) => {
                      const liveSeconds = t.has_running_timer ? t.total_duration_seconds + elapsedSecondsSince(t.running_since) : t.total_duration_seconds
                      return (
                        <button
                          key={t.id}
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
                          <div className="line-clamp-2 text-lg font-bold text-slate-800">{t.title}</div>
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
        <DialogContent className="max-w-3xl" dir="rtl">
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
                    {detailItem.customer_order_code} {detailItem.customer_name ? `(${detailItem.customer_name})` : ""}
                  </div>
                )}
                <div>
                  <span className="text-slate-400">أنشئ بواسطة: </span>
                  {detailItem.created_by_name || "-"}
                </div>
              </div>

              {detailItem.description && <p className="rounded-md bg-slate-50 p-2 text-sm text-slate-600">{detailItem.description}</p>}

              <Separator />

              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-600">مراحل التنفيذ</div>
                {detailItem.instances.map((instance) => {
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
                              disabled={actionBusy || instance.status !== "in_progress"}
                              onClick={() => openNoteDialog(instance.id, "complete", "إنهاء")}
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
                              <Select value={transferTarget.sectionId} onValueChange={(v) => setTransferTarget((f) => ({ ...f, sectionId: v, userId: "" }))}>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="قسم آخر (اختياري)" />
                                </SelectTrigger>
                                <SelectContent>
                                  {sections.map((s) => (
                                    <SelectItem key={s.id} value={String(s.id)}>
                                      {s.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={transferTarget.userId} onValueChange={(v) => setTransferTarget((f) => ({ ...f, userId: v }))}>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="مستخدم محدد (اختياري)" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(sections.find((s) => s.id === Number(transferTarget.sectionId))?.members || sections.find((s) => s.id === instance.effective_section_id)?.members || []).map(
                                    (m) => (
                                      <SelectItem key={m.user_id} value={m.user_id}>
                                        {m.full_name}
                                      </SelectItem>
                                    ),
                                  )}
                                </SelectContent>
                              </Select>
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

    </div>
  )
}
