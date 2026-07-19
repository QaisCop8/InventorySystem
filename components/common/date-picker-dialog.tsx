"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Calendar } from "@/components/ui/calendar"

interface DatePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value?: string | null
  title?: string
  onSelect: (isoDate: string) => void
}

export default function DatePickerDialog({ open, onOpenChange, value, title = "اختر التاريخ", onSelect }: DatePickerDialogProps) {
  const [selected, setSelected] = useState<Date | undefined>(undefined)

  useEffect(() => {
    if (!open) return
    if (value) {
      const parsed = new Date(value)
      setSelected(Number.isNaN(parsed.getTime()) ? undefined : parsed)
    } else {
      setSelected(undefined)
    }
  }, [open, value])

  const handleConfirm = () => {
    if (!selected) return
    const iso = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`
    onSelect(iso)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="w-auto max-w-fit overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur sm:p-4"
        dir="rtl"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-slate-50 via-white to-indigo-50/60 px-3 py-2">
            <h2 className="text-base font-extrabold tracking-tight text-slate-900">{title}</h2>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 rounded-full border border-slate-200 bg-white p-0 text-slate-500 shadow-sm hover:bg-slate-100"
              aria-label="إغلاق"
              title="إغلاق"
            >
              ✕
            </Button>
          </div>

          <Calendar mode="single" selected={selected} onSelect={setSelected} initialFocus />

          <div className="flex justify-center gap-2 border-t border-slate-200 pt-3">
            <Button onClick={handleConfirm} disabled={!selected} className="search-button shadow-sm">
              موافق
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="search-button shadow-sm">
              إغلاق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
