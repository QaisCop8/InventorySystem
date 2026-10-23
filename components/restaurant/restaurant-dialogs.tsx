"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Check, Loader2, Minus, Plus, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type FloorLocation = { id: number; code: string; name: string; color: string | null; configured: boolean }
export type FloorTable = {
  id: number; name: string; seats: number; shape: string; location_id: number
  order_id: number | null; order_no: string | null; guests: number | null; opened_at: string | null; revision: number | null
  is_primary: boolean | null; opened_by_name: string | null; remaining: number; items_count: number; paid_amount: number; merged_with: string | null
}
export type OrderItem = {
  id: number; product_id: number; product_code: string; product_name: string; unit_id: number | null; unit_name: string | null
  price: number; quantity: number; paid_quantity: number; remaining_quantity: number; discount: number; note: string | null; created_at: string
  addons?: Addon[]
}
export type Addon = { group: string; value: string }
export type AddonGroup = { name: string; values: string[] }
export const addonsText = (addons?: Addon[] | null) => (addons || []).map((addon) => addon.value).join("، ")

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export const round4 = (value: number) => Math.round(value * 10000) / 10000
export const money = (value: number) => round2(value).toFixed(2)
export const qtyText = (value: number) => (Number.isInteger(value) ? String(value) : String(round4(value)))

function Stepper({ value, max, step = 1, onChange }: { value: number; max?: number; step?: number; onChange: (value: number) => void }) {
  const clamp = (next: number) => Math.max(0, max === undefined ? next : Math.min(max, next))
  return (
    <div className="flex items-center gap-1">
      <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => onChange(round4(clamp(value - step)))}><Minus className="h-4 w-4" /></Button>
      <Input type="number" inputMode="decimal" className="h-8 w-16 text-center" value={qtyText(value)} min={0} max={max}
        onChange={(event) => onChange(round4(clamp(Number(event.target.value) || 0)))} onFocus={(event) => event.currentTarget.select()} />
      <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => onChange(round4(clamp(value + step)))}><Plus className="h-4 w-4" /></Button>
    </div>
  )
}

/** اختيار طاولة/طاولات من لوحة الفرع، مجمّعة حسب الموقع */
export function TablePickerDialog(props: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string
  tables: FloorTable[]; locations: FloorLocation[]; allow: (table: FloorTable) => boolean; multiple?: boolean
  busy?: boolean; confirmLabel?: string; onConfirm: (ids: number[]) => void; children?: ReactNode
}) {
  const { open, onOpenChange, title, description, tables, locations, allow, multiple, busy, confirmLabel, onConfirm, children } = props
  const [selected, setSelected] = useState<number[]>([])
  useEffect(() => { if (open) setSelected([]) }, [open])
  const groups = useMemo(() => locations.map((location) => ({ location, tables: tables.filter((table) => table.location_id === location.id && allow(table)) })).filter((group) => group.tables.length), [locations, tables, allow])
  const toggle = (id: number) => setSelected((current) => multiple ? (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]) : [id])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="flex max-h-[calc(100%-1.5rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col">
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
        {children}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {groups.map(({ location, tables: list }) => (
            <div key={location.id}>
              <div className="mb-2 text-sm font-bold text-muted-foreground">{location.name}</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {list.map((table) => {
                  const active = selected.includes(table.id)
                  return (
                    <button key={table.id} type="button" onClick={() => toggle(table.id)}
                      className={`rounded-lg border-2 p-2 text-center text-sm transition ${active ? "border-teal-600 bg-teal-50 ring-2 ring-teal-200" : table.order_id ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50/60"}`}>
                      <div className="font-bold">{table.name}</div>
                      <div className="text-xs text-muted-foreground">{table.order_id ? `${money(table.remaining)}` : "فارغة"}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {!groups.length && <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">لا توجد طاولات متاحة</div>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button disabled={!selected.length || busy} onClick={() => onConfirm(selected)}>{busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}{confirmLabel || "تأكيد"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type EditableLine = { name: string; quantity: number; minQuantity: number; discount: number; note: string; units?: { unitId: number | null; unitName: string; price: number }[]; unitId?: number | null }

/** تعديل سطر (كمية/خصم/ملاحظة للمطبخ، والوحدة للأصناف غير المرسلة) */
export function ItemEditDialog(props: {
  open: boolean; onOpenChange: (open: boolean) => void; line: EditableLine | null; canDiscount: boolean; canDelete: boolean; canReduce: boolean
  busy?: boolean; onSave: (value: { quantity: number; discount: number; note: string; unitId?: number | null }) => void; onDelete: () => void
}) {
  const { open, onOpenChange, line, canDiscount, canDelete, canReduce, busy, onSave, onDelete } = props
  const [quantity, setQuantity] = useState(1)
  const [discount, setDiscount] = useState(0)
  const [note, setNote] = useState("")
  const [unitId, setUnitId] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    if (!open || !line) return
    setQuantity(line.quantity); setDiscount(line.discount); setNote(line.note); setUnitId(line.unitId)
  }, [open, line])
  if (!line) return null
  const minimum = canReduce ? Math.max(line.minQuantity, 0) : line.quantity
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="w-[calc(100vw-1rem)] max-w-sm">
        <DialogHeader><DialogTitle>{line.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2"><Label>الكمية</Label><Stepper value={quantity} onChange={(value) => setQuantity(Math.max(minimum, value))} /></div>
          {line.minQuantity > 0 && <p className="text-xs text-amber-700">مدفوع منه {qtyText(line.minQuantity)} — لا تقل الكمية عن ذلك</p>}
          {line.units && line.units.length > 1 && (
            <div className="space-y-1">
              <Label>الوحدة</Label>
              <Select value={String(unitId ?? "")} onValueChange={(value) => setUnitId(Number(value) || null)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{line.units.map((unit) => <SelectItem key={String(unit.unitId)} value={String(unit.unitId ?? "")}>{unit.unitName} — {money(unit.price)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {canDiscount && <div className="flex items-center justify-between gap-2"><Label>خصم %</Label><Input type="number" min={0} max={100} className="w-24" value={discount} onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /></div>}
          <div className="space-y-1"><Label>ملاحظة للمطبخ</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="بدون بصل، حار..." /></div>
        </div>
        <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-between">
          {canDelete ? <Button variant="outline" className="text-red-600" disabled={busy} onClick={onDelete}><Trash2 className="ml-1 h-4 w-4" />حذف</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button disabled={busy || !(quantity > 0)} onClick={() => onSave({ quantity, discount, note, unitId })}>{busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}<Check className="ml-1 h-4 w-4" />حفظ</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** كميات لكل سطر غير مدفوع — للفصل (نقل لطاولة أخرى) وللدفع الجزئي */
export function LineQuantities({ items, values, onChange }: { items: OrderItem[]; values: Record<number, number>; onChange: (values: Record<number, number>) => void }) {
  const open = items.filter((item) => item.remaining_quantity > 0)
  return (
    <div className="max-h-[45vh] space-y-2 overflow-y-auto">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onChange(Object.fromEntries(open.map((item) => [item.id, item.remaining_quantity])))}>تحديد الكل</Button>
        <Button size="sm" variant="ghost" onClick={() => onChange({})}>إلغاء التحديد</Button>
      </div>
      {open.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{item.product_name}</div>
            <div className="text-xs text-muted-foreground">المتاح {qtyText(item.remaining_quantity)} × {money(item.price * (1 - item.discount / 100))}</div>
          </div>
          <Stepper value={values[item.id] || 0} max={item.remaining_quantity} onChange={(value) => onChange({ ...values, [item.id]: value })} />
        </div>
      ))}
    </div>
  )
}

export type PayScope = { mode: "all" | "items" | "equal"; quantities: Record<number, number>; people: number; share: number }

/** اختيار ما سيُدفع: كامل المتبقي، أصناف/كميات محددة، أو حصة متساوية (عدد الأشخاص) */
export function PayScopeDialog(props: {
  open: boolean; onOpenChange: (open: boolean) => void; items: OrderItem[]; guests: number
  amountFor: (lines: { item: OrderItem; quantity: number }[]) => number; onContinue: (lines: { item: OrderItem; quantity: number }[], partial: boolean) => void
  currencyCode: string; busy?: boolean
}) {
  const { open, onOpenChange, items, guests, amountFor, onContinue, currencyCode, busy } = props
  const [scope, setScope] = useState<PayScope>({ mode: "all", quantities: {}, people: 2, share: 1 })
  useEffect(() => { if (open) setScope({ mode: "all", quantities: {}, people: Math.max(2, guests || 2), share: 1 }) }, [open, guests])
  const remainingItems = items.filter((item) => item.remaining_quantity > 0)
  const lines = useMemo(() => {
    if (scope.mode === "all") return remainingItems.map((item) => ({ item, quantity: item.remaining_quantity }))
    if (scope.mode === "items") return remainingItems.map((item) => ({ item, quantity: scope.quantities[item.id] || 0 })).filter((line) => line.quantity > 0)
    const people = Math.max(1, Math.trunc(scope.people)), share = Math.min(people, Math.max(1, Math.trunc(scope.share)))
    if (share >= people) return remainingItems.map((item) => ({ item, quantity: item.remaining_quantity }))
    return remainingItems.map((item) => ({ item, quantity: round4(item.remaining_quantity * share / people) })).filter((line) => line.quantity > 0)
  }, [scope, remainingItems])
  const amount = amountFor(lines)
  const total = amountFor(remainingItems.map((item) => ({ item, quantity: item.remaining_quantity })))
  const partial = lines.some((line) => line.quantity < line.item.remaining_quantity - 0.00001) || lines.length < remainingItems.length
  const tabs: { key: PayScope["mode"]; label: string }[] = [{ key: "all", label: "كامل الحساب" }, { key: "items", label: "أصناف محددة" }, { key: "equal", label: "تقسيم بالتساوي" }]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="flex max-h-[calc(100%-1.5rem)] w-[calc(100vw-1rem)] max-w-lg flex-col">
        <DialogHeader><DialogTitle>دفع حساب الطاولة</DialogTitle><DialogDescription>المتبقي على الطاولة {money(total)} {currencyCode}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" onClick={() => setScope({ ...scope, mode: tab.key })}
              className={`rounded-md px-2 py-2 text-xs font-bold sm:text-sm ${scope.mode === tab.key ? "bg-background shadow" : "text-muted-foreground"}`}>{tab.label}</button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {scope.mode === "all" && <p className="rounded-lg bg-emerald-50 p-4 text-center text-sm">سيتم دفع كامل المتبقي وإغلاق الطاولة.</p>}
          {scope.mode === "items" && <LineQuantities items={items} values={scope.quantities} onChange={(quantities) => setScope({ ...scope, quantities })} />}
          {scope.mode === "equal" && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
              <div className="space-y-1"><Label className="flex items-center gap-1"><Users className="h-4 w-4" />عدد الأشخاص</Label><Input type="number" min={1} value={scope.people} onChange={(e) => setScope({ ...scope, people: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} /></div>
              <div className="space-y-1"><Label>يدفع الآن عن</Label><Input type="number" min={1} max={scope.people} value={scope.share} onChange={(e) => setScope({ ...scope, share: Math.max(1, Math.min(scope.people, Math.trunc(Number(e.target.value) || 1))) })} /></div>
              <p className="col-span-2 text-xs text-muted-foreground">حصة كل شخص ≈ {money(total / Math.max(1, scope.people))} {currencyCode}. بعد كل دفعة يُحسب الباقي على من تبقى.</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-white"><span>المبلغ المطلوب الآن</span><strong className="text-lg">{money(amount)} {currencyCode}</strong></div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button disabled={!lines.length || !(amount > 0) || busy} onClick={() => onContinue(lines, partial)}>متابعة للدفع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** إضافات السطر: مجموعات "المتغيرات والخصائص" من تعريف الصنف، اختيار متعدد لكل مجموعة + ملاحظة للمطبخ */
export function AddonsDialog(props: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; groups: AddonGroup[]; selected: Addon[]; note: string
  busy?: boolean; onSave: (addons: Addon[], note: string) => void
}) {
  const { open, onOpenChange, title, groups, selected, note, busy, onSave } = props
  const [picked, setPicked] = useState<Addon[]>([])
  const [text, setText] = useState("")
  useEffect(() => { if (open) { setPicked(selected); setText(note) } }, [open, selected, note])
  const has = (group: string, value: string) => picked.some((addon) => addon.group === group && addon.value === value)
  const toggle = (group: string, value: string) => setPicked((current) => has(group, value) ? current.filter((addon) => !(addon.group === group && addon.value === value)) : [...current, { group, value }])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="flex max-h-[calc(100%-1.5rem)] w-[calc(100vw-1rem)] max-w-lg flex-col">
        <DialogHeader><DialogTitle>إضافات — {title}</DialogTitle><DialogDescription>اختر الإضافات لتظهر على الطلب وفي قسيمة المطبخ</DialogDescription></DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.name}>
              <div className="mb-2 text-sm font-bold text-muted-foreground">{group.name}</div>
              <div className="flex flex-wrap gap-2">
                {group.values.map((value) => {
                  const active = has(group.name, value)
                  return (
                    <button key={value} type="button" onClick={() => toggle(group.name, value)}
                      className={`min-h-11 rounded-full border-2 px-4 text-sm font-semibold transition ${active ? "border-rose-600 bg-rose-600 text-white" : "border-slate-200 bg-background hover:border-rose-300"}`}>
                      {active && <Check className="ml-1 inline h-4 w-4" />}{value}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {!groups.length && <p className="rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">لا توجد إضافات معرّفة لهذا الصنف (تُعرّف من تبويب "المتغيرات والخصائص" في تعريف الصنف)</p>}
          <div className="space-y-1"><Label>ملاحظة للمطبخ</Label><Textarea rows={2} value={text} onChange={(event) => setText(event.target.value)} placeholder="بدون بصل، حار..." /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button disabled={busy} onClick={() => onSave(picked, text.trim())}>{busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}<Check className="ml-1 h-4 w-4" />حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** نافذة إدخال قيمة واحدة داخل التطبيق (بدل window.prompt) — رقم مع أزرار سريعة، أو نص */
export function ValueDialog(props: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; label: string; value: string
  kind?: "number" | "text"; min?: number; max?: number; suffix?: string; presets?: number[]; placeholder?: string
  busy?: boolean; onConfirm: (value: string) => void
}) {
  const { open, onOpenChange, title, label, value, kind = "text", min, max, suffix, presets, placeholder, busy, onConfirm } = props
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  useEffect(() => { if (open) { setText(value); setError("") } }, [open, value])
  const submit = () => {
    if (kind === "number") {
      const number = Number(text)
      if (text.trim() === "" || !Number.isFinite(number) || (min !== undefined && number < min) || (max !== undefined && number > max)) {
        setError(`أدخل رقماً${min !== undefined && max !== undefined ? ` بين ${min} و${max}` : " صالحاً"}`)
        return
      }
    }
    onConfirm(text.trim())
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="w-[calc(100vw-1rem)] max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{label}</Label>
            <div className="relative">
              <Input autoFocus className="h-12 text-lg font-bold" type={kind === "number" ? "number" : "text"} inputMode={kind === "number" ? "decimal" : undefined}
                min={min} max={max} value={text} placeholder={placeholder} onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => { setText(event.target.value); setError("") }} onKeyDown={(event) => { if (event.key === "Enter") submit() }} />
              {suffix && <span className="absolute left-3 top-3 text-lg font-bold text-muted-foreground">{suffix}</span>}
            </div>
          </div>
          {presets && presets.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {presets.map((preset) => (
                <Button key={preset} type="button" variant={Number(text) === preset ? "default" : "outline"} className="h-11 font-bold" onClick={() => { setText(String(preset)); setError("") }}>
                  {preset}{suffix || ""}
                </Button>
              ))}
            </div>
          )}
          {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button className="h-11" disabled={busy} onClick={submit}>{busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}<Check className="ml-1 h-4 w-4" />حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
