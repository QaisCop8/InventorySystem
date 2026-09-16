"use client"

import { useId, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"

export type ReportShift = { shift_guid: string; first_date: string; user_name?: string; point_name?: string }
const shiftLabel = (shift: ReportShift) => [shift.user_name || "مستخدم غير محدد", shift.point_name || "نقطة بيع غير محددة", String(shift.first_date || "").slice(0, 10), shift.shift_guid].join(" · ")

export function ReportShiftFilter({ shifts, value, onChange }: { shifts: ReportShift[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const selected = shifts.find(shift => shift.shift_guid === value)
  const choose = (next: string) => { onChange(next); setOpen(false) }
  return <div className="min-w-0 space-y-2"><Label htmlFor={id}>الوردية</Label><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between rounded-xl font-normal"><span className="truncate">{selected ? shiftLabel(selected) : value || "جميع الورديات"}</span><ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger><PopoverContent dir="rtl" align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"><Command><CommandInput placeholder="ابحث بالمستخدم أو نقطة البيع أو رقم الوردية..." /><CommandList><CommandEmpty>لا توجد ورديات مطابقة</CommandEmpty><CommandItem value="جميع الورديات" onSelect={() => choose("")}><Check className={`ml-2 h-4 w-4 ${value ? "opacity-0" : "opacity-100"}`} />جميع الورديات</CommandItem>{shifts.map(shift => <CommandItem key={shift.shift_guid} value={shiftLabel(shift)} onSelect={() => choose(shift.shift_guid)}><Check className={`ml-2 h-4 w-4 shrink-0 ${value === shift.shift_guid ? "opacity-100" : "opacity-0"}`} /><span className="break-words">{shiftLabel(shift)}</span></CommandItem>)}</CommandList></Command></PopoverContent></Popover></div>
}
