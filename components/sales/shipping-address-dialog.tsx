"use client"

import { useEffect, useState } from "react"
import { MapPin, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import Dropdown from "@/components/common/FocusDropdown"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { WorkspaceDialogProvider } from "@/contexts/workspace-dialog-context"

export type ShippingInfo = {
  destination_name?: string
  car_id?: number | null
  driver_id?: number | null
  city_id?: number | null
  po_box?: string
  phone?: string
  address?: string
}

const asList = (data: any) => (Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [])
const active = (row: any) => row.status === undefined || row.status === 1 || row.status === "1" || row.status === "active" || row.status === "نشط"

/** ملخص قصير لعنوان الشحن (يظهر بجانب زر "عنوان الشحن" وفي الطباعة). */
export function shippingSummary(info: ShippingInfo | null | undefined) {
  if (!info) return ""
  return [info.destination_name, info.address, info.phone].filter((part) => String(part || "").trim()).join(" — ")
}

/** نافذة عنوان الشحن لفواتير وإرساليات المبيعات: المرسل إليه، السيارة، السائق، المنطقة، ص.ب، الهاتف، العنوان. */
export function ShippingAddressDialog({ open, onOpenChange, value, onSave, readOnly = false, defaults }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: ShippingInfo | null | undefined
  onSave: (value: ShippingInfo) => void
  readOnly?: boolean
  /** يُقترح عند فتح عنوان فارغ (اسم العميل وهاتفه) */
  defaults?: ShippingInfo
}) {
  const [form, setForm] = useState<ShippingInfo>({})
  const [cars, setCars] = useState<any[]>([])
  const [drivers, setDrivers] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])

  useEffect(() => {
    if (!open) return
    const empty = !value || !Object.values(value).some((part) => part !== null && part !== undefined && String(part).trim() !== "")
    setForm(empty ? { ...defaults } : { ...value })
    Promise.all([fetch("/api/cars"), fetch("/api/drivers"), fetch("/api/cities")].map((request) => request.then((response) => response.json()).catch(() => [])))
      .then(([carRows, driverRows, cityRows]) => {
        setCars(asList(carRows).filter(active).map((row: any) => ({ value: Number(row.id), label: [row.car_code, row.name, row.plate_number].filter(Boolean).join(" - ") })))
        setDrivers(asList(driverRows).filter(active).map((row: any) => ({ value: Number(row.id), label: [row.driver_code, row.name].filter(Boolean).join(" - "), phone: row.phone })))
        setCities(asList(cityRows).map((row: any) => ({ value: Number(row.id), label: row.name })))
      })
  }, [open])

  const set = (key: keyof ShippingInfo, next: unknown) => setForm((current) => ({ ...current, [key]: next }))

  return (
    <WorkspaceDialogProvider container={null} confined={false}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="z-[3001] w-[min(640px,calc(100vw-1.5rem))] max-w-none gap-0 overflow-hidden rounded-2xl p-0" dir="rtl">
          <div className="flex items-center gap-3 bg-gradient-to-l from-sky-600 to-indigo-600 px-5 py-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><Truck className="h-5 w-5" /></span>
            <div className="text-right">
              <DialogTitle className="text-base font-bold">عنوان الشحن</DialogTitle>
              <DialogDescription className="text-xs text-sky-50">بيانات التوصيل والمرسل إليه لهذا السند</DialogDescription>
            </div>
          </div>
          <fieldset disabled={readOnly} className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>المرسل إليه</Label><Input value={form.destination_name || ""} onChange={(event) => set("destination_name", event.target.value)} maxLength={150} /></div>
            <div><Label>السيارة</Label><Dropdown value={form.car_id ?? null} options={cars} optionLabel="label" optionValue="value" filter showClear placeholder="اختر السيارة" disabled={readOnly} onChange={(event: any) => set("car_id", event.value ?? null)} className="w-full" appendTo="self" /></div>
            <div><Label>السائق</Label><Dropdown value={form.driver_id ?? null} options={drivers} optionLabel="label" optionValue="value" filter showClear placeholder="اختر السائق" disabled={readOnly} onChange={(event: any) => { set("driver_id", event.value ?? null) }} className="w-full" appendTo="self" /></div>
            <div><Label>المنطقة</Label><Dropdown value={form.city_id ?? null} options={cities} optionLabel="label" optionValue="value" filter showClear placeholder="اختر المنطقة" disabled={readOnly} onChange={(event: any) => set("city_id", event.value ?? null)} className="w-full" appendTo="self" /></div>
            <div><Label>ص.ب</Label><Input value={form.po_box || ""} onChange={(event) => set("po_box", event.target.value)} maxLength={30} dir="ltr" /></div>
            <div className="sm:col-span-2"><Label>الهاتف</Label><Input value={form.phone || ""} onChange={(event) => set("phone", event.target.value)} maxLength={30} dir="ltr" /></div>
            <div className="sm:col-span-2"><Label>العنوان</Label><Textarea value={form.address || ""} onChange={(event) => set("address", event.target.value)} rows={3} maxLength={500} /></div>
          </fieldset>
          <div className="flex items-center justify-between border-t bg-slate-50 px-5 py-3">
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />يُحفظ مع السند عند الحفظ</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>{readOnly ? "إغلاق" : "إلغاء"}</Button>
              {!readOnly && <Button onClick={() => { onSave(form); onOpenChange(false) }}>موافق</Button>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceDialogProvider>
  )
}
