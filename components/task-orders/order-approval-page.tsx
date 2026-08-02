"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, PackageCheck, RefreshCw } from "lucide-react"
import type { ApprovableCustomerOrder } from "./types"
import { PRIORITY_LABELS } from "./types"
import { PRIORITY_BADGE_CLASS } from "./utils"
import { formatDateTimeToBritish } from "@/lib/utils"

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
  }, [])

  const approve = async (orderId: number) => {
    if (!userId) return
    setApprovingId(orderId)
    try {
      const res = await fetch(`/api/task-orders/customer-orders/${orderId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, receivedBy: user?.fullName || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "فشل اعتماد الطلبية")
      setOrders((prev) => prev.filter((o) => o.id !== orderId))
      toast({ title: "تم", description: "تم اعتماد الطلبية وأصبحت جاهزة" })
    } catch (error: any) {
      toast({ title: "تعذّر الاعتماد", description: error?.message || "خطأ غير متوقع", variant: "destructive" })
    } finally {
      setApprovingId(null)
    }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4 p-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">اعتماد الطلبيات الجاهزة</h1>
          <p className="text-sm text-slate-500">طلبيات اكتملت كل أصنافها بسير العمل وتنتظر الاعتماد النهائي</p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchOrders} title="تحديث">
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-slate-500">لا توجد طلبيات جاهزة للاعتماد حالياً</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm text-slate-400">{order.order_code}</div>
                    <div className="text-base font-bold text-slate-800">{order.customer_name || "بدون عميل"}</div>
                  </div>
                  <Badge className={`border ${PRIORITY_BADGE_CLASS[order.priority] || ""}`}>{PRIORITY_LABELS[order.priority] || order.priority}</Badge>
                </div>

                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>عدد الأصناف</span>
                  <span className="font-semibold">{order.item_count}</span>
                </div>
                {order.completed_at && (
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>اكتملت في</span>
                    <span>{formatDateTimeToBritish(order.completed_at)}</span>
                  </div>
                )}

                <Button className="w-full gap-1.5" disabled={approvingId === order.id} onClick={() => approve(order.id)}>
                  <PackageCheck className="h-4 w-4" /> اعتماد الطلبية
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
