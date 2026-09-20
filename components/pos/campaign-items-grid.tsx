"use client"

import { useMemo, useState, type MutableRefObject } from "react"
import dynamic from "next/dynamic"
import { Plus, Search, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { campaignAmounts, editCampaignItem } from "@/lib/campaign-items"
import type { CampaignItem } from "./unified-campaigns"

const DataGridView = dynamic(() => import("@/components/common/DataGridView"), { ssr: false })
export type CampaignProduct = { id: number; code?: string; name: string; sale_price?: number; unit_id?: number; unit_name?: string }

export function CampaignItemsGrid({ title, items, setItems, products, gridRef }: {
  title: string; items: CampaignItem[]; setItems: (items: CampaignItem[]) => void; products: CampaignProduct[]; gridRef: MutableRefObject<any>
}) {
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const matches = useMemo(() => search.trim() ? products.filter(product => `${product.code} ${product.name}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 40) : [], [products, search])
  const rows = useMemo(() => items.map((item, index) => ({ ...item, _index: index, ser: index + 1, ...campaignAmounts(item) })), [items])
  const scheme = useMemo(() => ({ name: "campaign-items", sortable: false, columns: [
    { name: "ser", header: "#", width: 48, isReadOnly: true },
    { name: "item_code", header: "رقم الصنف", width: 130, isReadOnly: true },
    { name: "item_name", header: "اسم الصنف", width: "*", minWidth: 200, isReadOnly: true },
    { name: "unit_name", header: "الوحدة", width: 90, isReadOnly: true },
    { name: "price", header: "السعر", width: 100, dataType: "Number", format: "n2", isReadOnly: true },
    { name: "quantity", header: "الكمية", width: 100, dataType: "Number", format: "n2" },
    { name: "qtyAmount", header: "القيمة الأصلية", width: 125, dataType: "Number", format: "n2", isReadOnly: true },
    { name: "discount", header: "مبلغ الخصم", width: 110, dataType: "Number", format: "n2" },
    { name: "discount_ratio", header: "الخصم %", width: 100, dataType: "Number", format: "n2" },
    { name: "campQtyAmount", header: "قيمة الحملة", width: 125, dataType: "Number", format: "n2" },
    { name: "notes", header: "ملاحظات", width: 180 },
    { name: "delete", header: "حذف", width: 65, buttonBody: "button", iconType: "delete", className: "danger", isReadOnly: true,
      onClick: (_event: any, context: any) => setItems(items.filter((_, index) => index !== context.item._index)) },
  ] }), [items, setItems])
  const add = (product: CampaignProduct) => {
    gridRef.current?.control?.finishEditing()
    setItems([...items, { item_id: Number(product.id), item_code: product.code, item_name: product.name, unit_id: product.unit_id, unit_name: product.unit_name, price: Number(product.sale_price || 0), quantity: 1, discount: 0, discount_type: 1 }])
    setSearch(""); setError("")
  }
  const edited = (grid: any, event: any) => {
    const row = grid.rows[event.row]?.dataItem
    if (!row) return
    const field = grid.columns[event.col].binding
    try {
      const original = items[row._index]
      const next = field === "notes" ? { ...original, notes: String(row.notes || "") } : editCampaignItem(original, field, row[field])
      setItems(items.map((item, index) => index === row._index ? next : item)); setError("")
    } catch (reason) {
      Object.assign(row, items[row._index], campaignAmounts(items[row._index])); grid.invalidate()
      setError(reason instanceof Error ? reason.message : "قيمة غير صالحة")
    }
  }
  return <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-teal-50 p-2 text-teal-700"><Package size={20}/></span><div><h3 className="font-bold">{title}</h3><p className="text-xs text-slate-500">عدّل الكمية أو الخصم أو قيمة الحملة مباشرة في الجدول</p></div></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{items.length} أصناف</span></div>
    <div className="relative max-w-xl"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400"/><Input aria-label={`بحث ${title}`} className="pr-9" placeholder="ابحث برقم الصنف أو اسمه لإضافته…" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && matches[0]) { event.preventDefault(); add(matches[0]) } if (event.key === "Escape") setSearch("") }}/>
      {search.trim() && <div className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border bg-white shadow-xl">{matches.map(product => <button type="button" key={product.id} onClick={() => add(product)} className="flex w-full items-center gap-3 border-b p-3 text-right text-sm hover:bg-teal-50"><Plus size={16}/><span className="flex-1">{product.name}<small className="block text-slate-500">{product.code} · {product.unit_name}</small></span><span>{Number(product.sale_price || 0).toFixed(2)}</span></button>)}{!matches.length && <p className="p-4 text-sm text-slate-500">لا توجد أصناف مطابقة</p>}</div>}
    </div>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    <div className="h-[390px] overflow-hidden rounded-xl border"><DataGridView innerRef={gridRef} scheme={scheme} dataSource={rows} cellEditEnded={edited} defaultRowHeight={42} dontConvertToCards containerStyle={{ height: "100%" }} style={{ height: "100%" }}/></div>
    {!items.length && <p className="text-center text-sm text-slate-500">ابحث عن صنف أعلاه لبدء إعداد العرض.</p>}
  </section>
}
