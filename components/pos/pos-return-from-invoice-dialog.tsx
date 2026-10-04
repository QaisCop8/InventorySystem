"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type ReturnInvoiceItem = {
  id: number
  product_id?: number
  product_name?: string
  item_name?: string
  product_code?: string
  barcode?: string
  unit_id?: number | null
  unit_name?: string
  qnty?: number
  quantity?: number
  price?: number
  unit_price?: number
  discount?: number
  discount_percent?: number
  campaign_discount?: number
  account_id?: number | null
}

export type ReturnSourceInvoice = {
  id: number
  vch_code: string
  vch_date: string
  vch_type: number
  customer_name: string
  account_id?: number | null
  amount: number
  items?: ReturnInvoiceItem[]
}

export type SelectedReturnItem = { item: ReturnInvoiceItem; quantity: number }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoices: ReturnSourceInvoice[]
  query: string
  onQueryChange: (value: string) => void
  onSearch: () => void
  loadingInvoices: boolean
  error: string
  selectedInvoice: ReturnSourceInvoice | null
  loadingItems: boolean
  onSelectInvoice: (invoice: ReturnSourceInvoice) => void
  onBack: () => void
  onAddItems: (items: SelectedReturnItem[]) => void
  currencyCode: string
}

const quantityOf = (item: ReturnInvoiceItem) => Number(item.qnty ?? item.quantity ?? 0)

export function PosReturnFromInvoiceDialog(props: Props) {
  const {
    open, onOpenChange, invoices, query, onQueryChange, onSearch, loadingInvoices, error,
    selectedInvoice, loadingItems, onSelectInvoice, onBack, onAddItems, currencyCode,
  } = props
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [itemError, setItemError] = useState("")
  const filteredInvoices = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ar")
    return invoices.filter(invoice => !term || `${invoice.vch_code} ${invoice.customer_name || ""}`.toLocaleLowerCase("ar").includes(term))
  }, [invoices, query])

  useEffect(() => {
    setChecked({})
    setQuantities({})
    setItemError("")
  }, [selectedInvoice?.id])

  const chooseItems = () => {
    const selected = (selectedInvoice?.items || []).filter(item => checked[item.id]).map(item => ({
      item,
      quantity: Number(quantities[item.id] ?? quantityOf(item)),
    }))
    if (!selected.length) {
      setItemError("اختر صنفاً واحداً على الأقل")
      return
    }
    if (selected.some(({ item, quantity }) => !Number.isFinite(quantity) || quantity <= 0 || quantity > quantityOf(item))) {
      setItemError("كمية المرتجع يجب أن تكون أكبر من صفر ولا تتجاوز كمية الفاتورة")
      return
    }
    onAddItems(selected)
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent dir="rtl" className="flex max-h-[88dvh] w-[min(94vw,720px)] max-w-none flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="shrink-0 border-b bg-emerald-50 px-5 py-4 text-right dark:bg-emerald-950">
        <DialogTitle className="text-base">{selectedInvoice ? `مرتجع من الفاتورة ${selectedInvoice.vch_code}` : "اختيار فاتورة مصدر"}</DialogTitle>
        <DialogDescription>{selectedInvoice ? "حدد الأصناف والكميات المراد إرجاعها." : "اختر فاتورة مبيعات ثم حدد الأصناف المراد إرجاعها."}</DialogDescription>
      </DialogHeader>

      {!selectedInvoice ? <>
        <div className="flex gap-2 border-b p-3">
          <Input autoFocus value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter") onSearch() }} placeholder="رقم الفاتورة أو اسم العميل..." />
          <Button size="icon" variant="outline" onClick={onSearch} aria-label="بحث عن الفواتير"><Search size={16} /></Button>
        </div>
        {error && <p className="mx-4 mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3 dark:bg-slate-900">
          {filteredInvoices.map(invoice => <button key={invoice.id} type="button" onClick={() => onSelectInvoice(invoice)} className="mb-2 flex w-full items-center justify-between gap-3 rounded-lg border bg-white p-3 text-right transition hover:border-emerald-500 hover:bg-emerald-50 dark:bg-slate-950">
            <span className="min-w-0"><strong>{invoice.vch_code}</strong><span className="mt-1 block truncate text-xs text-slate-500">{invoice.customer_name || "عميل نقدي"} · {String(invoice.vch_date).slice(0, 10)}</span></span>
            <b dir="ltr" className="shrink-0 tabular-nums">{Number(invoice.amount || 0).toFixed(2)} {currencyCode}</b>
          </button>)}
          {!filteredInvoices.length && <p className="py-12 text-center text-sm text-slate-500">{loadingInvoices ? "جاري تحميل الفواتير..." : "لا توجد فواتير مبيعات مطابقة"}</p>}
        </div>
      </> : <>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b p-3">
          <Button size="sm" variant="outline" onClick={onBack}><ArrowRight size={15} /> الفواتير</Button>
          <div className="text-left text-xs text-slate-500"><b className="block text-sm text-slate-800 dark:text-slate-100">{selectedInvoice.customer_name || "عميل نقدي"}</b>{String(selectedInvoice.vch_date).slice(0, 10)} · {Number(selectedInvoice.amount || 0).toFixed(2)} {currencyCode}</div>
        </div>
        {error && <p className="mx-4 mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {itemError && <p className="mx-4 mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{itemError}</p>}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3 dark:bg-slate-900">
          {loadingItems ? <p className="py-12 text-center text-sm text-slate-500">جاري تحميل أصناف الفاتورة...</p> : (selectedInvoice.items || []).map(item => {
            const soldQuantity = quantityOf(item)
            const isChecked = Boolean(checked[item.id])
            return <label key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_100px] items-center gap-3 rounded-lg border bg-white p-3 dark:bg-slate-950">
              <input type="checkbox" checked={isChecked} onChange={event => { setChecked(current => ({ ...current, [item.id]: event.target.checked })); setItemError("") }} aria-label={`اختيار ${item.product_name || item.item_name || "الصنف"}`} />
              <span className="min-w-0"><b className="block truncate">{item.product_name || item.item_name || "صنف"}</b><small className="block text-xs text-slate-500">{item.product_code || ""}{item.unit_name ? ` · ${item.unit_name}` : ""} · مباع: {soldQuantity} · {Number(item.price ?? item.unit_price ?? 0).toFixed(2)}</small></span>
              <Input aria-label={`كمية المرتجع ${item.product_name || item.item_name || "الصنف"}`} type="number" min="0" max={soldQuantity} step="0.001" disabled={!isChecked} value={quantities[item.id] ?? String(soldQuantity)} onChange={event => { setQuantities(current => ({ ...current, [item.id]: event.target.value })); setItemError("") }} />
            </label>
          })}
          {!loadingItems && !selectedInvoice.items?.length && <p className="py-12 text-center text-sm text-slate-500">لا توجد أصناف في الفاتورة</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t p-3"><Button variant="outline" onClick={onBack}>رجوع</Button><Button onClick={chooseItems} disabled={loadingItems || !selectedInvoice.items?.length}>إضافة المحدد إلى الكاشير</Button></div>
      </>}
    </DialogContent>
  </Dialog>
}