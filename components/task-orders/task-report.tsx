"use client"

import { useEffect, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, RefreshCw, Loader2, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDateTimeToBritish } from "@/lib/utils"
import type { TaskOrderItemDetail, TaskOrderItemRow, TaskWorkflow } from "./types"
import { ACTION_LABELS, PRIORITY_LABELS } from "./types"
import { PRIORITY_BADGE_CLASS, formatDuration } from "./utils"

const ITEM_STATUS_LABELS: Record<string, string> = {
  in_workflow: "جارٍ",
  completed: "مكتمل",
  cancelled: "ملغى",
}
const ITEM_STATUS_BADGE_CLASS: Record<string, string> = {
  in_workflow: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
  cancelled: "bg-slate-100 text-slate-400 border-slate-200",
}

export function TaskReport() {
  const { toast } = useToast()
  const [workflows, setWorkflows] = useState<TaskWorkflow[]>([])
  const [items, setItems] = useState<TaskOrderItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [workflowFilter, setWorkflowFilter] = useState("all")

  const [detailId, setDetailId] = useState<number | null>(null)
  const [detailItem, setDetailItem] = useState<TaskOrderItemDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchWorkflows = async () => {
    try {
      const res = await fetch("/api/task-orders/workflows")
      const data = await res.json()
      setWorkflows(Array.isArray(data) ? data : [])
    } catch {
      // صامت — فلتر سير العمل غير أساسي لعمل التقرير
    }
  }

  const fetchItems = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (workflowFilter !== "all") params.set("workflow_id", workflowFilter)
      if (search.trim()) params.set("search", search.trim())
      const res = await fetch(`/api/task-orders/order-items?${params}`)
      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب تقرير أصناف الطلبية", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorkflows()
  }, [])

  useEffect(() => {
    const timeout = setTimeout(fetchItems, 300)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, workflowFilter, search])

  const openDetail = async (id: number) => {
    setDetailId(id)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/task-orders/order-items/${id}`)
      if (!res.ok) throw new Error()
      setDetailItem(await res.json())
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب تفاصيل الصنف", variant: "destructive" })
      setDetailId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const summary = useMemo(() => {
    const total = items.length
    const inWorkflow = items.filter((i) => i.status === "in_workflow").length
    const completed = items.filter((i) => i.status === "completed").length
    const cancelled = items.filter((i) => i.status === "cancelled").length
    return { total, inWorkflow, completed, cancelled }
  }, [items])

  return (
    <div dir="rtl" className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">تقرير متابعة أصناف الطلبية</h1>
        <p className="text-sm text-slate-500">كل الأصناف بحالاتها ومراحلها الحالية وآخر ملاحظة مسجَّلة عليها</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-slate-800">{summary.total}</div>
            <div className="text-xs text-slate-500">الإجمالي</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{summary.inWorkflow}</div>
            <div className="text-xs text-slate-500">جارٍ</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{summary.completed}</div>
            <div className="text-xs text-slate-500">مكتمل</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-slate-400">{summary.cancelled}</div>
            <div className="text-xs text-slate-500">ملغى</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم الصنف أو العنوان" className="pr-8" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="in_workflow">جارٍ</SelectItem>
            <SelectItem value="completed">مكتمل</SelectItem>
            <SelectItem value="cancelled">ملغى</SelectItem>
          </SelectContent>
        </Select>
        <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="كل سير العمل" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل سير العمل</SelectItem>
            {workflows.map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>
                {w.name}
                {w.version > 1 ? ` v${w.version}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchItems} title="تحديث">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الصنف</TableHead>
                  <TableHead className="text-right">العنوان</TableHead>
                  <TableHead className="text-right">سير العمل</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">المرحلة الحالية</TableHead>
                  <TableHead className="text-right">الأولوية</TableHead>
                  <TableHead className="text-right">آخر ملاحظة</TableHead>
                  <TableHead className="text-right">أنشئ بواسطة</TableHead>
                  <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(item.id)}>
                    <TableCell className="font-mono text-xs text-slate-500">{item.item_code}</TableCell>
                    <TableCell className="max-w-[220px] truncate font-medium">{item.title}</TableCell>
                    <TableCell className="text-xs text-slate-500">{item.workflow_name}</TableCell>
                    <TableCell>
                      <Badge className={cn("border text-[10px]", ITEM_STATUS_BADGE_CLASS[item.status])}>{ITEM_STATUS_LABELS[item.status] || item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{item.current_steps || (item.status === "in_workflow" ? "-" : "—")}</TableCell>
                    <TableCell>
                      <Badge className={cn("border text-[10px]", PRIORITY_BADGE_CLASS[item.priority])}>{PRIORITY_LABELS[item.priority] || item.priority}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs text-slate-500" title={item.last_note || ""}>
                      {item.last_note || "-"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{item.created_by_name || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-slate-400">{formatDateTimeToBritish(item.created_at)}</TableCell>
                  </TableRow>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-slate-400">
                      لا توجد أصناف مطابقة
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* نافذة عرض تفاصيل صنف — للعرض والتدقيق فقط (بلا أزرار إجراءات)؛ التحكم الفعلي بالمهام من
          لوحة Kanban، هذه شاشة تقرير/تتبّع تُبرز الحالة والملاحظات وسجلّ الأحداث الكامل. */}
      <Dialog open={detailId !== null} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-w-2xl" dir="rtl">
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
                  <Badge className={cn("border", ITEM_STATUS_BADGE_CLASS[detailItem.status])}>{ITEM_STATUS_LABELS[detailItem.status] || detailItem.status}</Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-400">سير العمل: </span>
                  {detailItem.workflow_name}
                </div>
                <div>
                  <span className="text-slate-400">أنشئ بواسطة: </span>
                  {detailItem.created_by_name || "-"}
                </div>
              </div>
              {detailItem.description && <p className="rounded-md bg-slate-50 p-2 text-sm text-slate-600">{detailItem.description}</p>}

              <Separator />

              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-600">مراحل التنفيذ</div>
                {detailItem.instances.map((instance) => (
                  <div key={instance.id} className="flex items-center justify-between rounded-md border border-slate-200 px-2 py-1.5 text-sm">
                    <span>
                      {instance.step_label} <span className="text-xs text-slate-400">({instance.section_name})</span>
                    </span>
                    <span className="text-xs text-slate-500">
                      {instance.claimed_by_name || "غير مسند"} · {formatDuration(instance.total_duration_seconds)}
                    </span>
                  </div>
                ))}
              </div>

              <Separator />

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-600">سجلّ الأحداث والملاحظات</div>
                <ScrollArea className="max-h-64">
                  <div className="space-y-2 pl-2">
                    {detailItem.logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 text-xs">
                        <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <div>
                          <span className="font-medium text-slate-700">{log.user_name || "النظام"}</span>{" "}
                          <span className="text-slate-500">{ACTION_LABELS[log.action] || log.action}</span>
                          {log.duration_sec > 0 && <span className="text-slate-500"> — {formatDuration(log.duration_sec)}</span>}
                          {log.note && <div className="mt-0.5 rounded bg-slate-50 p-1.5 text-slate-600">{log.note}</div>}
                          <div className="text-slate-400">{formatDateTimeToBritish(log.at)}</div>
                        </div>
                      </div>
                    ))}
                    {detailItem.logs.length === 0 && <div className="text-xs text-slate-400">لا توجد أحداث بعد</div>}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
