"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react"

// رابط العودة من صفحة الدفع (لحظة): ?reference=... — التحقق الفعلي يتم بالخادم لدى لحظة ثم تُنشأ قاعدة الشركة.
type Result =
  | { kind: "checking" }
  | { kind: "approved"; companyName: string }
  | { kind: "provisioning" }
  | { kind: "unpaid"; message: string }
  | { kind: "error"; message: string }

const css = `
.pc-root{position:relative;isolation:isolate;min-height:100vh;overflow:hidden;background:#050b14;color:#fff}
.pc-aurora{position:fixed;inset:0;z-index:-2;background:radial-gradient(60% 50% at 15% 10%,rgba(16,185,129,.3),transparent 70%),radial-gradient(50% 45% at 90% 20%,rgba(56,189,248,.2),transparent 70%),radial-gradient(55% 55% at 80% 95%,rgba(139,92,246,.2),transparent 70%),#050b14}
.pc-card{border-radius:28px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(160deg,rgba(13,22,36,.94),rgba(8,15,26,.96));box-shadow:0 50px 90px -35px rgba(0,0,0,.9),0 0 80px -30px rgba(16,185,129,.5)}
.pc-btn{border-radius:14px;background:linear-gradient(100deg,#10b981,#06b6d4);border-bottom:4px solid #0a6a63;box-shadow:0 18px 30px -14px rgba(16,185,129,.8);transition:transform .12s,filter .2s}
.pc-btn:hover{filter:brightness(1.08);transform:translateY(-2px)}
`

function PaymentCallback() {
  const params = useSearchParams()
  const reference = params.get("reference") || params.get("trxref") || ""
  const [result, setResult] = useState<Result>({ kind: "checking" })
  const attempts = useRef(0)

  const verify = async () => {
    setResult({ kind: "checking" })
    try {
      const response = await fetch("/api/management/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) })
      const data = await response.json().catch(() => ({}))
      if (response.status === 401) { window.location.href = "/management/login"; return }
      if (!response.ok) { setResult({ kind: "error", message: data.error || "تعذّر التحقق من الدفع" }); return }
      if (data.status === "approved") setResult({ kind: "approved", companyName: data.companyName || "" })
      else if (data.status === "provisioning" || data.status === "failed") {
        // الدفع مؤكَّد والاعتماد يجري بالخلفية ⇒ "شركاتي" تعرض "جاري اعتماد الشركة" (أو "اعادة المحاولة" عند الفشل)
        setResult({ kind: "provisioning" })
        window.setTimeout(() => { window.location.href = "/management/companies" }, 1200)
      } else setResult({ kind: "unpaid", message: data.message || "لم تكتمل عملية الدفع" })
    } catch {
      setResult({ kind: "error", message: "تعذّر الاتصال بالخادم" })
    }
  }

  useEffect(() => {
    if (!reference) { setResult({ kind: "error", message: "مرجع الدفع غير موجود في الرابط" }); return }
    void verify()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference])

  return (
    <main dir="rtl" className="pc-root grid place-items-center px-5 py-10">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="pc-aurora" aria-hidden="true" />
      <div className="pc-card w-full max-w-md p-8 text-center">
        {result.kind === "checking" || result.kind === "provisioning" ? (
          <>
            <Loader2 className="mx-auto h-14 w-14 animate-spin text-emerald-300" />
            <h1 className="mt-5 text-2xl font-black">{result.kind === "checking" ? "جاري التحقق من الدفع…" : "تم الدفع — جاري إنشاء شركتك…"}</h1>
            <p className="mt-2 text-sm leading-7 text-slate-400">{result.kind === "checking" ? "نتأكد من عملية الدفع لدى بوابة لحظة." : "يتم تجهيز قاعدة بيانات الشركة، قد يستغرق ذلك دقيقة."}</p>
          </>
        ) : result.kind === "approved" ? (
          <>
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-[0_18px_40px_-12px_rgba(16,185,129,.9)]"><CheckCircle2 className="h-10 w-10 text-white" /></span>
            <h1 className="mt-6 text-2xl font-black">تم الدفع وإنشاء الشركة 🎉</h1>
            <p className="mt-2 text-sm leading-7 text-slate-400">شركة <b className="text-white">{result.companyName}</b> جاهزة، واشتراكها ساري لمدة سنة.</p>
            <a href="/management/companies" className="pc-btn mt-7 inline-flex h-12 w-full items-center justify-center gap-2 text-sm font-black text-white">الذهاب إلى شركاتي<ArrowLeft className="h-4 w-4" /></a>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-14 w-14 text-rose-300" />
            <h1 className="mt-5 text-2xl font-black">{result.kind === "unpaid" ? "لم يكتمل الدفع" : "تعذّر التحقق"}</h1>
            <p className="mt-2 text-sm leading-7 text-slate-400">{result.message}</p>
            <div className="mt-7 grid gap-2">
              {reference && <button type="button" onClick={() => void verify()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 text-sm font-bold text-slate-200 hover:bg-white/10"><RefreshCw className="h-4 w-4" />إعادة التحقق</button>}
              <a href="/management/companies" className="pc-btn inline-flex h-12 items-center justify-center gap-2 text-sm font-black text-white">العودة إلى شركاتي<ArrowLeft className="h-4 w-4" /></a>
            </div>
          </>
        )}
        {reference && <p className="mt-6 text-[11px] text-slate-500" dir="ltr">{reference}</p>}
      </div>
    </main>
  )
}

export default function PaymentCallbackPage() {
  return <Suspense fallback={null}><PaymentCallback /></Suspense>
}
