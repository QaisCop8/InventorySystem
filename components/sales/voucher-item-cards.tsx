"use client"

// أسطر الأصناف كبطاقات على الجوال بدل شبكة Wijmo — العرض فقط هنا؛ كل تعديل يمر عبر onCommit
// (نفس منطق إنهاء تحرير خلية الشبكة في الشاشة الأم) فتبقى الحسابات/النوافذ/القيود واحدة.
import { useEffect, useState } from "react"
import { tr } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Minus, Plus, Search, Trash2, SlidersHorizontal, Barcode, Warehouse, Ruler, PackagePlus } from "lucide-react"

export type ItemCardField =
  | "product"
  | "warehouse"
  | "unit"
  | "quantity"
  | "bonus_quantity"
  | "unit_price"
  | "discount_percent"
  | "total_price"
  | "note"
  | "delete"

export interface ItemCardRow {
  product_id?: number | null
  product_code?: string
  product_name?: string
  barcode?: string
  warehouse_name?: string
  unit_name?: string
  quantity?: number | null
  bonus_quantity?: number | null
  unit_price?: number | null
  discount_percent?: number | null
  total_price?: number | string | null
  note?: string
  batch_number?: string
  expiry_date?: string
  has_serial?: boolean
  serials_text?: string
  measurment_id?: number | null
}

interface VoucherItemCardsProps {
  items: ItemCardRow[]
  show: Partial<Record<"warehouse" | "unit" | "bonus" | "price" | "discount" | "batch" | "expiry", boolean>>
  canEdit: (row: number, field: ItemCardField) => boolean
  canAdd: boolean
  onCommit: (row: number, field: "quantity" | "bonus_quantity" | "unit_price" | "discount_percent" | "total_price" | "note", value: any) => void
  onAdd: () => void
  onQuickCode: (code: string) => void
  onChangeProduct: (row: number) => void
  onPickWarehouse: (row: number) => void
  onPickUnit: (row: number) => void
  onMeasurement: (row: number) => void
  onAttributes: (row: number) => void
  onSerials: (row: number) => void
  onDelete: (row: number) => void
}

const fmt = (value: unknown) => {
  const n = Number(value)
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return ""
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

// حقل يحتفظ بالمسودة أثناء الكتابة ويُرسلها عند الخروج/Enter فقط — كخلية الشبكة تماماً
function DraftInput({
  value,
  numeric = true,
  disabled,
  onCommit,
  className,
  placeholder,
}: {
  value: unknown
  numeric?: boolean
  disabled?: boolean
  onCommit: (value: any) => void
  className?: string
  placeholder?: string
}) {
  const shown = value === null || value === undefined ? "" : String(value)
  const [draft, setDraft] = useState(shown)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setDraft(shown)
  }, [shown, focused])
  const commit = () => {
    if (draft === shown) return
    if (!numeric) return onCommit(draft)
    onCommit(draft.trim() === "" ? null : draft.trim())
  }
  return (
    <Input
      value={draft}
      disabled={disabled}
      inputMode={numeric ? "decimal" : undefined}
      placeholder={placeholder}
      className={`h-10 text-center text-base ${className || ""}`}
      onFocus={(e) => {
        setFocused(true)
        e.currentTarget.select()
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur()
      }}
    />
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  )
}

export default function VoucherItemCards(props: VoucherItemCardsProps) {
  const { items, show, canEdit, canAdd } = props
  const [quickCode, setQuickCode] = useState("")
  const rows = items.map((row, index) => ({ row, index })).filter(({ row }) => row.product_id)

  const submitQuickCode = () => {
    const code = quickCode.trim()
    if (!code) return
    setQuickCode("")
    props.onQuickCode(code)
  }

  return (
    <div className="space-y-3">
      {canAdd && (
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Barcode className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={quickCode}
              onChange={(e) => setQuickCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  submitQuickCode()
                }
              }}
              placeholder={tr("رقم الصنف أو الباركود")}
              className="h-11 ps-9 text-base"
            />
          </div>
          <Button type="button" className="h-11 shrink-0 gap-1 bg-emerald-600 px-4 hover:bg-emerald-700" onClick={props.onAdd}>
            <PackagePlus className="h-5 w-5" />
            {tr("إضافة صنف")}
          </Button>
        </div>
      )}

      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{tr("لا توجد أصناف بعد")}</div>
      )}

      {rows.map(({ row, index }, position) => {
        const measured = Number(row.measurment_id || 1) !== 1
        return (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-100 px-1.5 text-xs font-bold text-emerald-700">
                {position + 1}
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-start disabled:cursor-default"
                disabled={!canEdit(index, "product")}
                onClick={() => props.onChangeProduct(index)}
              >
                <div className="truncate font-bold text-slate-800">{row.product_name || tr("اختر الصنف")}</div>
                <div className="truncate text-xs text-slate-500">
                  {[row.product_code, row.barcode && row.barcode !== row.product_code ? row.barcode : ""].filter(Boolean).join(" · ")}
                </div>
              </button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" title={tr("المتغيرات والخصائص")} onClick={() => props.onAttributes(index)}>
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
              {canEdit(index, "delete") && (
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-600 hover:bg-red-50" title={tr("حذف")} onClick={() => props.onDelete(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            {(show.unit || show.warehouse) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {show.unit && (
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1" disabled={!canEdit(index, "unit")} onClick={() => props.onPickUnit(index)}>
                    <Ruler className="h-3.5 w-3.5" />
                    {row.unit_name || tr("الوحدة")}
                  </Button>
                )}
                {show.warehouse && (
                  <Button type="button" variant="outline" size="sm" className="h-8 max-w-full gap-1" disabled={!canEdit(index, "warehouse")} onClick={() => props.onPickWarehouse(index)}>
                    <Warehouse className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{row.warehouse_name || tr("المستودع")}</span>
                  </Button>
                )}
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label={tr("الكمية")}>
                {measured ? (
                  <Button type="button" variant="outline" className="h-10 text-base" disabled={!canEdit(index, "quantity")} onClick={() => props.onMeasurement(index)}>
                    {fmt(row.quantity) || tr("بيانات القياس")}
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      disabled={!canEdit(index, "quantity") || Number(row.quantity || 0) <= 1}
                      onClick={() => props.onCommit(index, "quantity", Number(row.quantity || 0) - 1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <DraftInput value={row.quantity} disabled={!canEdit(index, "quantity")} onCommit={(v) => props.onCommit(index, "quantity", v)} />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      disabled={!canEdit(index, "quantity")}
                      onClick={() => props.onCommit(index, "quantity", Number(row.quantity || 0) + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Field>
              {show.price && (
                <Field label={tr("السعر")}>
                  <DraftInput value={row.unit_price == null ? null : Math.round(Number(row.unit_price) * 100) / 100} disabled={!canEdit(index, "unit_price")} onCommit={(v) => props.onCommit(index, "unit_price", v)} />
                </Field>
              )}
              {show.bonus && (
                <Field label={tr("البونص")}>
                  <DraftInput value={row.bonus_quantity} disabled={!canEdit(index, "bonus_quantity") || measured} onCommit={(v) => props.onCommit(index, "bonus_quantity", v)} />
                </Field>
              )}
              {show.discount && (
                <Field label={tr("الخصم %")}>
                  <DraftInput value={row.discount_percent} disabled={!canEdit(index, "discount_percent")} onCommit={(v) => props.onCommit(index, "discount_percent", v)} />
                </Field>
              )}
            </div>

            {((show.batch && row.batch_number) || (show.expiry && row.expiry_date) || row.has_serial) && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                {show.batch && row.batch_number && <span className="rounded-md bg-slate-100 px-2 py-1">{tr("الرقم التشغيلي")}: {row.batch_number}</span>}
                {show.expiry && row.expiry_date && <span className="rounded-md bg-slate-100 px-2 py-1">{tr("تاريخ الانتهاء")}: {row.expiry_date}</span>}
                {row.has_serial && (
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => props.onSerials(index)}>
                    <Barcode className="h-3.5 w-3.5" />
                    {row.serials_text || tr("الأرقام التسلسلية")}
                  </Button>
                )}
              </div>
            )}

            <div className="mt-3 flex items-end gap-2 border-t border-slate-100 pt-3">
              <div className="min-w-0 flex-1">
                <DraftInput
                  value={row.note}
                  numeric={false}
                  disabled={!canEdit(index, "note")}
                  placeholder={tr("ملاحظة")}
                  className="text-start text-sm"
                  onCommit={(v) => props.onCommit(index, "note", v)}
                />
              </div>
              <Field label={tr("المبلغ")}>
                <DraftInput
                  value={row.total_price == null || row.total_price === "" ? null : fmt(row.total_price).replace(/,/g, "")}
                  disabled={!canEdit(index, "total_price")}
                  className="w-32 font-bold text-emerald-700"
                  onCommit={(v) => props.onCommit(index, "total_price", v)}
                />
              </Field>
            </div>
          </div>
        )
      })}

      {canAdd && rows.length > 0 && (
        <Button type="button" variant="outline" className="h-11 w-full gap-1 border-dashed border-emerald-400 text-emerald-700" onClick={props.onAdd}>
          <Search className="h-4 w-4" />
          {tr("إضافة صنف")}
        </Button>
      )}
    </div>
  )
}
