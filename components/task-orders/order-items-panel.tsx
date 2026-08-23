"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Trash2, Printer } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { SiblingOrderItem, StepType } from "./types"
import { printItemBarcode } from "./print-item-barcode"

interface OrderItemsPanelProps {
  customerOrderId: number | null
  stepType: StepType
  showAllItems?: boolean
  printBarcode?: boolean
  userId: string
  // هل المستخدم الحالي فعلاً يملك هذه المهمة (مستلمها، أو عضو بقسمها لخطوة assignment_type='all'،
  // أو مدير نظام)؟ من يفتح نافذة صنف بخطوة ليست له (كعرض فقط بنطاق "كل المهام"/"أقسامي") يجب ألا
  // يستطيع تعديل الكمية/الكمية المجهزة رغم ظهور اللوحة — يطابق نفس شرط الوصول الخادمي
  // (assertOrderItemStepAccess بـlib/task-orders.ts) الذي سيرفض الحفظ فعلياً لو حاول.
  canEdit: boolean
  onAllLoadingCheckedChange?: (allChecked: boolean) => void
}

// لوحة الأصناف الشقيقة — تظهر داخل نافذة تفاصيل المهمة (task-board.tsx) فقط أثناء العمل على خطوة
// نوعها تدقيق/اعتماد/تجهيز/تحميل؛ خطوة عادية لا تعرضها إطلاقاً فيبقى سلوك النافذة كما هو تماماً.
export function OrderItemsPanel({ customerOrderId, stepType, showAllItems = false, printBarcode = false, userId, canEdit, onAllLoadingCheckedChange }: OrderItemsPanelProps) {
  const { toast } = useToast()
  const [items, setItems] = useState<SiblingOrderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [qtyDrafts, setQtyDrafts] = useState<Record<number, string>>({})

  const canEditQty = canEdit && (stepType === "audit" || stepType === "approval")
  const canDelete = canEdit && (stepType === "audit" || stepType === "approval")
  const canEditPrepared = canEdit && stepType === "preparation"
  const isLoadingStep = stepType === "loading"
  const showBarcode = printBarcode || isLoadingStep
  const canCheckLoading = canEdit && isLoadingStep

  const fetchItems = async () => {
    if (!customerOrderId) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/task-orders/customer-orders/${customerOrderId}/items`)
      const data = await res.json()
      const rows: SiblingOrderItem[] = Array.isArray(data) ? data : []
      setItems(rows)
      setQtyDrafts(Object.fromEntries(rows.map((r) => [r.id, r.qty != null ? String(r.qty) : ""])))
      if (isLoadingStep) onAllLoadingCheckedChange?.(rows.length > 0 && rows.every((r) => !!r.loading_checked_at))
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب أصناف الطلبية", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerOrderId, stepType])

  const patchItem = async (itemId: number, action: string, value: unknown) => {
    setBusyId(itemId)
    try {
      const res = await fetch(`/api/task-orders/order-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "فشل تنفيذ العملية")
      await fetchItems()
    } catch (error: any) {
      toast({ title: "تعذّر التنفيذ", description: error?.message || "خطأ غير متوقع", variant: "destructive" })
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (itemId: number) => {
    if (!window.confirm("هل تريد حذف هذا الصنف من الطلبية؟")) return
    setBusyId(itemId)
    try {
      const res = await fetch(`/api/task-orders/order-items/${itemId}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "فشل الحذف")
      await fetchItems()
    } catch (error: any) {
      toast({ title: "تعذّر الحذف", description: error?.message || "خطأ غير متوقع", variant: "destructive" })
    } finally {
      setBusyId(null)
    }
  }

  if (!customerOrderId) return null
  if (!showAllItems && !isLoadingStep && !showBarcode) return null

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">أصناف الطلبية</div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>

      {items.length === 0 && !loading && <div className="py-4 text-center text-xs text-slate-400">لا توجد أصناف</div>}

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <Card key={item.id}>
            <CardContent className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{item.title}</div>
                  <div className="font-mono text-xs text-slate-400">{item.item_code}</div>
                </div>
                {canDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-red-500 hover:bg-red-50"
                    disabled={busyId === item.id}
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">الكمية المطلوبة</div>
                  {canEditQty ? (
                    <Input
                      type="number"
                      className="h-8"
                      value={qtyDrafts[item.id] ?? ""}
                      disabled={busyId === item.id}
                      onChange={(e) => setQtyDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                      onBlur={(e) => {
                        const value = Number(e.target.value)
                        if (!Number.isNaN(value) && value !== item.qty) patchItem(item.id, "qty", value)
                      }}
                    />
                  ) : (
                    <div className="text-sm font-semibold">{item.qty ?? "-"}</div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-slate-500">الكمية المجهزة</div>
                  {canEditPrepared ? (
                    <Input
                      type="number"
                      className="h-8"
                      defaultValue={item.prepared_qty ?? ""}
                      disabled={busyId === item.id}
                      onBlur={(e) => {
                        const value = Number(e.target.value)
                        if (!Number.isNaN(value) && value !== item.prepared_qty) patchItem(item.id, "prepared_qty", value)
                      }}
                    />
                  ) : (
                    <div className="text-sm font-semibold">{item.prepared_qty ?? "-"}</div>
                  )}
                </div>
              </div>

              {showBarcode && (
                <div className="flex items-center justify-between gap-2 border-t border-dashed border-slate-200 pt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!item.loading_checked_at}
                      disabled={busyId === item.id || !canCheckLoading}
                      onCheckedChange={(checked) => patchItem(item.id, "loading_checked", !!checked)}
                    />
                    تم الفحص والموافقة
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={!item.loading_checked_at}
                    onClick={() => printItemBarcode(item)}
                  >
                    <Printer className="h-3.5 w-3.5" /> طباعة الباركود
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
