"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

export type PosInvoice = {
  id: number; vch_code: string; vch_date: string; vch_type: number; customer_name: string
  amount: number; status: number; payments?: Array<{ method: string; amount: number; reference?: string }>
  items?: Array<{ id: number; product_name?: string; item_name?: string; qnty?: number; quantity?: number; price?: number; discount?: number; total_price?: number; line_amount?: number }>
}
type Props = {
  open: boolean; onOpenChange: (open: boolean) => void; rows: PosInvoice[]
  query: string; onQueryChange: (value: string) => void; scope: "shift" | "all"; onScopeChange: (value: "shift" | "all") => void
  onSearch: () => void; onSelect: (row: PosInvoice) => void; loading: boolean; error: string; currencyCode: string; hasShift: boolean
}
const money = (value: number) => Number(value || 0).toFixed(2)
const typeName = (type: number) => Number(type) === 16 ? "مردود" : Number(type) === 9 ? "هدية" : "بيع"

export function PosInvoiceHistoryDialog(p: Props) {
  const { open, onOpenChange, rows, query, onQueryChange, scope, onScopeChange, onSearch, onSelect, loading, error, currencyCode, hasShift } = p
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent dir="rtl" className="flex max-h-[88dvh] w-[min(94vw,640px)] max-w-none flex-col gap-0 overflow-hidden rounded-3xl border p-0 shadow-2xl">
      <DialogHeader className="shrink-0 bg-gradient-to-l from-emerald-700 to-sky-700 p-5 text-right text-white">
        <DialogTitle className="text-lg text-white">بحث الفواتير</DialogTitle>
        <DialogDescription className="text-emerald-50">ابحث ثم اختر فاتورة لعرضها في شاشة الكاشير.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Button size="sm" variant={scope === "shift" ? "default" : "outline"} disabled={!hasShift} onClick={() => onScopeChange("shift")}>فواتير الوردية</Button>
        <Button size="sm" variant={scope === "all" ? "default" : "outline"} onClick={() => onScopeChange("all")}>كل الفواتير</Button>
        <div className="flex min-w-48 flex-1 gap-2"><Input autoFocus value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter") onSearch() }} placeholder="رقم الفاتورة أو العميل..." /><Button size="icon" variant="outline" onClick={onSearch} aria-label="بحث"><Search className="size-4" /></Button></div>
      </div>
      {error && <p className="mx-4 mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3 dark:bg-slate-900">
        {rows.map(row => <button key={row.id} type="button" onClick={() => onSelect(row)} className="mb-2 flex w-full items-center justify-between gap-3 rounded-xl border bg-white p-3 text-right transition hover:border-emerald-400 hover:bg-emerald-50 dark:bg-slate-950">
          <div className="min-w-0"><div className="flex items-center gap-2"><strong>{row.vch_code}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">{typeName(row.vch_type)}</span></div><p className="mt-1 truncate text-xs text-slate-500">{row.customer_name || "عميل نقدي"} · {String(row.vch_date).slice(0, 10)}</p></div>
          <b dir="ltr" className="shrink-0 tabular-nums">{money(row.amount)} {currencyCode}</b>
        </button>)}
        {!rows.length && <p className="py-12 text-center text-sm text-slate-500">{loading ? "جاري التحميل..." : "لا توجد فواتير مطابقة"}</p>}
      </div>
    </DialogContent>
  </Dialog>
}
