"use client"

import { tr, appDir } from "@/lib/i18n"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Truck, RefreshCw, Fuel, Wrench, ShieldCheck, Banknote, PackagePlus, PackageMinus, Loader2, AlertTriangle, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { VoucherListHero, VoucherStats } from "@/components/common/voucher-list-shell"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { openSectionInNewTab } from "@/lib/new-tab-handoff"
import { formatAmount } from "@/lib/decimals"

// البيع المتجول (2026-11-18): السيارة = مستودع متنقل + مندوب + صندوق + حسابات مصاريف (تعريف السيارات).
// التحميل والتفريغ بالارسالية الداخلية، البيع من مستودع السيارة، ومن هنا: متابعة كل سيارة، مصاريفها، وتسليم نقديتها.

type Van = {
  id: number; car_code: string; name: string; plate_number: string | null; salesman_name: string; warehouse_name: string; cash_account_name: string
  cash_account_id: number | null; items_count: number; stock_quantity: number; stock_value: number; sales: number; returns: number; sales_count: number
  cash_in: number; cash_out: number; cash_balance: number; expenses: { insurance: number; fuel: number; maintenance: number }; expenses_total: number; ready: boolean
}
type Kind = "insurance" | "fuel" | "maintenance"
const KINDS: { value: Kind; label: string; icon: any }[] = [
  { value: "fuel", label: "مصروف المحروقات", icon: Fuel },
  { value: "maintenance", label: "مصروف صيانة", icon: Wrench },
  { value: "insurance", label: "مصروف التامين والترخيص", icon: ShieldCheck },
]
const today = () => new Date().toISOString().slice(0, 10)
const fmt = (value: number) => formatAmount(value)

export default function CashVan() {
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState<Van[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [dialog, setDialog] = useState<{ type: "expense" | "handover"; van: Van } | null>(null)
  const [kind, setKind] = useState<Kind>("fuel")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(today())
  const [accountId, setAccountId] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch(`/api/cash-van?from=${from}&to=${to}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || tr("تعذر تحميل البيع المتجول"))
      setRows(body.rows || [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("تعذر تحميل البيع المتجول"))
    } finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { void load() }, [load])

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    sales: sum.sales + row.sales - row.returns, cash: sum.cash + row.cash_balance, stock: sum.stock + row.stock_value, expenses: sum.expenses + row.expenses_total,
  }), { sales: 0, cash: 0, stock: 0, expenses: 0 }), [rows])

  const openDialog = (type: "expense" | "handover", van: Van, expenseKind: Kind = "fuel") => {
    setDialog({ type, van }); setKind(expenseKind); setAmount(type === "handover" && van.cash_balance > 0 ? String(Math.round(van.cash_balance * 1000) / 1000) : "")
    setDate(today()); setAccountId(""); setNote(""); setError("")
  }

  const submit = async () => {
    if (!dialog) return
    setSaving(true); setError("")
    try {
      const response = await fetch("/api/cash-van", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dialog.type === "expense"
          ? { action: "expense", car_id: dialog.van.id, kind, amount: Number(amount), date, paid_account_id: accountId ? Number(accountId) : null, note }
          : { action: "handover", car_id: dialog.van.id, amount: Number(amount), date, to_account_id: Number(accountId), note }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || tr("تعذر تنفيذ العملية"))
      setNotice(tr("تم إنشاء سند القيد {0}", body.journal?.code || ""))
      setDialog(null)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("تعذر تنفيذ العملية"))
    } finally { setSaving(false) }
  }

  return (
    <div dir={appDir()} className="space-y-4 p-3 md:p-5">
      <VoucherListHero title={tr("البيع المتجول")} subtitle={tr("سيارات التوزيع: مخزون كل سيارة، مبيعاتها، صندوقها ومصاريفها — التحميل والتفريغ بالارسالية الداخلية")}
        icon={Truck} category={tr("المبيعات")} addLabel={tr("تعريف السيارات")} onNew={() => openSectionInNewTab("cars")}
        actions={<Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{tr("تحديث")}</Button>} />
      <VoucherStats stats={[
        { label: tr("صافي المبيعات"), value: fmt(totals.sales) },
        { label: tr("نقدية السيارات"), value: fmt(totals.cash) },
        { label: tr("قيمة مخزون السيارات"), value: fmt(totals.stock) },
        { label: tr("المصاريف"), value: fmt(totals.expenses) },
      ]} />
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-3 dark:bg-slate-950">
        <div className="grid gap-1"><Label>{tr("من تاريخ")}</Label><Input type="date" dir="ltr" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 w-40" /></div>
        <div className="grid gap-1"><Label>{tr("إلى تاريخ")}</Label><Input type="date" dir="ltr" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 w-40" /></div>
      </div>
      {error && !dialog && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</p>}
      {!loading && rows.length === 0 && <div className="rounded-2xl border-2 border-dashed py-14 text-center text-sm text-muted-foreground">
        <Truck className="mx-auto mb-2 h-10 w-10 text-emerald-600" />{tr("لا توجد سيارات — عرّف السيارة ومندوبها ومستودعها وصندوقها من شاشة السيارات")}
      </div>}
      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((van) => (
          <div key={van.id} className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white"><Truck className="h-5 w-5" /></span>
                <div>
                  <div className="font-bold">{van.name} <span className="font-mono text-xs text-slate-500">{van.car_code}{van.plate_number ? ` · ${van.plate_number}` : ""}</span></div>
                  <div className="text-xs text-slate-500">{tr("المندوب")}: {van.salesman_name || "—"} · {tr("المستودع")}: {van.warehouse_name || "—"}</div>
                </div>
              </div>
              {!van.ready && <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{tr("عرّف المندوب والمستودع والصندوق")}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Tile label={tr("المخزون")} value={`${fmt(van.stock_value)}`} sub={tr("{0} صنف", van.items_count)} />
              <Tile label={tr("المبيعات")} value={fmt(van.sales)} sub={van.returns ? `${tr("مرتجع")} ${fmt(van.returns)}` : tr("{0} سند", van.sales_count)} />
              <Tile label={tr("رصيد الصندوق")} value={fmt(van.cash_balance)} sub={`+${fmt(van.cash_in)} / −${fmt(van.cash_out)}`} />
              <Tile label={tr("المصاريف")} value={fmt(van.expenses_total)} sub={`${tr("محروقات")} ${fmt(van.expenses.fuel)}`} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => openSectionInNewTab("internal-delivery-vouchers")}><PackagePlus className="me-1 h-4 w-4" />{tr("تحميل السيارة")}</Button>
              <Button size="sm" variant="outline" onClick={() => openSectionInNewTab("internal-delivery-vouchers")}><PackageMinus className="me-1 h-4 w-4" />{tr("تفريغ السيارة")}</Button>
              <Button size="sm" variant="outline" onClick={() => openDialog("expense", van)}><Fuel className="me-1 h-4 w-4" />{tr("مصروف سيارة")}</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={!van.cash_account_id} onClick={() => openDialog("handover", van)}><Banknote className="me-1 h-4 w-4" />{tr("تسليم النقدية")}</Button>
              <Button size="sm" variant="ghost" onClick={() => openSectionInNewTab("cars")}><Settings2 className="me-1 h-4 w-4" />{tr("تعريف السيارة")}</Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => { if (!open) setDialog(null) }}>
        <DialogContent dir={appDir()} className="max-w-lg">
          <DialogHeader><DialogTitle>{dialog?.type === "expense" ? tr("مصروف سيارة") : tr("تسليم نقدية السيارة")} — {dialog?.van.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {dialog?.type === "expense" && (
              <div className="grid grid-cols-3 gap-2">
                {KINDS.map(({ value, label, icon: Icon }) => (
                  <button key={value} type="button" onClick={() => setKind(value)}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-xs font-semibold ${kind === value ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}>
                    <Icon className="h-5 w-5" />{tr(label)}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1"><Label>{tr("المبلغ")}</Label><Input type="number" min={0} dir="ltr" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
              <div className="grid gap-1"><Label>{tr("التاريخ")}</Label><Input type="date" dir="ltr" value={date} onChange={(event) => setDate(event.target.value)} /></div>
            </div>
            <AutoCompleteAccount label={dialog?.type === "expense" ? tr("مدفوع من (افتراضياً صندوق السيارة)") : tr("الصندوق المستلم")} value={accountId} valueMode="id"
              onValueChange={(value: any) => setAccountId(String(value || ""))} onAccountSelect={(account: any) => setAccountId(account ? String(account.id) : "")}
              showCostCenterButton={false} showCostCenterDialog={false} placeholder={tr("رقم الحساب أو البحث")} />
            <div className="grid gap-1"><Label>{tr("ملاحظة")}</Label><Input value={note} onChange={(event) => setNote(event.target.value)} /></div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={saving || !(Number(amount) > 0) || (dialog?.type === "handover" && !accountId)} onClick={() => void submit()}>
              {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}{tr("حفظ وإنشاء سند القيد")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-slate-50/60 p-2 dark:bg-slate-900">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
      {sub ? <div className="truncate text-[10px] text-slate-400">{sub}</div> : null}
    </div>
  )
}
