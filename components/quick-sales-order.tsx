"use client"

import { tr, appDir } from "@/lib/i18n"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CalendarDays, PackageOpen, Plus, Save, ShoppingCart, StickyNote, Trash2, UserSearch } from "lucide-react"
import { Toast } from "primereact/toast"
import Util from "./common/Util"
import AccountSearchDialog, { type AccountItem } from "@/components/customer/account-search-dialog"
import ProductSearchPopup from "./products/ProductSearchPopup"
import { useAuth } from "./auth/auth-context"
import MeasurementInputDialog from "./common/MeasurementInputDialog"
import { useWorkspaceTabActive } from "@/contexts/workspace-tab-context"
import { categoryAttributeDeltas } from "@/lib/attribute-prices"

// نوع طلبية المبيعات ثابت في هذه النافذة السريعة — لا يُعرض للمستخدم ولا يمكن تغييره
const SALES_ORDER_TYPE = 1

interface QuickOrderItem {
  rowId: string
  product_id: number | null
  product_name: string
  barcode: string | null
  unit_id: number | null
  unit_name: string
  qty: number | ""
  price: number | ""
  discount: number | ""
  measurment_id: number
  product_length: number | null
  product_width: number | null
  product_density: number | null
  length: number | null
  width: number | null
  height: number | null
  count: number | null
}

interface SelectedCustomer {
  id: number
  name: string
  customer_code?: string
  mobile1?: string
}

interface QuickSalesOrderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOrderSaved?: (order: any) => void
}

const emptyItem = (): QuickOrderItem => ({
  rowId: Math.random().toString(36).slice(2),
  product_id: null,
  product_name: "",
  barcode: null,
  unit_id: null,
  unit_name: "",
  qty: 1,
  price: 0,
  discount: 0,
  measurment_id: 1,
  product_length: null,
  product_width: null,
  product_density: null,
  length: null,
  width: null,
  height: null,
  count: null,
})

const amountOf = (item: QuickOrderItem) => {
  const qty = Number(item.qty) || 0
  const price = Number(item.price) || 0
  const discount = Number(item.discount) || 0
  return qty * price - discount
}

export function QuickSalesOrder({ open, onOpenChange, onOrderSaved }: QuickSalesOrderProps) {
  const workspaceTabActive = useWorkspaceTabActive()
  const { user, activeBranchId } = useAuth()
  const toast = useRef<Toast | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [showProductSearch, setShowProductSearch] = useState(false)
  const [measurementItemId, setMeasurementItemId] = useState<string | null>(null)
  const [items, setItems] = useState<QuickOrderItem[]>([emptyItem()])
  const [defaultItemWarehouseId, setDefaultItemWarehouseId] = useState<number | null>(null)
  const [defaultWarehouseLoading, setDefaultWarehouseLoading] = useState(false)

  const resetForm = () => {
    setOrderDate(new Date().toISOString().split("T")[0])
    setNotes("")
    setCustomer(null)
    setItems([emptyItem()])
    setMeasurementItemId(null)
  }

  useEffect(() => {
    if (open) resetForm()
  }, [open])

  useEffect(() => {
    const loadDefaultWarehouse = async () => {
      if (!user?.id) {
        setDefaultItemWarehouseId(null)
        return
      }

      setDefaultWarehouseLoading(true)
      try {
        const response = await fetch(`/api/settings/user-warehouse-defaults?user_id=${encodeURIComponent(user.id)}`)
        if (!response.ok) {
          setDefaultItemWarehouseId(null)
          return
        }
        const data = await response.json()
        setDefaultItemWarehouseId(data?.default_item_warehouse_id ?? null)
      } catch (error) {
        console.error("Failed to load user default warehouse:", error)
        setDefaultItemWarehouseId(null)
      } finally {
        setDefaultWarehouseLoading(false)
      }
    }

    void loadDefaultWarehouse()
  }, [user?.id])

  // F2 لبحث العملاء أثناء فتح النافذة، بنفس اختصار نموذج طلبية المبيعات الكامل
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => { if (!workspaceTabActive.current) return;
      if (e.key === "F2" && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setShowCustomerSearch(true)
      }
      if (e.key === "F3" && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setShowProductSearch(true)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open])

  // 2026-11-24: اختيار من بحث الحسابات (مثل طلبية المبيعات الكاملة) بدل بحث العملاء
  const handleCustomerSelect = (selected: AccountItem & Record<string, any>) => {
    setCustomer({
      id: selected.id,
      name: selected.name || selected.customer_name || "",
      customer_code: selected.code || selected.customer_code,
      mobile1: selected.mobile1 || "",
    })
    setShowCustomerSearch(false)
  }

  const handleProductSelect = (products: any[]) => {
    const product = products?.[0]
    setShowProductSearch(false)
    if (!product) return

    const unit = product.selected_unit || product.units?.[0]
    // 2026-11-24: سعر الوحدة (أو سعر الصنف إن كانت 0) + فرق سعر قيمة المتغير المختارة بفئة السعر 1
    const basePrice = Number(unit?.price) || Number(product.first_price) || 0
    let price = basePrice
    for (const [group, value] of Object.entries((product.selected_attributes || {}) as Record<string, string>)) {
      const attribute = (Array.isArray(product.attributes) ? product.attributes : []).find((row: any) => row?.name === group)
      if (attribute) price += Number(categoryAttributeDeltas(attribute, basePrice, 1)[value] || 0)
    }

    setItems((prev) => {
      // أول سطر فارغ يُملأ مباشرة بدل إضافة سطر جديد، وإلا يُضاف سطر جديد بنهاية القائمة
      const emptyIndex = prev.findIndex((it) => !it.product_id)
      const filledRow: QuickOrderItem = {
        rowId: emptyIndex >= 0 ? prev[emptyIndex].rowId : Math.random().toString(36).slice(2),
        product_id: product.id,
        product_name: product.product_name,
        barcode: unit?.barcode || product.first_barcode || null,
        unit_id: unit?.unit_id ?? null,
        unit_name: unit?.unit_name || product.first_unit || "",
        qty: 1,
        price: Math.round(price * 10000) / 10000,
        discount: 0,
        measurment_id: product.measurment_id != null ? Number(product.measurment_id) : 1,
        product_length: product.length != null ? Number(product.length) : null,
        product_width: product.width != null ? Number(product.width) : null,
        product_density: product.density != null ? Number(product.density) : null,
        length: null,
        width: null,
        height: null,
        count: 1,
      }

      if (emptyIndex >= 0) {
        const next = [...prev]
        next[emptyIndex] = filledRow
        return next
      }
      return [...prev, filledRow]
    })
  }

  const updateItem = (rowId: string, field: "qty" | "price" | "discount", value: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.rowId !== rowId) return item
        if (value === "") return { ...item, [field]: "" }
        const numeric = Number(value)
        if (Number.isNaN(numeric)) return item
        return { ...item, [field]: numeric }
      }),
    )
  }

  const removeItem = (rowId: string) => {
    setItems((prev) => {
      const next = prev.filter((item) => item.rowId !== rowId)
      return next.length > 0 ? next : [emptyItem()]
    })
  }

  const openMeasurementDialog = (item: QuickOrderItem) => {
    if (item.product_id && Number(item.measurment_id || 1) !== 1) {
      setMeasurementItemId(item.rowId)
    }
  }

  const measurementItem = measurementItemId ? items.find((item) => item.rowId === measurementItemId) : undefined

  const totalAmount = items.reduce((sum, item) => sum + amountOf(item), 0)

  const validateOrder = (): { validItems: QuickOrderItem[] } | null => {
    if (!customer || !customer.id) {
      Util.showErrorToast(toast.current, tr("يجب اختيار العميل"))
      return null
    }

    const validItems = items.filter((item) => item.product_id)
    if (validItems.length === 0) {
      Util.showErrorToast(toast.current, tr("يجب ادخال صنف واحد على الأقل"))
      return null
    }

    for (const item of validItems) {
      const qty = Number(item.qty) || 0
      if (qty <= 0) {
        Util.showErrorToast(toast.current, tr("يجب ادخال الكمية للصنف ") + item.product_name)
        return null
      }

      const price = Number(item.price) || 0
      const discount = Number(item.discount) || 0
      if (discount > qty * price) {
        Util.showErrorToast(toast.current, tr("مبلغ الخصم اكبر من مبلغ الصنف ") + item.product_name)
        return null
      }
    }

    if (totalAmount < 0) {
      Util.showErrorToast(toast.current, tr("مجموع الطلبية غير منطقي يرجى التأكد من المدخلات"))
      return null
    }

    return { validItems }
  }

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault()

    const validated = validateOrder()
    if (!validated) return

    if (!user?.id) {
      Util.showErrorToast(toast.current, tr("المستخدم غير معرف يرجى تسجيل الدخول من جديد"))
      return
    }

    setIsSubmitting(true)
    try {
      const orderData = {
        id: 0,
        order_date: orderDate,
        customer_id: customer!.id,
        customer_name: customer!.name,
        customer_phone: customer!.mobile1 || "",
        currency_id: 1,
        exchange_rate: 1,
        total_amount: totalAmount,
        order_type: SALES_ORDER_TYPE,
        order_status: 1,
        order_status2: 1,
        order_decision: 1,
        general_notes: notes || "",
        user_id: user.id,
        branch_id: activeBranchId ?? null,
      }

      const orderItems = validated.validItems.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.qty) || 0,
        price: Number(item.price) || 0,
        bonus: 0,
        discount: Number(item.discount) || 0,
        barcode: item.barcode || null,
        unit_id: item.unit_id || null,
        store_id: defaultItemWarehouseId ?? null,
        delivered_quantity: 0,
        expiry_date: null,
        batch_number: null,
        item_status: 1,
      }))

      const response = await fetch("/api/orders/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderData, items: orderItems }),
      })

      if (!response.ok) {
        const responseText = await response.text()
        let errorData: any
        try {
          errorData = JSON.parse(responseText)
        } catch {
          errorData = { error: `HTTP ${response.status}: ${responseText}` }
        }
        Util.showErrorToast(toast.current, errorData.error || tr("فشل في حفظ طلبية المبيعات"))
        return
      }

      const result = await response.json()
      toast.current?.show({
        severity: "success",
        summary: "",
        detail: tr("تم حفظ الطلبية بنجاح{0}", result?.order_number ? " رقم " + result.order_number : ""),
        life: 3000,
      })

      // فتح خطوات سير العمل ("تتبع أوامر العمل") لأصناف الطلبية أثر جانبي أفضل جهد بالخادم — قد يفشل
      // بصمت (لا يوجد سير عمل عام/خاص مطابق لهذا الصنف/الفرع بعد) دون أن يمنع حفظ الطلبية نفسها؛
      // النافذة السريعة تستخدم نفس نقطة الحفظ التي تستخدمها شاشة طلبية المبيعات الكاملة، فتُظهر هنا
      // تنبيهاً صريحاً إن لم تُفتح الخطوات بدل ترك المستخدم يظن أن هذا مسار مختلف لا يدعم التتبع.
      if (result?._taskTracking && result._taskTracking.opened < result._taskTracking.attempted) {
        Util.showErrorToast(
          toast.current,
          result._taskTracking.opened === 0
            ? tr("تم حفظ الطلبية لكن لم يتم فتح خطوات سير العمل — تأكد من وجود سير عمل مطابق لهذه الأصناف من شاشة إدارة الأقسام ومخطط سير العمل")
            : tr("تم حفظ الطلبية، لكن تعذّر فتح خطوات سير العمل لبعض الأصناف"),
        )
      }

      onOrderSaved?.(result)
      resetForm()
      onOpenChange(false)
    } catch (err) {
      console.error("Error saving quick sales order:", err)
      Util.showErrorToast(toast.current, tr("حدث خطأ أثناء حفظ البيانات"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent
        className="flex max-h-[92vh] max-w-4xl flex-col gap-0 overflow-hidden rounded-3xl p-0"
        dir={appDir()}
        // ProductSearchPopup يُركَّب عبر createPortal مباشرة إلى document.body (خارج شجرة DOM لهذه
        // النافذة تماماً)، خلافاً لـCustomerSearchPopup التي تُعرَض ضمن الشجرة نفسها بلا portal —
        // فتُعامِل Radix أي تفاعل (نقر/تركيز/Escape) داخل نافذة بحث الأصناف كتفاعل "خارج" هذه
        // الـDialog وتُغلقها تلقائياً، فتُغلَق نافذة الطلبية السريعة كاملة معها. تُمنَع هذه الإغلاقات
        // التلقائية طالما نافذة بحث الأصناف مفتوحة — إغلاقها هي نفسها يبقى بيد onClose/Escape الخاصين
        // بها فقط.
        // 2026-11-24: النقر خارج النافذة لا يغلق الطلبية (الإغلاق بزر X/إلغاء/Escape فقط)
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (showProductSearch || showCustomerSearch || measurementItem) e.preventDefault() }}
      >
        <Toast ref={toast} position="top-left" className="erp-toast-host" style={{ top: 100, whiteSpace: "pre-line" }} />

        {/* 2026-11-24: تصميم جديد — ترويسة بتدرّج النظام، بطاقة العميل، جدول أصناف مضغوط، وشريط إجمالي ثابت */}
        <DialogHeader className="relative shrink-0 overflow-hidden bg-gradient-to-l from-[#137a68] via-[#16917a] to-[#1fae8e] px-6 pb-5 pt-5 text-white">
          <div className="flex flex-wrap items-center gap-3 pe-10">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25"><ShoppingCart className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-start text-xl font-black text-white">{tr("طلبية مبيعات سريعة")}</DialogTitle>
              <p className="mt-0.5 text-xs text-emerald-50/80">{tr("اختر الحساب وأضف الأصناف ثم احفظ")}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[11px] font-bold">{tr("F2: بحث عميل")}</span>
              <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[11px] font-bold">{tr("F3: بحث صنف")}</span>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSaveOrder} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <button
                type="button"
                onClick={() => setShowCustomerSearch(true)}
                className={`group flex min-w-0 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-start transition ${customer ? "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300" : "border-dashed border-slate-300 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/40"} dark:border-slate-700 dark:bg-slate-900`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${customer ? "bg-emerald-600 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"}`}><UserSearch className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-slate-500">{tr("العميل *")}</span>
                  <span className={`block truncate text-sm font-extrabold ${customer ? "text-slate-800 dark:text-slate-100" : "text-slate-400"}`}>{customer?.name || tr("-- اختر العميل --")}</span>
                  {customer?.customer_code && <span className="block font-mono text-[11px] text-slate-500" dir="ltr">{customer.customer_code}</span>}
                </span>
                <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100 group-hover:bg-emerald-600 group-hover:text-white">{customer ? tr("تغيير") : tr("اختيار")}</span>
              </button>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
                <Label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{tr("تاريخ الطلبية")}</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="h-9 border-0 bg-transparent px-0 text-start font-bold shadow-none focus-visible:ring-0" />
              </div>
              <div className="md:col-span-2">
                <div className="relative">
                  <StickyNote className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("ملاحظات")} className="h-11 rounded-xl ps-9 text-start" />
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-700 dark:text-slate-200">
                  {tr("الأصناف")}
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{items.filter((item) => item.product_name).length}</span>
                </h3>
                <Button type="button" size="sm" onClick={() => setShowProductSearch(true)} className="h-8 gap-1.5 rounded-lg bg-emerald-600 font-bold hover:bg-emerald-700">
                  <Plus className="h-4 w-4" />
                  {tr("إضافة صنف")}
                </Button>
              </div>

              <div className="hidden grid-cols-[minmax(0,2.4fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_40px] gap-2 border-b border-slate-100 px-4 py-2 text-[11px] font-bold text-slate-500 md:grid dark:border-slate-800">
                <span>{tr("اسم الصنف")}</span><span>{tr("الكمية")}</span><span>{tr("السعر")}</span><span>{tr("الخصم")}</span><span className="text-end">{tr("المبلغ")}</span><span />
              </div>

              {items.every((item) => !item.product_name) && items.length <= 1 ? (
                <button type="button" onClick={() => setShowProductSearch(true)} className="flex w-full flex-col items-center gap-2 px-4 py-8 text-slate-400 hover:bg-emerald-50/40 hover:text-emerald-700">
                  <PackageOpen className="h-8 w-8" />
                  <span className="text-sm font-bold">{tr("لا توجد أصناف بعد — اضغط لإضافة صنف (F3)")}</span>
                </button>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((item, index) => (
                    <div key={item.rowId} className="grid grid-cols-2 items-center gap-2 px-4 py-2.5 md:grid-cols-[minmax(0,2.4fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_40px]">
                      <div className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-500">{index + 1}</span>
                        <span className="truncate text-sm font-bold text-slate-800 dark:text-slate-100" title={item.product_name || ""}>{item.product_name || "—"}</span>
                      </div>
                      <label className="min-w-0">
                        <span className="mb-0.5 block text-[10px] font-bold text-slate-400 md:hidden">{tr("الكمية")}</span>
                        <Input
                          type="number"
                          value={item.qty}
                          onChange={(e) => updateItem(item.rowId, "qty", e.target.value)}
                          onFocus={() => openMeasurementDialog(item)}
                          onClick={() => openMeasurementDialog(item)}
                          readOnly={Number(item.measurment_id || 1) !== 1}
                          className="h-9 rounded-lg text-start tabular-nums"
                        />
                      </label>
                      <label className="min-w-0">
                        <span className="mb-0.5 block text-[10px] font-bold text-slate-400 md:hidden">{tr("السعر")}</span>
                        <Input type="number" step="0.01" value={item.price} onChange={(e) => updateItem(item.rowId, "price", e.target.value)} className="h-9 rounded-lg text-start tabular-nums" />
                      </label>
                      <label className="min-w-0">
                        <span className="mb-0.5 block text-[10px] font-bold text-slate-400 md:hidden">{tr("الخصم")}</span>
                        <Input type="number" step="0.01" value={item.discount} onChange={(e) => updateItem(item.rowId, "discount", e.target.value)} className="h-9 rounded-lg text-start tabular-nums" />
                      </label>
                      <span className="text-end text-sm font-extrabold tabular-nums text-slate-800 dark:text-slate-100">{amountOf(item).toFixed(2)}</span>
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(item.rowId)} className="h-8 w-8 justify-self-end rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600" aria-label={tr("حذف")}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3.5 dark:border-slate-700 dark:bg-slate-950">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-slate-500">{tr("الإجمالي:")}</span>
              <span className="text-2xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">{totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="h-10 rounded-xl px-5">
                {tr("إلغاء")}
              </Button>
              <Button type="submit" disabled={isSubmitting} className="h-10 gap-2 rounded-xl bg-emerald-600 px-6 font-bold hover:bg-emerald-700">
                <Save className="h-4 w-4" />
                {isSubmitting ? tr("جاري الحفظ...") : tr("حفظ الطلبية")}
              </Button>
            </div>
          </div>
        </form>

        <AccountSearchDialog
          open={showCustomerSearch}
          onOpenChange={setShowCustomerSearch}
          accounts={[]}
          allowedTypeValues={[2, 3, 5, 6]}
          onSelect={handleCustomerSelect}
        />
        <ProductSearchPopup
          visible={showProductSearch}
          onClose={() => setShowProductSearch(false)}
          onSelect={handleProductSelect}
          priceCategoryId={1}
          ShowSelect={false}
          searchText=""
        />
        <MeasurementInputDialog
          open={Boolean(measurementItem)}
          onOpenChange={(next) => {
            if (!next) setMeasurementItemId(null)
          }}
          measurmentId={Number(measurementItem?.measurment_id || 1)}
          productName={measurementItem?.product_name}
          initialValues={measurementItem ? {
            length: measurementItem.length,
            width: measurementItem.width,
            height: measurementItem.height,
            count: measurementItem.count,
          } : undefined}
          productLength={measurementItem?.product_length}
          productWidth={measurementItem?.product_width}
          productDensity={measurementItem?.product_density}
          onConfirm={(values, quantity) => {
            if (!measurementItemId) return
            setItems((prev) => prev.map((item) => item.rowId === measurementItemId
              ? { ...item, ...values, qty: quantity }
              : item))
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
