"use client"

import { tr, appDir } from "@/lib/i18n"
import { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { FolderTree, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react"
import { LOCATION_TYPES } from "@/lib/fixed-assets/constants"
import { DEPRECIATION_METHODS } from "@/lib/fixed-assets/depreciation"
import { AccountField, api, DataTable, Field, n, NumberField, recordOptions, SectionCard, Select, toOptions, type Lookups, type Row } from "./shared"

const ACCOUNT_FIELDS: [string, string, boolean][] = [
  ["asset_account_id", "حساب الأصل", true],
  ["accumulated_depreciation_account_id", "حساب الإهلاك المتراكم", true],
  ["depreciation_expense_account_id", "حساب مصروف الإهلاك", true],
  ["gain_on_disposal_account_id", "ربح استبعاد الأصول", false],
  ["loss_on_disposal_account_id", "خسارة استبعاد الأصول", false],
  ["revaluation_reserve_account_id", "فائض إعادة التقييم", false],
  ["impairment_loss_account_id", "خسارة انخفاض القيمة", false],
]

const blankCategory = (): Row => ({ code: "", name: "", parent_id: null, default_useful_life_months: 60, default_depreciation_method: "STRAIGHT_LINE", default_residual_percentage: 0, default_declining_rate: "", is_depreciable: true, status: 1 })
const blankLocation = (): Row => ({ code: "", name: "", parent_id: null, type: "SITE", branch_id: null, status: 1 })

function EditDialog({ title, open, saving, error, onClose, onSave, children }: { title: string; open: boolean; saving: boolean; error: string; onClose: () => void; onSave: () => void; children: React.ReactNode }) {
  return <Dialog open={open} onOpenChange={next => { if (!next && !saving) onClose() }}>
    <DialogContent dir={appDir()} className="max-h-[90dvh] w-[94vw] max-w-3xl overflow-y-auto" onInteractOutside={event => event.preventDefault()}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{tr("الحقول المعلَّمة بـ * إلزامية")}</DialogDescription></DialogHeader>
      {error && <Alert variant="destructive" className="border-rose-200 bg-rose-50 text-rose-700"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid gap-4 sm:grid-cols-2" data-enter-tab-root="true">{children}</div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>{tr("إلغاء")}</Button>
        <Button className="bg-teal-600 hover:bg-teal-700" onClick={onSave} disabled={saving}>{saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{tr("حفظ")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

export function CategoriesSetup({ lookups, onChanged }: { lookups: Lookups; onChanged: (message: string) => void }) {
  const [form, setForm] = useState<Row | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [remove, setRemove] = useState<Row | null>(null)
  const accountName = (id: unknown) => lookups.accounts.find(row => Number(row.id) === Number(id))
  const set = (patch: Row) => setForm(current => ({ ...current, ...patch }))

  const save = async () => {
    if (!form) return
    setSaving(true)
    setError("")
    try {
      await api("/api/fixed-assets/categories", { method: form.id ? "PUT" : "POST", json: form })
      setForm(null)
      onChanged("تم حفظ التصنيف")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr("تعذر الحفظ"))
    } finally {
      setSaving(false)
    }
  }

  const doRemove = async () => {
    const row = remove
    setRemove(null)
    if (!row) return
    try { await api(`/api/fixed-assets/categories?id=${row.id}`, { method: "DELETE" }); onChanged("تم حذف التصنيف") }
    catch (reason) { setError(reason instanceof Error ? reason.message : tr("تعذر الحذف")) }
  }

  return <SectionCard title={tr("تصنيفات الأصول والربط المحاسبي")} icon={<FolderTree className="h-4 w-4" />} actions={<Button size="sm" onClick={() => { setError(""); setForm(blankCategory()) }}><Plus className="me-1 h-4 w-4" />{tr("تصنيف جديد")}</Button>}>
    {error && !form && <Alert variant="destructive" className="mb-3 border-rose-200 bg-rose-50 text-rose-700"><AlertDescription>{error}</AlertDescription></Alert>}
    <DataTable rows={lookups.categories} footer={false} onRowClick={row => { setError(""); setForm({ ...row }) }} columns={[
      { key: "code", label: tr("الرمز") },
      { key: "name", label: tr("التصنيف") },
      { key: "parent_name", label: tr("التصنيف الأب") },
      { key: "asset_account_id", label: tr("حساب الأصل"), render: row => accountName(row.asset_account_id)?.code ?? "—" },
      { key: "accumulated_depreciation_account_id", label: tr("الإهلاك المتراكم"), render: row => accountName(row.accumulated_depreciation_account_id)?.code ?? "—" },
      { key: "depreciation_expense_account_id", label: tr("مصروف الإهلاك"), render: row => accountName(row.depreciation_expense_account_id)?.code ?? "—" },
      { key: "policy", label: tr("السياسة الافتراضية"), render: row => row.is_depreciable === false ? "غير قابل للإهلاك" : `${(DEPRECIATION_METHODS as Row)[row.default_depreciation_method]} · ${row.default_useful_life_months} شهر · ${n(row.default_residual_percentage)}%` },
      { key: "asset_count", label: tr("الأصول") },
      { key: "status", label: tr("الحالة"), render: row => Number(row.status) === 1 ? "فعّال" : "موقوف" },
      { key: "actions", label: "", render: row => <span className="flex gap-1">
        <Button size="icon" variant="ghost" aria-label={tr("تعديل")} onClick={event => { event.stopPropagation(); setError(""); setForm({ ...row }) }}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={tr("حذف")} className="text-rose-600" onClick={event => { event.stopPropagation(); setRemove(row) }}><Trash2 className="h-4 w-4" /></Button>
      </span> },
    ]} empty={tr("ابدأ بتعريف تصنيفات مثل: مركبات، مبانٍ، أثاث، حواسيب، آلات، أراضٍ")} />

    <EditDialog title={form?.id ? tr("تعديل التصنيف {0}", form.name) : tr("تصنيف أصول جديد")} open={form !== null} saving={saving} error={error} onClose={() => setForm(null)} onSave={() => void save()}>
      {form && <>
        <Field label={tr("الرمز")} htmlFor="fa-cat-code" required><Input id="fa-cat-code" value={form.code ?? ""} onChange={event => set({ code: event.target.value })} /></Field>
        <Field label={tr("الاسم")} htmlFor="fa-cat-name" required><Input id="fa-cat-name" value={form.name ?? ""} onChange={event => set({ name: event.target.value })} /></Field>
        <Field label={tr("التصنيف الأب")} htmlFor="fa-cat-parent"><Select id="fa-cat-parent" value={form.parent_id} clearable options={toOptions(lookups.categories.filter(row => Number(row.id) !== Number(form.id)))} onChange={value => set({ parent_id: value })} /></Field>
        <Field label={tr("الحالة")} htmlFor="fa-cat-status"><Select id="fa-cat-status" value={Number(form.status ?? 1)} options={[{ label: tr("فعّال"), value: 1 }, { label: tr("موقوف"), value: 2 }]} onChange={value => set({ status: value })} /></Field>
        <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2 dark:bg-slate-800/50">
          <p className="mb-3 text-xs font-black text-slate-600">{tr("الربط المحاسبي")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {ACCOUNT_FIELDS.map(([key, label, required]) => <Field key={key} label={label} htmlFor={`fa-cat-${key}`} required={required && (key === "asset_account_id" || form.is_depreciable !== false)}>
              <AccountField value={form[key]} onChange={value => set({ [key]: value })} />
            </Field>)}
          </div>
        </div>
        <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm sm:col-span-2"><span><b className="block">{tr("قابل للإهلاك")}</b><small className="text-slate-500">{tr("أوقفه للأراضي والأعمال الفنية")}</small></span><Switch checked={form.is_depreciable !== false} onCheckedChange={value => set({ is_depreciable: value })} /></label>
        {form.is_depreciable !== false && <>
          <Field label={tr("طريقة الإهلاك الافتراضية")} htmlFor="fa-cat-method"><Select id="fa-cat-method" value={form.default_depreciation_method} options={recordOptions(DEPRECIATION_METHODS).filter(option => option.value !== "NONE")} onChange={value => set({ default_depreciation_method: value })} /></Field>
          <Field label={tr("العمر الإنتاجي الافتراضي (أشهر)")} htmlFor="fa-cat-life" hint={tr("{0} سنة", (n(form.default_useful_life_months) / 12).toFixed(1))}><NumberField id="fa-cat-life" value={form.default_useful_life_months} min={1} step="1" onChange={value => set({ default_useful_life_months: value })} /></Field>
          <Field label={tr("القيمة المتبقية الافتراضية %")} htmlFor="fa-cat-residual"><NumberField id="fa-cat-residual" value={form.default_residual_percentage} min={0} onChange={value => set({ default_residual_percentage: value })} /></Field>
          {form.default_depreciation_method === "DECLINING_BALANCE" && <Field label={tr("نسبة القسط المتناقص %")} htmlFor="fa-cat-rate" hint={tr("فارغ = ضعف القسط الثابت")}><NumberField id="fa-cat-rate" value={form.default_declining_rate} min={0} onChange={value => set({ default_declining_rate: value })} /></Field>}
        </>}
      </>}
    </EditDialog>
    <ConfirmDialogYesNo useAppDialog visible={remove !== null} message={tr("حذف التصنيف {0}؟", remove?.name ?? "")} onConfirm={() => void doRemove()} onCancel={() => setRemove(null)} />
  </SectionCard>
}

export function LocationsSetup({ lookups, onChanged }: { lookups: Lookups; onChanged: (message: string) => void }) {
  const [form, setForm] = useState<Row | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [remove, setRemove] = useState<Row | null>(null)
  const set = (patch: Row) => setForm(current => ({ ...current, ...patch }))

  const tree = useMemo(() => {
    const byParent = new Map<number | null, Row[]>()
    for (const row of lookups.locations) {
      const key = row.parent_id == null ? null : Number(row.parent_id)
      byParent.set(key, [...(byParent.get(key) ?? []), row])
    }
    const out: Row[] = []
    const walk = (parent: number | null, depth: number) => {
      for (const row of byParent.get(parent) ?? []) { out.push({ ...row, depth }); walk(Number(row.id), depth + 1) }
    }
    walk(null, 0)
    const seen = new Set(out.map(row => row.id))
    return [...out, ...lookups.locations.filter(row => !seen.has(row.id)).map(row => ({ ...row, depth: 0 }))]
  }, [lookups.locations])

  const save = async () => {
    if (!form) return
    setSaving(true)
    setError("")
    try {
      await api("/api/fixed-assets/locations", { method: form.id ? "PUT" : "POST", json: form })
      setForm(null)
      onChanged("تم حفظ الموقع")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr("تعذر الحفظ"))
    } finally {
      setSaving(false)
    }
  }

  const doRemove = async () => {
    const row = remove
    setRemove(null)
    if (!row) return
    try { await api(`/api/fixed-assets/locations?id=${row.id}`, { method: "DELETE" }); onChanged("تم حذف الموقع") }
    catch (reason) { setError(reason instanceof Error ? reason.message : tr("تعذر الحذف")) }
  }

  return <SectionCard title={tr("المواقع (هرمية)")} icon={<MapPin className="h-4 w-4" />} actions={<Button size="sm" onClick={() => { setError(""); setForm(blankLocation()) }}><Plus className="me-1 h-4 w-4" />{tr("موقع جديد")}</Button>}>
    {error && !form && <Alert variant="destructive" className="mb-3 border-rose-200 bg-rose-50 text-rose-700"><AlertDescription>{error}</AlertDescription></Alert>}
    <DataTable rows={tree} footer={false} onRowClick={row => { setError(""); setForm({ ...row }) }} columns={[
      { key: "name", label: tr("الموقع"), render: row => <span style={{ paddingInlineStart: `${row.depth * 20}px` }} className="flex items-center gap-1.5">{row.depth > 0 && <span className="text-slate-300">└</span>}<b>{row.name}</b><small className="text-slate-400">{row.code}</small></span> },
      { key: "type", label: tr("النوع"), render: row => (LOCATION_TYPES as Row)[row.type] ?? row.type },
      { key: "branch", label: tr("الفرع"), render: row => lookups.branches.find(branch => Number(branch.id) === Number(row.branch_id))?.name ?? "—" },
      { key: "asset_count", label: tr("الأصول") },
      { key: "status", label: tr("الحالة"), render: row => Number(row.status) === 1 ? "فعّال" : "موقوف" },
      { key: "actions", label: "", render: row => <Button size="icon" variant="ghost" aria-label={tr("حذف")} className="text-rose-600" onClick={event => { event.stopPropagation(); setRemove(row) }}><Trash2 className="h-4 w-4" /></Button> },
    ]} empty={tr("مثال: فرع نابلس ← مبنى A ← الطابق 2 ← قسم تقنية المعلومات ← غرفة الخوادم")} />

    <EditDialog title={form?.id ? tr("تعديل الموقع {0}", form.name) : tr("موقع جديد")} open={form !== null} saving={saving} error={error} onClose={() => setForm(null)} onSave={() => void save()}>
      {form && <>
        <Field label={tr("الرمز")} htmlFor="fa-loc-code" required><Input id="fa-loc-code" value={form.code ?? ""} onChange={event => set({ code: event.target.value })} /></Field>
        <Field label={tr("الاسم")} htmlFor="fa-loc-name" required><Input id="fa-loc-name" value={form.name ?? ""} onChange={event => set({ name: event.target.value })} /></Field>
        <Field label={tr("يتبع لـ")} htmlFor="fa-loc-parent"><Select id="fa-loc-parent" value={form.parent_id} clearable options={toOptions(lookups.locations.filter(row => Number(row.id) !== Number(form.id)))} onChange={value => set({ parent_id: value })} /></Field>
        <Field label={tr("النوع")} htmlFor="fa-loc-type"><Select id="fa-loc-type" value={form.type} options={recordOptions(LOCATION_TYPES)} onChange={value => set({ type: value })} /></Field>
        <Field label={tr("الفرع")} htmlFor="fa-loc-branch"><Select id="fa-loc-branch" value={form.branch_id} clearable options={toOptions(lookups.branches)} onChange={value => set({ branch_id: value })} /></Field>
        <Field label={tr("الحالة")} htmlFor="fa-loc-status"><Select id="fa-loc-status" value={Number(form.status ?? 1)} options={[{ label: tr("فعّال"), value: 1 }, { label: tr("موقوف"), value: 2 }]} onChange={value => set({ status: value })} /></Field>
      </>}
    </EditDialog>
    <ConfirmDialogYesNo useAppDialog visible={remove !== null} message={tr("حذف الموقع {0}؟", remove?.name ?? "")} onConfirm={() => void doRemove()} onCancel={() => setRemove(null)} />
  </SectionCard>
}
