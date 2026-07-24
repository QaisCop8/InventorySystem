"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Check, X } from "lucide-react"
import DataGridView from "@/components/common/DataGridView"

export interface ExpiryLotOption {
  lot_number: string
  expiry_date: string | null
  available_quantity: number
  unit_cost: number
}

export interface ExpiryLotAllocation {
  batch_number: string
  expiry_date: string
  quantity: number
}

interface ItemExpiryDatePickerProps {
  open: boolean
  productId: number | null
  productCode: string
  productName: string
  requiredQuantity: number
  unitName: string
  toMainQty: number
  warehouseName: string
  warehouseId: number | null
  hasBatch: boolean
  // كميات "محجوزة" فعلياً بسطور أخرى غير محفوظة بعد في نفس الشبكة، لنفس الصنف والمستودع — مفتاحها
  // "رقم_تشغيلي||تاريخ_صلاحية" (YYYY-MM-DD)، وقيمتها بالوحدة الرئيسية (بعد ضربها بـto_main_qnty
  // الخاص بوحدة كل سطر آخر). تُطرَح من الكمية المتاحة لكل دفعة قبل عرضها — وإلا يرى المستخدم نفس
  // "المتاح" الكامل عند إضافة نفس الصنف بسطر ثانٍ رغم أن السطر الأول استهلك منه بالفعل.
  reservedByLot?: Record<string, number>
  onConfirm: (allocations: ExpiryLotAllocation[]) => void
  onCancel: () => void
}

// نافذة اختيار الدفعة/تاريخ الصلاحية عند إدخال الكمية لصنف له تتبع صلاحية/رقم تشغيلي في سندات
// اخراج بضاعة/استعمال/ارسالية داخلية — مطابقة تصميماً لِـItemExpiryDate.js في النظام المرجعي
// القديم (حقول الكمية/الوحدة/المستودع للقراءة فقط، خانة توزيع تلقائي، شبكة دفعات، زرَّا تأكيد/
// إلغاء دائريان) لكن مبنية على DataGridView (نفس مكوّن بقية شاشات هذا المشروع) وبيانات
// voucher_items_tbl الفعلية بدل جدول دفعات منفصل غير موجود في هذه القاعدة.
export default function ItemExpiryDatePicker({
  open,
  productId,
  productCode,
  productName,
  requiredQuantity,
  unitName,
  toMainQty,
  warehouseName,
  warehouseId,
  hasBatch,
  reservedByLot,
  onConfirm,
  onCancel,
}: ItemExpiryDatePickerProps) {
  const [loading, setLoading] = useState(false)
  const [lots, setLots] = useState<ExpiryLotOption[]>([])
  const [allocated, setAllocated] = useState<Record<number, number>>({})
  // "توزيع الكميات على تواريخ الصلاحية حسب الاقدم فالاحدث" — عند التفعيل (الافتراضي) تُوزَّع الكمية
  // المطلوبة تلقائياً FIFO عبر الدفعات؛ عند الإلغاء تبقى كل الدفعات صفراً لتعبئة يدوية بالكامل.
  const [distribute, setDistribute] = useState(true)

  const allocateFifo = (data: ExpiryLotOption[]): Record<number, number> => {
    let remaining = requiredQuantity
    const next: Record<number, number> = {}
    data.forEach((lot, index) => {
      if (remaining <= 0) return
      const take = Math.min(lot.available_quantity, remaining)
      if (take > 0) {
        next[index] = take
        remaining -= take
      }
    })
    return next
  }

  useEffect(() => {
    if (!open || !productId || !warehouseId) return
    setLoading(true)
    setLots([])
    setAllocated({})
    setDistribute(true)
    fetch(
      `/api/inventory/products/expiry-lots?product_id=${productId}&warehouse_id=${warehouseId}&to_main_qnty=${toMainQty || 1}`,
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ExpiryLotOption[]) => {
        const adjusted = data.map((lot) => {
          const key = `${lot.lot_number || ""}||${lot.expiry_date ? lot.expiry_date.slice(0, 10) : ""}`
          const reservedMainUnit = reservedByLot?.[key] || 0
          const reservedInLotUnit = reservedMainUnit / (toMainQty || 1)
          return { ...lot, available_quantity: Math.max(0, lot.available_quantity - reservedInLotUnit) }
        })
        setLots(adjusted)
        setAllocated(allocateFifo(adjusted))
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId, warehouseId, toMainQty, requiredQuantity, reservedByLot])

  const handleDistributeChange = (checked: boolean) => {
    setDistribute(checked)
    setAllocated(checked ? allocateFifo(lots) : {})
  }

  const totalAllocated = useMemo(
    () => Object.values(allocated).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [allocated],
  )

  const gridDataSource = useMemo(
    () =>
      lots.map((lot, index) => ({
        ser: index + 1,
        batch_number: lot.lot_number || "",
        expiry_date_display: lot.expiry_date ? lot.expiry_date.slice(0, 10) : "-",
        available_quantity: lot.available_quantity,
        out_quantity: allocated[index] ?? 0,
      })),
    [lots, allocated],
  )

  const scheme = useMemo(
    () => ({
      name: "ExpiryLotsScheme",
      showFooter: false,
      columns: [
        { header: "#", name: "ser", width: 45, isReadOnly: true, dataType: "Number" },
        { header: "الرقم التشغيلي", name: "batch_number", width: '*', minWidth: 120, isReadOnly: true, visible: hasBatch },
        { header: "تاريخ انتهاء الصلاحية", name: "expiry_date_display", width: '*', minWidth: 120, isReadOnly: true },
        { header: "الكمية المتوفرة", name: "available_quantity", width: 130, isReadOnly: true, dataType: "Number" },
        { header: "الكمية المخرجة", name: "out_quantity", width: 130, dataType: "Number" },
      ],
    }),
    [hasBatch],
  )

  const handleCellEditEnded = (grid: any, e: any) => {
    const colName = grid?.columns?.[e.col]?.binding
    if (colName !== "out_quantity") return
    const row = e.row
    const lot = lots[row]
    if (!lot) return
    const raw = grid.getCellData(row, e.col, false)
    const clamped = Math.max(0, Math.min(lot.available_quantity, Number(raw) || 0))
    setAllocated((prev) => ({ ...prev, [row]: clamped }))
  }

  const handleConfirm = () => {
    const allocations: ExpiryLotAllocation[] = lots
      .map((lot, index) => ({ lot, qty: Number(allocated[index] || 0) }))
      .filter(({ qty }) => qty > 0)
      .map(({ lot, qty }) => ({
        batch_number: lot.lot_number,
        expiry_date: lot.expiry_date || "",
        quantity: qty,
      }))
    if (allocations.length === 0) return
    onConfirm(allocations)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <DialogContent
        hideCloseButton
        className="max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl"
        dir="rtl"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            className="h-8 w-8 rounded-full border border-slate-200 bg-white p-0 text-slate-500 shadow-sm hover:bg-slate-100"
            aria-label="إغلاق"
            title="إغلاق"
          >
            <X className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-extrabold text-blue-700">
            تواريخ الصلاحية للصنف / {productName}
            {productCode ? ` — ${productCode}` : ""}
          </h2>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <Label>الكمية</Label>
              <Input value={requiredQuantity} readOnly disabled className="text-right" />
            </div>
            <div className="grid gap-1.5">
              <Label>الوحدة</Label>
              <Input value={unitName} readOnly disabled className="text-right" />
            </div>
            <div className="grid gap-1.5">
              <Label>المستودع</Label>
              <Input value={warehouseName} readOnly disabled className="text-right" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="distribute_expiry_qty"
              checked={distribute}
              onCheckedChange={(checked) => handleDistributeChange(checked === true)}
            />
            <Label htmlFor="distribute_expiry_qty" className="cursor-pointer text-sm font-medium">
              توزيع الكميات على تواريخ الصلاحية حسب الاقدم فالاحدث
            </Label>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-slate-400">جارٍ التحميل...</div>
          ) : lots.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">لا توجد دفعات متاحة لهذا الصنف</div>
          ) : (
            <div className="w-full overflow-x-auto rounded-lg border border-slate-200">
              <DataGridView
                style={{ height: 240 }}
                scheme={scheme}
                dataSource={gridDataSource}
                idProperty="ser"
                isReport={false}
                showContextMenu={false}
                dontConvertToCards={true}
                cellEditEnded={handleCellEditEnded}
              />
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
            <span>
              الإجمالي المُخصَّص: <strong>{totalAllocated}</strong> / المطلوب: <strong>{requiredQuantity}</strong>
            </span>
            {totalAllocated < requiredQuantity && (
              <span className="text-amber-600">الكمية المتاحة غير كافية للوفاء بكامل الكمية المطلوبة</span>
            )}
          </div>
        </div>

        <div className="flex justify-center gap-3 border-t border-slate-200 py-3">
          <Button
            onClick={handleConfirm}
            disabled={totalAllocated <= 0}
            className="h-9 w-9 rounded-full border border-emerald-200 bg-emerald-50 p-0 text-emerald-600 shadow-sm hover:bg-emerald-100"
            aria-label="تأكيد"
            title="تأكيد"
          >
            <Check className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            onClick={onCancel}
            className="h-9 w-9 rounded-full border border-rose-200 bg-rose-50 p-0 text-rose-600 shadow-sm hover:bg-rose-100"
            aria-label="إلغاء"
            title="إلغاء"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
