"use client"

import { useEffect, useState } from "react"
import { ArrowDownWideNarrow, ArrowUpWideNarrow, CheckCircle2, Link2Off, Loader2, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { WorkspaceDialogProvider } from "@/contexts/workspace-dialog-context"

type Voucher = { id: number; vch_type: number; vch_code: string; vch_date: string; due_date: string | null; amount: number; currency_name: string | null; party_name: string | null; party_code: string | null; settled: number; remaining: number; type_label: string; mode: "invoice" | "payment"; posted: boolean }
type Candidate = Voucher & { remaining_in_current: number; overdue_days: number }
type Linked = { id: number; amount: number; payment_amount: number; voucher_id: number; vch_type: number; vch_code: string; vch_date: string; voucher_amount: number; currency_name: string | null; type_label: string }
type View = { voucher: Voucher; linked: Linked[]; candidates: Candidate[]; can_settle: boolean }

const fmt = (value: unknown) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** تسديد الفواتير — من فاتورة مبيعات (ربط سندات القبض/الإشعارات/المرتجعات) أو من سند تسديد (ربط الفواتير المفتوحة). */
export function BillsPaymentDialog({ open, onOpenChange, voucherId }: { open: boolean; onOpenChange: (open: boolean) => void; voucherId: number | null }) {
  const [view, setView] = useState<View | null>(null)
  const [amounts, setAmounts] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [lateOnly, setLateOnly] = useState(false)

  const apply = (data: View) => { setView(data); setAmounts({}) }
  useEffect(() => {
    if (!open || !voucherId) return
    setLoading(true); setError("")
    fetch(`/api/invoice-settlements?voucher_id=${voucherId}`, { cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); apply(data) })
      .catch((cause) => setError(cause.message || "تعذر تحميل بيانات التسديد"))
      .finally(() => setLoading(false))
  }, [open, voucherId])

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/invoice-settlements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voucher_id: voucherId, ...body }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تنفيذ التسديد")
      apply({ ...data, can_settle: view?.can_settle ?? true })
    } catch (cause: any) { setError(cause.message) } finally { setBusy(false) }
  }

  const voucher = view?.voucher
  const isInvoice = voucher?.mode === "invoice"
  const canEdit = Boolean(view?.can_settle && voucher?.posted)
  const candidates = (view?.candidates || []).filter((row) => !lateOnly || row.overdue_days > 0)
  const payRow = (row: Candidate) => {
    const amount = Number(amounts[row.id] ?? Math.min(row.remaining_in_current, voucher?.remaining || 0))
    if (!(amount > 0)) { setError("أدخل مبلغ التسديد"); return }
    void post({ action: "allocate", other_id: row.id, amount })
  }

  return (
    <WorkspaceDialogProvider container={null} confined={false}>
      <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value) }}>
        <DialogContent className="z-[3001] flex max-h-[92vh] w-[min(1100px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0" dir="rtl">
          <div className="flex items-center gap-3 bg-gradient-to-l from-emerald-600 to-teal-600 px-5 py-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><Wallet className="h-5 w-5" /></span>
            <div className="text-right">
              <DialogTitle className="text-base font-bold">تسديد الفواتير {voucher ? `— ${voucher.type_label} ${voucher.vch_code}` : ""}</DialogTitle>
              <DialogDescription className="text-xs text-emerald-50">{isInvoice ? "ربط سندات القبض والإشعارات الدائنة والمرتجعات بهذه الفاتورة" : "توزيع هذا السند على فواتير العميل المفتوحة"}</DialogDescription>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {loading && <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />جاري التحميل...</div>}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-700">{error}</p>}
            {voucher && !loading && <>
              {!voucher.party_name && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">يجب اختيار العميل في السند لتتمكن من التسديد.</p>}
              {!voucher.posted && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">السند غير مرحّل — يمكن التسديد بعد ترحيله.</p>}
              {!view?.can_settle && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">لا يوجد لديك صلاحية "تسديد الفواتير" — عرض فقط.</p>}
              <div className="grid grid-cols-2 gap-2 rounded-xl border bg-slate-50 p-3 sm:grid-cols-3 lg:grid-cols-6">
                <Info label="العميل" value={voucher.party_name ? `${voucher.party_code ? `${voucher.party_code} - ` : ""}${voucher.party_name}` : "-"} wide />
                <Info label="التاريخ" value={voucher.vch_date} />
                {isInvoice && <Info label="تاريخ الاستحقاق" value={voucher.due_date || "-"} />}
                <Info label="المبلغ" value={`${fmt(voucher.amount)} ${voucher.currency_name || ""}`} />
                <Info label="المسدّد" value={fmt(voucher.settled)} tone="text-emerald-700" />
                <Info label={isInvoice ? "المتبقي للتسديد" : "غير مخصّص"} value={fmt(voucher.remaining)} tone={voucher.remaining > 0 ? "text-amber-700" : "text-emerald-700"} />
              </div>

              <section className="rounded-xl border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white px-3 py-2">
                  <h3 className="font-bold">{isInvoice ? "سندات العميل المتاحة للتسديد" : "فواتير العميل المفتوحة"} <span className="font-normal text-muted-foreground">({candidates.length})</span></h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {!isInvoice && <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={lateOnly} onChange={(event) => setLateOnly(event.target.checked)} />المتأخرة السداد فقط</label>}
                    <Button size="sm" variant="outline" disabled={!canEdit || busy || !voucher.remaining || !candidates.length} onClick={() => void post({ action: "auto", order: "fifo" })}><ArrowDownWideNarrow className="ml-1 h-4 w-4" />توزيع الأقدم أولاً</Button>
                    <Button size="sm" variant="outline" disabled={!canEdit || busy || !voucher.remaining || !candidates.length} onClick={() => void post({ action: "auto", order: "lifo" })}><ArrowUpWideNarrow className="ml-1 h-4 w-4" />توزيع الأحدث أولاً</Button>
                  </div>
                </div>
                <div className="max-h-[32vh] overflow-auto">
                  <table className="w-full min-w-[760px]">
                    <thead className="sticky top-0 bg-slate-100 text-xs text-slate-600"><tr>{["#", "النوع", "رقم السند", "التاريخ", ...(isInvoice ? [] : ["الاستحقاق", "أيام التأخير"]), "المبلغ", "المسدّد سابقاً", "المتبقي", "مبلغ التسديد", ""].map((label) => <th key={label} className="whitespace-nowrap px-2 py-2 text-right font-semibold">{label}</th>)}</tr></thead>
                    <tbody>
                      {candidates.map((row, index) => <tr key={row.id} className="border-t">
                        <td className="px-2 py-1.5 text-muted-foreground">{index + 1}</td>
                        <td className="px-2 py-1.5">{row.type_label}</td>
                        <td className="px-2 py-1.5 font-mono font-bold text-indigo-700">{row.vch_code}</td>
                        <td className="px-2 py-1.5" dir="ltr">{row.vch_date}</td>
                        {!isInvoice && <><td className="px-2 py-1.5" dir="ltr">{row.due_date || "-"}</td><td className={`px-2 py-1.5 font-semibold ${row.overdue_days ? "text-rose-600" : "text-muted-foreground"}`}>{row.overdue_days || "-"}</td></>}
                        <td className="px-2 py-1.5" dir="ltr">{fmt(row.amount)} <span className="text-[10px] text-muted-foreground">{row.currency_name}</span></td>
                        <td className="px-2 py-1.5" dir="ltr">{fmt(row.settled)}</td>
                        <td className="px-2 py-1.5 font-semibold" dir="ltr">{fmt(row.remaining_in_current)}</td>
                        <td className="px-2 py-1.5"><Input type="number" min={0} step="0.01" className="h-8 w-28 text-center" disabled={!canEdit || busy} placeholder={fmt(Math.min(row.remaining_in_current, voucher.remaining))} value={amounts[row.id] ?? ""} onChange={(event) => setAmounts((current) => ({ ...current, [row.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); payRow(row) } }} /></td>
                        <td className="px-2 py-1.5"><Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" disabled={!canEdit || busy || !voucher.remaining} onClick={() => payRow(row)}><CheckCircle2 className="ml-1 h-3.5 w-3.5" />تسديد</Button></td>
                      </tr>)}
                      {!candidates.length && <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">{isInvoice ? "لا توجد سندات قبض أو إشعارات أو مرتجعات متاحة لهذا العميل" : "لا توجد فواتير مفتوحة لهذا العميل"}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-xl border">
                <div className="border-b bg-white px-3 py-2"><h3 className="font-bold">{isInvoice ? "السندات المرتبطة بالفاتورة" : "الفواتير المسدّدة بهذا السند"} <span className="font-normal text-muted-foreground">({view?.linked.length || 0})</span></h3></div>
                <div className="max-h-[26vh] overflow-auto">
                  <table className="w-full min-w-[640px]">
                    <thead className="sticky top-0 bg-slate-100 text-xs text-slate-600"><tr>{["#", "النوع", "رقم السند", "التاريخ", "مبلغ السند", "المبلغ المسدّد", ""].map((label) => <th key={label} className="whitespace-nowrap px-2 py-2 text-right font-semibold">{label}</th>)}</tr></thead>
                    <tbody>
                      {(view?.linked || []).map((row, index) => <tr key={row.id} className="border-t">
                        <td className="px-2 py-1.5 text-muted-foreground">{index + 1}</td>
                        <td className="px-2 py-1.5">{row.type_label}</td>
                        <td className="px-2 py-1.5 font-mono font-bold text-indigo-700">{row.vch_code}</td>
                        <td className="px-2 py-1.5" dir="ltr">{row.vch_date}</td>
                        <td className="px-2 py-1.5" dir="ltr">{fmt(row.voucher_amount)} <span className="text-[10px] text-muted-foreground">{row.currency_name}</span></td>
                        <td className="px-2 py-1.5 font-semibold text-emerald-700" dir="ltr">{fmt(isInvoice ? row.amount : row.payment_amount)}</td>
                        <td className="px-2 py-1.5"><Button size="sm" variant="outline" className="h-8 border-rose-200 text-rose-600 hover:bg-rose-50" disabled={!view?.can_settle || busy} onClick={() => void post({ action: "remove", id: row.id })}><Link2Off className="ml-1 h-3.5 w-3.5" />فك الربط</Button></td>
                      </tr>)}
                      {!view?.linked.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">لا يوجد ربط بعد</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </>}
          </div>
          <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-2.5 text-xs text-muted-foreground">
            <span>{busy && <Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin" />}المبالغ بعملة {voucher?.currency_name || "السند"} — Enter في خانة المبلغ للتسديد</span>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>إغلاق</Button>
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceDialogProvider>
  )
}

function Info({ label, value, tone = "", wide = false }: { label: string; value: string; tone?: string; wide?: boolean }) {
  return <div className={`min-w-0 ${wide ? "col-span-2 sm:col-span-1" : ""}`}><div className="text-[11px] text-muted-foreground">{label}</div><div className={`truncate font-bold ${tone}`} dir="auto">{value}</div></div>
}
