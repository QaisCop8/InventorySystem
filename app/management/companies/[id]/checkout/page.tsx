"use client"

import { use, useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowRight, CheckCircle2, Loader2, Phone, ShieldCheck, XCircle } from "lucide-react"
import { openLahzaPopup } from "@/lib/lahza-popup"

// صفحة "خيارات الدفع" لشركة بانتظار الدفع: الدفع عبر الانترنت (نافذة لحظة المنبثقة، أو صفحة لحظة إن لم يُضبط المفتاح العام)
// أو التواصل مع المبيعات / إرسال بطاقة للمبيعات.

type Checkout = {
  company: { id: number; name: string; status: string }
  counts: { users: number; branches: number; posPoints: number; restaurantLocations: number }
  quote: { currency: string; total: number; lines: { label: string; amount: number }[] }
  contacts: { phone: string; whatsapp: string }
  user: { name: string; email: string }
  online: boolean
  popup: boolean
  testMode: boolean
}

const money = (value: number) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const telHref = (value: string) => `tel:${value.replace(/[^\d+]/g, "")}`
const waHref = (value: string) => `https://wa.me/${value.replace(/\D/g, "")}`
const inputClass = "h-11 w-full rounded-lg border border-slate-400/70 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#1a6bb3] focus:ring-2 focus:ring-[#1a6bb3]/15"

export default function CompanyCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<Checkout | null>(null)
  const [loadError, setLoadError] = useState("")
  const [paying, setPaying] = useState(false)
  const [payState, setPayState] = useState<{ kind: "idle" | "verifying" | "approved" | "error"; text?: string }>({ kind: "idle" })
  const [lead, setLead] = useState({ name: "", email: "", phone: "", whatsapp: "", notes: "" })
  const [leadState, setLeadState] = useState<{ kind: "idle" | "sending" | "sent" | "error"; text?: string }>({ kind: "idle" })
  const pollCount = useRef(0)

  useEffect(() => {
    fetch(`/api/management/companies/${id}/checkout`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) { window.location.href = "/management/login"; return }
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || "تعذّر تحميل خيارات الدفع")
        setData(body)
        setLead((current) => ({ ...current, name: current.name || body.user?.name || "", email: current.email || body.user?.email || "" }))
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "تعذّر تحميل خيارات الدفع"))
  }, [id])

  const verify = useCallback(async (reference: string) => {
    setPayState({ kind: "verifying" })
    try {
      const res = await fetch("/api/management/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "تعذّر التحقق من الدفع")
      // الدفع مؤكَّد ⇒ "شركاتي" تعرض "جاري اعتماد الشركة" (أو الشركة جاهزة / فشل الاعتماد مع "اعادة المحاولة")
      if (["approved", "provisioning", "failed"].includes(body.status)) { window.location.href = "/management/companies"; return }
      if (body.status === "unpaid") setPayState({ kind: "error", text: body.message || "لم تكتمل عملية الدفع" })
    } catch (error) {
      setPayState({ kind: "error", text: error instanceof Error ? error.message : "تعذّر التحقق من الدفع" })
    }
  }, [])

  const payOnline = async () => {
    if (!data) return
    setPaying(true)
    setPayState({ kind: "idle" })
    try {
      const res = await fetch(`/api/management/companies/${id}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: data.popup ? "popup" : "redirect" }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "تعذّر بدء عملية الدفع")
      if (body.provisioned) { window.location.href = "/management/companies"; return }
      if (body.authorizationUrl) { window.location.href = body.authorizationUrl; return }
      await openLahzaPopup({
        publicKey: body.publicKey,
        email: body.email,
        firstName: body.fullName,
        amountMinor: body.amountMinor,
        currency: body.currency,
        reference: body.reference,
        metadata: { company_id: Number(id) },
        onSuccess: () => { pollCount.current = 0; void verify(body.reference) },
        onCancel: () => setPayState({ kind: "error", text: "تم إغلاق نافذة الدفع قبل إتمام العملية" }),
      })
    } catch (error) {
      setPayState({ kind: "error", text: error instanceof Error ? error.message : "تعذّر بدء عملية الدفع" })
    } finally {
      setPaying(false)
    }
  }

  const sendLead = async (event: FormEvent) => {
    event.preventDefault()
    setLeadState({ kind: "sending" })
    try {
      const res = await fetch("/api/management/sales-leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...lead, company_id: Number(id) }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "تعذّر إرسال الطلب")
      setLeadState({ kind: "sent" })
    } catch (error) {
      setLeadState({ kind: "error", text: error instanceof Error ? error.message : "تعذّر إرسال الطلب" })
    }
  }

  if (loadError) return <Centered><XCircle className="mx-auto h-10 w-10 text-rose-500" /><p className="mt-3 text-sm text-slate-600">{loadError}</p><BackLink /></Centered>
  if (!data) return <Centered><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1a6bb3]" /></Centered>

  const alreadyActive = data.company.status === "approved" || payState.kind === "approved"

  return (
    <main dir="rtl" className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4"><BackLink /></div>
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="border-b border-slate-200 pb-4 text-lg font-black">خيارات الدفع</h1>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* خيارات الدفع */}
            <div className="rounded-xl border border-slate-200 p-7 shadow-sm">
              <h2 className="border-b border-slate-200 pb-4 text-lg font-black">خيارات الدفع</h2>

              <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm">
                <div className="flex items-center justify-between gap-3"><span className="text-slate-500">الشركة</span><b>{data.company.name}</b></div>
                {data.quote.lines.filter((line) => line.amount > 0).map((line) => (
                  <div key={line.label} className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{line.label}</span><span className="tabular-nums" dir="ltr">{money(line.amount)}</span></div>
                ))}
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3"><span className="font-bold">الاشتراك السنوي</span><b className="text-lg tabular-nums text-[#1a6bb3]" dir="ltr">{money(data.quote.total)} {data.quote.currency}</b></div>
              </div>

              {alreadyActive ? (
                <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                  <p className="mt-2 font-black text-emerald-800">تم الدفع وإنشاء الشركة</p>
                  <a href="/management/companies" className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-[#1a6bb3] px-6 text-sm font-bold text-white hover:bg-[#155a96]">الذهاب إلى شركاتي</a>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => void payOnline()} disabled={!data.online || paying || payState.kind === "verifying"}
                    className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-[#1a6bb3] text-base font-black text-white shadow-sm transition hover:bg-[#155a96] disabled:cursor-not-allowed disabled:opacity-60">
                    {paying || payState.kind === "verifying" ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                    {payState.kind === "verifying" ? "جاري التحقق من الدفع…" : "الدفع عبر الانترنت"}
                  </button>
                  <p className="mt-3 text-sm text-slate-600">{data.online ? "اضغط على 'الدفع عبر الانترنت' للانتقال إلى بوابة الدفع الآمنة الخاصة بنا" : "الدفع الإلكتروني غير متاح حالياً — تواصل مع المبيعات."}</p>
                  {data.testMode && data.online && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">وضع تجريبي: البطاقة <span dir="ltr" className="font-mono">4111 1111 1111 1111</span> — <span dir="ltr" className="font-mono">03/30</span> — CVV <span dir="ltr" className="font-mono">004</span></p>}
                  {payState.kind === "error" && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{payState.text}</p>}
                </>
              )}

              <div className="my-6 flex items-center gap-3 text-sm text-slate-500"><span className="h-px flex-1 bg-slate-300" />او<span className="h-px flex-1 bg-slate-300" /></div>

              <h3 className="font-black">تواصل مع المبيعات</h3>
              <div className="mt-4 space-y-3 text-sm">
                {data.contacts.phone && <div className="flex items-center justify-between gap-3"><span className="text-slate-600">اتصل بنا على</span><a href={telHref(data.contacts.phone)} dir="ltr" className="inline-flex items-center gap-1.5 text-base font-black text-[#1a6bb3] hover:underline"><Phone className="h-4 w-4" />{data.contacts.phone}</a></div>}
                {data.contacts.whatsapp && <div className="flex items-center justify-between gap-3"><span className="text-slate-600">او عبر الواتساب</span><a href={waHref(data.contacts.whatsapp)} target="_blank" rel="noreferrer" dir="ltr" className="text-base font-black text-[#1a6bb3] hover:underline">{data.contacts.whatsapp}</a></div>}
              </div>
            </div>

            {/* ارسال بطاقة للمبيعات */}
            <form onSubmit={sendLead} className="rounded-xl border border-slate-200 p-7 shadow-sm">
              <h2 className="text-lg font-black">ارسال بطاقة للمبيعات</h2>
              {leadState.kind === "sent" ? (
                <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                  <p className="mt-2 font-black text-emerald-800">تم إرسال طلبك</p>
                  <p className="mt-1 text-sm text-emerald-700">سيتواصل معك فريق المبيعات قريباً.</p>
                </div>
              ) : (
                <>
                  <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
                    <label className="text-sm text-slate-600">الاسم<span className="text-rose-500">*</span><input required value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} className={`mt-1.5 ${inputClass}`} /></label>
                    <label className="text-sm text-slate-600">البريد الالكتروني<span className="text-rose-500">*</span><input required type="email" dir="ltr" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} className={`mt-1.5 ${inputClass}`} style={{ textAlign: "left" }} /></label>
                    <label className="text-sm text-slate-600">الهاتف<span className="text-rose-500">*</span><input required type="tel" dir="ltr" value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} className={`mt-1.5 ${inputClass}`} style={{ textAlign: "left" }} /></label>
                    <label className="text-sm text-slate-600">واتساب<span className="text-rose-500">*</span><input required type="tel" dir="ltr" value={lead.whatsapp} onChange={(e) => setLead({ ...lead, whatsapp: e.target.value })} className={`mt-1.5 ${inputClass}`} style={{ textAlign: "left" }} placeholder="+970" /></label>
                    <label className="text-sm text-slate-600 sm:col-span-2">ملاحظات<textarea rows={4} value={lead.notes} onChange={(e) => setLead({ ...lead, notes: e.target.value })} className={`mt-1.5 ${inputClass} h-auto py-2`} /></label>
                  </div>
                  {leadState.kind === "error" && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{leadState.text}</p>}
                  <button type="submit" disabled={leadState.kind === "sending"} className="mt-6 inline-flex h-11 min-w-24 items-center justify-center gap-2 rounded-lg bg-[#1a6bb3] px-6 text-sm font-black text-white hover:bg-[#155a96] disabled:opacity-60">
                    {leadState.kind === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}ارسال
                  </button>
                </>
              )}
            </form>
          </div>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />الدفع آمن عبر بوابة لحظة</p>
        </section>
      </div>
    </main>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main dir="rtl" className="grid min-h-screen place-items-center bg-slate-100 p-6"><div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">{children}</div></main>
}

function BackLink() {
  return <a href="/management/companies" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a6bb3] hover:underline"><ArrowRight className="h-4 w-4" />العودة إلى شركاتي</a>
}
