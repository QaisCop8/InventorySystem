"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Plus, Save, Trash2, UserSearch } from "lucide-react"
import { Toast } from "primereact/toast"
import Util from "./common/Util"
import CustomerSearchPopup from "./products/CustomerSearchPopup"
import ProductSearchPopup from "./products/ProductSearchPopup"
import { useAuth } from "./auth/auth-context"

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
})

const amountOf = (item: QuickOrderItem) => {
  const qty = Number(item.qty) || 0
  const price = Number(item.price) || 0
  const discount = Number(item.discount) || 0
  return qty * price - discount
}

export function QuickSalesOrder({ open, onOpenChange, onOrderSaved }: QuickSalesOrderProps) {
  const { user, activeBranchId } = useAuth()
  const toast = useRef<Toast | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [showProductSearch, setShowProductSearch] = useState(false)
  const [items, setItems] = useState<QuickOrderItem[]>([emptyItem()])
  const [defaultItemWarehouseId, setDefaultItemWarehouseId] = useState<number | null>(null)
  const [defaultWarehouseLoading, setDefaultWarehouseLoading] = useState(false)

  const resetForm = () => {
    setOrderDate(new Date().toISOString().split("T")[0])
    setNotes("")
    setCustomer(null)
    setItems([emptyItem()])
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
    const handleKeyDown = (e: KeyboardEvent) => {
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

  const handleCustomerSelect = (selected: any) => {
    setCustomer({
      id: selected.id,
      name: selected.name || selected.customer_name || "",
      customer_code: selected.customer_code,
      mobile1: selected.mobile1,
    })
    setShowCustomerSearch(false)
  }

  const handleProductSelect = (products: any[]) => {
    const product = products?.[0]
    setShowProductSearch(false)
    if (!product) return

    const unit = product.selected_unit || product.units?.[0]

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
        price: unit?.price ?? product.first_price ?? 0,
        discount: 0,
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

  const totalAmount = items.reduce((sum, item) => sum + amountOf(item), 0)

  const validateOrder = (): { validItems: QuickOrderItem[] } | null => {
    if (!customer || !customer.id) {
      Util.showErrorToast(toast.current, "يجب اختيار العميل")
      return null
    }

    const validItems = items.filter((item) => item.product_id)
    if (validItems.length === 0) {
      Util.showErrorToast(toast.current, "يجب ادخال صنف واحد على الأقل")
      return null
    }

    for (const item of validItems) {
      const qty = Number(item.qty) || 0
      if (qty <= 0) {
        Util.showErrorToast(toast.current, "يجب ادخال الكمية للصنف " + item.product_name)
        return null
      }

      const price = Number(item.price) || 0
      const discount = Number(item.discount) || 0
      if (discount > qty * price) {
        Util.showErrorToast(toast.current, "مبلغ الخصم اكبر من مبلغ الصنف " + item.product_name)
        return null
      }
    }

    if (totalAmount < 0) {
      Util.showErrorToast(toast.current, "مجموع الطلبية غير منطقي يرجى التأكد من المدخلات")
      return null
    }

    return { validItems }
  }

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault()

    const validated = validateOrder()
    if (!validated) return

    if (!user?.id) {
      Util.showErrorToast(toast.current, "المستخدم غير معرف يرجى تسجيل الدخول من جديد")
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
        Util.showErrorToast(toast.current, errorData.error || "فشل في حفظ طلبية المبيعات")
        return
      }

      const result = await response.json()
      toast.current?.show({
        severity: "success",
        summary: "",
        detail: `تم حفظ الطلبية بنجاح${result?.order_number ? " رقم " + result.order_number : ""}`,
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
            ? "تم حفظ الطلبية لكن لم يتم فتح خطوات سير العمل — تأكد من وجود سير عمل مطابق لهذه الأصناف من شاشة إدارة الأقسام ومخطط سير العمل"
            : "تم حفظ الطلبية، لكن تعذّر فتح خطوات سير العمل لبعض الأصناف",
        )
      }

      onOrderSaved?.(result)
      resetForm()
      onOpenChange(false)
    } catch (err) {
      console.error("Error saving quick sales order:", err)
      Util.showErrorToast(toast.current, "حدث خطأ أثناء حفظ البيانات")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
        // ProductSearchPopup يُركَّب عبر createPortal مباشرة إلى document.body (خارج شجرة DOM لهذه
        // النافذة تماماً)، خلافاً لـCustomerSearchPopup التي تُعرَض ضمن الشجرة نفسها بلا portal —
        // فتُعامِل Radix أي تفاعل (نقر/تركيز/Escape) داخل نافذة بحث الأصناف كتفاعل "خارج" هذه
        // الـDialog وتُغلقها تلقائياً، فتُغلَق نافذة الطلبية السريعة كاملة معها. تُمنَع هذه الإغلاقات
        // التلقائية طالما نافذة بحث الأصناف مفتوحة — إغلاقها هي نفسها يبقى بيد onClose/Escape الخاصين
        // بها فقط.
        onPointerDownOutside={(e) => { if (showProductSearch) e.preventDefault() }}
        onInteractOutside={(e) => { if (showProductSearch) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (showProductSearch) e.preventDefault() }}
      >
        <Toast ref={toast} position="top-left" className="erp-toast-host" style={{ top: 100, whiteSpace: "pre-line" }} />

        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="text-right">طلبية مبيعات سريعة</DialogTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">F2: بحث عميل</Badge>
              <Badge variant="outline" className="text-xs">F3: بحث صنف</Badge>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSaveOrder} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-right block mb-2">العميل *</Label>
              <div className="flex gap-2">
                <Input
                  value={customer?.name || ""}
                  readOnly
                  placeholder="-- اختر العميل --"
                  className="text-right"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowCustomerSearch(true)}>
                  <UserSearch className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-right block mb-2">تاريخ الطلبية</Label>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="text-right"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-right block mb-2">ملاحظات</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="text-right" />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-right">الأصناف</h3>
              <Button type="button" size="sm" onClick={() => setShowProductSearch(true)}>
                <Plus className="h-4 w-4 mr-2" />
                إضافة صنف
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.rowId} className="grid grid-cols-1 md:grid-cols-6 gap-3 p-3 border rounded-lg items-end">
                  <div className="md:col-span-2">
                    <Label className="text-right block mb-1 text-sm">اسم الصنف</Label>
                    <div className="rounded-md border bg-muted px-3 py-2 text-sm text-right min-h-[38px]">
                      {item.product_name || "—"}
                    </div>
                  </div>
                  <div>
                    <Label className="text-right block mb-1 text-sm">الكمية</Label>
                    <Input
                      type="number"
                      value={item.qty}
                      onChange={(e) => updateItem(item.rowId, "qty", e.target.value)}
                      className="text-right"
                    />
                  </div>
                  <div>
                    <Label className="text-right block mb-1 text-sm">السعر</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.price}
                      onChange={(e) => updateItem(item.rowId, "price", e.target.value)}
                      className="text-right"
                    />
                  </div>
                  <div>
                    <Label className="text-right block mb-1 text-sm">الخصم</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.discount}
                      onChange={(e) => updateItem(item.rowId, "discount", e.target.value)}
                      className="text-right"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{amountOf(item).toFixed(2)}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => removeItem(item.rowId)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-semibold">الإجمالي:</span>
                <span className="text-xl font-bold">{totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              إلغاء
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="h-4 w-4 mr-2" />
              {isSubmitting ? "جاري الحفظ..." : "حفظ الطلبية"}
            </Button>
          </div>
        </form>

        <CustomerSearchPopup
          visible={showCustomerSearch}
          onClose={() => setShowCustomerSearch(false)}
          onSelect={handleCustomerSelect}
          type={1}
          vch_type={SALES_ORDER_TYPE}
        />
        <ProductSearchPopup
          visible={showProductSearch}
          onClose={() => setShowProductSearch(false)}
          onSelect={handleProductSelect}
          priceCategoryId={1}
          ShowSelect={false}
          searchText=""
        />
      </DialogContent>
    </Dialog>
  )
}
