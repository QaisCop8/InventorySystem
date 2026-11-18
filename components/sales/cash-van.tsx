"use client"

import { tr, appDir } from "@/lib/i18n"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Truck, RefreshCw, Fuel, Wrench, ShieldCheck, Banknote, PackagePlus, PackageMinus, Loader2, AlertTriangle, Settings2, LayoutGrid, Scale } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { VoucherListHero, VoucherStats } from "@/components/common/voucher-list-shell"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { openSectionInNewTab } from "@/lib/new-tab-handoff"
import { formatAmount } from "@/lib/decimals"
import { ReportGrid, type ReportGridColumn } from "@/components/reports/report-grid"
import PrimeDropdown from "@/components/common/FocusDropdown"

// البيع المتجول (2026-11-18): السيارة = مستودع متنقل + مندوب + صندوق + حسابات مصاريف (تعريف السيارات).
// التحميل والتفريغ بالارسالية الداخلية، البيع من مستودع السيارة، ومن هنا: متابعة كل سيارة، مصاريفها، وتسليم نقديتها.

type Van = {
  id: number; car_code: string; name: string; plate_number: string | null; salesman_name: string; warehouse_name: string; cash_account_name: string
  cash_account_id: number | null; items_count: number; stock_quantity: number; stock_value: number; sales: number; returns: number; sales_count: number
  cash_in: number; cash_out: number; cash_balance: number; expenses: { insurance: number; fuel: number; maintenance: number }; expenses_total: number; ready: boolean
}
type ProfitRow = {
  id: number; car_code: string; name: string; plate_number: string; salesman_name: string; warehouse_name: string; employee_name: string
  sales: number; returns: number; net_sales: number; cost: number; gross_profit: number; unpriced_lines: number
  insurance: number; fuel: number; maintenance: number; expenses_total: number
  salary: number; salary_source: "payroll" | "basic" | "mixed" | "none" | "no_salesman" | "no_employee"
  net_profit: number; result: "profit" | "loss"; has_warehouse: boolean
}
const SALARY_SOURCE: Record<ProfitRow["salary_source"], string> = {
  payroll: "كشف الرواتب", basic: "الراتب الأساسي", mixed: "كشف الرواتب + الأساسي", none: "لا يوجد راتب",
  no_salesman: "لا مندوب للسيارة", no_employee: "المندوب غير مرتبط بموظف",
}
const PRICING = [
  { label: "متوسط الكلفة", value: "average" },
  { label: "آخر سعر شراء", value: "last" },
  { label: "داخل أول خارج أول", value: "fifo" },
]
type Kind = "insurance" | "fuel" | "maintenance"
const KINDS: { value: Kind; label: string; icon: any }[] = [
  { value: "fuel", label: "مصروف المحروقات", icon: Fuel },
  { value: "maintenance", label: "مصروف صيانة", icon: Wrench },
  { value: "insurance", label: "مصروف التامين والترخيص", icon: ShieldCheck },
]
const today = () => new Date().toISOString().slice(0, 10)
const fmt = (value: number) => formatAmount(value)

export default function CashVan() {
  const [tab, setTab] = useState<"vans" | "profit">("vans")
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
      {tab === "vans" && <VoucherStats stats={[
        { label: tr("صافي المبيعات"), value: fmt(totals.sales) },
        { label: tr("نقدية السيارات"), value: fmt(totals.cash) },
        { label: tr("قيمة مخزون السيارات"), value: fmt(totals.stock) },
        { label: tr("المصاريف"), value: fmt(totals.expenses) },
      ]} />}
      <div className="inline-flex rounded-xl border bg-white p-1 dark:bg-slate-950">
        {([["vans", tr("متابعة السيارات"), LayoutGrid], ["profit", tr("ربح / خسارة السيارات"), Scale]] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => setTab(value)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === value ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>
      {tab === "profit" ? <CarProfitPanel /> : <>
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
      </>}

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

const monthStart = () => `${today().slice(0, 8)}01`

/** ربح/خسارة كل سيارة في الفترة: ربح الأصناف (فواتير − مرتجعات من مستودعها) − مصاريفها − راتب مندوبها. */
function CarProfitPanel() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [pricing, setPricing] = useState("average")
  const [rows, setRows] = useState<ProfitRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const run = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch(`/api/cash-van?view=profit&from=${from}&to=${to}&pricing=${pricing}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || tr("تعذر تحميل التقرير"))
      setRows(body.rows || [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("تعذر تحميل التقرير"))
    } finally { setLoading(false) }
  }, [from, to, pricing])
  useEffect(() => { void run() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    gross: sum.gross + row.gross_profit, expenses: sum.expenses + row.expenses_total, salary: sum.salary + row.salary, net: sum.net + row.net_profit,
  }), { gross: 0, expenses: 0, salary: 0, net: 0 }), [rows])

  const money = (key: keyof ProfitRow, label: string, extra: Partial<ReportGridColumn<ProfitRow>> = {}): ReportGridColumn<ProfitRow> =>
    ({ key, label, type: "number", total: true, minWidth: 92, ...extra })
  const columns: ReportGridColumn<ProfitRow>[] = [
    { key: "name", label: tr("السيارة"), minWidth: 130, value: (row) => `${row.name} (${row.car_code})`, render: (row) => <span className="flex min-w-0 flex-col leading-tight"><span className="truncate font-semibold">{row.name}</span><span className="truncate font-mono text-[11px] text-slate-500">{row.car_code}{row.plate_number ? ` · ${row.plate_number}` : ""}</span></span> },
    { key: "salesman_name", label: tr("المندوب"), minWidth: 120, render: (row) => <span className="block truncate" title={row.salesman_name}>{row.salesman_name || "—"}</span> },
    money("net_sales", tr("صافي المبيعات")),
    money("cost", tr("كلفة المبيعات")),
    money("gross_profit", tr("ربح الأصناف"), { render: (row) => <span className={row.gross_profit < 0 ? "text-red-600" : ""}>{fmt(row.gross_profit)}{row.unpriced_lines ? <span title={tr("{0} سطر بلا كلفة", row.unpriced_lines)} className="ms-1 text-amber-600">⚠</span> : null}</span> }),
    money("fuel", tr("المحروقات")),
    money("maintenance", tr("الصيانة")),
    money("insurance", tr("التأمين والترخيص")),
    money("salary", tr("راتب المندوب"), { render: (row) => <span title={tr(SALARY_SOURCE[row.salary_source])} className={row.salary_source === "no_employee" ? "text-amber-600" : ""}>{fmt(row.salary)}</span> }),
    money("net_profit", tr("صافي الربح / الخسارة"), { minWidth: 110, render: (row) => <span className={`font-bold ${row.net_profit < 0 ? "text-red-600" : "text-emerald-700"}`}>{fmt(row.net_profit)}</span> }),
    { key: "result", label: tr("النتيجة"), minWidth: 72, value: (row) => row.result === "profit" ? tr("ربح") : tr("خسارة"),
      render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${row.result === "profit" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{row.result === "profit" ? tr("ربح") : tr("خسارة")}</span> },
  ]
  const missingEmployee = rows.some((row) => row.salary_source === "no_employee")

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-3 dark:bg-slate-950">
        <div className="grid gap-1"><Label>{tr("من تاريخ")}</Label><Input type="date" dir="ltr" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 w-40" /></div>
        <div className="grid gap-1"><Label>{tr("إلى تاريخ")}</Label><Input type="date" dir="ltr" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 w-40" /></div>
        <div className="fa-field grid w-48 gap-1"><Label>{tr("طريقة احتساب الكلفة")}</Label>
          <PrimeDropdown value={pricing} options={PRICING.map((option) => ({ ...option, label: tr(option.label) }))} optionLabel="label" optionValue="value"
            className="invoice-currency-dropdown w-full" panelClassName="invoice-currency-dropdown-panel" appendTo="self" onChange={(e: any) => setPricing(e.value || "average")} />
        </div>
        <Button data-report-apply className="h-9 bg-emerald-600 hover:bg-emerald-700" disabled={loading} onClick={() => void run()}>
          {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RefreshCw className="me-2 h-4 w-4" />}{tr("عرض التقرير")}
        </Button>
      </div>
      <VoucherStats stats={[
        { label: tr("ربح الأصناف"), value: fmt(totals.gross) },
        { label: tr("مصاريف السيارات"), value: fmt(totals.expenses) },
        { label: tr("رواتب المندوبين"), value: fmt(totals.salary) },
        { label: totals.net >= 0 ? tr("صافي الربح") : tr("صافي الخسارة"), value: fmt(totals.net) },
      ]} />
      {missingEmployee && <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />{tr("بعض المندوبين غير مرتبطين بموظف — اربطهم من تعريف المندوبين («الموظف المرتبط») ليُحتسب الراتب")}</p>}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <ReportGrid rows={rows} columns={columns} exportFileName={tr("ربح وخسارة السيارات")} totalLabel={tr("المجموع")}
        rowClassName={(row) => row.result === "loss" ? "bg-red-50/40" : undefined} emptyText={loading ? tr("جاري التحميل...") : tr("لا توجد سيارات")} />
      <p className="text-xs text-muted-foreground">{tr("ربح الأصناف = فواتير المبيعات − المرتجعات من مستودع السيارة مطروحاً منها الكلفة (كتقرير أرباح الأصناف). المصاريف من حسابات مصاريف السيارة. الراتب من كشف رواتب الموظف المرتبط بالمندوب للأشهر المشمولة (أو راتبه الأساسي إن لم يُصرف)، موزّعاً على أيام الفترة.")}</p>
    </div>
  )
}
