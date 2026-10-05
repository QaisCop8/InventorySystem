"use client"

import { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { DISPOSAL_TYPES } from "@/lib/fixed-assets/constants"
import { DEPRECIATION_METHODS } from "@/lib/fixed-assets/depreciation"
import { api, Field, money, n, NumberField, recordOptions, Select, today, toOptions, type Lookups, type Row } from "./shared"

export type AssetAction = "addition" | "revaluation" | "impairment" | "adjust" | "transfer" | "suspend" | "resume" | "dispose"

export const ACTION_LABELS: Record<AssetAction, string> = {
  addition: "إضافة رأسمالية",
  revaluation: "إعادة تقييم",
  impairment: "انخفاض قيمة",
  adjust: "تعديل سياسة الإهلاك",
  transfer: "نقل الأصل",
  suspend: "إيقاف الإهلاك",
  resume: "استئناف الإهلاك",
  dispose: "استبعاد / بيع",
}

const DESCRIPTIONS: Record<AssetAction, string> = {
  addition: "تكلفة رأسمالية تُضاف إلى تكلفة الأصل ويُعاد توزيعها على العمر المتبقي. القيد: مدين حساب الأصل / دائن الحساب المختار.",
  revaluation: "تعديل القيمة الدفترية إلى القيمة العادلة. الزيادة لحساب فائض إعادة التقييم، والنقص لحساب خسارة الانخفاض.",
  impairment: "خسارة انخفاض قيمة تُسجَّل على الإهلاك المتراكم. القيد: مدين خسارة الانخفاض / دائن الإهلاك المتراكم.",
  adjust: "تغيير مستقبلي للعمر الإنتاجي أو القيمة المتبقية أو الطريقة — لا يغيّر الإهلاك المرحّل سابقاً.",
  transfer: "نقل الأصل بين الفروع أو المواقع أو الأقسام أو مراكز التكلفة أو العهدة. يُحفظ سجل النقل بشكل دائم.",
  suspend: "يتوقف احتساب الإهلاك للأصل حتى استئنافه، ويُحفظ العمر المتبقي.",
  resume: "يُستأنف الإهلاك من تاريخ الاستئناف على العمر المتبقي المحفوظ.",
  dispose: "إخراج الأصل من الدفاتر. يجب ترحيل الإهلاك حتى الشهر السابق لتاريخ الاستبعاد أولاً.",
}

export function AssetActionDialog({ action, asset, lookups, onClose, onDone }: {
  action: AssetAction | null; asset: Row | null; lookups: Lookups; onClose: () => void; onDone: (message: string) => void
}) {
  const [form, setForm] = useState<Row>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const open = Boolean(action && asset)
  const set = (patch: Row) => setForm(current => ({ ...current, ...patch }))
  const accounts = useMemo(() => toOptions(lookups.accounts), [lookups.accounts])
  const nbv = n(asset?.net_book_value)

  const resetFor = (next: AssetAction) => ({
    date: today(),
    post_journal: true,
    useful_life_months: asset?.books?.[0]?.useful_life_months ?? asset?.useful_life_months,
    residual_value: asset?.books?.[0]?.residual_value ?? asset?.residual_value,
    depreciation_method: asset?.books?.[0]?.depreciation_method ?? asset?.depreciation_method,
    declining_rate: asset?.books?.[0]?.declining_rate ?? "",
    to_branch_id: asset?.branch_id, to_location_id: asset?.location_id, to_department_id: asset?.department_id,
    to_cost_center_id: asset?.cost_center_id, to_custodian_id: asset?.custodian_employee_id,
    disposal_type: "SALE",
    new_value: next === "revaluation" ? nbv : "",
  })

  const [lastKey, setLastKey] = useState("")
  const key = `${action}:${asset?.id}`
  if (open && key !== lastKey) {
    setLastKey(key)
    setForm(resetFor(action!))
    setError("")
  }

  const submit = async () => {
    if (!action || !asset) return
    setSaving(true)
    setError("")
    try {
      await api(`/api/fixed-assets/${asset.id}/actions`, { method: "POST", json: { ...form, action } })
      onDone(`تم تنفيذ ${ACTION_LABELS[action]} على ${asset.asset_no}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تنفيذ العملية")
    } finally {
      setSaving(false)
    }
  }

  const gainLoss = action === "dispose" ? n(form.disposal_type === "SALE" ? form.sale_amount : 0) - nbv : 0

  return <Dialog open={open} onOpenChange={next => { if (!next && !saving) onClose() }}>
    <DialogContent dir="rtl" className="max-h-[90dvh] w-[94vw] max-w-2xl overflow-y-auto" onInteractOutside={event => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle>{action ? ACTION_LABELS[action] : ""} — {asset?.asset_no} {asset?.name}</DialogTitle>
        <DialogDescription className="leading-6">{action ? DESCRIPTIONS[action] : ""}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center text-xs dark:bg-slate-800/60">
        <div><p className="text-slate-500">التكلفة</p><b dir="ltr">{money(asset?.book_cost)}</b></div>
        <div><p className="text-slate-500">الإهلاك المتراكم</p><b dir="ltr">{money(asset?.accumulated_depreciation)}</b></div>
        <div><p className="text-slate-500">القيمة الدفترية</p><b dir="ltr" className="text-teal-700">{money(nbv)}</b></div>
      </div>
      {error && <Alert variant="destructive" className="border-rose-200 bg-rose-50 text-rose-700"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid gap-4 sm:grid-cols-2" data-enter-tab-root="true">
        <Field label="التاريخ" htmlFor="fa-action-date" required><Input id="fa-action-date" type="date" value={form.date ?? ""} onChange={event => set({ date: event.target.value })} /></Field>

        {action === "addition" && <>
          <Field label="المبلغ" htmlFor="fa-action-amount" required><NumberField id="fa-action-amount" value={form.amount} min={0} onChange={value => set({ amount: value })} /></Field>
          <Field label="تمديد العمر (أشهر)" htmlFor="fa-action-extend"><NumberField id="fa-action-extend" value={form.extend_life_months} min={0} step="1" onChange={value => set({ extend_life_months: value })} /></Field>
          <Field label="الحساب الدائن" htmlFor="fa-action-credit" required={form.post_journal} hint="المورد أو الصندوق أو حساب وسيط"><Select id="fa-action-credit" value={form.credit_account_id} options={accounts} onChange={value => set({ credit_account_id: value })} /></Field>
          <Field label="البيان" htmlFor="fa-action-desc" className="sm:col-span-2"><Input id="fa-action-desc" value={form.description ?? ""} onChange={event => set({ description: event.target.value })} /></Field>
          <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm sm:col-span-2"><span>إنشاء قيد محاسبي</span><Switch checked={form.post_journal !== false} onCheckedChange={value => set({ post_journal: value })} /></label>
        </>}

        {action === "revaluation" && <>
          <Field label="القيمة العادلة الجديدة" htmlFor="fa-action-new" required hint={`الفرق: ${money(n(form.new_value) - nbv)}`}><NumberField id="fa-action-new" value={form.new_value} min={0} onChange={value => set({ new_value: value })} /></Field>
          <Field label="حساب بديل (اختياري)" htmlFor="fa-action-account" hint="افتراضياً: فائض إعادة التقييم أو خسارة الانخفاض من التصنيف"><Select id="fa-action-account" value={form.account_id} options={accounts} clearable onChange={value => set({ account_id: value })} /></Field>
        </>}

        {action === "impairment" && <>
          <Field label="مبلغ الانخفاض" htmlFor="fa-action-imp" required><NumberField id="fa-action-imp" value={form.amount} min={0} onChange={value => set({ amount: value })} /></Field>
          <Field label="حساب الخسارة (اختياري)" htmlFor="fa-action-imp-account" className="sm:col-span-2"><Select id="fa-action-imp-account" value={form.account_id} options={accounts} clearable onChange={value => set({ account_id: value })} /></Field>
        </>}

        {action === "adjust" && <>
          <Field label="طريقة الإهلاك" htmlFor="fa-action-method"><Select id="fa-action-method" value={form.depreciation_method} options={recordOptions(DEPRECIATION_METHODS)} onChange={value => set({ depreciation_method: value })} /></Field>
          <Field label="العمر الإنتاجي الكلي (أشهر)" htmlFor="fa-action-life" hint={n(form.useful_life_months) ? `${(n(form.useful_life_months) / 12).toFixed(1)} سنة` : undefined}><NumberField id="fa-action-life" value={form.useful_life_months} min={1} step="1" onChange={value => set({ useful_life_months: value })} /></Field>
          <Field label="القيمة المتبقية" htmlFor="fa-action-residual"><NumberField id="fa-action-residual" value={form.residual_value} min={0} onChange={value => set({ residual_value: value })} /></Field>
          {form.depreciation_method === "DECLINING_BALANCE" && <Field label="نسبة القسط المتناقص السنوية %" htmlFor="fa-action-rate" hint="فارغ = ضعف القسط الثابت"><NumberField id="fa-action-rate" value={form.declining_rate} min={0} onChange={value => set({ declining_rate: value })} /></Field>}
        </>}

        {action === "transfer" && <>
          <Field label="الفرع" htmlFor="fa-action-branch"><Select id="fa-action-branch" value={form.to_branch_id} options={toOptions(lookups.branches)} onChange={value => set({ to_branch_id: value })} /></Field>
          <Field label="الموقع" htmlFor="fa-action-location"><Select id="fa-action-location" value={form.to_location_id} options={toOptions(lookups.locations)} clearable onChange={value => set({ to_location_id: value })} /></Field>
          <Field label="القسم" htmlFor="fa-action-dept"><Select id="fa-action-dept" value={form.to_department_id} options={toOptions(lookups.departments)} clearable onChange={value => set({ to_department_id: value })} /></Field>
          <Field label="مركز التكلفة" htmlFor="fa-action-cc"><Select id="fa-action-cc" value={form.to_cost_center_id} options={toOptions(lookups.costCenters)} clearable onChange={value => set({ to_cost_center_id: value })} /></Field>
          <Field label="المسؤول / العهدة" htmlFor="fa-action-custodian"><Select id="fa-action-custodian" value={form.to_custodian_id} options={toOptions(lookups.employees)} clearable onChange={value => set({ to_custodian_id: value })} /></Field>
        </>}

        {action === "dispose" && <>
          <Field label="نوع الاستبعاد" htmlFor="fa-action-dtype"><Select id="fa-action-dtype" value={form.disposal_type} options={recordOptions(DISPOSAL_TYPES)} onChange={value => set({ disposal_type: value })} /></Field>
          {form.disposal_type === "SALE" && <>
            <Field label="قيمة البيع" htmlFor="fa-action-sale" required><NumberField id="fa-action-sale" value={form.sale_amount} min={0} onChange={value => set({ sale_amount: value })} /></Field>
            <Field label="حساب المتحصلات" htmlFor="fa-action-proceeds" required hint="الصندوق أو البنك أو حساب العميل"><Select id="fa-action-proceeds" value={form.proceeds_account_id} options={accounts} onChange={value => set({ proceeds_account_id: value })} /></Field>
          </>}
          <div className={`rounded-xl p-3 text-sm font-bold sm:col-span-2 ${gainLoss >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {gainLoss >= 0 ? "ربح" : "خسارة"} الاستبعاد المتوقع: <span dir="ltr">{money(Math.abs(gainLoss))}</span>
          </div>
        </>}

        <Field label="السبب / ملاحظات" htmlFor="fa-action-reason" className="sm:col-span-2"><Textarea id="fa-action-reason" rows={2} value={form.reason ?? ""} onChange={event => set({ reason: event.target.value })} /></Field>
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
        <Button onClick={() => void submit()} disabled={saving} className={action === "dispose" ? "bg-rose-600 hover:bg-rose-700" : "bg-teal-600 hover:bg-teal-700"}>
          {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تنفيذ
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
