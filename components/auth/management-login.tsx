"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { PasswordReset } from "./password-reset"
import { Switch } from "@/components/ui/switch"
import { AlertCircle, ArrowLeft, BarChart3, Building2, CheckCircle2, Database, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles, TrendingUp } from "lucide-react"
import { NoonLogo } from "@/components/brand/noon-logo"
import { PoweredBy } from "@/components/brand/powered-by"

// The app sets `[dir="rtl"] input { direction: rtl }` globally, which overrides an input's own dir
// attribute: typing Latin text then leaves the caret at the left edge. Setting direction inline wins
// over that rule, and plaintext bidi keeps the caret right after the last typed character.
const credentialStyle: CSSProperties = { direction: "ltr", unicodeBidi: "plaintext", textAlign: "left" }

type Props = {
  onLogin: (credentials: { username: string; password: string; rememberMe: boolean }) => void | Promise<void>
  footer?: ReactNode
}

// تصميم زجاجي حديث بـCSS فقط: شفق متحرك (aurora)، بطاقات معاينة عائمة ثلاثية الأبعاد، وحدّ متدرّج متحرك
// لبطاقة الدخول. الميل مع الماوس عبر متغيرات CSS (بلا إعادة عرض React).
const css = `
@property --ml-angle{syntax:"<angle>";inherits:false;initial-value:0deg}
.ml-root{--mx:0;--my:0;position:relative;isolation:isolate;overflow:hidden;background:#050b14;color:#fff;font-feature-settings:"ss01"}
.ml-aurora{position:absolute;inset:0;z-index:-2;background:
  radial-gradient(60% 50% at 15% 10%,rgba(16,185,129,.35),transparent 70%),
  radial-gradient(50% 45% at 90% 20%,rgba(56,189,248,.22),transparent 70%),
  radial-gradient(55% 55% at 80% 95%,rgba(139,92,246,.22),transparent 70%),
  radial-gradient(45% 45% at 10% 90%,rgba(20,184,166,.25),transparent 70%),#050b14;}
.ml-blob{position:absolute;border-radius:9999px;filter:blur(70px);z-index:-1;opacity:.55;animation:ml-drift 16s ease-in-out infinite}
@keyframes ml-drift{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(40px,-50px,0) scale(1.12)}}
.ml-dots{position:absolute;inset:0;z-index:-1;opacity:.5;background-image:radial-gradient(rgba(255,255,255,.14) 1px,transparent 1.2px);background-size:26px 26px;
  mask-image:radial-gradient(70% 70% at 50% 45%,#000,transparent);-webkit-mask-image:radial-gradient(70% 70% at 50% 45%,#000,transparent)}

/* ── معاينة اللوحة ثلاثية الأبعاد ── */
.ml-scene{perspective:1500px;display:grid;place-items:center;height:430px}
.ml-board{position:relative;width:440px;height:330px;transform-style:preserve-3d;
  transform:rotateX(calc(14deg + var(--my)*-6deg)) rotateY(calc(-24deg + var(--mx)*10deg)) rotateZ(2deg);transition:transform .25s ease-out}
.ml-panel{position:absolute;border-radius:22px;border:1px solid rgba(255,255,255,.16);
  background:linear-gradient(145deg,rgba(255,255,255,.16),rgba(255,255,255,.04));
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  box-shadow:0 1px 0 rgba(255,255,255,.25) inset,0 40px 60px -28px rgba(0,0,0,.8),0 0 60px -20px rgba(16,185,129,.4);
  animation:ml-float 7s ease-in-out infinite}
@keyframes ml-float{0%,100%{translate:0 0}50%{translate:0 -12px}}
.ml-p-main{inset:0;transform:translateZ(0);padding:22px}
.ml-p-stat{width:178px;right:-46px;top:-34px;transform:translateZ(90px);padding:14px 16px;animation-delay:-2s}
.ml-p-list{width:200px;left:-50px;bottom:-40px;transform:translateZ(120px);padding:14px 16px;animation-delay:-4s}
.ml-p-badge{right:36px;bottom:-26px;transform:translateZ(150px);padding:9px 14px;border-radius:9999px;animation-delay:-1s}
.ml-line{stroke-dasharray:420;stroke-dashoffset:420;animation:ml-draw 2.4s .4s ease-out forwards}
@keyframes ml-draw{to{stroke-dashoffset:0}}
.ml-bar{transform-origin:bottom;animation:ml-grow 1.2s cubic-bezier(.2,.8,.2,1) both}
@keyframes ml-grow{from{transform:scaleY(.05)}}

/* ── بطاقة الدخول ── */
.ml-wrap{perspective:1400px;width:100%;max-width:440px}
.ml-card{position:relative;border-radius:30px;padding:2px;transform-style:preserve-3d;
  transform:rotateX(calc(var(--my)*-4deg)) rotateY(calc(var(--mx)*5deg));transition:transform .2s ease-out;
  background:conic-gradient(from var(--ml-angle),rgba(16,185,129,0),#10b981,#38bdf8,#a78bfa,rgba(16,185,129,0) 60%);animation:ml-spin 7s linear infinite;
  box-shadow:0 50px 90px -35px rgba(0,0,0,.9),0 0 80px -30px rgba(16,185,129,.55)}
@keyframes ml-spin{to{--ml-angle:360deg}}
.ml-card-in{border-radius:28px;background:linear-gradient(160deg,rgba(13,22,36,.92),rgba(8,15,26,.94));backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);
  box-shadow:0 1px 0 rgba(255,255,255,.1) inset}
.ml-field{height:3.1rem;width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);padding-left:2.9rem;font-size:15px;color:#fff;outline:none;
  box-shadow:inset 0 2px 6px rgba(0,0,0,.35);transition:border-color .2s,background .2s,box-shadow .2s}
.ml-field::placeholder{color:rgba(148,163,184,.6)}
.ml-field:focus{border-color:#34d399;background:rgba(16,185,129,.08);box-shadow:inset 0 2px 6px rgba(0,0,0,.35),0 0 0 4px rgba(16,185,129,.18),0 0 24px rgba(16,185,129,.25)}
.ml-field:-webkit-autofill{-webkit-text-fill-color:#fff;box-shadow:0 0 0 40px #0d1a29 inset}
.ml-btn{position:relative;overflow:hidden;border-radius:14px;background:linear-gradient(100deg,#10b981,#06b6d4);border-bottom:4px solid #0a6a63;
  box-shadow:0 18px 30px -14px rgba(16,185,129,.8);transition:transform .12s,border-bottom-width .12s,box-shadow .2s,filter .2s}
.ml-btn::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.45) 50%,transparent 65%);transform:translateX(-120%);transition:transform .7s}
.ml-btn:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-2px)}
.ml-btn:hover:not(:disabled)::after{transform:translateX(120%)}
.ml-btn:active:not(:disabled){transform:translateY(3px);border-bottom-width:1px}
@keyframes ml-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.ml-rise{animation:ml-rise .7s cubic-bezier(.2,.8,.2,1) both}
@media (prefers-reduced-motion:reduce){.ml-root *{animation:none!important;transition:none!important}.ml-line{stroke-dashoffset:0}}
@media (max-width:1023px){.ml-card{transform:none}}
`

function Wordmark() {
  return <NoonLogo tone="dark" size="lg" />
}

function DashboardScene() {
  const bars = [38, 56, 44, 72, 52, 86, 64]
  return <div className="ml-scene" aria-hidden="true">
    <div className="ml-board">
      <div className="ml-panel ml-p-main">
        <div className="flex items-center justify-between" dir="ltr">
          <div className="flex gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-400/80" /><i className="h-2.5 w-2.5 rounded-full bg-amber-300/80" /><i className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" /></div>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-200">Dashboard</span>
        </div>
        <svg viewBox="0 0 400 130" className="mt-4 h-[120px] w-full">
          <defs>
            <linearGradient id="mlg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#34d399" stopOpacity=".5" /><stop offset="1" stopColor="#34d399" stopOpacity="0" /></linearGradient>
          </defs>
          <path d="M0 100 C40 90 60 40 100 55 S160 110 200 70 S270 10 310 40 S370 50 400 20 V130 H0Z" fill="url(#mlg)" />
          <path className="ml-line" d="M0 100 C40 90 60 40 100 55 S160 110 200 70 S270 10 310 40 S370 50 400 20" fill="none" stroke="#6ee7b7" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <div className="mt-3 flex h-[72px] items-end justify-between gap-2" dir="ltr">
          {bars.map((height, index) => <span key={index} className="ml-bar w-full rounded-t-md bg-gradient-to-t from-emerald-500/40 to-cyan-300/80" style={{ height: `${height}%`, animationDelay: `${index * 90}ms` }} />)}
        </div>
      </div>
      <div className="ml-panel ml-p-stat">
        <div className="flex items-center gap-2 text-[11px] text-slate-300"><TrendingUp className="h-3.5 w-3.5 text-emerald-300" />المبيعات هذا الشهر</div>
        <div className="mt-1 text-2xl font-black" dir="ltr">+24.8%</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-3/4 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" /></div>
      </div>
      <div className="ml-panel ml-p-list">
        {["شركة الأفق", "مؤسسة النور", "مجموعة الرواد"].map((name, index) => <div key={name} className="flex items-center gap-2 py-1 text-[12px]">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/10"><Building2 className="h-3.5 w-3.5 text-emerald-300" /></span>
          <span className="flex-1 truncate text-slate-200">{name}</span>
          <span className={`h-2 w-2 rounded-full ${index === 2 ? "bg-amber-300" : "bg-emerald-400"} shadow-[0_0_8px_currentColor]`} />
        </div>)}
      </div>
      <div className="ml-panel ml-p-badge flex items-center gap-2 text-[12px] font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-300" />النسخ الاحتياطي مكتمل</div>
    </div>
  </div>
}

export function ManagementLogin({ onLogin, footer }: Props) {
  const [credentials, setCredentials] = useState({ username: "", password: "", rememberMe: false })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showReset, setShowReset] = useState(false)
  const [inviteLink, setInviteLink] = useState<{ email: string; code: string } | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)

  // رابط "تعيين كلمة المرور" من بريد الدعوة/الاستعادة: ?set_password=1&email=...&code=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("set_password") !== "1") return
    setInviteLink({ email: params.get("email") || "", code: params.get("code") || "" })
    setShowReset(true)
  }, [])

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

  if (showReset) return <PasswordReset onBack={() => { setShowReset(false); if (inviteLink) { setInviteLink(null); window.history.replaceState(null, "", window.location.pathname) } }} initialEmail={inviteLink?.email} initialCode={inviteLink?.code} />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    setLoading(true)
    try {
      await onLogin(credentials)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حدث خطأ في تسجيل الدخول")
    } finally {
      setLoading(false)
    }
  }

  return <main ref={rootRef} dir="rtl" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className="ml-root grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <div className="ml-aurora" aria-hidden="true" />
    <div className="ml-dots" aria-hidden="true" />
    <div className="ml-blob -right-24 top-0 h-80 w-80 bg-emerald-500/40" aria-hidden="true" />
    <div className="ml-blob -left-24 bottom-0 h-96 w-96 bg-violet-500/30 [animation-delay:-6s]" aria-hidden="true" />

    <aside className="relative hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      <div className="ml-rise"><Wordmark /></div>

      <div className="ml-rise max-w-xl [animation-delay:.1s]">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-emerald-200 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" />بوابة إدارة النظام
        </p>
        <h1 className="text-4xl font-black leading-[1.3] xl:text-[3.25rem]">
          أدِر شركاتك<br />
          <span className="bg-gradient-to-l from-emerald-300 via-cyan-300 to-violet-300 bg-clip-text text-transparent">بذكاء وأمان</span>
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-8 text-slate-300">مساحة واحدة لإدارة الشركات وقواعد بياناتها واشتراكاتها، والدخول إلى أي منها بضغطة واحدة.</p>
      </div>

      <DashboardScene />

      <div className="ml-rise grid grid-cols-3 gap-3 [animation-delay:.25s]">
        {[
          { icon: Building2, title: "عدة شركات", text: "بيانات معزولة لكل شركة" },
          { icon: Database, title: "اشتراكات وتراخيص", text: "متابعة حالة كل شركة" },
          { icon: ShieldCheck, title: "أمان وصلاحيات", text: "جلسات وصلاحيات دقيقة" },
        ].map(item => <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 backdrop-blur-xl transition duration-300 hover:-translate-y-1.5 hover:border-emerald-300/30 hover:bg-white/[0.09]">
          <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-cyan-400/10 text-emerald-300 ring-1 ring-white/10"><item.icon className="h-[18px] w-[18px]" /></span>
          <b className="block text-[13px]">{item.title}</b>
          <span className="text-xs leading-5 text-slate-400">{item.text}</span>
        </div>)}
      </div>
    </aside>

    <section className="relative flex min-h-screen flex-col items-center justify-center px-5 py-10 sm:px-8">
      <div className="mb-8 lg:hidden"><Wordmark /></div>
      <div className="ml-wrap ml-rise [animation-delay:.15s]">
        <div className="ml-card">
          <div className="ml-card-in p-7 sm:p-9">
            <div className="mb-7">
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-300 ring-1 ring-emerald-300/20"><BarChart3 className="h-3.5 w-3.5" />Noon ERP</span>
              <h2 className="text-[1.75rem] font-black leading-tight">مرحباً بعودتك 👋</h2>
              <p className="mt-1.5 text-sm text-slate-400">سجّل الدخول للمتابعة إلى بوابة الإدارة</p>
            </div>

            <form onSubmit={submit} className="space-y-5" noValidate={false}>
              {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-3 text-sm font-medium text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
              </div>}

              <div className="space-y-2">
                <label htmlFor="mgmt-username" className="text-sm font-bold text-slate-200">البريد الإلكتروني أو اسم المستخدم</label>
                <div className="relative" dir="ltr">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                  <input id="mgmt-username" dir="ltr" style={credentialStyle} className="ml-field pr-4" autoComplete="username" autoFocus required spellCheck={false} autoCapitalize="none"
                    placeholder="name@company.com" value={credentials.username} onChange={event => setCredentials(current => ({ ...current, username: event.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="mgmt-password" className="text-sm font-bold text-slate-200">كلمة المرور</label>
                  <button type="button" onClick={() => setShowReset(true)} className="text-xs font-bold text-emerald-300 transition hover:text-emerald-200 hover:underline">نسيت كلمة المرور؟</button>
                </div>
                <div className="relative" dir="ltr">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                  <input id="mgmt-password" dir="ltr" style={credentialStyle} type={showPassword ? "text" : "password"} className="ml-field pr-12" autoComplete="current-password" required
                    placeholder="••••••••" value={credentials.password} onChange={event => setCredentials(current => ({ ...current, password: event.target.value }))} />
                  <button type="button" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white">
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-300">
                <Switch checked={credentials.rememberMe} onCheckedChange={rememberMe => setCredentials(current => ({ ...current, rememberMe }))} />
                تذكرني على هذا الجهاز
              </label>

              <button type="submit" disabled={loading} className="ml-btn group flex h-12 w-full items-center justify-center gap-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-70">
                {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />جاري التحقق…</> : <>دخول<ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /></>}
              </button>
            </form>

            {footer && <div className="mt-6 border-t border-white/10 pt-5 text-center text-sm text-slate-400">ليس لديك حساب؟ {footer}</div>}
          </div>
        </div>
      </div>
      <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />اتصال مشفّر · <span dir="ltr">Noon ERP</span></p>
      <PoweredBy tone="dark" className="mt-2" />
    </section>
  </main>
}
