"use client"
import { amountFractionOptions } from "@/lib/decimals"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { BadgeCheck, Building2, CalendarRange, Clock3, FileText, Landmark, Loader2, Phone, Printer, Send, Upload, XCircle } from "lucide-react"

type Line = { voucher_id: number; code: string; date: string; type: number; type_name: string; note: string; debit: number; credit: number; balance: number }
type Payment = { id: number; amount: string | number; transfer_date: string; reference: string | null; status: string; review_note: string | null; created_at: string; currency_code: string | null; receipt_code: string | null }
type PortalData = {
  company: { name: string; phone: string; email: string; address: string; logo: string }
  account: { id: number; code: string; name: string; mobile: string }
  currency: { id: number; code: string; name: string }
  currencies: { id: number; code: string; name: string }[]
  from: string
  to: string
  opening: number
  lines: Line[]
  totals: { debit: number; credit: number }
  balance: number
  payments: Payment[]
}

const money = (value: number | string) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const todayText = () => new Date().toISOString().slice(0, 10)
const logoSrc = (logo: string) => (!logo ? "" : /^(https?:|data:|\/)/i.test(logo) ? logo : `data:image/png;base64,${logo}`)
const STATUS: Record<string, { label: string; className: string; icon: typeof Clock3 }> = {
  pending: { label: "بانتظار المراجعة", className: "bg-amber-50 text-amber-700 ring-amber-200", icon: Clock3 },
  approved: { label: "تم القبول", className: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: BadgeCheck },
  rejected: { label: "مرفوضة", className: "bg-rose-50 text-rose-700 ring-rose-200", icon: XCircle },
}

export default function CustomerPortalView({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [range, setRange] = useState({ from: "", to: "" })
  const [form, setForm] = useState({ amount: "", currency_id: "", transfer_date: todayText(), reference: "", bank_name: "", payer_name: "", note: "" })
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [formMessage, setFormMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const load = useCallback(async (from?: string, to?: string) => {
    setLoading(true)
    setError("")
    try {
      const query = new URLSearchParams()
      if (from) query.set("from", from)
      if (to) query.set("to", to)
      const response = await fetch(`/api/portal/${encodeURIComponent(token)}${query.toString() ? `?${query}` : ""}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "تعذر تحميل كشف الحساب")
      setData(body)
      setRange({ from: body.from, to: body.to })
      setForm((current) => ({
        ...current,
        currency_id: current.currency_id || String(body.currency.id),
        amount: current.amount || (Number(body.balance) > 0 ? String(body.balance) : ""),
        payer_name: current.payer_name || body.account.name,
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل كشف الحساب")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormMessage(null)
    if (!file) return setFormMessage({ type: "error", text: "أرفق صورة أو ملف PDF لإشعار التحويل" })
    setSending(true)
    try {
      const body = new FormData()
      for (const [key, value] of Object.entries(form)) body.set(key, value)
      body.set("proof", file)
      const response = await fetch(`/api/portal/${encodeURIComponent(token)}/payments`, { method: "POST", body })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error || "تعذر إرسال الدفعة")
      setFormMessage({ type: "success", text: "تم إرسال إشعار التحويل — ستظهر الدفعة في كشف حسابك بعد مراجعتها من الشركة." })
      setForm((current) => ({ ...current, amount: "", reference: "", bank_name: "", note: "" }))
      setFile(null)
      await load(range.from, range.to)
    } catch (e) {
      setFormMessage({ type: "error", text: e instanceof Error ? e.message : "تعذر إرسال الدفعة" })
    } finally {
      setSending(false)
    }
  }

  if (loading && !data) {
    return <div dir="rtl" className="grid min-h-screen place-items-center bg-slate-50 text-slate-400"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }
  if (!data) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <XCircle className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-3 text-lg font-black text-slate-900">تعذر فتح الرابط</h1>
          <p className="mt-2 text-sm text-slate-600">{error || "الرابط غير صالح"}</p>
        </div>
      </div>
    )
  }

  const owes = data.balance > 0
  const logo = logoSrc(data.company.logo)

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-100 to-white text-slate-900 print:bg-white">
      <header className="bg-gradient-to-l from-emerald-700 to-teal-600 text-white print:bg-none print:text-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5">
          <div className="flex min-w-0 items-center gap-3">
            {logo ? <img src={logo} alt="" className="h-12 w-12 rounded-2xl bg-white object-contain p-1" /> : <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20"><Building2 className="h-6 w-6" /></span>}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black">{data.company.name || "كشف حساب"}</h1>
              <p className="flex flex-wrap gap-x-3 text-xs text-white/85 print:text-slate-600">{data.company.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /><span dir="ltr">{data.company.phone}</span></span>}{data.company.address && <span>{data.company.address}</span>}</p>
            </div>
          </div>
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-white/20 px-4 text-sm font-bold hover:bg-white/30 print:hidden"><Printer className="h-4 w-4" />طباعة / PDF</button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <section className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">العميل</p>
            <h2 className="mt-1 text-2xl font-black">{data.account.name}</h2>
            <p className="mt-1 text-sm text-slate-500">رقم الحساب <span dir="ltr" className="font-mono">{data.account.code}</span></p>
          </div>
          <div className={`rounded-3xl p-5 shadow-sm ${owes ? "bg-gradient-to-l from-rose-500 to-orange-500 text-white" : "bg-gradient-to-l from-emerald-500 to-teal-500 text-white"}`}>
            <p className="text-xs font-semibold text-white/85">{owes ? "الرصيد المستحق عليك" : data.balance < 0 ? "رصيد لصالحك" : "الرصيد"}</p>
            <p className="mt-1 text-3xl font-black tabular-nums" dir="ltr" style={{ textAlign: "right" }}>{money(Math.abs(data.balance))} <span className="text-base font-bold">{data.currency.code}</span></p>
            <p className="mt-1 text-xs text-white/80">حسب الحركات المعتمدة حتى اليوم</p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-black"><FileText className="h-5 w-5 text-emerald-600" />كشف الحساب</h2>
            <form className="flex flex-wrap items-end gap-2 print:hidden" onSubmit={(event) => { event.preventDefault(); void load(range.from, range.to) }}>
              <label className="text-xs text-slate-500">من<input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} className="mt-1 block h-10 rounded-xl border border-slate-200 px-3 text-sm" /></label>
              <label className="text-xs text-slate-500">إلى<input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} className="mt-1 block h-10 rounded-xl border border-slate-200 px-3 text-sm" /></label>
              <button type="submit" disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarRange className="h-4 w-4" />}عرض</button>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="py-2 text-right font-semibold">التاريخ</th><th className="py-2 text-right font-semibold">الحركة</th><th className="py-2 text-right font-semibold">البيان</th><th className="py-2 text-left font-semibold">مدين</th><th className="py-2 text-left font-semibold">دائن</th><th className="py-2 text-left font-semibold">الرصيد</th></tr></thead>
              <tbody>
                <tr className="border-b border-slate-100 bg-slate-50/70"><td className="py-2 tabular-nums" dir="ltr" style={{ textAlign: "right" }}>{data.from}</td><td className="py-2 font-semibold" colSpan={4}>رصيد افتتاحي</td><td className="py-2 text-left font-bold tabular-nums" dir="ltr">{money(data.opening)}</td></tr>
                {data.lines.map((line, index) => (
                  <tr key={`${line.voucher_id}-${index}`} className="border-b border-slate-100">
                    <td className="py-2 tabular-nums" dir="ltr" style={{ textAlign: "right" }}>{line.date}</td>
                    <td className="py-2"><span className="font-semibold">{line.type_name}</span> <span className="text-xs text-slate-400" dir="ltr">{line.code}</span></td>
                    <td className="max-w-[220px] truncate py-2 text-xs text-slate-500" title={line.note}>{line.note}</td>
                    <td className="py-2 text-left tabular-nums" dir="ltr">{line.debit ? money(line.debit) : ""}</td>
                    <td className="py-2 text-left tabular-nums text-emerald-700" dir="ltr">{line.credit ? money(line.credit) : ""}</td>
                    <td className="py-2 text-left font-bold tabular-nums" dir="ltr">{money(line.balance)}</td>
                  </tr>
                ))}
                {!data.lines.length && <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-400">لا توجد حركات في هذه الفترة</td></tr>}
              </tbody>
              <tfoot><tr className="border-t-2 border-slate-300 font-black"><td className="py-2" colSpan={3}>المجموع ({data.currency.code})</td><td className="py-2 text-left tabular-nums" dir="ltr">{money(data.totals.debit)}</td><td className="py-2 text-left tabular-nums" dir="ltr">{money(data.totals.credit)}</td><td className="py-2 text-left tabular-nums" dir="ltr">{money(data.lines.length ? data.lines[data.lines.length - 1].balance : data.opening)}</td></tr></tfoot>
            </table>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] print:hidden">
          <section className="rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm md:p-5">
            <h2 className="flex items-center gap-2 text-lg font-black"><Landmark className="h-5 w-5 text-emerald-600" />سداد بتحويل بنكي</h2>
            <p className="mt-1 text-xs leading-6 text-slate-500">حوّل المبلغ إلى حساب الشركة البنكي أو المحفظة، ثم أرسل تفاصيل التحويل وصورة الإشعار هنا. تُضاف الدفعة إلى كشف حسابك بعد مراجعتها.</p>
            <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">المبلغ *<input required inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 px-3 text-base tabular-nums" dir="ltr" /></label>
              <label className="text-xs font-semibold text-slate-600">العملة *<select value={form.currency_id} onChange={(event) => setForm({ ...form, currency_id: event.target.value })} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">{data.currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.code} — {currency.name}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">تاريخ التحويل *<input required type="date" max={todayText()} value={form.transfer_date} onChange={(event) => setForm({ ...form, transfer_date: event.target.value })} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-600">رقم المرجع / الحوالة<input value={form.reference} maxLength={100} onChange={(event) => setForm({ ...form, reference: event.target.value })} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" dir="ltr" /></label>
              <label className="text-xs font-semibold text-slate-600">البنك / المحفظة<input value={form.bank_name} maxLength={150} onChange={(event) => setForm({ ...form, bank_name: event.target.value })} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-600">اسم المحوِّل<input value={form.payer_name} maxLength={150} onChange={(event) => setForm({ ...form, payer_name: event.target.value })} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">ملاحظات<textarea value={form.note} maxLength={1000} rows={2} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-4 text-sm sm:col-span-2">
                <Upload className="h-5 w-5 shrink-0 text-emerald-600" />
                <span className="min-w-0 flex-1"><b className="block">صورة إشعار التحويل *</b><span className="block truncate text-xs text-slate-500">{file ? file.name : "صورة (JPG/PNG) أو PDF حتى 4 ميجابايت"}</span></span>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              </label>
              {formMessage && <p className={`rounded-xl px-3 py-2 text-sm sm:col-span-2 ${formMessage.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{formMessage.text}</p>}
              <button type="submit" disabled={sending} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-base font-black text-white hover:bg-emerald-700 disabled:opacity-60 sm:col-span-2">{sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}إرسال إشعار التحويل</button>
            </form>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <h2 className="text-lg font-black">دفعاتي المرسلة</h2>
            {data.payments.length ? (
              <ul className="mt-3 space-y-2">{data.payments.map((payment) => {
                const status = STATUS[payment.status] || STATUS.pending
                const Icon = status.icon
                return (
                  <li key={payment.id} className="rounded-2xl border border-slate-100 p-3">
                    <div className="flex items-center justify-between gap-2"><b className="tabular-nums" dir="ltr">{money(payment.amount)} {payment.currency_code}</b><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${status.className}`}><Icon className="h-3.5 w-3.5" />{status.label}</span></div>
                    <p className="mt-1 text-xs text-slate-500">تحويل بتاريخ <span dir="ltr">{payment.transfer_date}</span>{payment.reference ? ` · مرجع ${payment.reference}` : ""}{payment.receipt_code ? ` · سند قبض ${payment.receipt_code}` : ""}</p>
                    {payment.status === "rejected" && payment.review_note && <p className="mt-1 rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-700">السبب: {payment.review_note}</p>}
                  </li>
                )
              })}</ul>
            ) : <p className="mt-3 rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-400">لم ترسل أي دفعات بعد</p>}
          </section>
        </div>
        <p className="pb-6 text-center text-[11px] text-slate-400 print:hidden">هذا الرابط خاص بك — لا تشاركه مع أحد.</p>
      </main>
    </div>
  )
}
