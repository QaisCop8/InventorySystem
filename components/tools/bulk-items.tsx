"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Filter, Loader2, PackageSearch, Percent, Search, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import Messages from "@/components/common/Messages"
import { confirmYesNo } from "@/components/ui/confirm-host"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { BULK_ITEM_FIELDS, ITEM_STATUS_OPTIONS, PRODUCT_TYPE_OPTIONS, type BulkItemField, type BulkItemFilters } from "@/lib/bulk-items-shared"

// أدوات ⇐ تعديل الأصناف: فلترة الأصناف (مجموعة، تصنيف، نوع المخزون، علامة تجارية...) ثم تعديل حقل أو أكثر
// لها دفعة واحدة، و/أو رفع/خفض أسعار البيع بنسبة من السعر الحالي (lib/bulk-items.ts).

type Meta = { groups: ReportOption[]; categories: ReportOption[]; brands: (ReportOption & { type_name?: string })[]; warehouses: ReportOption[]; priceCategories: ReportOption[]; taxClassifications: ReportOption[] }
type Row = {
  id: number; product_code: string; product_name: string; type: number; status: number; product_type: string
  group_name: string | null; category_name: string | null; sale_price: number | null; price_unit_name: string | null; units_count: number
}

const SELECT_CLASS = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
const ROUND_OPTIONS = [{ label: "بدون تقريب", value: 0 }, { label: "0.05", value: 0.05 }, { label: "0.1", value: 0.1 }, { label: "0.5", value: 0.5 }, { label: "1", value: 1 }]
const money = (value: number | null | undefined) => (value == null ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 }))
const roundTo = (value: number, step: number) => (step > 0 ? Math.round(value / step) * step : Math.round(value * 1000) / 1000)
const typeLabel = (value: string) => PRODUCT_TYPE_OPTIONS.find((option) => option.value === String(value))?.label || "—"

export default function BulkItems() {
  const [meta, setMeta] = useState<Meta>({ groups: [], categories: [], brands: [], warehouses: [], priceCategories: [], taxClassifications: [] })
  const [filters, setFilters] = useState<BulkItemFilters>({ itemKind: "", status: "" })
  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [enabled, setEnabled] = useState<Partial<Record<BulkItemField, boolean>>>({})
  const [values, setValues] = useState<Partial<Record<BulkItemField, string>>>({})
  const [priceOn, setPriceOn] = useState(false)
  const [percent, setPercent] = useState("")
  const [priceCategoryId, setPriceCategoryId] = useState("1")
  const [round, setRound] = useState(0)
  const messagesRef = useRef<any>(null)

  const show = (severity: "success" | "error" | "info", detail: string) => {
    messagesRef.current?.clear?.()
    messagesRef.current?.show?.([{ severity, summary: "", detail, life: 6000, sticky: severity === "error" }])
  }

  useEffect(() => {
    fetch("/api/tools/bulk-items", { cache: "no-store" })
      .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "تعذر تحميل القوائم"); setMeta({ ...meta, ...data }) })
      .catch((error) => show("error", error instanceof Error ? error.message : "تعذر تحميل القوائم"))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = <K extends keyof BulkItemFilters>(key: K, value: BulkItemFilters[K]) => setFilters((current) => ({ ...current, [key]: value }))
  // سعر المعاينة: فئة تعديل السعر إن حُددت، وإلا الفئة الأولى
  const previewCategory = Number(priceCategoryId) || Number(meta.priceCategories[0]?.id) || 1

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/tools/bulk-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", filters, price_category_id: previewCategory }) })
      const data = await response.json().catch(() => [])
      if (!response.ok) throw new Error(data?.error || "تعذر تحميل الأصناف")
      const list: Row[] = Array.isArray(data) ? data : []
      setRows(list)
      setSelected(new Set(list.map((row) => row.id)))
      setSearched(true)
      if (list.length >= 5000) show("info", "تُعرض أول 5000 صنف فقط — ضيّق الفلاتر")
    } catch (error) {
      show("error", error instanceof Error ? error.message : "تعذر تحميل الأصناف")
    } finally {
      setLoading(false)
    }
  }

  // المعاينة تتبع فئة السعر المختارة لتعديل السعر
  useEffect(() => { if (searched) void load() }, [previewCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeChanges = useMemo(() => (Object.keys(BULK_ITEM_FIELDS) as BulkItemField[]).filter((field) => enabled[field]), [enabled])
  const percentValue = Number(percent)
  const priceActive = priceOn && Number.isFinite(percentValue) && percentValue !== 0
  const newPrice = (row: Row) => (row.sale_price == null || Number(row.sale_price) <= 0 ? null : roundTo(Number(row.sale_price) * (1 + percentValue / 100), round))

  const apply = async () => {
    const ids = rows.filter((row) => selected.has(row.id)).map((row) => row.id)
    if (!ids.length) return show("error", "حدد صنفاً واحداً على الأقل")
    if (!activeChanges.length && !priceActive) return show("error", "اختر حقلاً للتعديل أو أدخل نسبة تعديل الأسعار")
    if (priceOn && (!Number.isFinite(percentValue) || percentValue <= -100)) return show("error", "نسبة تعديل السعر غير صالحة")
    const changes: Record<string, string> = {}
    for (const field of activeChanges) changes[field] = values[field] ?? ""
    const summary = [
      ...activeChanges.map((field) => BULK_ITEM_FIELDS[field].label),
      ...(priceActive ? [`أسعار البيع ${percentValue > 0 ? "+" : ""}${percentValue}% (${Number(priceCategoryId) ? meta.priceCategories.find((option) => String(option.id) === priceCategoryId)?.name || "" : "كل الفئات"})`] : []),
    ].join("، ")
    if (!(await confirmYesNo(`سيتم تعديل ${ids.length} صنف: ${summary}. هل تريد المتابعة؟`))) return
    setApplying(true)
    try {
      const response = await fetch("/api/tools/bulk-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", filters, product_ids: ids, changes, price: priceActive ? { percent: percentValue, priceCategoryId: Number(priceCategoryId) || null, roundTo: round } : null }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذر تعديل الأصناف")
      show("success", `تمت العملية بنجاح — عُدّل ${data.updatedItems || 0} صنف${data.updatedPrices ? ` و${data.updatedPrices} سعر بيع` : ""}`)
      setPriceOn(false)
      setPercent("")
      setEnabled({})
      await load()
    } catch (error) {
      show("error", error instanceof Error ? error.message : "تعذر تعديل الأصناف")
    } finally {
      setApplying(false)
    }
  }

  const optionsFor = (field: BulkItemField): { label: string; value: string }[] => {
    const def = BULK_ITEM_FIELDS[field] as any
    if (def.options) return def.options.map((option: any) => ({ label: option.label, value: String(option.value) }))
    const list: ReportOption[] = def.source ? (meta as any)[def.source] || [] : []
    return list.map((option) => ({ label: [option.code, option.name].filter(Boolean).join(" — "), value: String(option.id) }))
  }

  const fieldControl = (field: BulkItemField) => {
    const def = BULK_ITEM_FIELDS[field] as any
    const value = values[field] ?? ""
    const set = (next: string) => { setValues((current) => ({ ...current, [field]: next })); setEnabled((current) => ({ ...current, [field]: true })) }
    if (def.kind === "account") return <AutoCompleteAccount valueMode="id" value={value} onValueChange={set} showCostCenterButton={false} searchAllowedTypeValues={[1]} />
    if (def.kind === "number") return <div className="relative"><Input type="number" min={0} max={def.max} value={value} onChange={(event) => set(event.target.value)} />{def.suffix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{def.suffix}</span>}</div>
    if (def.kind === "text") return <Input value={value} maxLength={def.maxLength} onChange={(event) => set(event.target.value)} />
    return (
      <select className={SELECT_CLASS} value={value} onChange={(event) => set(event.target.value)}>
        <option value="">{def.kind === "lookup" ? "— بلا —" : "اختر"}</option>
        {optionsFor(field).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    )
  }

  const allChecked = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const productTypeIds = (filters.productTypes || []).map(Number)
  const productTypeOptions: ReportOption[] = PRODUCT_TYPE_OPTIONS.map((option) => ({ id: Number(option.value), name: option.label }))
  const brandOptions: ReportOption[] = meta.brands.map((brand) => ({ id: brand.id, name: brand.type_name ? `${brand.name} (${brand.type_name})` : brand.name }))

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <header className="page-hero relative overflow-hidden rounded-2xl px-5 py-5 sm:px-7">
        <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-1/3 h-56 w-56 rounded-full bg-teal-300/25 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="relative flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur"><Wand2 /></div>
          <div>
            <p className="text-xs font-semibold text-emerald-50/90">أدوات</p>
            <h1 className="truncate text-2xl font-black text-white drop-shadow-sm sm:text-3xl">تعديل الأصناف</h1>
            <p className="mt-1 text-sm text-emerald-50/85">فلتر الأصناف ثم عدّل حقلاً أو أكثر لها دفعة واحدة، أو ارفع/اخفض أسعار البيع بنسبة مئوية</p>
          </div>
        </div>
      </header>

      <Messages innerRef={messagesRef} />

      <section className="rounded-2xl border bg-background p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Filter className="h-4 w-4 text-emerald-600" />الفلاتر</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ReportMultiChoice label="مجموعة الصنف" options={meta.groups} selected={filters.groupIds || []} onChange={(ids) => setFilter("groupIds", ids)} placeholder="كل المجموعات" />
          <ReportMultiChoice label="التصنيف" options={meta.categories} selected={filters.categoryIds || []} onChange={(ids) => setFilter("categoryIds", ids)} placeholder="كل التصنيفات" />
          <ReportMultiChoice label="نوع المخزون" options={productTypeOptions} selected={productTypeIds} onChange={(ids) => setFilter("productTypes", ids.map(String))} placeholder="كل الأنواع" />
          <ReportMultiChoice label="العلامة التجارية" options={brandOptions} selected={filters.brandIds || []} onChange={(ids) => setFilter("brandIds", ids)} placeholder="كل العلامات" />
          <ReportMultiChoice label="التصنيف الضريبي" options={meta.taxClassifications} selected={filters.taxClassificationIds || []} onChange={(ids) => setFilter("taxClassificationIds", ids)} placeholder="الكل" />
          <div className="grid gap-1.5">
            <Label>صنف / خدمة</Label>
            <select className={SELECT_CLASS} value={filters.itemKind || ""} onChange={(event) => setFilter("itemKind", event.target.value as BulkItemFilters["itemKind"])}>
              <option value="">الكل</option><option value="item">أصناف</option><option value="service">خدمات</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>الحالة</Label>
            <select className={SELECT_CLASS} value={filters.status || ""} onChange={(event) => setFilter("status", event.target.value as BulkItemFilters["status"])}>
              <option value="">الكل</option><option value="active">فعال</option><option value="frozen">مجمد</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>بحث (رقم / اسم / باركود)</Label>
            <Input value={filters.search || ""} onChange={(event) => setFilter("search", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load() }} />
          </div>
          <div className="grid gap-1.5"><Label>من رقم صنف</Label><Input value={filters.codeFrom || ""} onChange={(event) => setFilter("codeFrom", event.target.value)} dir="ltr" /></div>
          <div className="grid gap-1.5"><Label>إلى رقم صنف</Label><Input value={filters.codeTo || ""} onChange={(event) => setFilter("codeTo", event.target.value)} dir="ltr" /></div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button onClick={() => void load()} disabled={loading} data-report-apply>
              {loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض الأصناف
            </Button>
            <Button variant="outline" onClick={() => { setFilters({ itemKind: "", status: "" }); setRows([]); setSelected(new Set()); setSearched(false) }}>مسح الفلاتر</Button>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-bold"><PackageSearch className="h-4 w-4 text-emerald-600" />الأصناف المطابقة</span>
            <span className="text-sm">{searched ? <>محدد <b>{selected.size}</b> من {rows.length}</> : "اضغط عرض الأصناف"}</span>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 p-2 text-center"><Checkbox checked={allChecked} onCheckedChange={(value) => setSelected(value === true ? new Set(rows.map((row) => row.id)) : new Set())} aria-label="تحديد الكل" /></th>
                  <th className="p-2 text-right">رقم الصنف</th>
                  <th className="p-2 text-right">اسم الصنف</th>
                  <th className="p-2 text-right">المجموعة</th>
                  <th className="p-2 text-right">نوع المخزون</th>
                  <th className="p-2 text-center">الحالة</th>
                  <th className="p-2 text-left">سعر البيع</th>
                  {priceActive && <th className="p-2 text-left text-emerald-700 dark:text-emerald-400">السعر الجديد</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const next = priceActive ? newPrice(row) : null
                  return (
                    <tr key={row.id} className={`border-t ${selected.has(row.id) ? "" : "opacity-50"}`}>
                      <td className="p-2 text-center"><Checkbox checked={selected.has(row.id)} onCheckedChange={(value) => setSelected((current) => { const set = new Set(current); if (value === true) set.add(row.id); else set.delete(row.id); return set })} aria-label={`تحديد ${row.product_name}`} /></td>
                      <td className="p-2 font-mono text-xs">{row.product_code}</td>
                      <td className="p-2">{row.product_name}{Number(row.type) === 2 && <span className="mr-1 rounded bg-sky-100 px-1 text-[10px] text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">خدمة</span>}</td>
                      <td className="p-2 text-xs text-muted-foreground">{row.group_name || "—"}</td>
                      <td className="p-2 text-xs text-muted-foreground">{typeLabel(row.product_type)}</td>
                      <td className="p-2 text-center text-xs">{ITEM_STATUS_OPTIONS.find((option) => option.value === Number(row.status))?.label || "—"}</td>
                      <td className="p-2 text-left tabular-nums" dir="ltr">{money(row.sale_price)}{row.price_unit_name && <span className="ml-1 text-[11px] text-muted-foreground">{row.price_unit_name}</span>}</td>
                      {priceActive && <td className="p-2 text-left font-semibold tabular-nums text-emerald-700 dark:text-emerald-400" dir="ltr">{money(next)}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {searched && !loading && rows.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">لا توجد أصناف مطابقة للفلاتر</div>}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border bg-background p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold">الحقول المراد تعديلها</h2>
            <div className="space-y-2.5">
              {(Object.keys(BULK_ITEM_FIELDS) as BulkItemField[]).map((field) => (
                <div key={field} className={`rounded-lg border p-2.5 ${enabled[field] ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20" : ""}`}>
                  <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox checked={Boolean(enabled[field])} onCheckedChange={(value) => setEnabled((current) => ({ ...current, [field]: value === true }))} />
                    {BULK_ITEM_FIELDS[field].label}
                  </label>
                  {enabled[field] && fieldControl(field)}
                </div>
              ))}
            </div>
          </section>

          <section className={`rounded-2xl border bg-background p-4 shadow-sm ${priceOn ? "border-emerald-300 dark:border-emerald-800" : ""}`}>
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm font-bold">
              <Checkbox checked={priceOn} onCheckedChange={(value) => setPriceOn(value === true)} />
              <Percent className="h-4 w-4 text-emerald-600" />تعديل أسعار البيع بنسبة
            </label>
            {priceOn && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="grid gap-1.5">
                  <Label>النسبة % <span className="text-xs font-normal text-muted-foreground">(موجبة للرفع، سالبة للخفض)</span></Label>
                  <Input type="number" step="0.01" value={percent} onChange={(event) => setPercent(event.target.value)} placeholder="مثال: 10 أو -5" dir="ltr" />
                </div>
                <div className="grid gap-1.5">
                  <Label>فئة السعر</Label>
                  <select className={SELECT_CLASS} value={priceCategoryId} onChange={(event) => setPriceCategoryId(event.target.value)}>
                    <option value="0">كل فئات الأسعار</option>
                    {meta.priceCategories.map((option) => <option key={option.id} value={String(option.id)}>{option.name}</option>)}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label>التقريب</Label>
                  <select className={SELECT_CLASS} value={round} onChange={(event) => setRound(Number(event.target.value))}>
                    {ROUND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">يُطبَّق على كل وحدات الصنف في الفئة المختارة (الأسعار الصفرية لا تتغير).{Number(priceCategoryId) === 0 && " المعاينة تعرض الفئة الأولى."}</p>
              </div>
            )}
          </section>

          <Button className="h-11 w-full" onClick={() => void apply()} disabled={applying || !selected.size}>
            {applying ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Wand2 className="ml-2 h-4 w-4" />}تطبيق على {selected.size} صنف
          </Button>
        </aside>
      </div>
    </div>
  )
}
