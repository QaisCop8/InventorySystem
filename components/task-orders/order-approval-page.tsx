"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { CheckCircle2, Clock, Loader2, PackageCheck, RefreshCw, Search, ShoppingBag, Boxes } from "lucide-react"
import type { ApprovableCustomerOrder } from "./types"
import { PRIORITY_LABELS } from "./types"
import { PRIORITY_BADGE_CLASS, formatDuration } from "./utils"
import { formatDateTimeToBritish } from "@/lib/utils"
import { cn } from "@/lib/utils"

// شاشة الاعتماد النهائي: تظهر الطلبيات التي اكتملت كل أصنافها عبر سير عمل "تتبع أوامر العمل" ولها
// طلب فعلي مرتبط (source_order_id) — اعتمادها يُحدِّث orders.order_status2 = 2 (جاهز) عبر
// lib/orders.ts approveTaskCustomerOrder (يعيد استخدام UpdateOrderStatus الموجودة مسبقاً).
export default function OrderApprovalPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const userId = user?.id ?? null

  const [orders, setOrders] = useState<ApprovableCustomerOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [approvingId, setApprovingId] = useState<number | null>(null)
  const [confirmOrder, setConfirmOrder] = useState<ApprovableCustomerOrder | null>(null)
  const [search, setSearch] = useState("")

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/task-orders/customer-orders/approvable")
      const data = await res.json()
      setOrders(Array.isArray(data) ? data : [])
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب الطلبيات القابلة للاعتماد", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((o) =>
      [o.order_code, o.source_order_number, o.customer_name].some((value) => (value || "").toLowerCase().includes(q)),
    )
  }, [orders, search])

  const totals = useMemo(
    () => ({
      orders: orders.length,
      items: orders.reduce((sum, o) => sum + Number(o.item_count || 0), 0),
      urgent: orders.filter((o) => o.priority === "urgent" || o.priority === "high").length,
    }),
    [orders],
  )

  const approve = async (order: ApprovableCustomerOrder) => {
    if (!userId) return
    setApprovingId(order.id)
    try {
      const res = await fetch(`/api/task-orders/customer-orders/${order.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, receivedBy: user?.fullName || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "فشل اعتماد الطلبية")
      setOrders((prev) => prev.filter((o) => o.id !== order.id))
      toast({ title: "تم", description: `تم اعتماد الطلبية ${order.source_order_number || order.order_code} وأصبحت جاهزة` })
    } catch (error: any) {
      toast({ title: "تعذّر الاعتماد", description: error?.message || "خطأ غير متوقع", variant: "destructive" })
    } finally {
      setApprovingId(null)
      setConfirmOrder(null)
    }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4 p-1">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 px-5 py-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <PackageCheck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold sm:text-2xl">اعتماد الطلبيات الجاهزة</h1>
              <p className="text-xs text-emerald-50/90 sm:text-sm">طلبيات اكتملت كل أصنافها بسير العمل وتنتظر الاعتماد النهائي لتصبح جاهزة</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={fetchOrders}
            disabled={loading}
            className="h-10 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <RefreshCw className={cn("ml-2 h-4 w-4", loading && "animate-spin")} />
            تحديث
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["بانتظار الاعتماد", totals.orders, ShoppingBag, "text-emerald-600"],
          ["إجمالي الأصناف", totals.items, Boxes, "text-sky-600"],
          ["عاجلة / عالية الأولوية", totals.urgent, Clock, "text-amber-600"],
        ].map(([label, value, Icon, color]: any) => (
          <div key={label} className="flex items-center justify-between rounded-2xl border bg-white p-5 shadow-sm">
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </div>
            <Icon className={`h-7 w-7 ${color}`} />
          </div>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم الطلبية أو اسم العميل" className="h-10 rounded-xl bg-white pr-9" />
      </div>

      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-white py-14 text-center text-slate-500">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          {orders.length === 0 ? "لا توجد طلبيات جاهزة للاعتماد حالياً" : "لا توجد طلبيات مطابقة للبحث"}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleOrders.map((order) => (
            <div key={order.id} className="flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md">
              <div className="h-1 w-full bg-emerald-500" />
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-bold text-emerald-700">{order.source_order_number || order.order_code}</div>
                    <div className="truncate text-base font-bold text-slate-800">{order.customer_name || "بدون عميل"}</div>
                  </div>
                  <Badge className={cn("border", PRIORITY_BADGE_CLASS[order.priority])}>{PRIORITY_LABELS[order.priority] || order.priority}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                  <div>
                    <div className="text-[11px] text-slate-400">عدد الأصناف</div>
                    <div className="font-bold text-slate-700">{order.item_count}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">وقت التنفيذ الفعلي</div>
                    <div className="font-mono font-bold text-slate-700">{formatDuration(Number(order.total_work_seconds || 0))}</div>
                  </div>
                  {order.completed_at && (
                    <div className="col-span-2">
                      <div className="text-[11px] text-slate-400">اكتملت في</div>
                      <div className="text-xs text-slate-600">{formatDateTimeToBritish(order.completed_at)}</div>
                    </div>
                  )}
                </div>

                <Button
                  className="mt-auto w-full gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                  disabled={approvingId === order.id}
                  onClick={() => setConfirmOrder(order)}
                >
                  {approvingId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                  اعتماد الطلبية
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialogYesNo
        visible={confirmOrder !== null}
        useAppDialog
        title="اعتماد الطلبية"
        message={confirmOrder ? `سيتم اعتماد الطلبية ${confirmOrder.source_order_number || confirmOrder.order_code} وتحويل حالة الطلب الفعلي إلى "جاهز". هل تريد المتابعة؟` : ""}
        busy={approvingId !== null}
        onConfirm={() => confirmOrder && approve(confirmOrder)}
        onCancel={() => setConfirmOrder(null)}
      />
    </div>
  )
}
