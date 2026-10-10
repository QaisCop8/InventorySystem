"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  SearchDialogHeader,
  SearchFilterField,
  SearchResultsTable,
  searchInputClassName,
  useEnterAsTabFilters,
  type SearchResultsTableHandle,
} from "@/components/common/search-dialog-kit"

// نافذة بحث "رقم + اسم" مشتركة (البنوك، فروع البنوك...) على نمط بحث الأصناف/الحسابات:
// التركيز على الاسم عند الفتح، Enter كـTab بين الفلاتر، ومن آخر فلتر (أو السهم للأسفل) إلى أول سطر
// بالنتائج، وEnter على السطر يختاره. الشبكة لوحة مفاتيح أصيلة (SearchResultsTable) لا Wijmo — Wijmo
// يبتلع Enter قبل معالجات النافذة فلم يكن الاختيار بـEnter يعمل.

export interface CodeNameRecord {
  id: number
  code?: string
  name: string
}

interface CodeNameSearchDialogProps<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  icon: ReactNode
  codeLabel: string
  nameLabel: string
  records: T[]
  toRecord: (row: T) => CodeNameRecord
  onSelect: (row: T) => void
  notice?: ReactNode
}

export default function CodeNameSearchDialog<T>({
  open, onOpenChange, title, icon, codeLabel, nameLabel, records, toRecord, onSelect, notice,
}: CodeNameSearchDialogProps<T>) {
  const [nameFilter, setNameFilter] = useState("")
  const [codeFilter, setCodeFilter] = useState("")
  const [active, setActive] = useState<T | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const filterContainerRef = useRef<HTMLDivElement | null>(null)
  const resultsRef = useRef<SearchResultsTableHandle | null>(null)

  useEffect(() => {
    if (open) return
    setNameFilter("")
    setCodeFilter("")
    setActive(null)
  }, [open])

  const rows = useMemo(() => {
    const name = nameFilter.trim().toLowerCase()
    const code = codeFilter.trim().toLowerCase()
    return records.filter((row) => {
      const record = toRecord(row)
      if (code && !String(record.code || "").toLowerCase().includes(code)) return false
      if (name && !record.name.toLowerCase().includes(name)) return false
      return true
    })
  }, [records, toRecord, nameFilter, codeFilter])

  useEnterAsTabFilters(open, filterContainerRef, () => resultsRef.current?.focusFirstRow())

  const pick = (row: T) => {
    onSelect(row)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        dir="rtl"
        className="flex h-[min(620px,calc(100dvh-2rem))] w-[min(720px,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-slate-50 p-0 shadow-2xl ring-1 ring-slate-900/10"
        // التركيز على الاسم مباشرة عند الفتح (بدل مؤقّت يسابق إدارة Radix للتركيز)
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          nameInputRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <SearchDialogHeader
          icon={icon}
          title={title}
          subtitle="Enter للتنقل بين الفلاتر ثم للنتائج • ↑↓ للتنقل • Enter للاختيار"
          count={rows.length}
          onClose={() => onOpenChange(false)}
        />
        <div ref={filterContainerRef} className="grid shrink-0 grid-cols-1 gap-3 border-b bg-white px-4 py-3 sm:grid-cols-[1.4fr_1fr]">
          <SearchFilterField label={nameLabel}>
            <Input ref={nameInputRef} value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} placeholder={`ابحث ب${nameLabel}`} className={searchInputClassName} />
          </SearchFilterField>
          <SearchFilterField label={codeLabel}>
            <Input value={codeFilter} onChange={(event) => setCodeFilter(event.target.value)} placeholder={`ابحث ب${codeLabel}`} className={searchInputClassName} />
          </SearchFilterField>
          {notice && <div className="text-xs text-amber-600 sm:col-span-2">{notice}</div>}
        </div>
        <div className="min-h-0 flex-1 p-3">
          <SearchResultsTable<T>
            ref={resultsRef}
            rows={rows}
            getRowKey={(row) => toRecord(row).id}
            onPick={(row) => pick(row)}
            onActiveChange={(row) => setActive(row)}
            columns={[
              { key: "code", header: codeLabel, width: "160px", className: "font-mono text-xs text-slate-600", render: (row) => toRecord(row).code || "—" },
              { key: "name", header: nameLabel, className: "font-semibold text-slate-800", render: (row) => toRecord(row).name },
            ]}
            className="h-full"
          />
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t bg-white px-4 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-lg">إغلاق</Button>
          <Button onClick={() => active && pick(active)} disabled={!active} className="h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700">اختيار</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
