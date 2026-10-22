"use client"
import { amountFractionOptions } from "@/lib/decimals"

import { useEffect, useState } from "react"
import { Banknote, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"

// صرف عمولة معتمدة: سند الصرف يُختار تلقائياً من سندات الصرف المعتمدة لفرع وعملة العمولة التي فيها رصيد غير مخصّص
// (لا إدخال رقم سند يدوياً)، والمبلغ محدود برصيد العمولة المتبقي وبرصيد السند المختار.
type Voucher = { id: number; vch_code: string; vch_date: string; amount: number; account_name: string | null; remaining: number }
type Row = { id: number; salesman_name?: string; invoice_code?: string; customer_name?: string; currency_code?: string; final_commission: number; paid_amount?: number }

const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())

export function CommissionPayDialog({ row, onClose, onPaid }: { row: Row; onClose: () => void; onPaid: () => void }) {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [remaining, setRemaining] = useState(Math.max(0, Number(row.final_commission || 0) - Number(row.paid_amount || 0)))
  const [voucherId, setVoucherId] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    fetch(`/api/salesman-commissions?payable_vouchers=1&transaction_id=${row.id}`, { cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "تعذر تحميل سندات الصرف"); return data })
      .then((data) => {
        if (!active) return
        const list: Voucher[] = (data.vouchers || []).map((v: any) => ({ ...v, amount: Number(v.amount), remaining: Number(v.remaining) }))
        const left = Number(data.remaining || 0)
        setVouchers(list); setRemaining(left)
        // اختيار تلقائي: أول سند يغطي رصيد العمولة كاملاً، وإلا السند صاحب أكبر رصيد
        const pick = list.find((v) => v.remaining + 0.009 >= left) || [...list].sort((a, b) => b.remaining - a.remaining)[0]
        if (pick) { setVoucherId(pick.id); setAmount(String(Math.min(left, pick.remaining).toFixed(2))) }
        else setAmount(String(left.toFixed(2)))
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "تعذر تحميل سندات الصرف"))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [row.id])

  const voucher = vouchers.find((v) => v.id === voucherId)
  const max = Math.min(remaining, voucher ? voucher.remaining : remaining)
  const value = Number(amount)
  const amountError = !amount ? "أدخل المبلغ المراد صرفه" : !(value > 0) ? "المبلغ يجب أن يكون أكبر من صفر" : value > max + 0.009 ? `المبلغ لا يمكن أن يتجاوز ${money(max)}` : ""

  const submit = async () => {
    if (!voucherId) { setError("اختر سند الصرف"); return }
    if (amountError) { setError(amountError); return }
    setSaving(true); setError("")
    try {
      const response = await fetch("/api/salesman-commissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pay", id: row.id, payment_voucher_id: voucherId, amount: Math.round(value * 100) / 100 }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذر صرف العمولة")
      onPaid()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر صرف العمولة")
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[3000] grid place-items-center bg-slate-950/45 p-3" dir="rtl">
      <div role="dialog" aria-modal="true" aria-label="صرف عمولة" className="flex max-h-[90dvh] w-[min(560px,100%)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center gap-3 bg-gradient-to-l from-emerald-600 to-teal-600 px-5 py-4 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25"><Banknote className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">صرف عمولة معتمدة</h2>
            <p className="truncate text-xs text-white/85">{row.salesman_name} · الفاتورة {row.invoice_code || "—"}{row.customer_name ? ` · ${row.customer_name}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 hover:bg-white/25"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[["العمولة", row.final_commission], ["المدفوع", row.paid_amount || 0], ["المتبقي للصرف", remaining]].map(([label, val], index) => (
              <div key={String(label)} className={`rounded-xl border px-2 py-2.5 ${index === 2 ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                <small className="block text-[11px] font-semibold text-slate-500">{label}</small>
                <b className={`font-mono text-base ${index === 2 ? "text-emerald-700" : "text-slate-800"}`} dir="ltr">{money(val)} <span className="text-[10px] font-semibold text-slate-400">{row.currency_code}</span></b>
              </div>
            ))}
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm font-bold text-slate-700">سند الصرف <span className="text-xs font-normal text-slate-500">(يُختار تلقائياً من سندات الصرف المعتمدة لنفس الفرع والعملة)</span></span>
            {loading ? <div className="flex h-11 items-center gap-2 rounded-xl border px-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />جاري تحميل السندات…</div>
              : vouchers.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">لا يوجد سند صرف معتمد برصيد غير مخصّص لهذا الفرع والعملة — أنشئ سند صرف للمندوب واعتمده أولاً، ثم عد للصرف.</div>
              : (
                <select value={voucherId ?? ""} onChange={(event) => { const id = Number(event.target.value); setVoucherId(id); const v = vouchers.find((x) => x.id === id); if (v) setAmount(String(Math.min(remaining, v.remaining).toFixed(2))) }} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900">
                  {vouchers.map((v) => <option key={v.id} value={v.id}>{v.vch_code} · {String(v.vch_date).slice(0, 10)} · {v.account_name || "—"} · المتاح {money(v.remaining)}</option>)}
                </select>
              )}
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-bold text-slate-700">المبلغ المراد صرفه *</span>
            <input
              inputMode="decimal" dir="ltr" autoFocus value={amount}
              onChange={(event) => { setAmount(event.target.value.replace(/[^\d.]/g, "")); setError("") }}
              onFocus={(event) => event.target.select()}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submit() } }}
              className={`h-12 rounded-xl border-2 px-3 text-center font-mono text-xl font-black outline-none focus:ring-4 ${amountError && amount ? "border-rose-300 text-rose-700 focus:ring-rose-100" : "border-emerald-300 bg-emerald-50/50 text-emerald-800 focus:ring-emerald-100"}`}
            />
            <small className="text-xs text-slate-500">الحد الأقصى: <b dir="ltr">{money(max)}</b> {row.currency_code} (رصيد العمولة المتبقي{voucher ? " ورصيد السند المختار" : ""})</small>
          </label>

          {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
        </div>

        <div className="flex justify-center gap-2 border-t bg-slate-50 px-4 py-3 dark:bg-slate-800">
          <Button onClick={() => void submit()} disabled={saving || loading || !voucherId || !!amountError} className="h-10 w-36 rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700">
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}صرف
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving} className="h-10 w-28 rounded-xl">إغلاق</Button>
        </div>
      </div>
    </div>
  )
}
