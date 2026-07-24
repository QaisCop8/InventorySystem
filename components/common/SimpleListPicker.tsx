"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export interface SimpleListPickerItem {
  id: number | string
  label: string
}

interface SimpleListPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  items: SimpleListPickerItem[]
  onSelect: (item: SimpleListPickerItem) => void
}

// نافذة اختيار بسيطة (بحث + قائمة) لاختيار عنصر واحد من قائمة تعريفات مرجعية (وحدة/فئة سعر/عملة/
// مستودع/حالة) داخل خلية شبكة DataGridView — بديل موحَّد لِـColumn.editor المباشر (يتطلّب عنصر
// تحكم Wijmo حقيقي، غير عملي لهذه الحالات) مطابق لنمط أزرار البحث المستخدَم في باقي شاشات السندات.
export default function SimpleListPicker({ open, onOpenChange, title, items, onSelect }: SimpleListPickerProps) {
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (open) setQuery("")
  }, [open])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter((item) => item.label.toLowerCase().includes(normalized))
  }, [items, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        dir="rtl"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input autoFocus placeholder="بحث..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="max-h-80 overflow-y-auto rounded-md border border-slate-200">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-400">لا توجد نتائج</div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                className="block w-full border-b border-slate-100 px-3 py-2 text-right text-sm last:border-b-0 hover:bg-slate-50"
                onClick={() => {
                  onSelect(item)
                  onOpenChange(false)
                }}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
