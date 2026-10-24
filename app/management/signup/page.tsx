"use client"

import { useRef, useState, type CSSProperties } from "react"
import Link from "next/link"
import { AlertCircle, ArrowLeft, Building2, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles, UserPlus, UserRound, Zap } from "lucide-react"
import { NoonLogo } from "@/components/brand/noon-logo"
import { PoweredBy } from "@/components/brand/powered-by"

// The app sets `[dir="rtl"] input { direction: rtl }` globally; inline direction wins so Latin email/password
// typing keeps the caret after the last character (same fix as components/auth/management-login.tsx).
const ltrStyle: CSSProperties = { direction: "ltr", unicodeBidi: "plaintext", textAlign: "left" }

// نفس هوية شاشة الدخول (management-login.tsx): شفق متحرك، نقاط، بطاقة زجاجية بحدّ متدرّج دوّار، ميل خفيف مع الماوس.
const css = `
@property --su-angle{syntax:"<angle>";inherits:false;initial-value:0deg}
.su-root{--mx:0;--my:0;position:relative;isolation:isolate;overflow:hidden;background:#050b14;color:#fff}
.su-aurora{position:absolute;inset:0;z-index:-2;background:
  radial-gradient(60% 50% at 85% 10%,rgba(16,185,129,.35),transparent 70%),
  radial-gradient(50% 45% at 10% 20%,rgba(56,189,248,.22),transparent 70%),
  radial-gradient(55% 55% at 20% 95%,rgba(139,92,246,.22),transparent 70%),
  radial-gradient(45% 45% at 90% 90%,rgba(20,184,166,.25),transparent 70%),#050b14}
.su-blob{position:absolute;border-radius:9999px;filter:blur(70px);z-index:-1;opacity:.55;animation:su-drift 16s ease-in-out infinite}
@keyframes su-drift{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-40px,-50px,0) scale(1.12)}}
.su-dots{position:absolute;inset:0;z-index:-1;opacity:.5;background-image:radial-gradient(rgba(255,255,255,.14) 1px,transparent 1.2px);background-size:26px 26px;
  mask-image:radial-gradient(70% 70% at 50% 45%,#000,transparent);-webkit-mask-image:radial-gradient(70% 70% at 50% 45%,#000,transparent)}
.su-wrap{perspective:1400px;width:100%;max-width:480px}
.su-card{position:relative;border-radius:30px;padding:2px;transform-style:preserve-3d;
  transform:rotateX(calc(var(--my)*-4deg)) rotateY(calc(var(--mx)*5deg));transition:transform .2s ease-out;
  background:conic-gradient(from var(--su-angle),rgba(16,185,129,0),#10b981,#38bdf8,#a78bfa,rgba(16,185,129,0) 60%);animation:su-spin 7s linear infinite;
  box-shadow:0 50px 90px -35px rgba(0,0,0,.9),0 0 80px -30px rgba(16,185,129,.55)}
@keyframes su-spin{to{--su-angle:360deg}}
.su-card-in{border-radius:28px;background:linear-gradient(160deg,rgba(13,22,36,.92),rgba(8,15,26,.94));backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);box-shadow:0 1px 0 rgba(255,255,255,.1) inset}
.su-field{height:3.1rem;width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);font-size:15px;color:#fff;outline:none;
  box-shadow:inset 0 2px 6px rgba(0,0,0,.35);transition:border-color .2s,background .2s,box-shadow .2s}
.su-field::placeholder{color:rgba(148,163,184,.6)}
.su-field:focus{border-color:#34d399;background:rgba(16,185,129,.08);box-shadow:inset 0 2px 6px rgba(0,0,0,.35),0 0 0 4px rgba(16,185,129,.18),0 0 24px rgba(16,185,129,.25)}
.su-field:-webkit-autofill{-webkit-text-fill-color:#fff;box-shadow:0 0 0 40px #0d1a29 inset}
.su-btn{position:relative;overflow:hidden;border-radius:14px;background:linear-gradient(100deg,#10b981,#06b6d4);border-bottom:4px solid #0a6a63;
  box-shadow:0 18px 30px -14px rgba(16,185,129,.8);transition:transform .12s,border-bottom-width .12s,box-shadow .2s,filter .2s}
.su-btn::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.45) 50%,transparent 65%);transform:translateX(-120%);transition:transform .7s}
.su-btn:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-2px)}
.su-btn:hover:not(:disabled)::after{transform:translateX(120%)}
.su-btn:active:not(:disabled){transform:translateY(3px);border-bottom-width:1px}
@keyframes su-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.su-rise{animation:su-rise .7s cubic-bezier(.2,.8,.2,1) both}
@keyframes su-pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
.su-pop{animation:su-pop .55s cubic-bezier(.2,.8,.2,1) both}
@media (prefers-reduced-motion:reduce){.su-root *{animation:none!important;transition:none!important}}
@media (max-width:1023px){.su-card{transform:none}}
`

function Wordmark() {
  return <NoonLogo tone="dark" size="lg" />
}

// قوة كلمة المرور (للعرض فقط — الحد الأدنى المفروض يبقى 6 أحرف كما في الخادم)
function passwordStrength(password: string) {
  if (!password) return { score: 0, label: "", color: "" }
  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 10) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  const level = Math.min(4, Math.max(1, score))
  return [
    { score: 1, label: "ضعيفة", color: "bg-rose-400" },
    { score: 2, label: "مقبولة", color: "bg-amber-300" },
    { score: 3, label: "جيدة", color: "bg-cyan-300" },
    { score: 4, label: "قوية", color: "bg-emerald-400" },
  ][level - 1]
}

export default function ManagementSignupPage() {
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirmPassword: "" })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLElement | null>(null)

  const strength = passwordStrength(form.password)
  const confirmMismatch = form.confirmPassword.length > 0 && form.confirmPassword !== form.password

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const root = rootRef.current
    if (!root) return
    root.style.setProperty("--mx", String((event.clientX / window.innerWidth - 0.5) * 2))
    root.style.setProperty("--my", String((event.clientY / window.innerHeight - 0.5) * 2))
  }
  const onPointerLeave = () => {
    rootRef.current?.style.setProperty("--mx", "0")
    rootRef.current?.style.setProperty("--my", "0")
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    if (form.password !== form.confirmPassword) {
      setError("كلمة المرور وتأكيد كلمة المرور غير متطابقتين")
      return
    }
    if (form.password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/management/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: form.fullName, email: form.email, password: form.password }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || "حدث خطأ أثناء إنشاء الحساب")
        return
      }
      setSuccess(true)
    } catch {
      setError("تعذّر الاتصال بالخادم")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main ref={rootRef} dir="rtl" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className="su-root grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="su-aurora" aria-hidden="true" />
      <div className="su-dots" aria-hidden="true" />
      <div className="su-blob -left-24 top-0 h-80 w-80 bg-emerald-500/40" aria-hidden="true" />
      <div className="su-blob -right-24 bottom-0 h-96 w-96 bg-violet-500/30 [animation-delay:-6s]" aria-hidden="true" />

      <section className="relative flex min-h-screen flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="mb-8 lg:hidden"><Wordmark /></div>
        <div className="su-wrap su-rise [animation-delay:.15s]">
          <div className="su-card">
            <div className="su-card-in p-7 sm:p-9">
              {success ? (
                <div className="py-4 text-center">
                  <span className="su-pop mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-[0_18px_40px_-12px_rgba(16,185,129,.9)] ring-1 ring-white/30">
                    <CheckCircle2 className="h-10 w-10 text-white" />
                  </span>
                  <h2 className="mt-6 text-[1.75rem] font-black">تم إنشاء الحساب بنجاح! 🎉</h2>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-slate-400">يمكنك الآن تسجيل الدخول إلى بوابة الإدارة وإضافة شركتك الأولى.</p>
                  <Link href="/management/login" className="su-btn group mt-7 inline-flex h-12 w-full items-center justify-center gap-2 text-sm font-black text-white">
                    الذهاب لتسجيل الدخول<ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mb-7">
                    <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-300 ring-1 ring-emerald-300/20"><UserPlus className="h-3.5 w-3.5" />حساب إدارة جديد</span>
                    <h1 className="text-[1.75rem] font-black leading-tight">أنشئ حسابك ✨</h1>
                    <p className="mt-1.5 text-sm text-slate-400">دقيقة واحدة وتبدأ بإدارة شركاتك من بوابة واحدة</p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                      <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-3 text-sm font-medium text-rose-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
                      </div>
                    )}

                    <div className="space-y-2">
                      <label htmlFor="signup-name" className="text-sm font-bold text-slate-200">الاسم الكامل</label>
                      <div className="relative">
                        <UserRound className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                        <input id="signup-name" autoComplete="name" autoFocus required placeholder="أدخل الاسم الكامل" className="su-field pl-4 pr-11 text-right"
                          value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="signup-email" className="text-sm font-bold text-slate-200">البريد الإلكتروني</label>
                      <div className="relative" dir="ltr">
                        <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                        <input id="signup-email" type="email" inputMode="email" autoComplete="email" required dir="ltr" style={ltrStyle} spellCheck={false} autoCapitalize="none"
                          placeholder="name@company.com" className="su-field pl-11 pr-4" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="signup-password" className="text-sm font-bold text-slate-200">كلمة المرور</label>
                        <div className="relative" dir="ltr">
                          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                          <input id="signup-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required dir="ltr" style={ltrStyle}
                            placeholder="6 أحرف على الأقل" className="su-field pl-11 pr-12" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
                          <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                            className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white">
                            {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="signup-confirm-password" className="text-sm font-bold text-slate-200">تأكيد كلمة المرور</label>
                        <div className="relative" dir="ltr">
                          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                          <input id="signup-confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required dir="ltr" style={ltrStyle}
                            placeholder="أعد كتابتها" className={`su-field pl-11 pr-4 ${confirmMismatch ? "!border-rose-400/70" : ""}`}
                            value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
                        </div>
                      </div>
                    </div>

                    {(form.password || form.confirmPassword) && (
                      <div className="space-y-2">
                        {form.password && (
                          <div className="flex items-center gap-3">
                            <div className="grid flex-1 grid-cols-4 gap-1.5" dir="ltr">
                              {[1, 2, 3, 4].map((step) => <span key={step} className={`h-1.5 rounded-full transition-colors ${step <= strength.score ? strength.color : "bg-white/10"}`} />)}
                            </div>
                            <span className="w-14 text-left text-xs font-bold text-slate-300">{strength.label}</span>
                          </div>
                        )}
                        {form.confirmPassword && (
                          <p className={`flex items-center gap-1.5 text-xs font-semibold ${confirmMismatch ? "text-rose-300" : "text-emerald-300"}`}>
                            {confirmMismatch ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {confirmMismatch ? "كلمتا المرور غير متطابقتين" : "كلمتا المرور متطابقتان"}
                          </p>
                        )}
                      </div>
                    )}

                    <button type="submit" disabled={loading} className="su-btn group flex h-12 w-full items-center justify-center gap-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-70">
                      {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />جاري إنشاء الحساب…</> : <>إنشاء الحساب<ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /></>}
                    </button>
                  </form>
                </>
              )}

              <div className="mt-6 border-t border-white/10 pt-5 text-center text-sm text-slate-400">
                لديك حساب بالفعل؟ <Link href="/management/login" className="font-semibold text-emerald-300 transition-colors hover:text-emerald-200">تسجيل الدخول</Link>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />اتصال مشفّر · <span dir="ltr">Noon ERP</span></p>
        <PoweredBy tone="dark" className="mt-2" />
      </section>

      <aside className="relative hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="su-rise flex justify-end"><Wordmark /></div>

        <div className="su-rise max-w-xl [animation-delay:.1s]">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-emerald-200 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />ابدأ مجاناً
          </p>
          <h2 className="text-4xl font-black leading-[1.3] xl:text-[3.25rem]">
            ابدأ إدارة شركتك<br />
            <span className="bg-gradient-to-l from-emerald-300 via-cyan-300 to-violet-300 bg-clip-text text-transparent">في دقائق</span>
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-8 text-slate-300">أنشئ حساب إدارة، أضف شركتك أو جرّب شركة تجريبية لمدة 10 أيام، وادخل إلى المخزون والمبيعات والحسابات والتقارير من مكان واحد.</p>
        </div>

        <ol className="su-rise relative max-w-md space-y-3 [animation-delay:.2s]">
          {[
            { title: "أنشئ حسابك", text: "الاسم والبريد وكلمة المرور" },
            { title: "أضف شركتك", text: "أو ابدأ بشركة تجريبية فوراً" },
            { title: "ادخل إلى النظام", text: "كل شركة بقاعدة بيانات معزولة" },
          ].map((step, index) => (
            <li key={step.title} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 backdrop-blur-xl">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400/30 to-cyan-400/10 text-base font-black text-emerald-200 ring-1 ring-white/10">{index + 1}</span>
              <span><b className="block text-sm">{step.title}</b><span className="text-xs text-slate-400">{step.text}</span></span>
            </li>
          ))}
        </ol>

        <div className="su-rise grid grid-cols-3 gap-3 [animation-delay:.3s]">
          {[
            { icon: Building2, title: "عدة شركات", text: "من حساب واحد" },
            { icon: ShieldCheck, title: "حماية البيانات", text: "تشفير وصلاحيات" },
            { icon: Zap, title: "بداية سريعة", text: "إعداد بسيط" },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 backdrop-blur-xl transition duration-300 hover:-translate-y-1.5 hover:border-emerald-300/30 hover:bg-white/[0.09]">
              <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-cyan-400/10 text-emerald-300 ring-1 ring-white/10"><item.icon className="h-[18px] w-[18px]" /></span>
              <b className="block text-[13px]">{item.title}</b>
              <span className="text-xs leading-5 text-slate-400">{item.text}</span>
            </div>
          ))}
        </div>
      </aside>
    </main>
  )
}
