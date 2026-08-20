"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PRODUCT_VARIANT_REQUEST_EVENT, type ConfigurableProduct } from "./product-variant-service"

type PendingRequest = { product: ConfigurableProduct; readOnly?: boolean; resolve: (product: ConfigurableProduct | null) => void }

export function ProductVariantProvider() {
  const [pending, setPending] = useState<PendingRequest | null>(null)
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [readOnly, setReadOnly] = useState(false)

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<PendingRequest>).detail
      if (!detail?.product || typeof detail.resolve !== "function") return
      setPending(detail)
      setSelection(detail.product.selected_attributes || {})
      setReadOnly(!!detail.readOnly)
      setError("")
    }
    window.addEventListener(PRODUCT_VARIANT_REQUEST_EVENT, handler)
    return () => window.removeEventListener(PRODUCT_VARIANT_REQUEST_EVENT, handler)
  }, [])

  if (!pending) return null
  const attributes = pending.product.attributes || []
  const cancel = () => { pending.resolve(null); setPending(null); setSelection({}); setError(""); setReadOnly(false) }
  const confirm = () => {
    if (readOnly) { cancel(); return }
    if (attributes.some((attribute) => !selection[attribute.name])) {
      setError("يجب اختيار قيمة لكل خصائص الصنف")
      return
    }
    const summary = attributes.map((attribute) => `${attribute.name}: ${selection[attribute.name]}`).join("، ")
    const baseProductName = pending.product.base_product_name || pending.product.product_name
    pending.resolve({ ...pending.product, product_name: summary ? `${baseProductName || ""} (${summary})` : baseProductName, base_product_name: baseProductName, selected_attributes: selection, attribute_summary: summary })
    setPending(null)
    setSelection({})
    setError("")
    setReadOnly(false)
  }

  return <div className="pointer-events-auto fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-3" dir="rtl">
    <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-xl font-bold">تهيئة الصنف</h2><p className="text-sm text-muted-foreground">اختر خصائص الصنف قبل إضافته إلى الحركة</p></div><Button type="button" variant="ghost" size="icon" onClick={cancel}><X className="h-5 w-5" /></Button></div>
      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5 md:grid-cols-[180px_1fr]">
        <div className="flex min-h-40 items-center justify-center rounded-xl border bg-slate-50 p-3">{pending.product.product_image || pending.product.image_url ? <img src={pending.product.product_image || pending.product.image_url || ""} alt="" className="max-h-44 max-w-full object-contain" /> : <span className="text-sm text-muted-foreground">لا توجد صورة</span>}</div>
        <div><h3 className="mb-5 text-lg font-bold">{pending.product.product_name}</h3><div className="space-y-5">{attributes.map((attribute) => <fieldset key={attribute.name} disabled={readOnly}><legend className="mb-2 font-semibold">{attribute.name} *</legend><div className="flex flex-wrap gap-3">{attribute.values.map((value) => { const image = attribute.value_images?.[value] || pending.product.product_image || pending.product.image_url; return <label key={value} className={`flex items-center gap-2 rounded-xl border px-4 py-2 transition ${readOnly ? "cursor-default opacity-80" : "cursor-pointer"} ${selection[attribute.name] === value ? "border-violet-600 bg-violet-50 text-violet-800 ring-1 ring-violet-600" : "hover:bg-muted"}`}><input type="radio" name={`variant-${attribute.name}`} value={value} checked={selection[attribute.name] === value} onChange={() => { setSelection((previous) => ({ ...previous, [attribute.name]: value })); setError("") }} />{image ? <img src={image} alt="" className="h-10 w-10 rounded-lg object-cover" /> : null}<span>{value}</span></label> })}</div></fieldset>)}</div></div>
      </div>
      {error && <div className="mx-5 rounded-md border border-red-200 bg-red-50 p-2 text-sm font-semibold text-red-700">{error}</div>}
      <div className="flex justify-end gap-2 border-t p-4"><Button type="button" onClick={confirm}>{readOnly ? "إغلاق" : "تأكيد"}</Button>{!readOnly && <Button type="button" variant="outline" onClick={cancel}>إلغاء</Button>}</div>
    </div>
  </div>
}
