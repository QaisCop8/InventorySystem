"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import DataGridView from "@/components/common/DataGridView"
import { CellRange } from "@grapecity/wijmo.grid"

export interface ChequeBookLeafRecord {
  id: number
  cheque_code: string
  cheque_books_id: number
  book_code: string
  status: number
}

// 1=متوفر (قابل للاختيار), 2=تالف/مجمد, 3=غير متوفر — مطابق لـ CHEQUE_BOOK_STATUS في
// unified-cheques-books.tsx. المستخدم يختار من المتوفر فقط، والباقي يظهر معطَّلاً للعلم فقط.
const LEAF_STATUS_NAME: Record<number, string> = { 1: "متوفر", 2: "مجمد", 3: "غير متوفر" }
const LEAF_STATUS_UNAVAILABLE = 3

interface ChequeBookLeafSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bankAccountId: number | null
  // أرقام شيكات مُستخدَمة أصلاً في سطور أخرى بنفس السند الجاري تعبئته (لم تُحفظ بعد فبقيت
  // حالتها في القاعدة "متوفر") — تُعرض هنا كأنها "غير متوفر" لمنع اختيار نفس الورقة مرتين.
  excludeCodes?: string[]
  onSelect: (record: ChequeBookLeafRecord) => void
}

// أوراق شيكات (كل الحالات) من دفاتر الحساب البنكي المحدد — يُستخدم في سند الصرف بدل كتابة رقم
// الشيك يدوياً (خاصة عند تفعيل إعداد "عدم السماح بادخال شيكات يدويا في سند الصرف"). يعرض حالة كل
// ورقة صراحة (متوفر/مجمد/غير متوفر) ويمنع اختيار أي حالة غير "متوفر".
export default function ChequeBookLeafSearch({ open, onOpenChange, bankAccountId, excludeCodes, onSelect }: ChequeBookLeafSearchProps) {
  const [codeFilter, setCodeFilter] = useState("")
  const [selected, setSelected] = useState<ChequeBookLeafRecord | null>(null)
  const [leaves, setLeaves] = useState<ChequeBookLeafRecord[]>([])
  const [loading, setLoading] = useState(false)
  const gridRef = useRef<any>(null)
  const filterContainerRef = useRef<HTMLDivElement | null>(null)
  const codeInputRef = useRef<HTMLInputElement | null>(null)

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
    const excluded = new Set(excludeCodes || [])
    const query = codeFilter.trim().toLowerCase()
    return leaves
      .filter((leaf) => !query || leaf.cheque_code.toLowerCase().includes(query))
      .map((leaf) => {
        const status = excluded.has(leaf.cheque_code) ? LEAF_STATUS_UNAVAILABLE : Number(leaf.status)
        return { ...leaf, status, status_name: LEAF_STATUS_NAME[status] || "" }
      })
  }, [leaves, codeFilter, excludeCodes])

  const scheme = useMemo(
    () => ({
      name: "ChequeBookLeafSearchScheme",
      columns: [
        { header: "دفتر الشيكات", name: "book_code", width: 160, isReadOnly: true },
        { header: "رقم الشيك", name: "cheque_code", width: 160, isReadOnly: true },
        { header: "الحالة", name: "status_name", width: 120, isReadOnly: true },
      ],
    }),
    [],
  )

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => codeInputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [open])

  const focusGridFirstRow = () => {
    const grid = gridRef.current
    if (!grid || !grid.columns || !grid.rows || grid.rows.length === 0) return
    grid.select(new CellRange(0, 0))
    grid.focus()
  }

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      const container = filterContainerRef.current
      if (!container || !container.contains(target)) return

      if (event.key === "ArrowDown") {
        event.preventDefault()
        event.stopPropagation()
        focusGridFirstRow()
        return
      }

      if (event.key !== "Enter") return

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)
      const currentIndex = focusable.indexOf(target)
      if (currentIndex === -1) return
      event.preventDefault()
      event.stopPropagation()
      if (currentIndex === focusable.length - 1) {
        focusGridFirstRow()
        return
      }
      focusable[currentIndex + 1]?.focus()
    }

    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleGridKeyDown = (grid: any, e: KeyboardEvent) => {
    if (e.key !== "Enter") return
    const row = grid?.selection?.row
    if (row == null || row < 0) return
    const item = grid.rows[row]?.dataItem
    if (!item || Number(item.status) !== 1) return
    e.preventDefault()
    handleRowDoubleClick(item)
  }

  const handleRowDoubleClick = (record: ChequeBookLeafRecord) => {
    if (Number(record.status) !== 1) return
    onSelect(record)
    onOpenChange(false)
  }

  const handleConfirm = () => {
    if (selected && Number(selected.status) === 1) handleRowDoubleClick(selected)
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

          <div className="grid gap-2 grid-cols-1 border-b border-slate-200 pb-3 sm:pb-4" ref={filterContainerRef}>
            <div>
              <Label className="mb-2 block text-sm font-medium">رقم الشيك</Label>
              <Input
                ref={codeInputRef}
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
                innerRef={gridRef}
                containerStyle={{ height: "100%", minHeight: 0, maxHeight: "100%" }}
                style={{ height: "100%", minHeight: 0, maxHeight: "100%" }}
                defaultRowHeight={42}
                autoRowHeights={false}
                wordWrap={false}
                dataSource={filteredLeaves}
                scheme={scheme}
                onRowClick={(record: ChequeBookLeafRecord) => {
                  if (Number(record.status) === 1) setSelected(record)
                }}
                onRowDoubleClick={handleRowDoubleClick}
                onKeyDown={handleGridKeyDown}
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
