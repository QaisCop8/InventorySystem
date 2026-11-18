"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Loader2, MapPin, Pencil, Printer, Search, ShieldCheck, Warehouse as WarehouseIcon, X } from "lucide-react"
import { VoucherListHero, VoucherStats } from "@/components/common/voucher-list-shell"
import { normalizeArabicSearch } from "@/lib/arabic-search"
import { WarehouseUsersDialog } from "./warehouse-users-dialog"
import CostCenterDefaultsEditor, { type CostCenterDefaultValue } from "@/components/common/cost-center-defaults-editor"

// تعريف المستودعات (أُعيد تصميمه 2026-11-18): رأس الصفحة القياسي + بطاقات المستودعات + نافذة بأقسام.
// الحذف أُلغي بطلب المستخدم — يُوقف المستودع بحالة «متوقف» (api/warehouses/[id] DELETE يرفض).
interface Warehouse {
  id: number
  warehouse_code: string
  warehouse_name: string
  warehouse_name_en?: string
  description?: string
  location?: string
  status: number
  default_printer?: string | null
  cost_centers?: CostCenterDefaultValue[]
}

interface WarehouseForm {
  id: number
  warehouse_code: string
  warehouse_name: string
  warehouse_name_en: string
  description: string
  location: string
  status: number
  default_printer: string
  cost_centers: CostCenterDefaultValue[]
}

const initialForm: WarehouseForm = {
  id: 0,
  warehouse_code: "",
  warehouse_name: "",
  warehouse_name_en: "",
  description: "",
  location: "",
  status: 1,
  default_printer: "",
  cost_centers: [],
}

type StatusFilter = "all" | "active" | "stopped"

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950" />
        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">{title}</h3>
      </div>
      {hint && <p className="-mt-1 mb-3 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </section>
  )
}

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<WarehouseForm>(initialForm)
  // صلاحيات المستخدمين على المستودع (lib/warehouse-access.ts)
  const [usersFor, setUsersFor] = useState<{ id: number; name: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const activeWarehouses = useMemo(() => warehouses.filter((w) => w.status === 1).length, [warehouses])
  const stoppedWarehouses = warehouses.length - activeWarehouses

  const shown = useMemo(() => {
    const term = normalizeArabicSearch(query.trim())
    return warehouses.filter((w) =>
      (statusFilter === "all" || (statusFilter === "active" ? w.status === 1 : w.status !== 1)) &&
      (!term || normalizeArabicSearch(`${w.warehouse_code} ${w.warehouse_name} ${w.warehouse_name_en || ""} ${w.location || ""}`).includes(term)))
  }, [warehouses, query, statusFilter])

  useEffect(() => { void fetchWarehouses() }, [])

  const fetchWarehouses = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/warehouses")
      const data = await response.json()
      setWarehouses(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch warehouses", error)
      setWarehouses([])
    } finally {
      setLoading(false)
    }
  }

  const openNewDialog = () => {
    setForm(initialForm)
    setErrorMessage("")
    setDialogOpen(true)
  }

  const openEditDialog = (warehouse: Warehouse) => {
    setForm({
      id: warehouse.id,
      warehouse_code: warehouse.warehouse_code,
      warehouse_name: warehouse.warehouse_name,
      warehouse_name_en: warehouse.warehouse_name_en || "",
      description: warehouse.description || "",
      location: warehouse.location || "",
      status: warehouse.status,
      default_printer: warehouse.default_printer || "",
      cost_centers: warehouse.cost_centers || [],
    })
    setErrorMessage("")
    setDialogOpen(true)
  }

  const saveWarehouse = async () => {
    if (!form.warehouse_name.trim()) {
      setErrorMessage(tr("اسم المستودع مطلوب"))
      return
    }
    setIsSaving(true)
    setErrorMessage("")
    try {
      const method = form.id > 0 ? "PUT" : "POST"
      const url = form.id > 0 ? `/api/warehouses/${form.id}` : "/api/warehouses"
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        setErrorMessage(error.error || tr("فشل في حفظ المستودع"))
        return
      }
      await fetchWarehouses()
      setDialogOpen(false)
    } catch (error) {
      console.error(error)
      setErrorMessage(tr("فشل في حفظ المستودع"))
    } finally {
      setIsSaving(false)
    }
  }

  const set = <K extends keyof WarehouseForm>(key: K, value: WarehouseForm[K]) => setForm((f) => ({ ...f, [key]: value }))
  const filters: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: tr("الكل"), count: warehouses.length },
    { key: "active", label: tr("نشط"), count: activeWarehouses },
    { key: "stopped", label: tr("متوقف"), count: stoppedWarehouses },
  ]

  return (
    <div className="space-y-4 p-1" dir={appDir()}>
      <VoucherListHero
        title={tr("تعريف المستودعات")}
        subtitle={tr("المستودعات وطابعاتها ومراكز تكلفتها وصلاحيات المستخدمين عليها")}
        category={tr("الملفات")}
        icon={WarehouseIcon}
        addLabel={tr("إضافة مستودع")}
        onNew={openNewDialog}
      />
      <VoucherStats stats={[
        { label: tr("إجمالي المستودعات"), value: warehouses.length },
        { label: tr("المستودعات الفعالة"), value: activeWarehouses },
        { label: tr("المستودعات المتوقفة"), value: stoppedWarehouses },
      ]} />

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-10 rounded-xl ps-9" placeholder={tr("بحث بالرمز أو الاسم أو الموقع")} value={query} onChange={(event) => setQuery(event.target.value)} />
            {query && <button type="button" className="absolute end-3 top-2.5 text-muted-foreground" onClick={() => setQuery("")} aria-label={tr("مسح")}><X className="h-4 w-4" /></button>}
          </div>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            {filters.map((row) => (
              <button key={row.key} type="button" onClick={() => setStatusFilter(row.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${statusFilter === row.key ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-300" : "text-slate-500 hover:text-slate-800"}`}>
                {row.label} <span className="opacity-60">{row.count}</span>
              </button>
            ))}
          </div>
        </div>

        {loading && !warehouses.length ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
        ) : !shown.length ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
            <WarehouseIcon className="h-8 w-8 opacity-40" />{warehouses.length ? tr("لا توجد مستودعات مطابقة") : tr("لا توجد مستودعات")}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((warehouse) => {
              const active = warehouse.status === 1
              return (
                <div key={warehouse.id} role="button" tabIndex={0} onClick={() => openEditDialog(warehouse)} onKeyDown={(event) => { if (event.key === "Enter") openEditDialog(warehouse) }}
                  className={`group relative flex cursor-pointer flex-col gap-3 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 dark:bg-slate-900 ${active ? "border-slate-200 dark:border-slate-800" : "border-slate-200 opacity-75 dark:border-slate-800"}`}>
                  <span className={`absolute inset-x-0 top-0 h-1 ${active ? "bg-gradient-to-l from-emerald-500 to-teal-500" : "bg-slate-300"}`} />
                  <div className="flex items-start gap-3">
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${active ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}><WarehouseIcon className="h-6 w-6" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{warehouse.warehouse_code}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{active ? tr("نشط") : tr("متوقف")}</span>
                      </div>
                      <div className="mt-1 truncate text-base font-black text-slate-900 dark:text-white" title={warehouse.warehouse_name}>{warehouse.warehouse_name}</div>
                      {warehouse.warehouse_name_en && <div className="truncate text-xs text-muted-foreground" dir="ltr">{warehouse.warehouse_name_en}</div>}
                    </div>
                    <Pencil className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-emerald-600" />
                  </div>
                  <div className="grid gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />{warehouse.location || <span className="text-muted-foreground">{tr("بلا موقع")}</span>}</span>
                    <span className="flex items-center gap-1.5 truncate" dir="auto"><Printer className="h-3.5 w-3.5 shrink-0 text-slate-400" />{warehouse.default_printer || <span className="text-muted-foreground">{tr("الطابعة الافتراضية")}</span>}</span>
                  </div>
                  <button type="button" onClick={(event) => { event.stopPropagation(); setUsersFor({ id: warehouse.id, name: warehouse.warehouse_name }) }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950">
                    <ShieldCheck className="h-3.5 w-3.5" />{tr("صلاحيات المستخدمين")}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* نافذة «صلاحيات المستخدمين» فوقها تُعدّ نقراً خارجها فكانت تُغلقها — لا إغلاق ما دامت مفتوحة */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!isSaving && (open || !usersFor)) setDialogOpen(open) }}>
        <DialogContent dir={appDir()} onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()} className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <div className="flex shrink-0 items-center gap-3 bg-gradient-to-l from-emerald-600 to-teal-600 px-5 py-4 text-white">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25"><WarehouseIcon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-black text-white">{form.id > 0 ? tr("تعديل مستودع") : tr("إضافة مستودع")}</DialogTitle>
              <p className="truncate text-xs text-emerald-50/90">{form.id > 0 ? `${form.warehouse_code} · ${form.warehouse_name}` : tr("يتم توليد رمز المستودع تلقائياً")}</p>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">
            {errorMessage && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{errorMessage}</div>}

            <Section title={tr("البيانات الأساسية")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="warehouse_code">{tr("رمز المستودع")}</Label>
                  <Input id="warehouse_code" value={form.warehouse_code} readOnly placeholder={tr("يتم توليده تلقائياً")} className="bg-slate-100 font-mono dark:bg-slate-800" />
                </div>
                <div className="space-y-1.5">
                  <Label>{tr("الحالة")}</Label>
                  <div className="grid h-10 grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                    {[{ value: 1, label: tr("نشط") }, { value: 2, label: tr("متوقف") }].map((option) => (
                      <button key={option.value} type="button" onClick={() => set("status", option.value)}
                        className={`rounded-lg text-sm font-bold transition ${form.status === option.value ? (option.value === 1 ? "bg-emerald-600 text-white shadow" : "bg-slate-600 text-white shadow") : "text-slate-500 hover:text-slate-800"}`}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="warehouse_name">{tr("اسم المستودع *")}</Label>
                  <Input id="warehouse_name" autoFocus value={form.warehouse_name} onChange={(e) => set("warehouse_name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="warehouse_name_en">{tr("الاسم بالإنجليزية")}</Label>
                  <Input id="warehouse_name_en" dir="ltr" value={form.warehouse_name_en} onChange={(e) => set("warehouse_name_en", e.target.value)} />
                </div>
              </div>
            </Section>

            <Section title={tr("الموقع والطباعة")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="warehouse_location">{tr("الموقع")}</Label>
                  <Input id="warehouse_location" value={form.location} onChange={(e) => set("location", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="warehouse_default_printer">{tr("الطابعة الافتراضية")}</Label>
                  <Input id="warehouse_default_printer" dir="ltr" value={form.default_printer} onChange={(e) => set("default_printer", e.target.value)} className="text-start" placeholder={tr("اسم الطابعة كما يظهر في ويندوز")} />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{tr("تُطبع عليها أصناف هذا المستودع عند \"طباعة حسب المستودع\" في الطلبية — فارغة: الطابعة الافتراضية في إعدادات الطباعة")}</p>
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="warehouse_description">{tr("الوصف")}</Label>
                <Input id="warehouse_description" value={form.description} onChange={(e) => set("description", e.target.value)} />
              </div>
            </Section>

            <Section title={tr("مراكز التكلفة الافتراضية")} hint={tr("تُطبَّق على أصناف السندات من هذا المستودع إن لم يكن للصنف مراكز تكلفة خاصة به (الصنف ← المستودع ← حساب الصنف).")}>
              <CostCenterDefaultsEditor value={form.cost_centers} onChange={(cost_centers) => set("cost_centers", cost_centers)} />
            </Section>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-white px-4 py-3 dark:bg-slate-950">
            {form.id > 0 ? (
              <Button variant="outline" className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setUsersFor({ id: form.id, name: form.warehouse_name })}>
                <ShieldCheck className="h-4 w-4" />{tr("صلاحيات المستخدمين")}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" disabled={isSaving} onClick={() => setDialogOpen(false)}>{tr("إلغاء")}</Button>
              <Button className="min-w-24 bg-emerald-600 hover:bg-emerald-700" onClick={() => void saveWarehouse()} disabled={isSaving}>{isSaving ? tr("جاري الحفظ...") : tr("حفظ")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <WarehouseUsersDialog warehouse={usersFor} onClose={() => setUsersFor(null)} />
    </div>
  )
}
