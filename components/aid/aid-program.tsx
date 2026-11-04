"use client"

import { tr, appDir } from "@/lib/i18n"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle, BookOpen, CheckCircle2, Download, FileSpreadsheet, HeartHandshake, KeyRound, Loader2, Lock, Pencil, Plus, RefreshCw,
  Scale, Search, Send, Trash2, Unlock, Users, Wallet, X, XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import ProductSearchPopup from "@/components/products/ProductSearchPopup"
import { useTransactionPermission } from "@/components/auth/transaction-access-gate"

// برامج المساعدات (lib/aid-program.ts): أنشطة المساعدة، المستفيدون ورموز الصرف، حركات الدفاتر الثلاثة وملخصها.
// الصرف نفسه من كاشير نقطة البيع بطريقة الدفع "قسيمة مساعدة".

type ActivityRow = {
  id: number; name: string; donor_name: string | null; donor_account_name: string | null; currency_code: string
  amount_per_participant: number; budget: number; start_date: string; end_date: string; status: number
  unallocated: number; redeemed: number; vendor_due: number; participant_count: number; participant_balance: number
}
type Participant = {
  id: number; national_id: string; full_name: string; phone: string | null; household_size: number | null; balance: number; allocated: number
  redeemed: number; redemptions: number; code_masked: string | null; code_status: number; locked: boolean; sms_sent_at: string | null
}
type LedgerRow = {
  id: number; entry_type: string; amount: number; program_delta: number; participant_delta: number; vendor_delta: number
  participant_balance_after: number | null; created_at: string; note: string | null; reverses_id: number | null; vch_code: string | null
  participant_name: string | null; national_id: string | null; point_name: string | null; user_name: string | null
}
type Summary = {
  activity: any
  program: { budget: number; unallocated: number; allocated: number }
  participants: { count: number; active: number; balance: number; stored_balance: number }
  vendors: { due: number; rows: { pos_point_id: number; point_name: string; due: number; redeem_count: number }[] }
  redeemed: number; redeem_count: number; balanced: boolean
}
type Lookup = { currencies: { id: number; code: string; name: string }[]; points: { id: number; code: string; name: string; currency_id: number }[]; groups: { id: number; name: string }[] }
type Draft = {
  id?: number; name: string; donor_name: string; donor_account_id: number | null; donor_account_label: string; currency_id: string
  amount_per_participant: string; budget: string; start_date: string; end_date: string; status: number; max_redemptions: string
  all_items: boolean; all_points: boolean; notes: string
  items: { product_id: number | null; category_id: number | null; label: string }[]; points: number[]
}
type Credential = { national_id: string; full_name: string; phone: string; code: string; pin: string; balance: number }

const STATUS: Record<number, { label: string; tone: string }> = {
  1: { label: tr("فعّال"), tone: "bg-emerald-100 text-emerald-800" },
  2: { label: tr("مجمّد"), tone: "bg-amber-100 text-amber-800" },
  3: { label: tr("مغلق"), tone: "bg-slate-200 text-slate-700" },
}
const ENTRY_LABELS: Record<string, string> = { allocate: tr("توزيع رصيد"), topup: tr("تعبئة رصيد"), redeem: tr("صرف من نقطة بيع"), reverse: tr("عكس صرف"), cancel: tr("إلغاء رمز") }
const IMPORT_COLUMNS: Record<string, string[]> = {
  national_id: ["رقم الهوية", "الهوية", "national_id", "id_number"],
  full_name: ["الاسم", "اسم المستفيد", "full_name", "name"],
  phone: ["الجوال", "رقم الجوال", "الهاتف", "phone", "mobile"],
  household_size: ["عدد أفراد الأسرة", "أفراد الأسرة", "household_size"],
  amount: ["المبلغ", "الرصيد", "amount"],
}
const today = () => new Date().toISOString().slice(0, 10)
const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const emptyDraft = (): Draft => ({
  name: "", donor_name: "", donor_account_id: null, donor_account_label: "", currency_id: "", amount_per_participant: "", budget: "",
  start_date: today(), end_date: today(), status: 1, max_redemptions: "", all_items: true, all_points: true, notes: "", items: [], points: [],
})

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(String(data?.error || "تعذر تنفيذ العملية"))
  return data
}

export default function AidProgram() {
  const { toast } = useToast()
  const can = useTransactionPermission()
  const canCreate = can("aid_program", "create", true)
  const canUpdate = can("aid_program", "update", true)
  const canDelete = can("aid_program", "delete", true)
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [tab, setTab] = useState<"participants" | "ledger" | "summary">("participants")
  const [lookup, setLookup] = useState<Lookup>({ currencies: [], points: [], groups: [] })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [picker, setPicker] = useState(false)
  const [groupId, setGroupId] = useState("")

  const fail = (error: unknown) => toast({ title: tr("خطأ"), description: error instanceof Error ? error.message : tr("تعذر تنفيذ العملية"), variant: "destructive" })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await readJson(await fetch("/api/aid/activities", { cache: "no-store" }))
      setRows(data.rows || [])
      setSelectedId((current) => current && data.rows.some((row: ActivityRow) => row.id === current) ? current : data.rows[0]?.id ?? null)
    } catch (error) { fail(error) } finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void fetch("/api/aid/activities?lookup=1").then(readJson).then(setLookup).catch(() => undefined) }, [])

  const selected = rows.find((row) => row.id === selectedId) || null

  const openNew = () => setDraft({ ...emptyDraft(), currency_id: String(lookup.currencies[0]?.id || "") })
  const openEdit = async (id: number) => {
    try {
      const data = await readJson(await fetch(`/api/aid/activities/${id}`, { cache: "no-store" }))
      const a = data.activity
      setDraft({
        id, name: a.name, donor_name: a.donor_name || "", donor_account_id: Number(a.donor_account_id),
        donor_account_label: `${a.donor_account_code} — ${a.donor_account_name}`, currency_id: String(a.currency_id),
        amount_per_participant: String(Number(a.amount_per_participant)), budget: String(Number(a.budget)), start_date: a.start_date, end_date: a.end_date,
        status: Number(a.status), max_redemptions: a.max_redemptions ? String(a.max_redemptions) : "", all_items: a.all_items, all_points: a.all_points,
        notes: a.notes || "", points: a.points || [],
        items: (a.items || []).map((item: any) => ({
          product_id: item.product_id, category_id: item.category_id,
          label: item.product_id ? `${item.product_code || ""} — ${item.product_name || ""}` : tr("مجموعة: {0}", item.category_name || item.category_id),
        })),
      })
    } catch (error) { fail(error) }
  }
  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const body = {
        ...draft, donor_account_id: draft.donor_account_id, currency_id: Number(draft.currency_id),
        amount_per_participant: Number(draft.amount_per_participant || 0), budget: Number(draft.budget || 0),
        max_redemptions: draft.max_redemptions ? Number(draft.max_redemptions) : null,
        items: draft.items.map(({ product_id, category_id }) => ({ product_id, category_id })),
      }
      const saved = await readJson(await fetch(draft.id ? `/api/aid/activities/${draft.id}` : "/api/aid/activities", {
        method: draft.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }))
      toast({ title: tr("تم الحفظ"), description: draft.name })
      setDraft(null)
      setSelectedId(Number(saved.id))
      await load()
    } catch (error) { fail(error) } finally { setSaving(false) }
  }
  const remove = async (row: ActivityRow) => {
    if (!(await confirmYesNo(tr("حذف النشاط «{0}» ومستفيديه؟ (يُسمح فقط إن لم تُسجَّل عليه أي حركة)", row.name)))) return
    try {
      await readJson(await fetch(`/api/aid/activities/${row.id}`, { method: "DELETE" }))
      await load()
    } catch (error) { fail(error) }
  }

  return (
    <main dir={appDir()} className="min-h-full space-y-4 bg-slate-50/70 p-3 sm:p-5 dark:bg-slate-950">
      {/* نفس ترويسة شاشات النظام (الشيكات...): بطاقة متدرجة بأيقونة وعنوان ووصف والأزرار */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 p-5 text-white shadow-xl sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <span className="rounded-2xl bg-white/15 p-3 backdrop-blur"><HeartHandshake className="h-7 w-7" /></span>
            <div className="min-w-0">
              <h1 className="text-2xl font-black sm:text-3xl">{tr("برامج المساعدات")}</h1>
              <p className="mt-1 max-w-2xl text-sm text-white/75">{tr("أنشطة القسائم بلا بطاقة: المستفيدون ورموز الصرف، والصرف من الكاشير بطريقة الدفع «قسيمة مساعدة».")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="flex-1 bg-white/15 text-white hover:bg-white/25 sm:flex-none" onClick={() => void load()}><RefreshCw className="me-1 h-4 w-4" />{tr("تحديث")}</Button>
            {canCreate && <Button className="flex-1 bg-white text-emerald-700 hover:bg-emerald-50 sm:flex-none" onClick={openNew}><Plus className="me-1 h-4 w-4" />{tr("نشاط جديد")}</Button>}
          </div>
        </div>
      </div>

      {/* الجوال: بطاقة لكل نشاط بدل جدول عريض */}
      <div className="space-y-2 md:hidden">
        {loading && <div className="rounded-2xl border bg-white p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}
        {!loading && !rows.length && <div className="rounded-2xl border bg-white p-6 text-center text-sm text-slate-500">{tr("لا توجد أنشطة بعد — أضف نشاطاً جديداً.")}</div>}
        {rows.map((row) => (
          <div key={row.id} role="button" tabIndex={0} onClick={() => setSelectedId(row.id)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(row.id) }}
            className={`rounded-2xl border bg-white p-3 shadow-sm ${row.id === selectedId ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-black text-slate-900">{row.name}</p>
                <p className="truncate text-xs text-slate-500">{row.donor_name || row.donor_account_name}</p>
                <p className="mt-0.5 text-[11px] tabular-nums text-slate-500" dir="ltr">{row.start_date} → {row.end_date}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[row.status]?.tone}`}>{STATUS[row.status]?.label}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {([[tr("الميزانية"), `${money(row.budget)} ${row.currency_code}`], [tr("غير موزّع"), money(row.unallocated)], [tr("المستفيدون"), String(row.participant_count)], [tr("المصروف"), money(row.redeemed)]] as const).map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-2 py-1.5"><span className="block text-[11px] text-slate-500">{label}</span><b className="tabular-nums" dir="ltr">{value}</b></div>
              ))}
            </div>
            {(canUpdate || canDelete) && <div className="mt-2 flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
              {canUpdate && <Button size="sm" variant="outline" onClick={() => void openEdit(row.id)}><Pencil className="me-1 h-4 w-4" />{tr("تعديل")}</Button>}
              {canDelete && <Button size="sm" variant="outline" onClick={() => void remove(row)} aria-label={tr("حذف")}><Trash2 className="h-4 w-4 text-rose-600" /></Button>}
            </div>}
          </div>
        ))}
      </div>

      <Card className="hidden md:block"><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600"><tr>
              <th className="p-2 text-start">{tr("النشاط")}</th><th className="p-2 text-start">{tr("الجهة المانحة")}</th><th className="p-2">{tr("الفترة")}</th>
              <th className="p-2">{tr("الميزانية")}</th><th className="p-2">{tr("غير موزّع")}</th><th className="p-2">{tr("المستفيدون")}</th><th className="p-2">{tr("أرصدتهم")}</th>
              <th className="p-2">{tr("المصروف")}</th><th className="p-2">{tr("الحالة")}</th><th className="p-2" />
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="p-6 text-center text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
              {!loading && !rows.length && <tr><td colSpan={10} className="p-6 text-center text-slate-500">{tr("لا توجد أنشطة بعد — أضف نشاطاً جديداً.")}</td></tr>}
              {rows.map((row) => (
                <tr key={row.id} onClick={() => setSelectedId(row.id)} className={`cursor-pointer border-t hover:bg-emerald-50/50 ${row.id === selectedId ? "bg-emerald-50" : ""}`}>
                  <td className="p-2 font-bold">{row.name}</td>
                  <td className="p-2 text-slate-600">{row.donor_name || row.donor_account_name}</td>
                  <td className="p-2 text-center text-xs tabular-nums" dir="ltr">{row.start_date} → {row.end_date}</td>
                  <td className="p-2 text-center tabular-nums">{money(row.budget)} <small>{row.currency_code}</small></td>
                  <td className="p-2 text-center tabular-nums">{money(row.unallocated)}</td>
                  <td className="p-2 text-center tabular-nums">{row.participant_count}</td>
                  <td className="p-2 text-center tabular-nums">{money(row.participant_balance)}</td>
                  <td className="p-2 text-center tabular-nums">{money(row.redeemed)}</td>
                  <td className="p-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[row.status]?.tone}`}>{STATUS[row.status]?.label}</span></td>
                  <td className="p-2 text-end whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                    {canUpdate && <Button size="sm" variant="ghost" onClick={() => void openEdit(row.id)} aria-label={tr("تعديل")}><Pencil className="h-4 w-4" /></Button>}
                    {canDelete && <Button size="sm" variant="ghost" onClick={() => void remove(row)} aria-label={tr("حذف")}><Trash2 className="h-4 w-4 text-rose-600" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>

      {selected && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 rounded-xl bg-slate-100 p-1 sm:flex-row sm:items-center">
            <div className="grid grid-cols-3 gap-1 sm:flex">
              {([["participants", "المستفيدون", Users], ["ledger", "الحركات", BookOpen], ["summary", "الدفاتر الثلاثة", Scale]] as const).map(([key, label, Icon]) => (
                <button key={key} type="button" onClick={() => setTab(key)} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold sm:px-4 sm:text-sm ${tab === key ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600"}`}>
                  <Icon className="h-4 w-4 shrink-0" /><span className="truncate">{tr(label)}</span>
                </button>
              ))}
            </div>
            <span className="truncate px-3 pb-1 text-sm font-bold text-slate-700 sm:ms-auto sm:pb-0">{selected.name}</span>
          </div>
          {tab === "participants" && <ParticipantsTab activity={selected} canCreate={canCreate} canUpdate={canUpdate} onChanged={load} fail={fail} />}
          {tab === "ledger" && <LedgerTab activityId={selected.id} points={lookup.points} fail={fail} />}
          {tab === "summary" && <SummaryTab activityId={selected.id} fail={fail} />}
        </div>
      )}

      <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) setDraft(null) }}>
        <DialogContent dir={appDir()} className="max-h-[92dvh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? tr("تعديل نشاط مساعدة") : tr("نشاط مساعدة جديد")}</DialogTitle>
            <DialogDescription>{tr("قيمة القسائم المصروفة تُسجَّل ذمةً على حساب الجهة المانحة في قيد فاتورة الكاشير.")}</DialogDescription></DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2"><Label>{tr("اسم النشاط *")}</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>{tr("الجهة المانحة")}</Label><Input value={draft.donor_name} placeholder={tr("مثال: CRS")} onChange={(e) => setDraft({ ...draft, donor_name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>{tr("حساب الجهة المانحة *")}</Label>
                  <AutoCompleteAccount label="" value={draft.donor_account_id ? String(draft.donor_account_id) : ""} valueMode="id" onValueChange={() => undefined}
                    onAccountSelect={(account: any) => setDraft((current) => current && ({ ...current, donor_account_id: account ? Number(account.id) : null, donor_account_label: account ? `${account.code} — ${account.name}` : "" }))}
                    showCostCenterButton={false} className="w-full" placeholder={tr("ابحث عن الحساب")} />
                  {draft.donor_account_label && <p className="text-xs text-slate-500">{draft.donor_account_label}</p>}
                </div>
                <div className="space-y-1.5"><Label>{tr("العملة *")}</Label>
                  <select className="h-10 w-full rounded-md border bg-white px-2 text-sm" value={draft.currency_id} onChange={(e) => setDraft({ ...draft, currency_id: e.target.value })}>
                    {lookup.currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.code} — {currency.name}</option>)}
                  </select>
                  <p className="text-xs text-slate-500">{tr("يجب أن تطابق عملة نقاط البيع التي تصرف القسائم.")}</p>
                </div>
                <div className="space-y-1.5"><Label>{tr("الحالة")}</Label>
                  <select className="h-10 w-full rounded-md border bg-white px-2 text-sm" value={draft.status} onChange={(e) => setDraft({ ...draft, status: Number(e.target.value) })}>
                    {Object.entries(STATUS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><Label>{tr("الميزانية *")}</Label><Input type="number" min="0" step="0.01" value={draft.budget} onChange={(e) => setDraft({ ...draft, budget: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>{tr("المبلغ الافتراضي لكل مستفيد")}</Label><Input type="number" min="0" step="0.01" value={draft.amount_per_participant} onChange={(e) => setDraft({ ...draft, amount_per_participant: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>{tr("من تاريخ *")}</Label><Input type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>{tr("إلى تاريخ *")}</Label><Input type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>{tr("أقصى عدد مرات صرف لكل مستفيد")}</Label><Input type="number" min="0" placeholder={tr("بلا حد")} value={draft.max_redemptions} onChange={(e) => setDraft({ ...draft, max_redemptions: e.target.value })} /></div>
              </div>

              <section className="space-y-2 rounded-xl border p-3">
                <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.all_items} onChange={(e) => setDraft({ ...draft, all_items: e.target.checked })} />{tr("كل الأصناف مسموحة")}</label>
                {!draft.all_items && <>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setPicker(true)}><Plus className="me-1 h-4 w-4" />{tr("صنف")}</Button>
                    <select className="h-9 rounded-md border bg-white px-2 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                      <option value="">{tr("مجموعة أصناف…")}</option>
                      {lookup.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                    <Button type="button" size="sm" variant="outline" disabled={!groupId} onClick={() => {
                      const group = lookup.groups.find((row) => row.id === Number(groupId))
                      if (!group || draft.items.some((item) => item.category_id === group.id)) return
                      setDraft({ ...draft, items: [...draft.items, { product_id: null, category_id: group.id, label: tr("مجموعة: {0}", group.name) }] })
                      setGroupId("")
                    }}>{tr("إضافة المجموعة")}</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {draft.items.map((item, index) => (
                      <Badge key={`${item.product_id}-${item.category_id}-${index}`} variant="secondary" className="gap-1">{item.label}
                        <button type="button" aria-label={tr("إزالة")} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                  </div>
                </>}
              </section>

              <section className="space-y-2 rounded-xl border p-3">
                <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.all_points} onChange={(e) => setDraft({ ...draft, all_points: e.target.checked })} />{tr("كل نقاط البيع (المتاجر) معتمدة")}</label>
                {!draft.all_points && <div className="grid gap-1 sm:grid-cols-2">
                  {lookup.points.map((point) => (
                    <label key={point.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={draft.points.includes(point.id)} onChange={(e) => setDraft({ ...draft, points: e.target.checked ? [...draft.points, point.id] : draft.points.filter((id) => id !== point.id) })} />
                      {point.code} — {point.name}
                    </label>
                  ))}
                </div>}
              </section>

              <div className="space-y-1.5"><Label>{tr("ملاحظات")}</Label><Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDraft(null)}>{tr("إلغاء")}</Button>
                <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="me-1 h-4 w-4 animate-spin" />}{tr("حفظ")}</Button>
              </div>
            </div>
          )}
          <ProductSearchPopup open={picker} onClose={() => setPicker(false)} title={tr("اختر الصنف")} onSelect={(products: any) => {
            const list = (Array.isArray(products) ? products : [products]).filter(Boolean)
            setDraft((current) => current && ({
              ...current,
              items: [...current.items, ...list.filter((p: any) => !current.items.some((item) => item.product_id === Number(p.id)))
                .map((p: any) => ({ product_id: Number(p.id), category_id: null, label: `${p.product_code || p.code || ""} — ${p.product_name || p.name || ""}` }))],
            }))
            setPicker(false)
          }} />
        </DialogContent>
      </Dialog>
    </main>
  )
}

function ParticipantsTab({ activity, canCreate, canUpdate, onChanged, fail }: { activity: ActivityRow; canCreate: boolean; canUpdate: boolean; onChanged: () => Promise<void>; fail: (error: unknown) => void }) {
  const { toast } = useToast()
  const [rows, setRows] = useState<Participant[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [importing, setImporting] = useState(false)
  const [importErrors, setImportErrors] = useState<{ row: number; error: string }[]>([])
  const [credentials, setCredentials] = useState<Credential[] | null>(null)
  const [topUp, setTopUp] = useState<{ amount: string; all: boolean; note: string; requestId: string } | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await readJson(await fetch(`/api/aid/participants?activity_id=${activity.id}&q=${encodeURIComponent(query.trim())}`, { cache: "no-store" }))
      setRows(data.rows || []); setTotal(Number(data.total || 0)); setSelected([])
    } catch (error) { fail(error) } finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id, query])
  useEffect(() => { void load() }, [activity.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (body: Record<string, unknown>) => readJson(await fetch("/api/aid/participants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activity_id: activity.id, ...body }) }))

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx")
    const sheet = XLSX.utils.aoa_to_sheet([["رقم الهوية", "الاسم", "الجوال", "عدد أفراد الأسرة", "المبلغ"], ["401234567", "اسم المستفيد", "0591234567", 5, Number(activity.amount_per_participant) || 0]])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, tr("المستفيدون"))
    XLSX.writeFile(book, "نموذج-مستفيدين.xlsx")
  }
  const importFile = async (file: File) => {
    setImporting(true); setImportErrors([])
    try {
      const XLSX = await import("xlsx")
      const book = XLSX.read(await file.arrayBuffer())
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: "", raw: false })
      const rows = raw.map((source) => {
        const entry: Record<string, unknown> = {}
        for (const [field, aliases] of Object.entries(IMPORT_COLUMNS)) {
          const key = Object.keys(source).find((header) => aliases.some((alias) => header.trim().toLowerCase() === alias.toLowerCase()))
          if (key !== undefined) entry[field] = source[key]
        }
        return entry
      }).filter((row) => Object.values(row).some((value) => String(value ?? "").trim()))
      const result = await post({ action: "import", rows })
      if (result.errors?.length) { setImportErrors(result.errors); return }
      toast({ title: tr("تم الاستيراد"), description: tr("{0} مستفيد{1}", result.imported, result.sms === "background" ? " — تُرسل الرموز برسائل SMS الآن" : "") })
      if (result.credentials) setCredentials(result.credentials)
      await Promise.all([load(), onChanged()])
    } catch (error) { fail(error) } finally { setImporting(false) }
  }
  const exportCredentials = async () => {
    if (!credentials) return
    const XLSX = await import("xlsx")
    const sheet = XLSX.utils.json_to_sheet(credentials.map((row) => ({ "رقم الهوية": row.national_id, "الاسم": row.full_name, "الجوال": row.phone, "رمز الصرف": row.code, "الرقم السري": row.pin, "الرصيد": row.balance })))
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, tr("الرموز"))
    XLSX.writeFile(book, `رموز-${activity.name}.xlsx`)
  }
  const runTopUp = async () => {
    if (!topUp) return
    try {
      const result = await post({ action: "topup", amount: Number(topUp.amount), all: topUp.all, participant_ids: selected, note: topUp.note, request_id: topUp.requestId })
      toast({ title: tr("تمت التعبئة"), description: tr("{0} مستفيد", result.updated) })
      setTopUp(null)
      await Promise.all([load(), onChanged()])
    } catch (error) { fail(error) }
  }
  const rowAction = async (row: Participant, action: "cancel" | "resend" | "unlock") => {
    if (action === "cancel" && !(await confirmYesNo(tr("إلغاء رمز «{0}»؟ يعود باقي رصيده ({1}) لميزانية النشاط.", row.full_name, money(row.balance))))) return
    if (action === "resend" && !(await confirmYesNo(tr("إصدار رقم سري جديد لـ«{0}» وإرساله برسالة؟ الرقم القديم يتوقف فوراً.", row.full_name)))) return
    setBusyId(row.id)
    try {
      const result = await post({ action, participant_id: row.id })
      if (action === "resend" && !result.sent) {
        setCredentials([{ national_id: row.national_id, full_name: row.full_name, phone: row.phone || "", code: result.code, pin: result.pin, balance: Number(row.balance) }])
        toast({ title: tr("تعذر إرسال الرسالة"), description: String(result.error || ""), variant: "destructive" })
      } else {
        toast({ title: action === "cancel" ? tr("تم إلغاء الرمز") : action === "resend" ? tr("تم الإرسال") : tr("تم فك القفل") })
      }
      await Promise.all([load(), action === "cancel" ? onChanged() : Promise.resolve()])
    } catch (error) { fail(error) } finally { setBusyId(null) }
  }

  return (
    <Card><CardContent className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 min-w-0 sm:min-w-[220px] sm:flex-1">
          <Search className="pointer-events-none absolute start-2 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="ps-8" placeholder={tr("بحث بالاسم أو الهوية أو الجوال أو الرمز")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load() }} />
        </div>
        <Button variant="outline" onClick={() => void load()}><Search className="me-1 h-4 w-4" />{tr("بحث")}</Button>
        {canCreate && <>
          <Button variant="outline" onClick={() => void downloadTemplate()}><Download className="me-1 h-4 w-4" />{tr("نموذج Excel")}</Button>
          <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-1 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 ${importing ? "pointer-events-none opacity-60" : ""}`}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}{tr("استيراد مستفيدين")}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void importFile(file) }} />
          </label>
        </>}
        {canUpdate && <Button variant="outline" onClick={() => setTopUp({ amount: String(Number(activity.amount_per_participant) || ""), all: !selected.length, note: "", requestId: crypto.randomUUID() })}><Wallet className="me-1 h-4 w-4" />{tr("تعبئة رصيد")}{selected.length ? ` (${selected.length})` : ""}</Button>}
      </div>

      {importErrors.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <p className="mb-2 flex items-center gap-1 font-bold"><AlertTriangle className="h-4 w-4" />{tr("لم يُستورد شيء — صحّح الأخطاء التالية في الملف ثم أعد الاستيراد:")}</p>
          <ul className="max-h-48 list-inside list-disc overflow-y-auto">{importErrors.map((item, index) => <li key={index}>{tr("الصف ")}{item.row}: {item.error}</li>)}</ul>
        </div>
      )}

      {/* الجوال: بطاقة لكل مستفيد */}
      <div className="space-y-2 md:hidden">
        {loading && <div className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}
        {!loading && !rows.length && <p className="p-6 text-center text-sm text-slate-500">{tr("لا يوجد مستفيدون — استورد ملف Excel.")}</p>}
        {!loading && rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" aria-label={tr("تحديد {0}", row.full_name)} checked={selected.includes(row.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{row.full_name}</p>
                <p className="text-xs tabular-nums text-slate-500" dir="ltr">{row.national_id} · {row.phone} · {row.code_masked}</p>
              </div>
              {row.code_status === 3 ? <Badge variant="secondary">{tr("ملغى")}</Badge> : row.locked ? <Badge className="bg-amber-100 text-amber-800">{tr("مقفل")}</Badge> : <Badge className="bg-emerald-100 text-emerald-800">{tr("فعّال")}</Badge>}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl bg-slate-50 px-2 py-1.5"><span className="block text-[11px] text-slate-500">{tr("الموزّع")}</span><b className="tabular-nums">{money(row.allocated)}</b></div>
              <div className="rounded-xl bg-slate-50 px-2 py-1.5"><span className="block text-[11px] text-slate-500">{tr("المصروف")}</span><b className="tabular-nums">{money(row.redeemed)}</b></div>
              <div className="rounded-xl bg-emerald-50 px-2 py-1.5"><span className="block text-[11px] text-slate-500">{tr("الرصيد")}</span><b className="tabular-nums text-emerald-700">{money(row.balance)}</b></div>
            </div>
            {canUpdate && row.code_status !== 3 && <div className="mt-2 flex justify-end gap-1">
              {row.locked && <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void rowAction(row, "unlock")}><Unlock className="me-1 h-4 w-4" />{tr("فك القفل")}</Button>}
              <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void rowAction(row, "resend")}><Send className="me-1 h-4 w-4" />{tr("رقم سري جديد وإرساله")}</Button>
              <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void rowAction(row, "cancel")} aria-label={tr("إلغاء الرمز")}><XCircle className="h-4 w-4 text-rose-600" /></Button>
            </div>}
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600"><tr>
            <th className="p-2"><input type="checkbox" aria-label={tr("تحديد الكل")} checked={rows.length > 0 && selected.length === rows.length} onChange={(e) => setSelected(e.target.checked ? rows.map((row) => row.id) : [])} /></th>
            <th className="p-2 text-start">{tr("المستفيد")}</th><th className="p-2">{tr("الهوية")}</th><th className="p-2">{tr("الجوال")}</th><th className="p-2">{tr("الرمز")}</th>
            <th className="p-2">{tr("الموزّع")}</th><th className="p-2">{tr("المصروف")}</th><th className="p-2">{tr("الرصيد")}</th><th className="p-2">{tr("الرسالة")}</th><th className="p-2">{tr("الحالة")}</th><th className="p-2" />
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && !rows.length && <tr><td colSpan={11} className="p-6 text-center text-slate-500">{tr("لا يوجد مستفيدون — استورد ملف Excel.")}</td></tr>}
            {!loading && rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-2 text-center"><input type="checkbox" aria-label={tr("تحديد {0}", row.full_name)} checked={selected.includes(row.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} /></td>
                <td className="p-2 font-semibold">{row.full_name}{row.household_size ? <small className="ms-1 text-slate-500">({row.household_size}{tr(" أفراد)")}</small> : null}</td>
                <td className="p-2 text-center tabular-nums" dir="ltr">{row.national_id}</td>
                <td className="p-2 text-center tabular-nums" dir="ltr">{row.phone}</td>
                <td className="p-2 text-center font-mono text-xs" dir="ltr">{row.code_masked}</td>
                <td className="p-2 text-center tabular-nums">{money(row.allocated)}</td>
                <td className="p-2 text-center tabular-nums">{money(row.redeemed)}</td>
                <td className="p-2 text-center font-bold tabular-nums">{money(row.balance)}</td>
                <td className="p-2 text-center">{row.sms_sent_at ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-label={tr("أُرسلت")} /> : <span className="text-xs text-slate-400">{tr("لم تُرسل")}</span>}</td>
                <td className="p-2 text-center">
                  {row.code_status === 3 ? <Badge variant="secondary">{tr("ملغى")}</Badge> : row.locked ? <Badge className="bg-amber-100 text-amber-800"><Lock className="me-1 h-3 w-3" />{tr("مقفل")}</Badge> : <Badge className="bg-emerald-100 text-emerald-800">{tr("فعّال")}</Badge>}
                </td>
                <td className="p-2 text-end whitespace-nowrap">
                  {canUpdate && row.code_status !== 3 && <>
                    {row.locked && <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => void rowAction(row, "unlock")} title={tr("فك القفل")}><Unlock className="h-4 w-4" /></Button>}
                    <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => void rowAction(row, "resend")} title={tr("رقم سري جديد وإرساله")}><Send className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => void rowAction(row, "cancel")} title={tr("إلغاء الرمز")}><XCircle className="h-4 w-4 text-rose-600" /></Button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">{total}{tr(" مستفيد")}{total > rows.length ? tr(" — يُعرض أول {0}، استخدم البحث", rows.length) : ""}</p>

      <Dialog open={Boolean(topUp)} onOpenChange={(open) => { if (!open) setTopUp(null) }}>
        <DialogContent dir={appDir()} className="max-w-md">
          <DialogHeader><DialogTitle>{tr("تعبئة رصيد")}</DialogTitle><DialogDescription>{tr("يُخصم المجموع من ميزانية النشاط غير الموزّعة (")}{money(activity.unallocated)} {activity.currency_code}).</DialogDescription></DialogHeader>
          {topUp && <div className="space-y-3">
            <div className="space-y-1.5"><Label>{tr("المبلغ لكل مستفيد")}</Label><Input type="number" min="0" step="0.01" value={topUp.amount} onChange={(e) => setTopUp({ ...topUp, amount: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={topUp.all} onChange={() => setTopUp({ ...topUp, all: true })} />{tr("كل المستفيدين الفعّالين (")}{activity.participant_count})</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!topUp.all} disabled={!selected.length} onChange={() => setTopUp({ ...topUp, all: false })} />{tr("المحدَّدون فقط (")}{selected.length})</label>
            <div className="space-y-1.5"><Label>{tr("ملاحظة")}</Label><Input value={topUp.note} onChange={(e) => setTopUp({ ...topUp, note: e.target.value })} /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setTopUp(null)}>{tr("إلغاء")}</Button><Button onClick={() => void runTopUp()}>{tr("تعبئة")}</Button></div>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(credentials)} onOpenChange={(open) => { if (!open) setCredentials(null) }}>
        <DialogContent dir={appDir()} className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />{tr("رموز الصرف والأرقام السرية")}</DialogTitle>
            <DialogDescription>{tr("لم تُرسل برسائل SMS. تُعرض هذه مرة واحدة فقط ولا تُحفظ الأرقام السرية — صدّرها أو سلّمها للمستفيدين الآن.")}</DialogDescription></DialogHeader>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs"><tr><th className="p-2 text-start">{tr("الاسم")}</th><th className="p-2">{tr("الجوال")}</th><th className="p-2">{tr("رمز الصرف")}</th><th className="p-2">{tr("الرقم السري")}</th><th className="p-2">{tr("الرصيد")}</th></tr></thead>
            <tbody>{credentials?.map((row) => <tr key={row.code} className="border-t"><td className="p-2">{row.full_name}</td><td className="p-2 text-center" dir="ltr">{row.phone}</td><td className="p-2 text-center font-mono" dir="ltr">{row.code}</td><td className="p-2 text-center font-mono font-bold" dir="ltr">{row.pin}</td><td className="p-2 text-center">{money(row.balance)}</td></tr>)}</tbody></table></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => void exportCredentials()}><Download className="me-1 h-4 w-4" />{tr("تصدير Excel")}</Button><Button onClick={() => setCredentials(null)}>{tr("تم")}</Button></div>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  )
}

function LedgerTab({ activityId, points, fail }: { activityId: number; points: Lookup["points"]; fail: (error: unknown) => void }) {
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ type: "", point_id: "", from: "", to: "" })
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ activity_id: String(activityId), ...filters })
      const data = await readJson(await fetch(`/api/aid/ledger?${params}`, { cache: "no-store" }))
      setRows(data.rows || [])
    } catch (error) { fail(error) } finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, filters])
  useEffect(() => { void load() }, [activityId]) // eslint-disable-line react-hooks/exhaustive-deps
  const delta = (value: number) => Number(value) === 0 ? <span className="text-slate-300">—</span> : <span className={Number(value) > 0 ? "text-emerald-700" : "text-rose-700"} dir="ltr">{Number(value) > 0 ? "+" : ""}{money(value)}</span>

  return (
    <Card><CardContent className="space-y-3 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label className="text-xs">{tr("النوع")}</Label>
          <select className="h-10 rounded-md border bg-white px-2 text-sm" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="">{tr("الكل")}</option>{Object.entries(ENTRY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></div>
        <div className="space-y-1"><Label className="text-xs">{tr("نقطة البيع")}</Label>
          <select className="h-10 rounded-md border bg-white px-2 text-sm" value={filters.point_id} onChange={(e) => setFilters({ ...filters, point_id: e.target.value })}>
            <option value="">{tr("الكل")}</option>{points.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}
          </select></div>
        <div className="space-y-1"><Label className="text-xs">{tr("من")}</Label><Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
        <div className="space-y-1"><Label className="text-xs">{tr("إلى")}</Label><Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
        <Button data-report-apply onClick={() => void load()}>{loading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Search className="me-1 h-4 w-4" />}{tr("عرض")}</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600"><tr>
            <th className="p-2">#</th><th className="p-2">{tr("التاريخ")}</th><th className="p-2 text-start">{tr("النوع")}</th><th className="p-2 text-start">{tr("المستفيد")}</th><th className="p-2">{tr("نقطة البيع")}</th>
            <th className="p-2">{tr("الفاتورة")}</th><th className="p-2">{tr("المبلغ")}</th><th className="p-2">{tr("دفتر الجهة المانحة")}</th><th className="p-2">{tr("دفتر المستفيد")}</th><th className="p-2">{tr("دفتر المتجر")}</th><th className="p-2">{tr("رصيد المستفيد بعدها")}</th><th className="p-2">{tr("المستخدم")}</th>
          </tr></thead>
          <tbody>
            {!loading && !rows.length && <tr><td colSpan={12} className="p-6 text-center text-slate-500">{tr("لا توجد حركات")}</td></tr>}
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-2 text-center text-xs text-slate-500">{row.id}</td>
                <td className="p-2 text-center text-xs tabular-nums" dir="ltr">{String(row.created_at).replace("T", " ").slice(0, 16)}</td>
                <td className="p-2">{ENTRY_LABELS[row.entry_type] || row.entry_type}{row.reverses_id ? <small className="ms-1 text-slate-500">{tr("(يعكس #")}{row.reverses_id})</small> : null}</td>
                <td className="p-2">{row.participant_name}{row.national_id ? <small className="ms-1 text-slate-500" dir="ltr">{row.national_id}</small> : null}</td>
                <td className="p-2 text-center">{row.point_name}</td>
                <td className="p-2 text-center font-mono text-xs">{row.vch_code}</td>
                <td className="p-2 text-center font-bold tabular-nums">{money(row.amount)}</td>
                <td className="p-2 text-center tabular-nums">{delta(row.program_delta)}</td>
                <td className="p-2 text-center tabular-nums">{delta(row.participant_delta)}</td>
                <td className="p-2 text-center tabular-nums">{delta(row.vendor_delta)}</td>
                <td className="p-2 text-center tabular-nums">{row.participant_balance_after === null ? "" : money(row.participant_balance_after)}</td>
                <td className="p-2 text-center text-xs">{row.user_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardContent></Card>
  )
}

function SummaryTab({ activityId, fail }: { activityId: number; fail: (error: unknown) => void }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  useEffect(() => {
    let active = true
    setSummary(null)
    void fetch(`/api/aid/activities/${activityId}`, { cache: "no-store" }).then(readJson).then((data) => { if (active) setSummary(data) }).catch(fail)
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId])
  const currency = summary?.activity?.currency_code || ""
  const tiles = useMemo(() => summary ? [
    { title: tr("دفتر الجهة المانحة"), rows: [["الميزانية", summary.program.budget], ["الموزّع على المستفيدين", summary.program.allocated], ["غير الموزّع", summary.program.unallocated]] },
    { title: tr("دفتر المستفيدين"), rows: [["عدد المستفيدين", summary.participants.count], ["الرموز الفعّالة", summary.participants.active], ["مجموع أرصدتهم", summary.participants.balance]] },
    { title: tr("دفتر المتاجر"), rows: [["صافي المصروف", summary.redeemed], ["عدد عمليات الصرف", summary.redeem_count], ["مستحقات المتاجر على الجهة المانحة", summary.vendors.due]] },
  ] : [], [summary])
  if (!summary) return <Card><CardContent className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></CardContent></Card>
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-bold ${summary.balanced ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
        {summary.balanced ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        {summary.balanced
          ? tr("الدفاتر متوازنة: الميزانية {0} = غير الموزّع {1} + أرصدة المستفيدين {2} + مستحقات المتاجر {3}", money(summary.program.budget), money(summary.program.unallocated), money(summary.participants.balance), money(summary.vendors.due))
          : tr("الدفاتر غير متوازنة — راجع الحركات (أرصدة المستفيدين المخزّنة {0} مقابل مجموع قيودهم {1})", money(summary.participants.stored_balance), money(summary.participants.balance))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.title}><CardContent className="space-y-2 p-4">
            <h3 className="font-black text-slate-800">{tile.title}</h3>
            {tile.rows.map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-slate-600">{label}</span>
                <b className="tabular-nums" dir="ltr">{String(label).startsWith("عدد") || String(label).startsWith("الرموز") ? Number(value) : `${money(value)} ${currency}`}</b>
              </div>
            ))}
          </CardContent></Card>
        ))}
      </div>
      <Card><CardContent className="p-3">
        <h3 className="mb-2 font-black text-slate-800">{tr("مستحقات كل متجر (نقطة بيع)")}</h3>
        <table className="w-full text-sm"><thead className="bg-slate-50 text-xs"><tr><th className="p-2 text-start">{tr("نقطة البيع")}</th><th className="p-2">{tr("عمليات الصرف")}</th><th className="p-2">{tr("المستحق")}</th></tr></thead>
          <tbody>
            {!summary.vendors.rows.length && <tr><td colSpan={3} className="p-4 text-center text-slate-500">{tr("لا يوجد صرف بعد")}</td></tr>}
            {summary.vendors.rows.map((row) => <tr key={row.pos_point_id} className="border-t"><td className="p-2">{row.point_name}</td><td className="p-2 text-center">{row.redeem_count}</td><td className="p-2 text-center font-bold tabular-nums">{money(row.due)} {currency}</td></tr>)}
          </tbody></table>
      </CardContent></Card>
    </div>
  )
}
