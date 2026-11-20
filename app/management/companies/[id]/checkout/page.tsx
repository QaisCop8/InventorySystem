"use client"

import { tr, appDir } from "@/lib/i18n"
import { use, useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowRight, Building2, Check, CheckCircle2, CreditCard, Headphones, Loader2, Lock, MessageCircle, Phone, Send, ShieldCheck, Sparkles, XCircle, Zap } from "lucide-react"
import { ONLINE_COMPANY_PAYMENT_VISIBLE } from "@/lib/company-pricing"
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
const inputClass = "h-11 w-full rounded-xl border-0 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-500"

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
        if (!res.ok) throw new Error(body.error || tr("تعذّر تحميل خيارات الدفع"))
        setData(body)
        setLead((current) => ({ ...current, name: current.name || body.user?.name || "", email: current.email || body.user?.email || "" }))
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : tr("تعذّر تحميل خيارات الدفع")))
  }, [id])

  // closedText: نافذة لحظة أُغلقت (onCancel) — يُتحقق بالخادم أولاً لأن الإغلاق قد يأتي بعد دفع ناجح
  // (خصوصاً داخل WebView تطبيق أندرويد)، ولا تظهر رسالة الإلغاء إلا إن لم يُدفع فعلاً.
  const verify = useCallback(async (reference: string, closedText?: string) => {
    setPayState({ kind: "verifying" })
    try {
      const res = await fetch("/api/management/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || tr("تعذّر التحقق من الدفع"))
      // الدفع مؤكَّد ⇒ "شركاتي" تعرض "جاري اعتماد الشركة" (أو الشركة جاهزة / فشل الاعتماد مع "اعادة المحاولة")
      if (["approved", "provisioning", "failed"].includes(body.status)) { window.location.href = "/management/companies"; return }
      setPayState({ kind: "error", text: closedText || body.message || tr("لم تكتمل عملية الدفع") })
    } catch (error) {
      setPayState({ kind: "error", text: closedText || (error instanceof Error ? error.message : tr("تعذّر التحقق من الدفع")) })
    }
  }, [])

  const payOnline = async () => {
    if (!data) return
    setPaying(true)
    setPayState({ kind: "idle" })
    try {
      const res = await fetch(`/api/management/companies/${id}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: data.popup ? "popup" : "redirect" }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || tr("تعذّر بدء عملية الدفع"))
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
        onCancel: () => void verify(body.reference, "تم إغلاق نافذة الدفع قبل إتمام العملية"),
      })
    } catch (error) {
      setPayState({ kind: "error", text: error instanceof Error ? error.message : tr("تعذّر بدء عملية الدفع") })
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
      if (!res.ok) throw new Error(body.error || tr("تعذّر إرسال الطلب"))
      setLeadState({ kind: "sent" })
    } catch (error) {
      setLeadState({ kind: "error", text: error instanceof Error ? error.message : tr("تعذّر إرسال الطلب") })
    }
  }

  if (loadError) return <Centered><XCircle className="mx-auto h-10 w-10 text-rose-500" /><p className="mt-3 text-sm text-slate-600">{loadError}</p><BackLink /></Centered>
  if (!data) return <Centered><Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" /></Centered>

  const alreadyActive = data.company.status === "approved" || payState.kind === "approved"

  const busy = paying || payState.kind === "verifying"
  const lines = data.quote.lines.filter((line) => line.amount > 0)

  return (
    <main dir={appDir()} className="relative min-h-screen overflow-hidden bg-[#f4f8f7] text-slate-900">
      {/* خلفية ناعمة: توهّجات + شبكة خافتة */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 start-[-10%] h-[520px] w-[520px] rounded-full bg-emerald-300/25 blur-3xl" />
        <div className="absolute bottom-[-20%] end-[-10%] h-[480px] w-[480px] rounded-full bg-teal-200/30 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(15,118,110,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(15,118,110,.05)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,#000_30%,transparent_80%)]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:py-10">
        <div className="flex items-center justify-between gap-3">
          <BackLink />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 backdrop-blur"><Lock className="h-3.5 w-3.5" />{tr("اتصال آمن ومشفّر")}</span>
        </div>

        <header className="mt-6 sm:mt-8">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-bold text-emerald-700"><Sparkles className="h-3.5 w-3.5" />{tr("خطوة أخيرة")}</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{tr("أكمل اشتراكك في ")}<span className="bg-gradient-to-l from-emerald-600 to-teal-500 bg-clip-text text-transparent">Noon ERP</span></h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{ONLINE_COMPANY_PAYMENT_VISIBLE ? tr("ادفع الآن عبر الإنترنت وتُفعَّل شركتك فوراً، أو تحدّث مع فريق المبيعات ونساعدك في اختيار ما يناسبك.") : tr("أرسل طلبك لفريق المبيعات وسنتواصل معك لإتمام الاشتراك، وتُفعَّل شركتك لسنة كاملة فور اعتمادها.")}</p>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          {/* ملخص الاشتراك والدفع */}
          <section className="overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-30px_rgba(15,80,70,.35)] ring-1 ring-slate-900/5">
            <div className="relative bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-500 p-6 text-white sm:p-7">
              <div aria-hidden className="absolute -end-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
              <div className="relative flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25"><Building2 className="h-6 w-6" /></span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-emerald-50/80">{tr("الشركة")}</p>
                  <p className="truncate text-lg font-black">{data.company.name}</p>
                </div>
              </div>
              <div className="relative mt-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-emerald-50/80">{tr("الاشتراك السنوي")}</p>
                  <p className="mt-1 text-4xl font-black tabular-nums" dir="ltr">{money(data.quote.total)} <span className="text-lg font-bold text-emerald-50/90">{data.quote.currency}</span></p>
                </div>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/25">{tr("يُجدَّد سنوياً")}</span>
              </div>
            </div>

            <div className="p-6 sm:p-7">
              {lines.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-2xl bg-slate-50/80 px-4 ring-1 ring-slate-100">
                  {lines.map((line) => (
                    <li key={line.label} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <span className="flex items-center gap-2 text-slate-600"><Check className="h-4 w-4 shrink-0 text-emerald-600" />{line.label}</span>
                      <span className="font-bold tabular-nums text-slate-800" dir="ltr">{money(line.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {alreadyActive ? (
                <div className="mt-6 rounded-2xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-100">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                  <p className="mt-3 text-lg font-black text-emerald-800">{tr("تم الدفع وإنشاء الشركة")}</p>
                  <a href="/management/companies" className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-6 text-sm font-bold text-white transition hover:bg-emerald-700">{tr("الذهاب إلى شركاتي")}</a>
                </div>
              ) : ONLINE_COMPANY_PAYMENT_VISIBLE ? (
                <>
                  <button type="button" onClick={() => void payOnline()} disabled={!data.online || busy}
                    className="group mt-6 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-500 text-base font-black text-white shadow-lg shadow-emerald-600/25 transition hover:shadow-xl hover:shadow-emerald-600/30 hover:brightness-105 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none">
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
                    {payState.kind === "verifying" ? tr("جاري التحقق من الدفع…") : tr("ادفع {0} {1} الآن", money(data.quote.total), data.quote.currency)}
                  </button>
                  <p className="mt-3 text-center text-xs leading-6 text-slate-500">{data.online ? tr("ستنتقل إلى بوابة الدفع الآمنة لإدخال بيانات البطاقة — لا نحتفظ ببيانات بطاقتك") : tr("الدفع الإلكتروني غير متاح حالياً — تواصل مع المبيعات.")}</p>
                  {data.testMode && data.online && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 ring-1 ring-amber-100">{tr("وضع تجريبي: البطاقة ")}<span dir="ltr" className="font-mono">4111 1111 1111 1111</span> — <span dir="ltr" className="font-mono">03/30</span> — CVV <span dir="ltr" className="font-mono">004</span></p>}
                  {payState.kind === "error" && <p className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-100"><XCircle className="h-4 w-4 shrink-0" />{payState.text}</p>}
                </>
              ) : (
                <p className="mt-6 rounded-2xl bg-emerald-50/70 p-4 text-center text-sm leading-7 text-emerald-800 ring-1 ring-emerald-100">{tr("لإتمام الاشتراك أرسل طلبك لفريق المبيعات من النموذج المجاور، وسنتواصل معك لترتيب الدفع وتفعيل الشركة.")}</p>
              )}

              {ONLINE_COMPANY_PAYMENT_VISIBLE && <div className="mt-6 grid grid-cols-3 gap-2 border-t border-slate-100 pt-5 text-center text-[11px] font-semibold text-slate-500">
                <span className="flex flex-col items-center gap-1.5"><ShieldCheck className="h-5 w-5 text-emerald-600" />{tr("دفع آمن عبر لحظة")}</span>
                <span className="flex flex-col items-center gap-1.5"><Zap className="h-5 w-5 text-emerald-600" />{tr("تفعيل فوري")}</span>
                <span className="flex flex-col items-center gap-1.5"><CreditCard className="h-5 w-5 text-emerald-600" />Visa · Mastercard</span>
              </div>}
            </div>
          </section>

          {/* التواصل مع المبيعات */}
          <div className="flex flex-col gap-6">
            <section className="rounded-3xl bg-white p-6 shadow-[0_24px_60px_-34px_rgba(15,80,70,.3)] ring-1 ring-slate-900/5 sm:p-7">
              <h2 className="flex items-center gap-2 text-lg font-black"><Headphones className="h-5 w-5 text-emerald-600" />{tr("تحدّث مع المبيعات")}</h2>
              <p className="mt-1 text-sm text-slate-500">{tr("فريقنا جاهز للإجابة عن أسئلتك ومساعدتك في الاشتراك.")}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {data.contacts.phone && (
                  <a href={telHref(data.contacts.phone)} className="group flex items-center gap-3 rounded-2xl p-4 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:bg-emerald-50/60 hover:ring-emerald-200">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/25"><Phone className="h-5 w-5" /></span>
                    <span className="min-w-0"><span className="block text-xs text-slate-500">{tr("اتصل بنا")}</span><span className="block truncate text-base font-black text-slate-900" dir="ltr">{data.contacts.phone}</span></span>
                  </a>
                )}
                {data.contacts.whatsapp && (
                  <a href={waHref(data.contacts.whatsapp)} target="_blank" rel="noreferrer" className="group flex items-center gap-3 rounded-2xl p-4 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:bg-green-50/70 hover:ring-green-200">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#25D366] text-white shadow-md shadow-green-600/25"><MessageCircle className="h-5 w-5" /></span>
                    <span className="min-w-0"><span className="block text-xs text-slate-500">{tr("راسلنا على واتساب")}</span><span className="block truncate text-base font-black text-slate-900" dir="ltr">{data.contacts.whatsapp}</span></span>
                  </a>
                )}
              </div>
            </section>

            <form onSubmit={sendLead} className="rounded-3xl bg-white p-6 shadow-[0_24px_60px_-34px_rgba(15,80,70,.3)] ring-1 ring-slate-900/5 sm:p-7">
              <h2 className="flex items-center gap-2 text-lg font-black"><Send className="h-5 w-5 text-emerald-600" />{tr("اطلب اتصالاً من المبيعات")}</h2>
              <p className="mt-1 text-sm text-slate-500">{tr("اترك بياناتك وسنتواصل معك في أقرب وقت.")}</p>
              {leadState.kind === "sent" ? (
                <div className="mt-5 rounded-2xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-100">
                  <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" />
                  <p className="mt-2 font-black text-emerald-800">{tr("تم إرسال طلبك")}</p>
                  <p className="mt-1 text-sm text-emerald-700">{tr("سيتواصل معك فريق المبيعات قريباً، وتُفعَّل الشركة لسنة كاملة فور اعتمادها من الإدارة.")}</p>
                </div>
              ) : (
                <>
                  <div className="mt-5 grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
                    <Field label={tr("الاسم")} required><input required value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} className={inputClass} /></Field>
                    <Field label={tr("البريد الإلكتروني")} required><input required type="email" dir="ltr" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} className={`${inputClass} text-end`} /></Field>
                    <Field label={tr("الهاتف")} required><input required type="tel" dir="ltr" value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} className={`${inputClass} text-end`} placeholder="05xxxxxxxx" /></Field>
                    <Field label={tr("واتساب")} required><input required type="tel" dir="ltr" value={lead.whatsapp} onChange={(e) => setLead({ ...lead, whatsapp: e.target.value })} className={`${inputClass} text-end`} placeholder="+970" /></Field>
                    <Field label={tr("ملاحظات")} className="sm:col-span-2"><textarea rows={3} value={lead.notes} onChange={(e) => setLead({ ...lead, notes: e.target.value })} className={`${inputClass} h-auto resize-none py-2.5`} placeholder={tr("عدد المستخدمين، الفروع، أو أي استفسار…")} /></Field>
                  </div>
                  {leadState.kind === "error" && <p className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-100"><XCircle className="h-4 w-4 shrink-0" />{leadState.text}</p>}
                  <button type="submit" disabled={leadState.kind === "sending"} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60">
                    {leadState.kind === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{tr("إرسال الطلب")}
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </main>
  )
}

function Field({ label, required, className = "", children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={`block text-xs font-bold text-slate-600 ${className}`}><span className="mb-1.5 block">{label}{required && <span className="text-rose-500"> *</span>}</span>{children}</label>
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main dir={appDir()} className="grid min-h-screen place-items-center bg-[#f4f8f7] p-6"><div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-[0_24px_60px_-30px_rgba(15,80,70,.35)] ring-1 ring-slate-900/5">{children}</div></main>
}

function BackLink() {
  return <a href="/management/companies" className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 backdrop-blur transition hover:text-emerald-700 hover:ring-emerald-200"><ArrowRight className="h-4 w-4" />{tr("العودة إلى شركاتي")}</a>
}
