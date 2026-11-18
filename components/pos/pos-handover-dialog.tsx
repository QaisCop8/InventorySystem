"use client"

import { tr, appDir } from "@/lib/i18n"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PosDialogMessages } from "./pos-dialog-messages"
import { ArrowDownToLine, ArrowUpFromLine, Check, HandCoins, LockKeyhole, UserRound, X } from "lucide-react"
import "./pos-custody.css"

type Currency = { currency_id: number; currency_code: string; currency_name: string; rate_to_point: number }
type Session = { details_hidden?: boolean; movement_totals?: Array<{ movement_type: string; amount: number }>; shift_guid?: string; opening_cash: number; expected_cash: number; opened_at?: string; payments?: Array<{ payment_method: string; amount: number; sale_amount?: number; refund_amount?: number }>; currencies?: Array<{ currency_id: number; expected_amount: number; currency_code: string; rate_to_point?: number }>; movements?: Array<{ id: number; movement_type: string; currency_code?: string; currency_amount?: number; amount: number; created_at?: string; note?: string }> }
type Props = { open: boolean; onOpenChange: (open: boolean) => void; session: Session | null; userName: string; currencyCode: string; currencies: Currency[]; action: string; onActionChange: (action: string) => void; amount: number; onAmountChange: (amount: number) => void; currencyId: number; onCurrencyIdChange: (id: number) => void; amounts: Record<number, number>; onCurrencyAmountChange: (id: number, amount: number) => void; movementAmounts: Record<number, number>; onMovementAmountChange: (id: number, amount: number) => void; note: string; onNoteChange: (value: string) => void; onConfirm: () => void; busy: boolean; error?: string }
const money = (value: number) => Number(value || 0).toFixed(2)
const methods = [{ key: "cash", label: tr("الفواتير النقدية") }, { key: "cheque", label: tr("الشيكات") }, { key: "card", label: tr("البطاقات") }, { key: "account", label: tr("الذمم") }, { key: "gift_card", label: tr("بطاقات الهدايا") }, { key: "aid_voucher", label: tr("قسائم المساعدة") }]
// تسليم العهدة أُلغي من النافذة: إيداع، سحب، وإغلاق الوردية فقط
const actions = [{ key: "cash_in", label: tr("إيداع"), icon: ArrowDownToLine }, { key: "cash_out", label: tr("سحب"), icon: ArrowUpFromLine }, { key: "close", label: tr("إغلاق الوردية"), icon: LockKeyhole }]
const movementLabels: Record<string, string> = { opening: tr("فتح الوردية"), receive: tr("استلام العهدة"), sale: tr("بيع"), refund: tr("مردود"), cash_in: tr("إيداع"), cash_out: tr("سحب"), handover: tr("تسليم العهدة"), close: tr("إغلاق الوردية") }

export function PosHandoverDialog(p: Props) {
  const { open, onOpenChange, session, userName, currencyCode, currencies, action, onActionChange, amounts, onCurrencyAmountChange, movementAmounts, onMovementAmountChange, note, onNoteChange, onConfirm, busy, error } = p
  const closing = action === "close"
  // بلا صلاحية "السماح بمشاهدة تفاصيل العهدة": الخادم لا يرسل المبيعات/المتوقع/الحركات، وتُعرض حقول الإدخال فقط
  const showDetails = !session?.details_hidden
  const payments = session?.payments || []
  const sales = (method: string) => payments.filter(row => row.payment_method === method).reduce((sum, row) => sum + Number(row.sale_amount ?? row.amount ?? 0), 0)
  const refunds = (method: string) => payments.filter(row => row.payment_method === method).reduce((sum, row) => sum + Number(row.refund_amount || 0), 0)
  const totalSales = methods.reduce((sum, row) => sum + sales(row.key), 0)
  const totalRefunds = methods.reduce((sum, row) => sum + refunds(row.key), 0)
  const netCashSales = sales("cash") - refunds("cash")
  const available = (id: number) => Number(session?.currencies?.find(row => row.currency_id === id)?.expected_amount || 0)
  const rate = (id: number) => Number(session?.currencies?.find(row => row.currency_id === id)?.rate_to_point || currencies.find(row => row.currency_id === id)?.rate_to_point || 1)
  const totalEntered = currencies.reduce((sum, row) => sum + Number(amounts[row.currency_id] || 0) * rate(row.currency_id), 0)
  const validAmount = (value: number) => Number.isFinite(value) && value >= 0 && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001
  const valid = closing
    ? currencies.length > 0 && currencies.every(row => validAmount(Number(amounts[row.currency_id] ?? 0)))
    : currencies.some(row => Number(movementAmounts[row.currency_id] || 0) > 0) && currencies.every(row => { const value = Number(movementAmounts[row.currency_id] || 0); return validAmount(value) && (action !== "cash_out" || !showDetails || value <= available(row.currency_id) + 0.009) })
  const movements = session?.movements || []
  const movementTotal = (type: string) => (session?.movement_totals || movements).filter(row => row.movement_type === type).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const totalRequired = Math.round((Number(session?.opening_cash || 0) + netCashSales + movementTotal("cash_in") - movementTotal("cash_out")) * 100) / 100
  const difference = Math.round((totalEntered - totalRequired) * 100) / 100
  const moveToNextField = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return
    if (target.disabled || target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.readOnly)) return
    event.preventDefault()
    const controls = Array.from(new Set(event.currentTarget.querySelectorAll<HTMLElement>(
      'input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ))).filter(control => control.offsetWidth > 0 || control.offsetHeight > 0)
    const index = controls.indexOf(target)
    controls[(index + 1) % controls.length]?.focus()
  }
  const totalsSummary = <div className="pc-total" aria-live="polite">
    <span className="pc-total-icon"><HandCoins /></span>
    <div className="pc-total-item"><span>{tr("إجمالي المبلغ المعدود (")}{currencyCode})</span><strong dir="ltr">{money(totalEntered)}</strong></div>
    <div className="pc-total-item"><span>{tr("إجمالي المبلغ المطلوب (")}{currencyCode})</span><strong dir="ltr">{money(totalRequired)}</strong></div>
    <div className={"pc-total-item " + (difference > 0 ? "is-plus" : difference < 0 ? "is-minus" : "")}><span>{tr("الفرق (")}{currencyCode})</span><strong dir="ltr">{difference > 0 ? "+" : ""}{money(difference)}</strong></div>
  </div>
  const facts = [{ label: tr("رقم الوردية"), value: session?.shift_guid || "", ltr: true }, { label: tr("تاريخ العملية"), value: new Date().toLocaleString("en-GB"), ltr: true }, { label: tr("المستخدم"), value: userName }, { label: tr("الرصيد الافتتاحي"), value: `${money(Number(session?.opening_cash || 0))} ${currencyCode}` }, ...(showDetails ? [{ label: tr("مجموع المبيعات"), value: `${money(totalSales)} ${currencyCode}` }, { label: tr("الرصيد المتوقع"), value: `${money(Number(session?.expected_cash || 0))} ${currencyCode}` }] : [])]

  // بنمط شاشة الكاشير "Floating dock" — pos-custody.css
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent dir={appDir()} className="pos-custody flex h-[calc(100%-1.5rem)] max-h-[860px] w-[calc(100%-1.5rem)] max-w-[1040px] flex-col gap-0 overflow-hidden p-0" onKeyDown={event => { if (event.key === "F3") { event.preventDefault(); if (valid && !busy) onConfirm(); return } moveToNextField(event) }}>
      <DialogHeader className="pc-head shrink-0">
        <div className="pc-head-row"><span className="pc-brand">{closing ? <LockKeyhole /> : <HandCoins />}</span><div className="min-w-0"><span className="pc-eyebrow">{tr("العهدة")}</span><DialogTitle className="pc-title">{closing ? tr("إغلاق الوردية") : tr("العهدة")}</DialogTitle><DialogDescription className="pc-desc">{closing ? tr("المبلغ المعدود حسب المبالغ المدخلة في تفاصيل التسليم حسب العملة") : tr("إدارة عهدة الوردية والأرصدة حسب العملة")}</DialogDescription></div><span className="pc-chip max-sm:hidden"><UserRound />{userName || tr("الكاشير")}</span></div>
      </DialogHeader>
      <div className="pc-body min-h-0 flex-1 overflow-y-auto">
        <PosDialogMessages error={error} open={open} />
        <div role="tablist" className="pc-tabs">{actions.map(row => <button key={row.key} type="button" role="tab" aria-selected={action === row.key} onClick={() => onActionChange(row.key)} className="pc-tab"><row.icon /><span className="truncate">{row.label}</span></button>)}</div>
        {closing ? <>
          <section className="pc-card"><h3 className="pc-card-title">{tr("المبلغ المعدود")}</h3><div className="pc-card-body">
            <div className="grid gap-3 sm:grid-cols-2">{currencies.map(row => <div key={row.currency_id} className="pc-row" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)" }}><label htmlFor={`counted-${row.currency_id}`} className="pc-cur">{row.currency_code}<small>{row.currency_name}</small></label><Input id={`counted-${row.currency_id}`} aria-label={tr("المبلغ المعدود {0}", row.currency_code)} type="number" min="0" step="0.01" value={amounts[row.currency_id] ?? 0} onFocus={event => event.currentTarget.select()} onChange={event => onCurrencyAmountChange(row.currency_id, Number(event.target.value))} className="!h-12 text-end !text-xl" dir="ltr" /></div>)}</div>
          </div></section>
          {showDetails && totalsSummary}
        </> : <>
          <div className="pc-facts">{facts.map(card => <div key={card.label} className="pc-fact"><span>{card.label}</span><strong dir={card.ltr ? "ltr" : undefined} className={card.ltr ? "text-start" : undefined} title={card.value}>{card.value}</strong></div>)}</div>
          {showDetails && <section className="pc-card"><h3 className="pc-card-title">{tr("ملخص حركة الوردية")}</h3><div className="overflow-x-auto"><table className="pc-table min-w-[540px]"><thead><tr><th className="text-start">{tr("التفاصيل")}</th><th className="text-center">{tr("المبيعات")}</th><th className="text-center">{tr("المردودات")}</th><th className="text-center">{tr("الصافي")}</th></tr></thead><tbody>{methods.map(row => <tr key={row.key}><th className="text-start font-semibold">{row.label}</th><td className="text-center">{money(sales(row.key))}</td><td className="text-center">{money(refunds(row.key))}</td><td className="text-center font-bold">{money(sales(row.key) - refunds(row.key))}</td></tr>)}<tr className="pc-sum"><th className="text-start">{tr("المجموع")}</th><td className="text-center">{money(totalSales)}</td><td className="text-center">{money(totalRefunds)}</td><td className="text-center">{money(totalSales - totalRefunds)}</td></tr></tbody></table></div></section>}
          <section className="pc-card"><h3 className="pc-card-title">{action === "cash_in" ? tr("تفاصيل الإيداع") : tr("تفاصيل السحب")}</h3><div className="overflow-x-auto"><table className="pc-table min-w-[440px]"><thead><tr><th className="text-start">{tr("العملة")}</th>{showDetails && <th className="text-center">{tr("الرصيد المتاح")}</th>}<th className="text-center">{action === "cash_in" ? tr("مبلغ الإيداع") : tr("مبلغ السحب")}</th><th className="text-center">{tr("المبلغ المقيم (")}{currencyCode})</th></tr></thead><tbody>{currencies.map(row => <tr key={row.currency_id}><th className="text-start"><span className="pc-cur">{row.currency_code}<small>{row.currency_name}</small></span></th>{showDetails && <td className="text-center">{money(available(row.currency_id))}</td>}<td><Input aria-label={tr("{0} {1}", action === "cash_in" ? "إيداع" : "سحب", row.currency_code)} type="number" min="0" max={action === "cash_out" && showDetails ? available(row.currency_id) : undefined} step="0.01" value={movementAmounts[row.currency_id] ?? 0} onFocus={event => event.currentTarget.select()} onChange={event => onMovementAmountChange(row.currency_id, Number(event.target.value))} dir="ltr" /></td><td className="text-center font-bold">{money(Number(movementAmounts[row.currency_id] || 0) * rate(row.currency_id))}</td></tr>)}</tbody></table></div></section>
        </>}
        {showDetails && <section className="pc-card"><h3 className="pc-card-title">{tr("سجل العهدة في هذه الوردية")}</h3><div className="max-h-64 overflow-auto"><table className="pc-table min-w-[540px]"><thead><tr><th className="text-start">{tr("التاريخ والوقت")}</th><th className="text-start">{tr("العملية")}</th><th className="text-start">{tr("العملة")}</th><th className="text-end">{tr("المبلغ")}</th><th className="text-start">{tr("ملاحظات")}</th></tr></thead><tbody>{movements.map(row => <tr key={row.id}><td dir="ltr" className="text-start" style={{ color: "var(--pc-muted)" }}>{row.created_at ? new Date(row.created_at).toLocaleString("en-GB") : "—"}</td><td className="font-semibold">{movementLabels[row.movement_type] || row.movement_type}</td><td>{row.currency_code || currencyCode}</td><td dir="ltr" className="text-end font-bold">{money(Number(row.currency_amount ?? row.amount))}</td><td className="max-w-48 truncate" style={{ color: "var(--pc-muted)" }} title={row.note || ""}>{row.note || "—"}</td></tr>)}</tbody></table>{movements.length === 0 && <p className="p-6 text-center text-xs" style={{ color: "var(--pc-muted)" }}>{tr("لا توجد حركات مسجلة في هذه الوردية")}</p>}</div></section>}
        {!closing && <div className="space-y-2"><Label htmlFor="custody-note">{tr("ملاحظات")}</Label><Input id="custody-note" value={note} onChange={event => onNoteChange(event.target.value)} placeholder={tr("أضف ملاحظة لهذه العملية (اختياري)")} className="!font-normal" /></div>}
      </div>
      <div className="pc-foot"><button type="button" disabled={busy || !valid} onClick={onConfirm} className="pc-confirm"><Check className="size-5" />{tr("موافق")}<kbd>F3</kbd></button><button type="button" disabled={busy} onClick={() => onOpenChange(false)} className="pc-cancel"><X className="size-5" />{tr("إلغاء")}<kbd>Esc</kbd></button></div>
    </DialogContent>
  </Dialog>
}
