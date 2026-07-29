"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// نفس دوال measurementRequires*/معادلة الكمية المكرَّرة في unified-stock-voucher.tsx وunified-
// sales-delivery.tsx حرفياً (recalcQuantityFromMeasurement) — معاد كتابتها هنا مرة ثالثة بدل
// استيرادها، لنفس السبب الذي تشرحه تعليقات تلك الملفات: كل ملف يملك نوع صف (VoucherItemRow/
// SalesVoucherItemRow) مختلفاً بنيوياً عن الآخر، فتفشل مطابقة الأنواع عند التمرير المباشر.
export const measurementRequiresLength = (measurmentId: number): boolean => [2, 3, 4, 5, 8, 9, 10].includes(measurmentId)
export const measurementRequiresWidth = (measurmentId: number): boolean => [2, 3, 6, 8, 9].includes(measurmentId)
export const measurementRequiresHeight = (measurmentId: number): boolean => measurmentId === 3
export const measurementRequiresCount = (measurmentId: number): boolean => measurmentId !== 1

export interface MeasurementDialogValues {
  length: number | null
  width: number | null
  height: number | null
  count: number | null
}

export const recalcQuantityFromMeasurementValues = (
  measurmentId: number,
  values: MeasurementDialogValues,
  productLength: number,
  productWidth: number,
  productDensity: number,
): number => {
  const length = Number(values.length || 0)
  const width = Number(values.width || 0)
  const height = Number(values.height || 0)
  const count = Number(values.count || 0)
  switch (measurmentId) {
    case 2:
    case 8:
      return width * length * count
    case 3:
      return length * width * height * count
    case 4:
    case 5:
      return length * count
    case 6:
      return (2 * length + 2 * width) * count
    case 7:
      return count
    case 9:
      return (productLength * length + productWidth * width) * count
    case 10:
      return productDensity * length * count
    default:
      return count
  }
}

interface MeasurementInputDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  measurmentId: number
  productName?: string
  initialValues?: MeasurementDialogValues
  // أبعاد الصنف الافتراضية (نوعا القياس 9/10 فقط) — products.length/width/density.
  productLength?: number | null
  productWidth?: number | null
  productDensity?: number | null
  onConfirm: (values: MeasurementDialogValues, quantity: number) => void
}

const emptyValues: MeasurementDialogValues = { length: null, width: null, height: null, count: null }

// نافذة "بيانات القياس" — تجمع الطول/العرض/الارتفاع/العدد (أياً منها يتطلبه نوع قياس الصنف الحالي
// فقط، مطابقاً لِـshowLengthColumn وأخواتها سابقاً بمستوى الشبكة كاملة، والآن بمستوى السطر هنا) بدل
// إدخالها كأعمدة شبكة منفصلة، وتحتسب الكمية تلقائياً من نفس معادلة unified-stock-voucher.tsx —
// الكمية لا تُكتَب يدوياً إطلاقاً لصنف نوع قياسه غير عادي.
export default function MeasurementInputDialog({
  open,
  onOpenChange,
  measurmentId,
  productName,
  initialValues,
  productLength,
  productWidth,
  productDensity,
  onConfirm,
}: MeasurementInputDialogProps) {
  const [values, setValues] = useState<MeasurementDialogValues>(emptyValues)

  useEffect(() => {
    if (open) {
      setValues({ ...emptyValues, ...initialValues })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const needsLength = measurementRequiresLength(measurmentId)
  const needsWidth = measurementRequiresWidth(measurmentId)
  const needsHeight = measurementRequiresHeight(measurmentId)
  const needsCount = measurementRequiresCount(measurmentId)

  const lengthInputRef = useRef<HTMLInputElement>(null)
  const widthInputRef = useRef<HTMLInputElement>(null)
  const heightInputRef = useRef<HTMLInputElement>(null)
  const countInputRef = useRef<HTMLInputElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  // ترتيب الحقول المعروضة فعلياً (طول←عرض←ارتفاع←عدد، متخطّياً غير المطلوب منها لنوع القياس
  // الحالي) — يُستخدَم لكل من: (أ) تركيز أول حقل عند الفتح، (ب) تنقّل Enter بين الحقول أدناه.
  const fieldRefs = [
    needsLength ? lengthInputRef : null,
    needsWidth ? widthInputRef : null,
    needsHeight ? heightInputRef : null,
    needsCount ? countInputRef : null,
  ].filter((ref): ref is typeof lengthInputRef => ref !== null)

  // كان autoFocus مضبوطاً فقط على حقل "الطول" — فلا يتلقى أي حقل تركيزاً فعلياً لأنواع القياس التي
  // لا تتطلب الطول (كالمحيط: عرض+عدد فقط)، فيصل Enter حينها لعنصر DialogContent نفسه بلا أثر. يُركَّز
  // هنا صراحة على أول حقل معروض فعلياً بعد أن يفتح Radix النافذة.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => fieldRefs[0]?.current?.focus())
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, measurmentId])

  // Enter يتصرّف كـTab: ينقل التركيز للحقل التالي المعروض، وعند آخر حقل ينقله لزر "موافق" (Enter
  // عليه بعدها يُفعِّل onClick الخاص به تلقائياً — سلوك المتصفح الافتراضي لعنصر button مُركَّز عليه)
  // بدل تأكيد الإدخال فوراً من أي حقل، حتى يتسنّى للمستخدم مراجعة الكمية المحتسبة قبل التأكيد.
  const focusNextField = (currentRef: RefObject<HTMLInputElement>) => {
    const index = fieldRefs.indexOf(currentRef)
    const next = fieldRefs[index + 1]
    if (next) next.current?.focus()
    else confirmButtonRef.current?.focus()
  }

  const quantity = recalcQuantityFromMeasurementValues(
    measurmentId,
    values,
    Number(productLength || 0),
    Number(productWidth || 0),
    Number(productDensity || 0),
  )

  const canConfirm =
    (!needsLength || Number(values.length) > 0) &&
    (!needsWidth || Number(values.width) > 0) &&
    (!needsHeight || Number(values.height) > 0) &&
    (!needsCount || Number(values.count) > 0)

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm(values, quantity)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm"
        dir="rtl"
        // نفس نمط AccountSearchDialog/AccountCostCenters وأخواتها (انظر تعليقها) — يمنع Radix من سرقة
        // التركيز عند الإغلاق (افتراضياً يُعيده لعنصر داخلي/document.body بدل ترك restoreGridFocus
        // بملفَي unified-stock-voucher.tsx/unified-sales-delivery.tsx يتحكّم به كاملاً)، وإلا فقد
        // يتسابق سلوك Radix الافتراضي مع استدعاء selectCell/grid.focus() هناك ويُبطِل أثره.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>بيانات القياس{productName ? ` - ${productName}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {needsLength && (
            <div className="grid gap-1.5">
              <Label htmlFor="measurement-length">الطول</Label>
              <Input
                id="measurement-length"
                type="number"
                ref={lengthInputRef}
                value={values.length ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, length: e.target.value === "" ? null : Number(e.target.value) }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    focusNextField(lengthInputRef)
                  }
                }}
              />
            </div>
          )}
          {needsWidth && (
            <div className="grid gap-1.5">
              <Label htmlFor="measurement-width">العرض</Label>
              <Input
                id="measurement-width"
                type="number"
                ref={widthInputRef}
                value={values.width ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, width: e.target.value === "" ? null : Number(e.target.value) }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    focusNextField(widthInputRef)
                  }
                }}
              />
            </div>
          )}
          {needsHeight && (
            <div className="grid gap-1.5">
              <Label htmlFor="measurement-height">الارتفاع</Label>
              <Input
                id="measurement-height"
                type="number"
                ref={heightInputRef}
                value={values.height ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, height: e.target.value === "" ? null : Number(e.target.value) }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    focusNextField(heightInputRef)
                  }
                }}
              />
            </div>
          )}
          {needsCount && (
            <div className="grid gap-1.5">
              <Label htmlFor="measurement-count">العدد</Label>
              <Input
                id="measurement-count"
                type="number"
                ref={countInputRef}
                value={values.count ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, count: e.target.value === "" ? null : Number(e.target.value) }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    focusNextField(countInputRef)
                  }
                }}
              />
            </div>
          )}
          <div className="flex items-center justify-between rounded-md bg-slate-50 p-2 text-sm">
            <span className="text-muted-foreground">الكمية المحتسبة</span>
            <span className="font-bold">{quantity.toLocaleString()}</span>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button ref={confirmButtonRef} onClick={handleConfirm} disabled={!canConfirm}>
            موافق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
