"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import DataGridView from "@/components/common/DataGridView"

export interface ChequeBookLeafRecord {
  id: number
  cheque_code: string
  cheque_books_id: number
  book_code: string
}

interface ChequeBookLeafSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bankAccountId: number | null
  onSelect: (record: ChequeBookLeafRecord) => void
}

// أوراق شيكات متوفرة (status=1) من دفاتر الحساب البنكي المحدد فقط — يُستخدم في سند الصرف بدل
// كتابة رقم الشيك يدوياً (خاصة عند تفعيل إعداد "عدم السماح بادخال شيكات يدويا في سند الصرف").
export default function ChequeBookLeafSearch({ open, onOpenChange, bankAccountId, onSelect }: ChequeBookLeafSearchProps) {
  const [codeFilter, setCodeFilter] = useState("")
  const [selected, setSelected] = useState<ChequeBookLeafRecord | null>(null)
  const [leaves, setLeaves] = useState<ChequeBookLeafRecord[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setCodeFilter("")
      setSelected(null)
      return
    }
    if (!bankAccountId) {
      setLeaves([])
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/cheques-books/leaves?bank_account_id=${bankAccountId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setLeaves(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setLeaves([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, bankAccountId])

  const filteredLeaves = useMemo(() => {
    const query = codeFilter.trim().toLowerCase()
    if (!query) return leaves
    return leaves.filter((leaf) => leaf.cheque_code.toLowerCase().includes(query))
  }, [leaves, codeFilter])

  const scheme = useMemo(
    () => ({
      name: "ChequeBookLeafSearchScheme",
      columns: [
        { header: "رقم الشيك", name: "cheque_code", width: 160, isReadOnly: true },
        { header: "رقم الدفتر", name: "book_code", width: 160, isReadOnly: true },
      ],
    }),
    [],
  )

  const handleRowDoubleClick = (record: ChequeBookLeafRecord) => {
    onSelect(record)
    onOpenChange(false)
  }

  const handleConfirm = () => {
    if (selected) handleRowDoubleClick(selected)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="w-[90vw] max-w-2xl h-auto max-h-[76vh] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur sm:p-4"
        dir="rtl"
      >
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex flex-col gap-2 rounded-xl bg-gradient-to-r from-slate-50 via-white to-blue-50/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 text-center sm:text-right">
              بحث دفاتر الشيكات
            </h2>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="mx-auto h-8 w-8 rounded-full border border-slate-200 bg-white p-0 text-slate-500 shadow-sm hover:bg-slate-100 sm:mx-0"
              aria-label="إغلاق"
              title="إغلاق"
            >
              ✕
            </Button>
          </div>

          <div className="grid gap-2 grid-cols-1 border-b border-slate-200 pb-3 sm:pb-4">
            <div>
              <Label className="mb-2 block text-sm font-medium">رقم الشيك</Label>
              <Input
                value={codeFilter}
                onChange={(e) => setCodeFilter(e.target.value)}
                placeholder="ابحث برقم الشيك"
                className="h-10 rounded-xl border border-slate-200 bg-white text-right shadow-sm focus:border-blue-300 focus:bg-white"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm" style={{ height: "380px" }}>
            {loading ? (
              <div className="flex h-full items-center justify-center bg-gradient-to-b from-slate-50 to-white text-slate-500 text-sm">
                جارٍ التحميل...
              </div>
            ) : filteredLeaves.length > 0 ? (
              <DataGridView
                containerStyle={{ height: "100%", minHeight: 0, maxHeight: "100%" }}
                style={{ height: "100%", minHeight: 0, maxHeight: "100%" }}
                defaultRowHeight={42}
                autoRowHeights={false}
                wordWrap={false}
                dataSource={filteredLeaves}
                scheme={scheme}
                onRowClick={(record: ChequeBookLeafRecord) => setSelected(record)}
                onRowDoubleClick={handleRowDoubleClick}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-b from-slate-50 to-white text-slate-500 text-sm">
                لا توجد شيكات متوفرة لهذا الحساب البنكي
              </div>
            )}
          </div>

          <div className="flex justify-center gap-2 border-t border-slate-200 pt-4">
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
