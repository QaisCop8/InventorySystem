"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, PackageOpen, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// بحث الأصناف في كاشير نقطة البيع (F10): من كتالوج نقطة البيع نفسه (أسعار النقطة/العميل الحالية، المخزون،
// إعدادات الحسابات) — اختيار الصنف ثم وحدته إن كان له أكثر من وحدة، فيُضاف بتلك الوحدة وسعرها وباركودها.

export type PosSearchUnit = { unitId: number | null; unitName: string; price: number; barcode: string }

type SearchableProduct = {
  id: number
  code: string
  name: string
  barcode: string
  price: number
  unitId: number | null
  unitName: string
  available: number
  unitPrices?: { unitId: number | null; price: number; unitName?: string }[]
  barcodeOptions: { barcode: string; price: number; unitId: number | null; unitName: string }[]
}

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim()

/** وحدات الصنف: أسعار الوحدات + أسماؤها من الباركودات، مع وحدة الصنف الافتراضية دائماً. */
export function productUnits(product: SearchableProduct): PosSearchUnit[] {
  const units = new Map<string, PosSearchUnit>()
  const keyOf = (unitId: number | null) => String(unitId ?? "default")
  units.set(keyOf(product.unitId), { unitId: product.unitId, unitName: product.unitName, price: product.price, barcode: product.barcode })
  for (const row of product.unitPrices || []) {
    const key = keyOf(row.unitId)
    const option = product.barcodeOptions.find((candidate) => candidate.unitId === row.unitId)
    const existing = units.get(key)
    units.set(key, {
      unitId: row.unitId,
      unitName: row.unitName || option?.unitName || existing?.unitName || "",
      price: Number(row.price) > 0 ? Number(row.price) : existing?.price ?? 0,
      barcode: existing?.barcode || option?.barcode || "",
    })
  }
  for (const option of product.barcodeOptions) {
    const key = keyOf(option.unitId)
    if (!units.has(key)) units.set(key, { unitId: option.unitId, unitName: option.unitName, price: option.price, barcode: option.barcode })
  }
  return Array.from(units.values())
}

export function PosItemSearchDialog<T extends SearchableProduct>({
  open,
  products,
  initialQuery = "",
  currencyCode,
  onClose,
  onSelect,
}: {
  open: boolean
  products: T[]
  initialQuery?: string
  currencyCode?: string
  onClose: () => void
  onSelect: (product: T, unit: PosSearchUnit) => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [active, setActive] = useState(0)
  const [unitProduct, setUnitProduct] = useState<T | null>(null)
  const [activeUnit, setActiveUnit] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery(initialQuery)
    setActive(0)
    setUnitProduct(null)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open, initialQuery])

  const results = useMemo(() => {
    const terms = normalizeText(query).split(/\s+/).filter(Boolean)
    const list = terms.length
      ? products.filter((product) => {
          const haystack = normalizeText(`${product.name} ${product.code} ${product.barcode} ${product.barcodeOptions.map((option) => option.barcode).join(" ")}`)
          return terms.every((term) => haystack.includes(term))
        })
      : products
    return list.slice(0, 200)
  }, [products, query])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${unitProduct ? activeUnit : active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active, activeUnit, unitProduct])

  const units = useMemo(() => (unitProduct ? productUnits(unitProduct) : []), [unitProduct])

  const chooseProduct = (product: T | undefined) => {
    if (!product) return
    const list = productUnits(product)
    if (list.length <= 1) {
      onSelect(product, list[0])
      return
    }
    // باركود مُدخل يطابق وحدة بعينها ⇐ تُختار مباشرة دون سؤال
    const typed = query.trim()
    const exact = typed ? list.find((unit) => unit.barcode && unit.barcode === typed) : undefined
    if (exact) {
      onSelect(product, exact)
      return
    }
    setUnitProduct(product)
    setActiveUnit(Math.max(0, list.findIndex((unit) => unit.unitId === product.unitId)))
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const count = unitProduct ? units.length : results.length
    if (event.key === "ArrowDown") {
      event.preventDefault()
      unitProduct ? setActiveUnit((index) => Math.min(count - 1, index + 1)) : setActive((index) => Math.min(count - 1, index + 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      unitProduct ? setActiveUnit((index) => Math.max(0, index - 1)) : setActive((index) => Math.max(0, index - 1))
    } else if (event.key === "Enter") {
      event.preventDefault()
      event.stopPropagation()
      if (unitProduct) {
        const unit = units[activeUnit]
        if (unit) onSelect(unitProduct, unit)
      } else chooseProduct(results[active])
    }
  }

  const price = (value: number) => `${Number(value || 0).toFixed(2)}${currencyCode ? ` ${currencyCode}` : ""}`

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent dir="rtl" className="flex max-h-[85dvh] w-[96vw] max-w-3xl flex-col gap-0 overflow-hidden p-0" onKeyDown={onKeyDown}
        // Esc بخطوة اختيار الوحدة يرجع لقائمة الأصناف بدل إغلاق النافذة
        onEscapeKeyDown={(event) => {
          if (!unitProduct) return
          event.preventDefault()
          setUnitProduct(null)
          requestAnimationFrame(() => inputRef.current?.focus())
        }}
      >
        <DialogHeader className="border-b bg-gradient-to-l from-emerald-600 to-teal-600 px-5 py-3 text-right text-white">
          <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
            <Search className="h-4 w-4" />
            {unitProduct ? `اختر وحدة: ${unitProduct.name}` : "بحث الأصناف"}
          </DialogTitle>
          <DialogDescription className="text-xs text-emerald-50/90">
            {unitProduct ? "↑↓ للتنقل · Enter لإضافة الصنف بهذه الوحدة · Esc للرجوع" : "اكتب الاسم أو الرقم أو الباركود · ↑↓ للتنقل · Enter للاختيار"}
          </DialogDescription>
        </DialogHeader>

        {!unitProduct && (
          <div className="border-b px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم الصنف أو رقمه أو الباركود…" className="h-11 pr-9 text-base" />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{results.length} صنف{results.length === 200 ? " (أول 200 نتيجة)" : ""}</p>
          </div>
        )}

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {unitProduct ? (
            <>
              <button
                type="button"
                onClick={() => { setUnitProduct(null); requestAnimationFrame(() => inputRef.current?.focus()) }}
                className="mb-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                رجوع للأصناف
              </button>
              {units.map((unit, index) => (
                <button
                  key={`${unit.unitId ?? "default"}`}
                  type="button"
                  data-index={index}
                  onMouseEnter={() => setActiveUnit(index)}
                  onClick={() => onSelect(unitProduct, unit)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-right transition-colors",
                    index === activeUnit ? "border-emerald-300 bg-emerald-50" : "border-transparent hover:bg-slate-50",
                  )}
                >
                  <span>
                    <b className="block text-sm">{unit.unitName || "وحدة"}</b>
                    {unit.barcode && <small className="font-mono text-xs text-slate-500" dir="ltr">{unit.barcode}</small>}
                  </span>
                  <strong className={cn("text-sm tabular-nums", unit.price > 0 ? "text-emerald-700" : "text-rose-600")} dir="ltr">
                    {unit.price > 0 ? price(unit.price) : "بلا سعر"}
                  </strong>
                </button>
              ))}
            </>
          ) : results.length ? (
            results.map((product, index) => {
              const unitCount = productUnits(product).length
              return (
                <button
                  key={product.id}
                  type="button"
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => chooseProduct(product)}
                  className={cn(
                    "grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-xl border px-3 py-2.5 text-right transition-colors",
                    index === active ? "border-emerald-300 bg-emerald-50" : "border-transparent hover:bg-slate-50",
                  )}
                >
                  <span className="min-w-0">
                    <b className="block truncate text-sm">{product.name}</b>
                    <small className="flex flex-wrap gap-x-2 text-xs text-slate-500">
                      <span dir="ltr">{product.code}</span>
                      <span>· {product.unitName || "وحدة"}</span>
                      {unitCount > 1 && <span className="font-bold text-teal-700">· {unitCount} وحدات</span>}
                      <span className={product.available <= 0 ? "text-rose-600" : ""}>· المتوفر {product.available}</span>
                    </small>
                  </span>
                  <strong className="text-sm tabular-nums text-emerald-700" dir="ltr">{price(product.price)}</strong>
                </button>
              )
            })
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-slate-500">
              <PackageOpen className="h-8 w-8 text-slate-300" />
              لا توجد أصناف مطابقة
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
