"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import dynamic from "next/dynamic"
import { Plus, Search, Package, X, ScanBarcode, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { campaignAmounts, editCampaignItem } from "@/lib/campaign-items"
import type { CampaignItem } from "./unified-campaigns"

const DataGridView = dynamic(() => import("@/components/common/DataGridView"), { ssr: false })
const ProductSearchPopup = dynamic(() => import("@/components/products/ProductSearchPopup"), { ssr: false })
export type CampaignProduct = { id: number; code?: string; name: string; sale_price?: number; unit_id?: number; unit_name?: string }

// Wijmo's KeyAction.CycleEditable: Enter/Tab move to the next editable cell, then the next row.
const KEY_ACTION_CYCLE_EDITABLE = 5

const buildRows = (items: CampaignItem[]) => items.map((item, index) => ({ ...item, _index: index, ser: index + 1, ...campaignAmounts(item) }))

export function CampaignItemsGrid({ title, items, setItems, products, gridRef, onError, priceClass = 1 }: {
  title: string; items: CampaignItem[]; setItems: (items: CampaignItem[]) => void; products: CampaignProduct[]; gridRef: MutableRefObject<any>
  onError?: (message: string) => void
  /** فئة السعر للحملة — أسعار البحث والباركود بحسبها */
  priceClass?: number
}) {
  const [search, setSearch] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchSeed, setSearchSeed] = useState("")
  const [resolving, setResolving] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState("")
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const setError = useCallback((message: string) => { if (message && onErrorRef.current) onErrorRef.current(message); else setLocalError(message) }, [])
  // The Wijmo grid binds cellEditEnded / button handlers once at initialisation, so everything they
  // touch is read through refs instead of render-time closures.
  const itemsRef = useRef(items)
  const setItemsRef = useRef(setItems)
  setItemsRef.current = setItems
  const emittedRef = useRef<CampaignItem[] | null>(null)
  const [rows, setRows] = useState(() => buildRows(items))

  // Rebind the grid only when items change from outside (add, delete, another campaign loaded).
  // Cell edits update the bound row in place, so selection and keyboard navigation are kept.
  useEffect(() => {
    itemsRef.current = items
    if (items !== emittedRef.current) setRows(buildRows(items))
  }, [items])

  const replaceAll = useCallback((next: CampaignItem[]) => {
    itemsRef.current = next
    emittedRef.current = null
    setItemsRef.current(next)
  }, [])

  const configureGrid = useCallback((grid: any) => {
    if (!grid || grid.__campaignKeysConfigured) return
    grid.keyActionEnter = KEY_ACTION_CYCLE_EDITABLE
    grid.keyActionTab = KEY_ACTION_CYCLE_EDITABLE
    grid.__campaignKeysConfigured = true
  }, [])

  useEffect(() => {
    let frame = 0
    let attempts = 0
    const tryConfigure = () => {
      const grid = gridRef.current?.control
      if (grid) configureGrid(grid)
      else if (attempts++ < 60) frame = requestAnimationFrame(tryConfigure)
    }
    tryConfigure()
    return () => cancelAnimationFrame(frame)
  }, [gridRef, configureGrid, rows.length])

  const matches = useMemo(() => search.trim()
    ? products.filter(product => `${product.code} ${product.name}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 40)
    : [], [products, search])

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
      onClick: (_event: any, context: any) => {
        const index = Number(context?.item?._index)
        if (!Number.isInteger(index)) return
        replaceAll(itemsRef.current.filter((_, position) => position !== index))
        setError("")
      } },
  ] }), [replaceAll])

  const toItem = (product: CampaignProduct): CampaignItem => ({ item_id: Number(product.id), item_code: product.code, item_name: product.name, unit_id: product.unit_id, unit_name: product.unit_name, price: Number(product.sale_price || 0), quantity: 1, discount: 0, discount_type: 1 })

  const addMany = (list: CampaignProduct[]) => {
    if (!list.length) return
    gridRef.current?.control?.finishEditing()
    replaceAll([...itemsRef.current, ...list.map(toItem)])
    setSearch("")
    setError("")
  }
  const add = (product: CampaignProduct) => addMany([product])

  const openItemSearch = (seed = search) => {
    setSearchSeed(seed.trim())
    setSearchOpen(true)
  }

  // Enter بمربع البحث: رقم صنف مطابق تماماً ⇐ باركود (وحدة الباركود وسعرها، لا الوحدة الأولى) ⇐ أول نتيجة
  // بالاسم ⇐ وإلا تُفتح نافذة بحث الأصناف بنفس النص.
  const resolveEntry = async () => {
    const text = search.trim()
    if (!text || resolving) return
    const exactCode = products.find((product) => String(product.code || "").trim().toLowerCase() === text.toLowerCase())
    if (exactCode) return add(exactCode)
    setResolving(true)
    try {
      const response = await fetch(`/api/campaigns?barcode=${encodeURIComponent(text)}&price_class=${priceClass}`, { cache: "no-store" })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.product) return add(data.product)
    } catch {
      // يُكمل للبحث بالاسم
    } finally {
      setResolving(false)
    }
    if (matches[0]) return add(matches[0])
    openItemSearch(text)
  }

  // اختيار من نافذة بحث الأصناف: الوحدة المختارة بالنافذة وسعرها؛ صنف بلا وحدة مختارة ⇐ وحدته الأولى
  const handlePopupSelect = (selected: any[]) => {
    setSearchOpen(false)
    const list = (Array.isArray(selected) ? selected : [selected]).filter(Boolean).map((row: any): CampaignProduct => {
      const catalog = products.find((product) => Number(product.id) === Number(row.id))
      const pickedUnitId = Number(row.unit_id ?? row.selected_unit?.unit_id) || 0
      return {
        id: Number(row.id),
        code: row.product_code ?? catalog?.code,
        name: row.product_name ?? catalog?.name ?? "",
        unit_id: pickedUnitId || catalog?.unit_id,
        unit_name: (pickedUnitId ? row.unit_name ?? row.selected_unit?.unit_name : null) ?? catalog?.unit_name ?? row.first_unit,
        sale_price: Number((pickedUnitId ? row.first_price ?? row.selected_unit?.price : null) ?? catalog?.sale_price ?? row.first_price ?? 0),
      }
    })
    addMany(list)
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  const beginningEdit = useCallback((grid: any) => configureGrid(grid), [configureGrid])

  const edited = useCallback((grid: any, event: any) => {
    configureGrid(grid)
    const row = grid.rows[event.row]?.dataItem
    if (!row) return
    const field = grid.columns[event.col]?.binding
    const index = Number(row._index)
    const original = itemsRef.current[index]
    if (!field || !original) return
    try {
      const next = field === "notes"
        ? { ...original, notes: String(row.notes ?? "") }
        : editCampaignItem(original, field, row[field] ?? 0)
      // Recalculate every dependent cell of this row immediately (discount ⇄ % ⇄ campaign value).
      Object.assign(row, next, campaignAmounts(next))
      grid.invalidate()
      const list = itemsRef.current.map((item, position) => position === index ? next : item)
      itemsRef.current = list
      emittedRef.current = list
      setItemsRef.current(list)
      setError("")
    } catch (reason) {
      Object.assign(row, original, campaignAmounts(original))
      grid.invalidate()
      setError(reason instanceof Error ? reason.message : "قيمة غير صالحة")
    }
  }, [configureGrid])

  return <section
    className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
    // F10 في أي مكان داخل القسم (مربع البحث أو الشبكة) يفتح نافذة بحث الأصناف — بمرحلة الالتقاط لأن محرر Wijmo يبتلع المفاتيح
    onKeyDownCapture={event => {
      if (event.key !== "F10") return
      event.preventDefault()
      event.stopPropagation()
      gridRef.current?.control?.finishEditing()
      openItemSearch()
    }}
  >
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-teal-50 p-2 text-teal-700"><Package size={20} /></span><div><h3 className="font-bold">{title}</h3><p className="text-xs text-slate-500">عدّل الكمية أو مبلغ الخصم أو النسبة أو قيمة الحملة — يُعاد الاحتساب فور الضغط على Enter</p></div></div>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{items.length} أصناف</span>
    </div>
    <div className="relative flex max-w-2xl items-center gap-2"><div className="relative flex-1"><ScanBarcode className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><Input ref={searchInputRef} aria-label={`بحث ${title}`} className="pr-9 pl-9" placeholder="رقم الصنف، الباركود أو الاسم — Enter للإضافة، F10 للبحث" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void resolveEntry() } if (event.key === "Escape") setSearch("") }} />{resolving && <Loader2 className="absolute left-3 top-3 h-4 w-4 animate-spin text-teal-600" />}</div>
      <button type="button" onClick={() => openItemSearch()} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 text-sm font-bold text-teal-700 hover:bg-teal-100"><Search size={15} />بحث الأصناف<kbd className="rounded bg-white px-1.5 font-mono text-[10px] text-teal-600 ring-1 ring-teal-200">F10</kbd></button>
      {search.trim() && !resolving && <div className="absolute right-0 top-full z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border bg-white shadow-xl">{matches.map(product => <button type="button" key={product.id} onClick={() => add(product)} className="flex w-full items-center gap-3 border-b p-3 text-right text-sm hover:bg-teal-50"><Plus size={16} /><span className="flex-1">{product.name}<small className="block text-slate-500">{product.code} · {product.unit_name}</small></span><span>{Number(product.sale_price || 0).toFixed(2)}</span></button>)}{!matches.length && <p className="p-4 text-sm text-slate-500">لا توجد أصناف مطابقة</p>}</div>}
    </div>
    {localError && <p role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{localError}<button type="button" aria-label="إغلاق" onClick={() => setLocalError("")}><X size={14} /></button></p>}
    <div className="h-[390px] overflow-hidden rounded-xl border"><DataGridView innerRef={gridRef} scheme={scheme} dataSource={rows} beginningEdit={beginningEdit} cellEditEnded={edited} defaultRowHeight={42} dontConvertToCards containerStyle={{ height: "100%" }} style={{ height: "100%" }} /></div>
    {!items.length && <p className="text-center text-sm text-slate-500">ابحث عن صنف أعلاه لبدء إعداد العرض.</p>}
    {searchOpen && <ProductSearchPopup visible={searchOpen} onClose={() => { setSearchOpen(false); requestAnimationFrame(() => searchInputRef.current?.focus()) }} onSelect={handlePopupSelect} priceCategoryId={priceClass} ShowSelect searchText={searchSeed} title="بحث الأصناف" />}
  </section>
}
