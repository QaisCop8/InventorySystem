"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { WorkspaceDialogProvider } from "@/contexts/workspace-dialog-context"

type VoucherRow = { id: number; vch_code: string; vch_date: string; vch_type: number; status: number; customer_code: string | null; customer_name: string | null; branch_name: string | null; amount: number; lines: number }

const SALES_RETURN = 16
const fmt = (value: unknown) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })

/** نافذة بحث واختيار فاتورة مبيعات أو مرتجع (للتقارير). الأسهم + Enter أو النقر المزدوج للاختيار. */
export function InvoicePickerDialog({ open, onOpenChange, onSelect, initialSearch = "" }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (row: VoucherRow) => void; initialSearch?: string }) {
  const [search, setSearch] = useState(initialSearch)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [types, setTypes] = useState("12,16")
  const [rows, setRows] = useState<VoucherRow[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const sequenceRef = useRef(0)

  useEffect(() => { if (open) { setSearch(initialSearch); setActive(0); setTimeout(() => searchRef.current?.focus(), 50) } }, [open])

  useEffect(() => {
    if (!open) return
    const sequence = ++sequenceRef.current
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ invoices: "1", search, types })
        if (fromDate) params.set("from_date", fromDate)
        if (toDate) params.set("to_date", toDate)
        const response = await fetch(`/api/reports/sales-profit?${params}`, { cache: "no-store" })
        const data = await response.json()
        if (sequence !== sequenceRef.current) return
        setRows(Array.isArray(data) ? data : []); setActive(0)
      } finally { if (sequence === sequenceRef.current) setLoading(false) }
    }, 250)
    return () => clearTimeout(timer)
  }, [open, search, fromDate, toDate, types])

  const choose = (row: VoucherRow | undefined) => { if (!row) return; onSelect(row); onOpenChange(false) }
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(rows.length - 1, index + 1)) }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)) }
    else if (event.key === "Enter") { event.preventDefault(); choose(rows[active]) }
  }
  useEffect(() => { document.getElementById(`invoice-picker-row-${active}`)?.scrollIntoView({ block: "nearest" }) }, [active])

  return (
    <WorkspaceDialogProvider container={null} confined={false}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="z-[3001] flex h-[min(640px,90vh)] w-[min(900px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0" dir="rtl" onKeyDown={onKeyDown}>
          <div className="border-b bg-gradient-to-l from-indigo-700 to-violet-700 px-5 py-3 text-white">
            <DialogTitle className="flex items-center gap-2 text-base font-bold"><Search className="h-4 w-4" />بحث فاتورة مبيعات / مرتجع</DialogTitle>
            <DialogDescription className="text-xs text-indigo-100">ابحث برقم السند أو اسم/رقم العميل — Enter أو نقر مزدوج للاختيار</DialogDescription>
          </div>
          <div className="grid gap-2 border-b bg-slate-50 p-3 sm:grid-cols-[1fr_150px_150px_160px]">
            <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="رقم السند أو العميل..." className="pr-9" /></div>
            <Input type="date" lang="en" dir="ltr" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="من تاريخ" title="من تاريخ" />
            <Input type="date" lang="en" dir="ltr" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="إلى تاريخ" title="إلى تاريخ" />
            <select value={types} onChange={(event) => setTypes(event.target.value)} className="h-10 rounded-md border bg-white px-2 text-sm" aria-label="نوع السند">
              <option value="12,16">المبيعات والمرتجعات</option>
              <option value="12">فواتير المبيعات</option>
              <option value="16">مرتجعات المبيعات</option>
            </select>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-xs text-slate-600"><tr>{["رقم السند", "التاريخ", "النوع", "العميل", "الفرع", "الأصناف", "المبلغ", "الحالة"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 text-right font-semibold">{label}</th>)}</tr></thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} id={`invoice-picker-row-${index}`} onClick={() => setActive(index)} onDoubleClick={() => choose(row)} className={`cursor-pointer border-b ${index === active ? "bg-indigo-100" : "hover:bg-slate-50"}`}>
                    <td className="px-3 py-2 font-mono font-bold text-indigo-700">{row.vch_code}</td>
                    <td className="px-3 py-2" dir="ltr">{row.vch_date}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${Number(row.vch_type) === SALES_RETURN ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{Number(row.vch_type) === SALES_RETURN ? "مرتجع" : "مبيعات"}</span></td>
                    <td className="px-3 py-2">{row.customer_name ? `${row.customer_code ? `${row.customer_code} - ` : ""}${row.customer_name}` : "-"}</td>
                    <td className="px-3 py-2">{row.branch_name || "-"}</td>
                    <td className="px-3 py-2 text-center">{row.lines}</td>
                    <td className="px-3 py-2 font-semibold" dir="ltr">{fmt(row.amount)}</td>
                    <td className="px-3 py-2 text-xs">{Number(row.status) === 2 ? "مرحّل" : "غير مرحّل"}</td>
                  </tr>
                ))}
                {!loading && !rows.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">لا توجد سندات مطابقة</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
            <span className="flex items-center gap-2">{loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{rows.length} سند{rows.length === 200 ? " (أول 200 — ضيّق البحث)" : ""}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>إغلاق</Button>
              <Button size="sm" disabled={!rows[active]} onClick={() => choose(rows[active])}>اختيار</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceDialogProvider>
  )
}
