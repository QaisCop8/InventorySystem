"use client"

import { useEffect, useState } from "react"
import { Loader2, PackageSearch, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

export type ConsignmentHeader = { id: number; vch_code: string; vch_date: string; salesman_id: number | null; salesman_name?: string | null; currency_id: number | null; rate: number | null; branch_id: number | null }
export type ConsignmentLine = {
  id: number; product_id: number; product_code: string; product_name: string; unit_id: number | null; unit_name: string
  store_id: number | null; warehouse_name: string | null; price: number; discount: number; batch_no: string | null; expiry_date: string | null
  selling_account_id?: number | null; barcode?: string | null; has_expiry?: boolean; has_serial?: boolean
  original: number; invoiced: number; returned: number; remaining: number
}
type Row = { id: number; vch_code: string; vch_date: string; salesman_id: number | null; salesman_name: string | null; original: number; remaining: number; currency_code?: string | null }

const fmt = (value: number) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const day = (value: string) => String(value || "").slice(0, 10)

/** اختيار ارسالية برسم البيع مفتوحة (لفاتورة "من ارسالية برسم البيع" أو لمرتجع ارسالية برسم البيع). */
export function ConsignmentPickerDialog({ open, onOpenChange, forType, branchId, salesmen, defaultSalesmanId, onSelect }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  forType: 12 | 15
  branchId?: number | null
  salesmen: Array<{ id: number; name: string }>
  defaultSalesmanId?: number | null
  onSelect: (header: ConsignmentHeader, lines: ConsignmentLine[]) => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [salesmanId, setSalesmanId] = useState<number | null>(null)
  const [selected, setSelected] = useState<Row | null>(null)
  const [preview, setPreview] = useState<{ header: ConsignmentHeader; lines: ConsignmentLine[] } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setSearch(""); setSelected(null); setPreview(null); setError("")
    setSalesmanId(defaultSalesmanId || null)
  }, [open, defaultSalesmanId])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("")
      try {
        const params = new URLSearchParams({ for: String(forType) })
        if (branchId) params.set("branch_id", String(branchId))
        if (salesmanId) params.set("salesman_id", String(salesmanId))
        if (search.trim()) params.set("search", search.trim())
        const response = await fetch(`/api/sales-vouchers/consignments?${params}`, { signal: controller.signal })
        const data = await response.json().catch(() => [])
        if (!response.ok) throw new Error(data?.error || "فشل في جلب الارساليات")
        setRows(Array.isArray(data) ? data : [])
      } catch (cause: any) {
        if (cause?.name !== "AbortError") setError(cause?.message || "فشل في جلب الارساليات")
      } finally { setLoading(false) }
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [open, forType, branchId, salesmanId, search])

  const choose = async (row: Row) => {
    setSelected(row); setPreview(null); setPreviewLoading(true); setError("")
    try {
      const params = new URLSearchParams({ for: String(forType), id: String(row.id) })
      if (branchId) params.set("branch_id", String(branchId))
      const response = await fetch(`/api/sales-vouchers/consignments?${params}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || "فشل في جلب أسطر الارسالية")
      setPreview(data)
    } catch (cause: any) {
      setError(cause?.message || "فشل في جلب أسطر الارسالية")
    } finally { setPreviewLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[2001] flex max-h-[88vh] w-[min(1100px,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0" dir="rtl" onPointerDownOutside={(event) => event.preventDefault()}>
        <div className="shrink-0 bg-gradient-to-l from-violet-700 to-indigo-600 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><PackageSearch className="h-5 w-5" /></span>
            <div className="text-right">
              <DialogTitle className="text-base font-bold">{forType === 15 ? "اختيار ارسالية برسم البيع للمرتجع" : "فاتورة من ارسالية برسم البيع"}</DialogTitle>
              <DialogDescription className="text-xs text-violet-50">
                {forType === 15 ? "يُرجَع المتبقي (غير المفوتر) من الارسالية إلى المستودع — مرتجع واحد لكل ارسالية" : "تُفوتر الأصناف من المتبقي في الارسالية — يمكن عمل أكثر من فاتورة من نفس الارسالية"}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-slate-50 px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث برقم الارسالية أو اسم المندوب" className="h-9 pr-8" autoFocus />
          </div>
          <select value={salesmanId ?? ""} onChange={(event) => setSalesmanId(event.target.value ? Number(event.target.value) : null)} className="h-9 min-w-[200px] rounded-md border bg-white px-2 text-sm">
            <option value="">كل المندوبين</option>
            {salesmen.map((salesman) => <option key={salesman.id} value={salesman.id}>{salesman.name}</option>)}
          </select>
        </div>

        {error && <div className="mx-4 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div>}

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="min-h-[220px] overflow-auto border-l">
            {loading ? <div className="flex h-full min-h-[220px] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              : rows.length === 0 ? <div className="flex h-full min-h-[220px] items-center justify-center p-4 text-center text-sm text-slate-400">لا توجد ارساليات برسم البيع مفتوحة</div>
              : <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-xs text-slate-600"><tr><th className="px-3 py-2 text-right">الرقم</th><th className="px-3 py-2 text-right">التاريخ</th><th className="px-3 py-2 text-right">المندوب</th><th className="px-3 py-2 text-right">المتبقي</th></tr></thead>
                  <tbody>{rows.map((row) => (
                    <tr key={row.id} onClick={() => void choose(row)} onDoubleClick={() => preview && preview.header.id === row.id && onSelect(preview.header, preview.lines)}
                      className={`cursor-pointer border-t hover:bg-violet-50 ${selected?.id === row.id ? "bg-violet-100/70" : ""}`}>
                      <td className="px-3 py-2 font-mono font-semibold">{row.vch_code}</td>
                      <td className="px-3 py-2 text-slate-600">{day(row.vch_date)}</td>
                      <td className="px-3 py-2">{row.salesman_name || "—"}</td>
                      <td className="px-3 py-2"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">{fmt(row.remaining)} من {fmt(row.original)}</span></td>
                    </tr>
                  ))}</tbody>
                </table>}
          </div>
          <div className="min-h-[220px] overflow-auto bg-white">
            {previewLoading ? <div className="flex h-full min-h-[220px] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              : !preview ? <div className="flex h-full min-h-[220px] items-center justify-center p-4 text-center text-sm text-slate-400">اختر ارسالية لعرض أصنافها المتبقية</div>
              : <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-800 text-white"><tr><th className="px-2 py-2 text-right">الصنف</th><th className="px-2 py-2 text-right">الوحدة</th><th className="px-2 py-2 text-right">المرسل</th><th className="px-2 py-2 text-right">المفوتر</th><th className="px-2 py-2 text-right">المتبقي</th></tr></thead>
                  <tbody>{preview.lines.map((line) => (
                    <tr key={line.id} className="border-t">
                      <td className="px-2 py-1.5"><div className="font-semibold">{line.product_name}</div><div className="font-mono text-[11px] text-slate-400">{line.product_code}</div></td>
                      <td className="px-2 py-1.5">{line.unit_name}</td>
                      <td className="px-2 py-1.5">{fmt(line.original)}</td>
                      <td className="px-2 py-1.5 text-slate-500">{fmt(line.invoiced)}</td>
                      <td className="px-2 py-1.5 font-bold text-emerald-700">{fmt(line.remaining)}</td>
                    </tr>
                  ))}</tbody>
                </table>}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-slate-50 px-4 py-3">
          <div className="text-xs text-slate-500">{preview ? `الارسالية ${preview.header.vch_code} — المندوب: ${preview.header.salesman_name || "—"}` : ""}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}><X className="ml-1 h-4 w-4" />إلغاء</Button>
            <Button disabled={!preview} onClick={() => preview && onSelect(preview.header, preview.lines)} className="bg-violet-600 hover:bg-violet-700">اعتماد الارسالية</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
