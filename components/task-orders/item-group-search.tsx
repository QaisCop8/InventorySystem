"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface ItemGroupRecord {
  id: number
  group_code: string
  group_name: string
  status: "نشط" | "غير نشط"
}

interface ItemGroupSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (group: ItemGroupRecord) => void
}

// بحث بسيط عبر قائمة قابلة للتصفية (بدل شبكة Wijmo الثقيلة المستخدمة في بحث الحسابات البنكية) —
// مجموعات الأصناف عادة عدد محدود، فقائمة مُصفّاة بمربع بحث كافية دون تعقيد إضافي.
export default function ItemGroupSearch({ open, onOpenChange, onSelect }: ItemGroupSearchProps) {
  const [groups, setGroups] = useState<ItemGroupRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!open) return
    setQuery("")
    setLoading(true)
    fetch("/api/item-groups")
      .then((res) => res.json())
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false))
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groups
      .filter((g) => g.status === "نشط")
      .filter((g) => !q || g.group_name.toLowerCase().includes(q) || g.group_code.toLowerCase().includes(q))
  }, [groups, query])

  const handleSelect = (group: ItemGroupRecord) => {
    onSelect(group)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>بحث مجموعات الأصناف</DialogTitle>
        </DialogHeader>
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث برمز أو اسم المجموعة" />
        <ScrollArea className="max-h-80">
          <div className="space-y-1">
            {loading && <div className="py-6 text-center text-sm text-slate-400">جارٍ التحميل...</div>}
            {!loading && filtered.length === 0 && <div className="py-6 text-center text-sm text-slate-400">لا توجد نتائج</div>}
            {!loading &&
              filtered.map((g) => (
                <button
                  key={g.id}
                  onClick={() => handleSelect(g)}
                  className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-right text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-800">{g.group_name}</span>
                  <span className="text-xs text-slate-400">{g.group_code}</span>
                </button>
              ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
