"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CreditCard, Edit, LayoutGrid, Loader2, MapPin, Package, Plus, RefreshCw, Search, Store, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { useFileAccess } from "@/components/auth/use-file-access"
import { useAuth } from "@/components/auth/auth-context"
import { useNavigationGuard } from "@/lib/navigation-guard"
import { LicenseUsageStrip, useCompanyLicense, useLicenseRequestDialog } from "@/components/settings/license-limit"

type Location = Record<string, any> & {
  id: number; code: string; name: string; branch_id: number; branch_name?: string; status: number; tables_count?: number
  warehouse_name?: string | null; currency_code?: string | null; price_category_name?: string | null; sales_book_name?: string | null
}
type Option = { id: number; name: string; code?: string }
type Options = { branches: Option[]; warehouses: Option[]; currencies: Option[]; books: Option[]; priceCategories: Option[] }
const ACCOUNT_FIELDS = [
  ["cash_account_id", "حساب الصندوق"], ["walk_in_account_id", "الحساب النقدي (العميل النقدي)"], ["card_account_id", "حساب البطاقات"],
  ["cheque_account_id", "حساب الشيكات"], ["tax_account_id", "حساب الضريبة"],
] as const
const PRINT_MODES = [{ id: "0", name: "عدم الطباعة" }, { id: "1", name: "طباعة فاتورة كاملة" }, { id: "2", name: "طباعة فاتورة QR" }]

type Form = {
  id: number; code: string; name: string; branch_id: string; warehouse_id: string; currency_id: string; price_category_id: string; sales_book_id: string
  cash_account_id: string; walk_in_account_id: string; card_account_id: string; cheque_account_id: string; tax_account_id: string
  max_discount_percent: string; invoice_print_mode: string; print_by_item_group: boolean; kitchen_print_confirm: boolean; sort_order: string; color: string; notes: string; active: boolean
}
const str = (value: unknown) => (value == null || value === "" ? "" : String(value))
const emptyForm = (branchId: number | null, code = ""): Form => ({
  id: 0, code, name: "", branch_id: str(branchId), warehouse_id: "", currency_id: "", price_category_id: "", sales_book_id: "",
  cash_account_id: "", walk_in_account_id: "", card_account_id: "", cheque_account_id: "", tax_account_id: "",
  max_discount_percent: "100", invoice_print_mode: "1", print_by_item_group: true, kitchen_print_confirm: false, sort_order: "0", color: "#0f766e", notes: "", active: true,
})
const toForm = (row: Location): Form => ({
  id: row.id, code: row.code, name: row.name, branch_id: str(row.branch_id), warehouse_id: str(row.warehouse_id), currency_id: str(row.currency_id),
  price_category_id: str(row.price_category_id), sales_book_id: str(row.sales_book_id), cash_account_id: str(row.cash_account_id),
  walk_in_account_id: str(row.walk_in_account_id), card_account_id: str(row.card_account_id), cheque_account_id: str(row.cheque_account_id),
  tax_account_id: str(row.tax_account_id), max_discount_percent: str(row.max_discount_percent ?? 100), invoice_print_mode: str(row.invoice_print_mode ?? 1),
  print_by_item_group: row.print_by_item_group !== false, kitchen_print_confirm: row.kitchen_print_confirm === true, sort_order: str(row.sort_order ?? 0), color: row.color || "#0f766e", notes: row.notes || "",
  active: Number(row.status) !== 2,
})
const errorText = async (response: Response, fallback: string) => String((await response.json().catch(() => ({})))?.error || fallback)

function OptionSelect({ value, onChange, options, placeholder, disabled }: { value: string; onChange: (value: string) => void; options: Option[]; placeholder: string; disabled?: boolean }) {
  return (
    <Select value={value || undefined} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option.id} value={String(option.id)}>{option.code ? `${option.code} — ` : ""}{option.name}</SelectItem>)}</SelectContent>
    </Select>
  )
}

export default function RestaurantLocations() {
  const can = useFileAccess("restaurant-locations")
  const canView = can("view"), canCreate = can("create"), canUpdate = can("update"), canDelete = can("delete")
  const { activeBranchId } = useAuth()
  const [rows, setRows] = useState<Location[]>([])
  const [options, setOptions] = useState<Options>({ branches: [], warehouses: [], currencies: [], books: [], priceCategories: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [branchFilter, setBranchFilter] = useState("all")
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm(null))
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const initialRef = useRef("")
  const nextCodeRef = useRef("")

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const [listRes, optionsRes] = await Promise.all([
        canView ? fetch("/api/restaurant/locations", { cache: "no-store" }) : Promise.resolve(null),
        fetch("/api/restaurant/locations?options=1", { cache: "no-store" }),
      ])
      if (listRes) {
        if (!listRes.ok) throw new Error(await errorText(listRes, "تعذر تحميل المواقع"))
        setRows(await listRes.json())
      }
      if (optionsRes.ok) {
        const data = await optionsRes.json()
        const map = (list: any[], name = "name") => (list || []).map((row: any) => ({ id: Number(row.id), name: String(row[name] ?? row.name ?? ""), code: row.code ? String(row.code) : undefined }))
        setOptions({
          branches: map(data.branches, "branch_name"), warehouses: map(data.warehouses), currencies: map(data.currencies),
          books: map(data.books), priceCategories: map(data.priceCategories),
        })
        nextCodeRef.current = String(data.next_code || "")
      } else {
        setError(await errorText(optionsRes, "تعذر تحميل بيانات الشاشة"))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل المواقع")
    } finally {
      setLoading(false)
    }
  }, [canView])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) =>
      (branchFilter === "all" || String(row.branch_id) === branchFilter) &&
      (!term || row.name.toLowerCase().includes(term) || row.code.toLowerCase().includes(term)))
  }, [rows, search, branchFilter])

  const dirty = open && JSON.stringify(form) !== initialRef.current
  useNavigationGuard(() => dirty, (continueNavigation) => {
    void confirmYesNo("توجد تغييرات غير محفوظة على الموقع. هل تريد المتابعة دون حفظ؟").then((ok) => { if (ok) { setOpen(false); continueNavigation() } })
  })

  const openForm = (value: Form) => { setForm(value); initialRef.current = JSON.stringify(value); setFormError(""); setOpen(true) }
  const closeForm = async () => {
    if (dirty && !(await confirmYesNo("توجد تغييرات غير محفوظة. هل تريد الإغلاق دون حفظ؟"))) return
    setOpen(false)
  }
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }))

  // ترخيص الشركة: عدد مواقع المطاعم — عند بلوغ الحد تُفتح نافذة طلب الزيادة/الدفع بدل نموذج الإضافة
  const { license, reload: reloadLicense } = useCompanyLicense()
  const licenseRequest = useLicenseRequestDialog(() => void reloadLicense())
  const addLocation = () => {
    if (license && license.usage.restaurant_locations >= license.limits.restaurant_locations) {
      licenseRequest.open("restaurant_locations", `تم الوصول للحد المرخّص من مواقع المطاعم (${license.usage.restaurant_locations} من ${license.limits.restaurant_locations}).`, license.pending.some((request) => request.resource === "restaurant_locations"))
      return
    }
    openForm(emptyForm(activeBranchId, nextCodeRef.current))
  }

  const save = async () => {
    const required: [string, string][] = [[form.name.trim(), "اسم الموقع"], [form.branch_id, "الفرع"], [form.warehouse_id, "المستودع"], [form.currency_id, "العملة"], [form.price_category_id, "فئة السعر"], [form.sales_book_id, "دفتر فواتير البيع"]]
    const missing = required.filter(([value]) => !value).map(([, label]) => label)
    if (missing.length) { setFormError(`الحقول المطلوبة: ${missing.join("، ")}`); return }
    setSaving(true); setFormError("")
    try {
      const response = await fetch("/api/restaurant/locations", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form, id: form.id || undefined,
          branch_id: Number(form.branch_id), warehouse_id: Number(form.warehouse_id), currency_id: Number(form.currency_id),
          price_category_id: Number(form.price_category_id), sales_book_id: Number(form.sales_book_id),
          ...Object.fromEntries(ACCOUNT_FIELDS.map(([key]) => [key, Number(form[key]) || null])),
          max_discount_percent: Number(form.max_discount_percent), invoice_print_mode: Number(form.invoice_print_mode),
          sort_order: Number(form.sort_order) || 0, status: form.active ? 1 : 2,
        }),
      })
      if (!response.ok) throw new Error(await errorText(response, "تعذر حفظ الموقع"))
      initialRef.current = JSON.stringify(form)
      setOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذر حفظ الموقع")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: Location) => {
    if (!(await confirmYesNo(`حذف الموقع "${row.name}"؟`))) return
    const response = await fetch(`/api/restaurant/locations?id=${row.id}`, { method: "DELETE" })
    if (!response.ok) { setError(await errorText(response, "تعذر حذف الموقع")); return }
    await load()
  }

  const readOnly = form.id ? !canUpdate : !canCreate
  const configured = (row: Location) => row.warehouse_id && row.currency_id && row.price_category_id && row.sales_book_id

  return (
    <div dir="rtl" className="flex h-full flex-col gap-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-teal-700 to-emerald-600 p-4 text-white shadow">
        <div className="flex items-center gap-3">
          <MapPin className="h-8 w-8" />
          <div>
            <h1 className="text-xl font-bold">مواقع المطعم</h1>
            <p className="text-sm text-teal-50">الصالات والطوابق والمناطق الخارجية — لكل موقع فرعه وإعدادات البيع الخاصة به (مستقلة عن الكاشير)</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="ml-1 h-4 w-4" />تحديث</Button>
          {canCreate && <Button size="sm" className="bg-white text-teal-800 hover:bg-teal-50" onClick={addLocation}><Plus className="ml-1 h-4 w-4" />إضافة موقع</Button>}
        </div>
      </div>
      {licenseRequest.element}
      <LicenseUsageStrip resource="restaurant_locations" license={license} onRequest={() => licenseRequest.open("restaurant_locations")} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9" placeholder="بحث بالاسم أو الرمز" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="الفرع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفروع</SelectItem>
            {options.branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!canView && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">لا توجد لديك صلاحية استعلام مواقع المطاعم.</div>}

      {loading ? (
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm" style={{ borderTopColor: row.color || undefined, borderTopWidth: 4 }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-bold">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.code}</div>
                </div>
                <Badge variant={Number(row.status) === 2 ? "secondary" : "default"}>{Number(row.status) === 2 ? "موقوف" : "نشط"}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1"><Store className="h-4 w-4 text-muted-foreground" />{row.branch_name || "-"}</div>
                <div className="flex items-center gap-1"><LayoutGrid className="h-4 w-4 text-muted-foreground" />{row.tables_count ?? 0} طاولة</div>
                <div className="flex items-center gap-1"><Package className="h-4 w-4 text-muted-foreground" />{row.warehouse_name || "—"}</div>
                <div className="flex items-center gap-1"><CreditCard className="h-4 w-4 text-muted-foreground" />{row.currency_code || "—"} · {row.price_category_name || "—"}</div>
                {!configured(row) && <div className="col-span-2 text-amber-600">إعدادات البيع غير مكتملة — لا يمكن البيع على هذا الموقع</div>}
              </div>
              <div className="mt-auto flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => openForm(toForm(row))}><Edit className="ml-1 h-4 w-4" />{canUpdate ? "تعديل" : "عرض"}</Button>
                {canDelete && <Button size="sm" variant="outline" className="text-red-600" onClick={() => void remove(row)}><Trash2 className="ml-1 h-4 w-4" />حذف</Button>}
              </div>
            </div>
          ))}
          {canView && !filtered.length && <div className="col-span-full rounded-xl border border-dashed p-10 text-center text-muted-foreground">لا توجد مواقع معرّفة</div>}
        </div>
      )}

      <Dialog open={open} onOpenChange={(value) => { if (!value) void closeForm() }}>
        <DialogContent dir="rtl" className="flex max-h-[calc(100%-1.5rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-3"><DialogTitle>{form.id ? "تعديل موقع" : "إضافة موقع"}</DialogTitle></DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>الرمز</Label><Input value={form.code} disabled={readOnly} onChange={(e) => set({ code: e.target.value })} placeholder="تلقائي" /></div>
              <div className="space-y-1"><Label>اسم الموقع *</Label><Input value={form.name} disabled={readOnly} onChange={(e) => set({ name: e.target.value })} placeholder="الصالة الرئيسية" autoFocus /></div>
              <div className="space-y-1"><Label>الفرع *</Label><OptionSelect value={form.branch_id} disabled={readOnly} onChange={(value) => set({ branch_id: value })} options={options.branches} placeholder="اختر الفرع" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>الترتيب</Label><Input type="number" min={0} value={form.sort_order} disabled={readOnly} onChange={(e) => set({ sort_order: e.target.value })} /></div>
                <div className="space-y-1"><Label>اللون</Label><Input type="color" className="h-10 p-1" value={form.color} disabled={readOnly} onChange={(e) => set({ color: e.target.value })} /></div>
              </div>
            </section>

            <section className="rounded-xl border bg-muted/30 p-3 sm:p-4">
              <h3 className="mb-3 flex items-center gap-2 font-bold"><Package className="h-5 w-5 text-teal-600" />إعدادات البيع</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>المستودع *</Label><OptionSelect value={form.warehouse_id} disabled={readOnly} onChange={(value) => set({ warehouse_id: value })} options={options.warehouses} placeholder="اختر المستودع" /></div>
                <div className="space-y-1"><Label>العملة *</Label><OptionSelect value={form.currency_id} disabled={readOnly} onChange={(value) => set({ currency_id: value })} options={options.currencies} placeholder="اختر العملة" /></div>
                <div className="space-y-1"><Label>فئة السعر *</Label><OptionSelect value={form.price_category_id} disabled={readOnly} onChange={(value) => set({ price_category_id: value })} options={options.priceCategories} placeholder="اختر فئة السعر" /></div>
                <div className="space-y-1"><Label>دفتر فواتير البيع *</Label><OptionSelect value={form.sales_book_id} disabled={readOnly} onChange={(value) => set({ sales_book_id: value })} options={options.books} placeholder="اختر الدفتر" /></div>
                <div className="space-y-1"><Label>أعلى نسبة خصم %</Label><Input type="number" min={0} max={100} value={form.max_discount_percent} disabled={readOnly} onChange={(e) => set({ max_discount_percent: e.target.value })} /></div>
                <div className="space-y-1">
                  <Label>طباعة الفاتورة بعد الدفع</Label>
                  <OptionSelect value={form.invoice_print_mode} disabled={readOnly} onChange={(value) => set({ invoice_print_mode: value })} options={PRINT_MODES.map((mode) => ({ id: Number(mode.id), name: mode.name }))} placeholder="اختر" />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2"><Switch checked={form.print_by_item_group} disabled={readOnly} onCheckedChange={(value) => set({ print_by_item_group: value })} /><Label>طباعة قسائم المطبخ حسب طابعة مجموعة الصنف</Label></div>
                <div className="flex items-center gap-2 sm:col-span-2"><Switch checked={form.kitchen_print_confirm} disabled={readOnly} onCheckedChange={(value) => set({ kitchen_print_confirm: value })} /><Label>اظهار رسالة طباعة عند ارسال الطلب الى المطبخ</Label></div>
              </div>
            </section>

            <section className="rounded-xl border bg-muted/30 p-3 sm:p-4">
              <h3 className="mb-1 flex items-center gap-2 font-bold"><CreditCard className="h-5 w-5 text-teal-600" />حسابات الدفع</h3>
              <p className="mb-3 text-xs text-muted-foreground">اختيارية: عند تركها فارغة تُستخدم حسابات المستخدم الافتراضية لعملة الموقع ثم حسابات النظام (كما في الكاشير).</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ACCOUNT_FIELDS.map(([key, label]) => (
                  <AutoCompleteAccount key={key} label={label} value={form[key]} valueMode="id" disabled={readOnly}
                    onValueChange={(value: string) => set({ [key]: value } as Partial<Form>)} placeholder="اختياري — الحساب الافتراضي"
                    leafOnly showCostCenterButton={false} showCostCenterDialog={false} />
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="space-y-1"><Label>ملاحظات</Label><Textarea rows={2} value={form.notes} disabled={readOnly} onChange={(e) => set({ notes: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Switch checked={form.active} disabled={readOnly} onCheckedChange={(value) => set({ active: value })} /><Label>نشط</Label></div>
            </section>
            {formError && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{formError}</div>}
          </div>
          <DialogFooter className="gap-2 border-t px-5 py-3">
            <Button variant="outline" onClick={() => void closeForm()}>إغلاق</Button>
            {!readOnly && <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}حفظ</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
