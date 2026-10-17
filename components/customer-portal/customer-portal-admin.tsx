"use client"

import { confirmYesNo } from "@/components/ui/confirm-host"
import { useCallback, useEffect, useState } from "react"
import { BadgeCheck, Check, Clock3, Copy, ExternalLink, FileImage, Globe, Link2, Loader2, MessageCircle, RefreshCw, Trash2, X, XCircle } from "lucide-react"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { useAuth } from "@/components/auth/auth-context"

// إدارة بوابة العملاء: (1) مراجعة إشعارات التحويل المرفوعة وقبولها (ينشئ سند قبض) أو رفضها،
// (2) إنشاء رابط بوابة خاص لكل عميل ومشاركته (نسخ/واتساب) أو إلغاؤه.
type PortalPayment = {
  id: number; account_id: number; account_code: string; account_name: string; amount: string | number; currency_code: string | null
  transfer_date: string; reference: string | null; payer_name: string | null; bank_name: string | null; note: string | null
  status: "pending" | "approved" | "rejected"; created_at: string; reviewed_by: string | null; review_note: string | null
  receipt_code: string | null; has_proof: boolean; proof_mime: string | null
}
type PortalLinkRow = { id: number; account_id: number; account_code: string; account_name: string; created_by: string | null; created_at: string; last_access_at: string | null; access_count: number; mobile: string | null; pending: string | number }

const money = (value: number | string) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateTime = (value: string | null) => (value ? new Date(value).toLocaleString("en-GB", { hour12: false }).slice(0, 17) : "—")
const STATUS_TABS = [
  { key: "pending", label: "بانتظار المراجعة" },
  { key: "approved", label: "مقبولة" },
  { key: "rejected", label: "مرفوضة" },
  { key: "all", label: "الكل" },
] as const

function whatsappLink(mobile: string | null, url: string, name: string) {
  const text = `مرحباً ${name}،\nهذا رابط كشف حسابك لدينا، ويمكنك من خلاله إرسال إشعار التحويل عند السداد:\n${url}`
  const digits = String(mobile || "").replace(/\D/g, "")
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export function CustomerPortalAdmin() {
  const { activeBranchId } = useAuth()
  const [tab, setTab] = useState<"payments" | "links">("payments")
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]["key"]>("pending")
  const [payments, setPayments] = useState<PortalPayment[]>([])
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [links, setLinks] = useState<PortalLinkRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [customer, setCustomer] = useState<{ id: number; name: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ url: string; name: string; mobile: string | null } | null>(null)

  const [review, setReview] = useState<{ payment: PortalPayment; mode: "approve" | "reject" } | null>(null)
  const [reviewForm, setReviewForm] = useState({ cash_account_id: "", branch_id: "", vch_date: "", post: true, note: "" })
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState("")

  const loadPayments = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/customer-portal/payments?status=${status}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "تعذر تحميل الدفعات")
      setPayments(body.payments || [])
      setBranches(body.branches || [])
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "تعذر تحميل الدفعات" })
    } finally {
      setLoading(false)
    }
  }, [status])

  const loadLinks = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/customer-portal/links", { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "تعذر تحميل الروابط")
      setLinks(body.links || [])
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "تعذر تحميل الروابط" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (tab === "payments") void loadPayments(); else void loadLinks() }, [tab, loadPayments, loadLinks])

  const createLink = async (accountId: number, name: string, mobile: string | null = null) => {
    setCreating(true)
    setMessage(null)
    try {
      const response = await fetch("/api/customer-portal/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: accountId }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "تعذر إنشاء الرابط")
      const url = `${window.location.origin}${body.path}`
      setCreated({ url, name: body.account_name || name, mobile })
      try { await navigator.clipboard.writeText(url) } catch { /* clipboard blocked */ }
      void loadLinks()
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "تعذر إنشاء الرابط" })
    } finally {
      setCreating(false)
    }
  }

  const revokeLink = async (row: PortalLinkRow) => {
    if (!(await confirmYesNo(`إلغاء رابط البوابة للعميل ${row.account_name}؟ لن يعمل الرابط المرسل بعد الآن.`))) return
    const response = await fetch(`/api/customer-portal/links?id=${row.id}`, { method: "DELETE" })
    if (!response.ok) setMessage({ type: "error", text: "تعذر إلغاء الرابط" })
    void loadLinks()
  }

  const openReview = (payment: PortalPayment, mode: "approve" | "reject") => {
    setReview({ payment, mode })
    setReviewError("")
    setReviewForm({ cash_account_id: "", branch_id: String(activeBranchId || branches[0]?.id || ""), vch_date: payment.transfer_date, post: true, note: "" })
  }

  const submitReview = async () => {
    if (!review) return
    setReviewBusy(true)
    setReviewError("")
    try {
      const payload = review.mode === "approve"
        ? { action: "approve", cash_account_id: Number(reviewForm.cash_account_id), branch_id: Number(reviewForm.branch_id), vch_date: reviewForm.vch_date, post: reviewForm.post, note: reviewForm.note }
        : { action: "reject", note: reviewForm.note }
      const response = await fetch(`/api/customer-portal/payments/${review.payment.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "تعذرت المراجعة")
      setMessage({ type: "success", text: review.mode === "approve" ? `تم قبول الدفعة وإنشاء سند القبض ${body.receipt_code || ""}` : "تم رفض الدفعة وإبلاغ العميل بالسبب في البوابة" })
      setReview(null)
      void loadPayments()
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "تعذرت المراجعة")
    } finally {
      setReviewBusy(false)
    }
  }

  return (
    <div dir="rtl" className="mx-auto w-full max-w-7xl space-y-4 p-1 md:p-2">
      <div className="flex flex-col gap-3 rounded-3xl bg-gradient-to-l from-emerald-700 to-teal-600 p-5 text-white shadow-lg md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20"><Globe className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-black">بوابة العملاء</h1>
            <p className="text-sm text-white/85">رابط خاص لكل عميل يعرض كشف حسابه ويرسل منه إشعار التحويل — القبول ينشئ سند قبض تلقائياً</p>
          </div>
        </div>
        <div className="flex rounded-2xl bg-white/15 p-1">
          {([["payments", "الدفعات الواردة"], ["links", "روابط العملاء"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === key ? "bg-white text-emerald-800" : "text-white hover:bg-white/10"}`}>{label}</button>
          ))}
        </div>
      </div>

      {message && <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}><span>{message.text}</span><button type="button" onClick={() => setMessage(null)}><X className="h-4 w-4" /></button></div>}

      {tab === "payments" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">{STATUS_TABS.map((item) => <button key={item.key} type="button" onClick={() => setStatus(item.key)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${status === item.key ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>{item.label}</button>)}</div>
            <button type="button" onClick={() => void loadPayments()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />تحديث</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b text-xs text-slate-500"><th className="py-2 text-right">العميل</th><th className="py-2 text-left">المبلغ</th><th className="py-2 text-right">تاريخ التحويل</th><th className="py-2 text-right">المرجع / البنك</th><th className="py-2 text-right">الإشعار</th><th className="py-2 text-right">الحالة</th><th className="py-2 text-right">إجراء</th></tr></thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-slate-100 align-top dark:border-slate-800">
                    <td className="py-2"><b>{payment.account_name}</b><div className="text-xs text-slate-400">{payment.account_code} · أُرسلت {dateTime(payment.created_at)}</div>{payment.note && <div className="mt-1 max-w-xs text-xs text-slate-500">{payment.note}</div>}</td>
                    <td className="py-2 text-left font-black tabular-nums" dir="ltr">{money(payment.amount)} {payment.currency_code}</td>
                    <td className="py-2 tabular-nums" dir="ltr" style={{ textAlign: "right" }}>{payment.transfer_date}</td>
                    <td className="py-2 text-xs"><div dir="ltr" style={{ textAlign: "right" }}>{payment.reference || "—"}</div><div className="text-slate-500">{[payment.bank_name, payment.payer_name].filter(Boolean).join(" · ")}</div></td>
                    <td className="py-2">{payment.has_proof ? <a href={`/api/customer-portal/payments/${payment.id}/proof`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700 hover:bg-sky-100"><FileImage className="h-3.5 w-3.5" />عرض</a> : "—"}</td>
                    <td className="py-2 text-xs">
                      {payment.status === "pending" ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-700"><Clock3 className="h-3 w-3" />بانتظار المراجعة</span>
                        : payment.status === "approved" ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700"><BadgeCheck className="h-3 w-3" />سند {payment.receipt_code || ""}</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-700"><XCircle className="h-3 w-3" />مرفوضة</span>}
                      {payment.reviewed_by && <div className="mt-1 text-slate-400">{payment.reviewed_by}{payment.review_note ? ` — ${payment.review_note}` : ""}</div>}
                    </td>
                    <td className="py-2">{payment.status === "pending" && <div className="flex gap-1">
                      <button type="button" onClick={() => openReview(payment, "approve")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"><Check className="h-3.5 w-3.5" />قبول</button>
                      <button type="button" onClick={() => openReview(payment, "reject")} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"><X className="h-3.5 w-3.5" />رفض</button>
                    </div>}</td>
                  </tr>
                ))}
                {!payments.length && <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-400">{loading ? "جاري التحميل..." : "لا توجد دفعات"}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 font-black"><Link2 className="h-4 w-4 text-emerald-600" />رابط جديد لعميل</h2>
            <AutoCompleteAccount label="العميل" value={customer ? String(customer.id) : ""} valueMode="id" onValueChange={() => undefined}
              onAccountSelect={(account) => setCustomer(account ? { id: Number(account.id), name: String((account as any).name || "") } : null)}
              requiredTypeValues={[2, 3, 5]} searchAllowedTypeValues={[2, 3, 5]} showCostCenterButton={false} placeholder="ابحث عن العميل" />
            <button type="button" disabled={!customer || creating} onClick={() => customer && void createLink(customer.id, customer.name)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}إنشاء الرابط</button>
            <p className="text-xs leading-6 text-slate-500">الرابط يُعرض مرة واحدة فقط ويُنسخ تلقائياً. إنشاء رابط جديد لنفس العميل يُلغي رابطه السابق.</p>
            {created && (
              <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-900 dark:bg-emerald-950/40">
                <b className="block text-emerald-800 dark:text-emerald-200">رابط {created.name} (نُسخ):</b>
                <input readOnly value={created.url} dir="ltr" onFocus={(event) => event.currentTarget.select()} className="h-9 w-full rounded-lg border bg-white px-2 font-mono text-[11px] dark:bg-slate-900" />
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => void navigator.clipboard.writeText(created.url)} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 font-bold text-slate-700 ring-1 ring-slate-200"><Copy className="h-3.5 w-3.5" />نسخ</button>
                  <a href={whatsappLink(created.mobile, created.url, created.name)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 font-bold text-white"><MessageCircle className="h-3.5 w-3.5" />واتساب</a>
                  <a href={created.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 font-bold text-slate-700 ring-1 ring-slate-200"><ExternalLink className="h-3.5 w-3.5" />فتح</a>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-black">الروابط الفعّالة ({links.length})</h2><button type="button" onClick={() => void loadLinks()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />تحديث</button></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b text-xs text-slate-500"><th className="py-2 text-right">العميل</th><th className="py-2 text-right">أُنشئ</th><th className="py-2 text-right">آخر فتح</th><th className="py-2 text-right">دفعات معلقة</th><th className="py-2 text-right">إجراء</th></tr></thead>
                <tbody>
                  {links.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2"><b>{row.account_name}</b><div className="text-xs text-slate-400">{row.account_code}{row.mobile ? ` · ${row.mobile}` : ""}</div></td>
                      <td className="py-2 text-xs">{dateTime(row.created_at)}<div className="text-slate-400">{row.created_by}</div></td>
                      <td className="py-2 text-xs">{dateTime(row.last_access_at)}{row.access_count ? <span className="text-slate-400"> · {row.access_count} مرة</span> : null}</td>
                      <td className="py-2 text-xs">{Number(row.pending) ? <b className="text-amber-700">{row.pending}</b> : "—"}</td>
                      <td className="py-2"><div className="flex gap-1">
                        <button type="button" title="رابط جديد (يلغي الحالي)" onClick={() => void createLink(row.account_id, row.account_name, row.mobile)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"><RefreshCw className="h-3.5 w-3.5" />رابط جديد</button>
                        <button type="button" onClick={() => void revokeLink(row)} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"><Trash2 className="h-3.5 w-3.5" />إلغاء</button>
                      </div></td>
                    </tr>
                  ))}
                  {!links.length && <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-400">{loading ? "جاري التحميل..." : "لا توجد روابط فعّالة"}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {review && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/50 p-4" dir="rtl" onMouseDown={(event) => { if (event.target === event.currentTarget && !reviewBusy) setReview(null) }}>
          <div role="dialog" aria-modal="true" className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <h2 className="text-lg font-black">{review.mode === "approve" ? "قبول الدفعة وإنشاء سند قبض" : "رفض الدفعة"}</h2>
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">{review.payment.account_name} — <b dir="ltr">{money(review.payment.amount)} {review.payment.currency_code}</b> · تحويل <span dir="ltr">{review.payment.transfer_date}</span>{review.payment.reference ? ` · مرجع ${review.payment.reference}` : ""}</p>
            {review.mode === "approve" ? (
              <>
                <AutoCompleteAccount label="حساب البنك / الصندوق الذي وصل إليه المبلغ *" value={reviewForm.cash_account_id} valueMode="id" onValueChange={(value) => setReviewForm((form) => ({ ...form, cash_account_id: value }))}
                  onAccountSelect={(account) => setReviewForm((form) => ({ ...form, cash_account_id: account ? String(account.id) : "" }))} showCostCenterButton={false} placeholder="ابحث عن حساب البنك" />
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-slate-600">الفرع *<select value={reviewForm.branch_id} onChange={(event) => setReviewForm({ ...reviewForm, branch_id: event.target.value })} className="mt-1 block h-10 w-full rounded-xl border bg-white px-2 text-sm dark:bg-slate-900"><option value="">اختر الفرع</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
                  <label className="text-xs font-semibold text-slate-600">تاريخ السند<input type="date" value={reviewForm.vch_date} onChange={(event) => setReviewForm({ ...reviewForm, vch_date: event.target.value })} className="mt-1 block h-10 w-full rounded-xl border px-2 text-sm dark:bg-slate-900" /></label>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={reviewForm.post} onChange={(event) => setReviewForm({ ...reviewForm, post: event.target.checked })} className="h-4 w-4 accent-emerald-600" />ترحيل السند مباشرة (يظهر في كشف حساب العميل فوراً)</label>
              </>
            ) : null}
            <label className="block text-xs font-semibold text-slate-600">{review.mode === "approve" ? "ملاحظة (اختياري)" : "سبب الرفض * — يظهر للعميل"}<textarea rows={2} value={reviewForm.note} onChange={(event) => setReviewForm({ ...reviewForm, note: event.target.value })} className="mt-1 block w-full rounded-xl border px-3 py-2 text-sm dark:bg-slate-900" /></label>
            {reviewError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{reviewError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={reviewBusy} onClick={() => setReview(null)} className="h-10 rounded-xl border px-4 text-sm font-bold">إلغاء</button>
              <button type="button" disabled={reviewBusy || (review.mode === "approve" ? !reviewForm.cash_account_id || !reviewForm.branch_id : !reviewForm.note.trim())} onClick={() => void submitReview()}
                className={`inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-bold text-white disabled:opacity-50 ${review.mode === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
                {reviewBusy && <Loader2 className="h-4 w-4 animate-spin" />}{review.mode === "approve" ? "قبول وإنشاء السند" : "رفض الدفعة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CustomerPortalAdmin
