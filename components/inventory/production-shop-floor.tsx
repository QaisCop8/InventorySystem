"use client"
import { tr, appDir } from "@/lib/i18n"
import { amountFractionOptions } from "@/lib/decimals"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Minus, PackageSearch, Plus, Save, Settings2, Trash2, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ProductSearchPopup from "@/components/products/ProductSearchPopup"

// أرض المصنع (2026-11-24): «انتاج سريع» — صنف + كمية فقط، والباقي تلقائي (الوصفة مع الهدر، تكاليف الوصفة، الصلاحية
// والرقم التشغيلي، مستودعات المستخدم) ثم حفظ واعتماد بضغطة؛ و«مراكز العمل» (خطوط/آلات بكلفة ساعة تشغيل).

const money = (value: number) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const qty = (value: number) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0 }
const today = () => new Date().toISOString().slice(0, 10)
const addDays = (date: string, days: number) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10) }

type Info = {
  product: { id: number; product_code: string; product_name: string; unit_name: string; price: number; has_expiry: boolean; has_batch: boolean; unsupported: string | null }
  components: { product: { id: number; product_name: string; price: number; unsupported: string | null }; per_unit: number }[]
  recipe: { labor_cost: number; overhead_cost: number; packaging_cost: number; shelf_life_days: number } | null
}
type Requirement = { rows: { item_id: number; product_name: string; unit_name: string; required: number; available: number; shortage: number; unit_cost: number }[]; shortage_count: number; total_cost: number; store_checked: boolean }

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}))
  return data?.error || fallback
}

export function QuickProductionDialog({ branchId, warehouses, defaults, onClose, onDone, onOpenVoucher }: {
  branchId: number | null
  warehouses: { id: number; name: string }[]
  defaults: { finished_store_id: number | null; raw_store_id: number | null }
  onClose: () => void
  onDone: () => void
  onOpenVoucher: (id: number) => void
}) {
  const [info, setInfo] = useState<Info | null>(null)
  const [code, setCode] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [date, setDate] = useState(today())
  const [finished, setFinished] = useState(defaults.finished_store_id ? String(defaults.finished_store_id) : "")
  const [raw, setRaw] = useState(defaults.raw_store_id ? String(defaults.raw_store_id) : "")
  const [expiry, setExpiry] = useState("")
  const [batch, setBatch] = useState("")
  const [requirements, setRequirements] = useState<Requirement | null>(null)
  const [checking, setChecking] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<{ id: number; code: string; posted: boolean; message: string } | null>(null)
  const qtyRef = useRef<HTMLInputElement>(null)

  const amount = num(quantity)
  const usable = useMemo(() => (info?.components || []).filter((component) => !component.product.unsupported), [info])

  const loadProduct = async (query: string) => {
    setError(""); setResult(null)
    try {
      const response = await fetch(`/api/production-vouchers?${query}&date=${date}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await readError(response, tr("تعذر تحميل الصنف")))
      const item: Info | undefined = (await response.json()).items?.[0]
      if (!item) throw new Error(tr("الصنف غير موجود"))
      if (item.product.unsupported) throw new Error(tr("لا يمكن انتاج \"{0}\": {1}", item.product.product_name, item.product.unsupported))
      setInfo(item)
      setCode(item.product.product_code)
      const shelf = Number(item.recipe?.shelf_life_days) || 0
      setExpiry(item.product.has_expiry && shelf > 0 ? addDays(date, shelf) : "")
      setBatch(item.product.has_batch ? `B${date.replace(/-/g, "").slice(2)}-1` : "")
      setTimeout(() => qtyRef.current?.select(), 50)
    } catch (e) {
      setInfo(null)
      setError(e instanceof Error ? e.message : tr("تعذر تحميل الصنف"))
    }
  }

  // احتياج الخام وتوفره في مستودع الخام — يُعاد بعد توقف الكتابة
  useEffect(() => {
    if (!info || !(amount > 0) || !usable.length) { setRequirements(null); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      setChecking(true)
      try {
        const lines = encodeURIComponent(JSON.stringify([{ item_id: info.product.id, quantity: amount }]))
        const response = await fetch(`/api/production-orders?plan_lines=${lines}${raw ? `&raw_store_id=${raw}` : ""}&date=${date}`, { cache: "no-store" })
        if (!cancelled && response.ok) setRequirements(await response.json())
      } finally { if (!cancelled) setChecking(false) }
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [info, amount, raw, date, usable.length])

  const recipePerUnit = (Number(info?.recipe?.labor_cost) || 0) + (Number(info?.recipe?.overhead_cost) || 0) + (Number(info?.recipe?.packaging_cost) || 0)
  const rawCost = requirements?.total_cost ?? usable.reduce((sum, component) => sum + component.per_unit * amount * component.product.price, 0)
  const totalCost = rawCost + recipePerUnit * amount
  const unitCost = amount > 0 ? totalCost / amount : 0

  const submit = async (post: boolean) => {
    if (!info) { setError(tr("اختر الصنف المنتَج")); return }
    if (!(amount > 0)) { setError(tr("أدخل الكمية المنتجة")); return }
    if (!usable.length) { setError(tr("لا توجد مكونات تصنيع معرّفة على الصنف — استخدم سند الانتاج الكامل")); return }
    if (!finished || !raw) { setError(tr("اختر مستودع المواد الجاهزة ومستودع المواد الخام")); return }
    if (info.product.has_expiry && !expiry) { setError(tr("أدخل تاريخ صلاحية المنتَج")); return }
    if (info.product.has_batch && !batch.trim()) { setError(tr("أدخل الرقم التشغيلي")); return }
    setBusy(true); setError("")
    try {
      const round = (value: number) => Math.round(value * 1e6) / 1e6
      const costs = ([["labor", "labor_cost"], ["overhead", "overhead_cost"], ["packaging", "packaging_cost"]] as const)
        .map(([type, key]) => ({ cost_type: type, description: info.product.product_name, amount: round((Number(info.recipe?.[key]) || 0) * amount), source_line: 0 }))
        .filter((line) => line.amount > 0)
      const payload = {
        branch_id: branchId || undefined, vch_date: date, finished_store_id: Number(finished), raw_store_id: Number(raw), note: tr("انتاج سريع"),
        auto_cost: true, post,
        produced: [{ item_id: info.product.id, quantity: amount, price: 0, expiry_date: expiry || null, batch_no: batch.trim(), note: "" }],
        raw: usable.map((component) => ({ item_id: component.product.id, quantity: round(component.per_unit * amount), price: component.product.price, expiry_date: null, batch_no: "", note: "", source_line: 0, standard_quantity: round(component.per_unit * amount) })),
        costs,
      }
      const response = await fetch("/api/production-vouchers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (!response.ok) throw new Error(await readError(response, tr("تعذر حفظ سند الانتاج")))
      const data = await response.json()
      setResult({
        id: Number(data.id), code: data.code, posted: Boolean(data.posted),
        message: data.post_error ? tr("حُفظ السند {0} لكن تعذر اعتماده: {1}", data.code, data.post_error)
          : data.posted ? tr("تم انتاج {0} {1} واعتماده بالسند {2}", qty(amount), info.product.product_name, data.code) : tr("حُفظ سند الانتاج {0} (غير معتمد)", data.code),
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("تعذر حفظ سند الانتاج"))
    } finally { setBusy(false) }
  }

  const step = (delta: number) => setQuantity(String(Math.max(0, Math.round((amount + delta) * 1000) / 1000)))

  return (
    <Dialog open onOpenChange={(value) => { if (!value && !busy) onClose() }}>
      <DialogContent dir={appDir()} className="max-h-[calc(100%-1rem)] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto p-0"
        onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()} onFocusOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => { if (searchOpen || busy) event.preventDefault() }}>
        <DialogHeader className="rounded-t-lg bg-gradient-to-l from-amber-500 to-orange-600 px-5 py-4 text-start text-white">
          <DialogTitle className="flex items-center gap-2 text-lg"><Zap className="h-5 w-5" />{tr("انتاج سريع")}</DialogTitle>
          <p className="text-xs text-white/80">{tr("اختر الصنف والكمية — المواد الخام والتكاليف والصلاحية تُحسب تلقائياً")}</p>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
          {result && (
            <div className={`space-y-2 rounded-xl border p-3 text-sm font-semibold ${result.posted ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              <p className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />{result.message}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => onOpenVoucher(result.id)}><ExternalLink className="h-3.5 w-3.5" />{tr("فتح السند")}</Button>
                <Button size="sm" variant="outline" onClick={() => { setResult(null); setQuantity("1"); setTimeout(() => qtyRef.current?.select(), 50) }}>{tr("انتاج دفعة أخرى")}</Button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>{tr("الصنف المنتَج")}</Label>
            <div className="flex gap-2">
              <Input className="h-12 font-mono text-base" dir="ltr" placeholder={tr("رقم الصنف أو الباركود")} value={code} onChange={(event) => setCode(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && code.trim()) { event.preventDefault(); void loadProduct(`product_code=${encodeURIComponent(code.trim())}`) } }} autoFocus />
              <Button type="button" variant="outline" className="h-12 gap-1.5 px-4" onClick={() => setSearchOpen(true)}><PackageSearch className="h-5 w-5" />{tr("بحث")}</Button>
            </div>
            {info && <p className="text-base font-bold text-slate-800">{info.product.product_name} <span className="text-xs font-normal text-slate-500">({info.product.unit_name})</span></p>}
            {info && !usable.length && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">{tr("لا توجد مكونات تصنيع على هذا الصنف — عرّفها في بطاقة الصنف (مكونات التصنيع)")}</p>}
          </div>

          <div className="space-y-1">
            <Label>{tr("الكمية المنتجة")}</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="h-14 w-14 shrink-0" onClick={() => step(-1)} aria-label={tr("إنقاص")}><Minus className="h-6 w-6" /></Button>
              <Input ref={qtyRef} className="h-14 text-center font-mono text-2xl font-bold" type="number" min={0} step="any" dir="ltr" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submit(true) } }} />
              <Button type="button" variant="outline" className="h-14 w-14 shrink-0" onClick={() => step(1)} aria-label={tr("زيادة")}><Plus className="h-6 w-6" /></Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label className="text-xs">{tr("التاريخ")}</Label><Input type="date" dir="ltr" value={date} onChange={(event) => setDate(event.target.value)} /></div>
            <div className="space-y-1">
              <Label className="text-xs">{tr("مستودع المواد الجاهزة")}</Label>
              <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={finished} onChange={(event) => setFinished(event.target.value)}>
                <option value="">{tr("— اختر —")}</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{tr("مستودع المواد الخام")}</Label>
              <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={raw} onChange={(event) => setRaw(event.target.value)}>
                <option value="">{tr("— اختر —")}</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            {info?.product.has_expiry && <div className="space-y-1"><Label className="text-xs">{tr("تاريخ الصلاحية")}</Label><Input type="date" dir="ltr" value={expiry} onChange={(event) => setExpiry(event.target.value)} /></div>}
            {info?.product.has_batch && <div className="space-y-1"><Label className="text-xs">{tr("الرقم التشغيلي")}</Label><Input dir="ltr" maxLength={30} value={batch} onChange={(event) => setBatch(event.target.value)} /></div>}
          </div>

          {info && usable.length > 0 && amount > 0 && (
            <div className="space-y-2 rounded-xl border bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
                <span>{tr("المواد الخام")}</span>
                {checking ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : requirements && requirements.store_checked && (
                  requirements.shortage_count > 0
                    ? <span className="flex items-center gap-1 text-xs text-rose-700"><AlertTriangle className="h-4 w-4" />{tr("نواقص")}: {requirements.shortage_count}</span>
                    : <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />{tr("كل المواد متوفرة")}</span>
                )}
              </div>
              <ul className="space-y-1 text-sm">
                {(requirements?.rows || usable.map((component) => ({ item_id: component.product.id, product_name: component.product.product_name, unit_name: "", required: component.per_unit * amount, available: 0, shortage: 0, unit_cost: component.product.price }))).map((row) => (
                  <li key={row.item_id} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 ${row.shortage > 0 ? "bg-rose-100/70" : "bg-white"}`}>
                    <span className="min-w-0 truncate">{row.product_name}</span>
                    <span className="shrink-0 font-mono text-xs" dir="ltr">
                      {qty(row.required)}{requirements?.store_checked ? <span className="text-slate-400"> / {qty(row.available)}</span> : null}
                      {row.shortage > 0 && <b className="ms-1 text-rose-700">−{qty(row.shortage)}</b>}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-3 gap-2 border-t pt-2 text-center text-xs">
                <div><div className="text-slate-500">{tr("كلفة الخام")}</div><b className="font-mono" dir="ltr">{money(rawCost)}</b></div>
                <div><div className="text-slate-500">{tr("تكاليف الوصفة")}</div><b className="font-mono" dir="ltr">{money(recipePerUnit * amount)}</b></div>
                <div><div className="text-slate-500">{tr("كلفة الوحدة")}</div><b className="font-mono text-emerald-700" dir="ltr">{money(unitCost)}</b></div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sticky bottom-0 flex-col gap-2 border-t bg-white p-3 sm:flex-row">
          <Button disabled={busy || !info} onClick={() => void submit(true)} className="h-12 flex-1 gap-2 bg-emerald-600 text-base hover:bg-emerald-700">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}{tr("انتاج واعتماد")}
          </Button>
          <Button variant="outline" disabled={busy || !info} onClick={() => void submit(false)} className="h-12 gap-1.5"><Save className="h-4 w-4" />{tr("حفظ بدون اعتماد")}</Button>
          <Button variant="ghost" disabled={busy} onClick={onClose} className="h-12">{tr("إغلاق")}</Button>
        </DialogFooter>
      </DialogContent>

      <ProductSearchPopup
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(products) => { setSearchOpen(false); const id = Number(products?.[0]?.id); if (id) void loadProduct(`product_ids=${id}`) }}
        priceCategoryId={1}
        searchText=""
        productTypes={[1]}
        selectBaseProduct
        title={tr("اختيار صنف منتَج")}
      />
    </Dialog>
  )
}

/** مراكز العمل (خطوط انتاج/آلات): الاسم وكلفة ساعة التشغيل — المحذوف يُعطَّل فقط (سندات قديمة تشير إليه). */
export function WorkCentersDialog({ centers, onClose, onSaved }: {
  centers: { id: number; name: string; hourly_rate: number; active: boolean }[]
  onClose: () => void
  onSaved: (rows: { id: number; name: string; hourly_rate: number; active: boolean }[]) => void
}) {
  const [rows, setRows] = useState(() => centers.map((row) => ({ ...row, key: String(row.id), rate: String(row.hourly_rate || "") })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const save = async () => {
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/production-vouchers", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_work_centers", work_centers: rows.filter((row) => row.name.trim()).map((row) => ({ id: row.id || null, name: row.name, hourly_rate: num(row.rate), active: row.active })) }),
      })
      if (!response.ok) throw new Error(await readError(response, tr("تعذر حفظ مراكز العمل")))
      onSaved((await response.json()).work_centers || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("تعذر حفظ مراكز العمل"))
    } finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={(value) => { if (!value && !busy) onClose() }}>
      <DialogContent dir={appDir()} className="max-h-[calc(100%-1.5rem)] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto" onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader className="text-start"><DialogTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-violet-600" />{tr("مراكز العمل وخطوط الانتاج")}</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500">{tr("كلفة ساعة التشغيل (كهرباء، استهلاك الآلة، صيانة...) × ساعات التشغيل في السند = مصاريف تشغيل تُضاف لكلفة المنتَج")}</p>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.key} className={`grid grid-cols-[minmax(0,1fr)_110px_auto_auto] items-center gap-1.5 ${row.active ? "" : "opacity-50"}`}>
              <Input placeholder={tr("اسم المركز / الخط")} value={row.name} onChange={(event) => setRows((list) => list.map((item) => (item.key === row.key ? { ...item, name: event.target.value } : item)))} />
              <Input type="number" min={0} step="any" dir="ltr" className="font-mono" placeholder={tr("كلفة الساعة")} value={row.rate} onChange={(event) => setRows((list) => list.map((item) => (item.key === row.key ? { ...item, rate: event.target.value } : item)))} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="accent-emerald-600" checked={row.active} onChange={(event) => setRows((list) => list.map((item) => (item.key === row.key ? { ...item, active: event.target.checked } : item)))} />{tr("فعّال")}</label>
              <Button type="button" size="sm" variant="ghost" className="px-2 text-rose-600" onClick={() => setRows((list) => list.filter((item) => item.key !== row.key))} aria-label={tr("حذف")}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setRows((list) => [...list, { id: 0, name: "", hourly_rate: 0, active: true, key: Math.random().toString(36).slice(2), rate: "" }])}><Plus className="h-4 w-4" />{tr("إضافة مركز")}</Button>
        </div>
        <DialogFooter className="gap-2">
          <Button disabled={busy} onClick={() => void save()} className="gap-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{tr("حفظ")}</Button>
          <Button variant="outline" disabled={busy} onClick={onClose}>{tr("إلغاء")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
