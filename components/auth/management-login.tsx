"use client"

import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { PasswordReset } from "./password-reset"
import { Switch } from "@/components/ui/switch"
import { AlertCircle, ArrowLeft, BarChart3, Building2, Database, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react"
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

// Responsive management login layout.
const css = `
.ml-root{position:relative;isolation:isolate;overflow:auto;min-height:100svh;padding:clamp(10px,2.4vw,30px);background:#082b26;color:#10251f;font-feature-settings:"ss01"}
.ml-frame{position:relative;display:grid;min-height:calc(100svh - clamp(20px,4.8vw,60px));overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:28px;background:#f5f7f3;box-shadow:0 28px 90px rgba(0,0,0,.24)}
.ml-brand{position:relative;isolation:isolate;display:flex;min-height:270px;flex-direction:column;justify-content:space-between;overflow:hidden;padding:clamp(24px,5vw,64px);background:#087b60;color:white}
.ml-brand::before,.ml-brand::after{position:absolute;z-index:-1;content:"";pointer-events:none}
.ml-brand::before{inset:0;background:radial-gradient(circle at 18% 82%,rgba(62,214,158,.25),transparent 38%),linear-gradient(135deg,rgba(2,55,46,.18),transparent 62%)}
.ml-brand::after{width:min(34vw,420px);aspect-ratio:1;top:50%;left:-9%;transform:translateY(-50%);border:1px solid rgba(206,255,234,.16);border-radius:50%;box-shadow:0 0 0 28px rgba(206,255,234,.035),0 0 0 58px rgba(206,255,234,.03),0 0 0 96px rgba(206,255,234,.025)}
.ml-brand-top{display:flex;align-items:center;justify-content:space-between;gap:16px}
.ml-edition{display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:8px 11px;color:#d7f7e9;font-size:10px;font-weight:800;letter-spacing:.13em}
.ml-copy{position:relative;z-index:1;max-width:580px;padding-block:34px}
.ml-copy h1{max-width:560px;font-size:clamp(2rem,4.2vw,4.2rem);font-weight:900;line-height:1.23;letter-spacing:-.045em}
.ml-copy h1 span{color:#b6f0d6}
.ml-copy p:last-child{max-width:440px;margin-top:18px;color:rgba(240,255,248,.76);font-size:clamp(13px,1.15vw,15px);line-height:2}
.ml-orbit{position:absolute;left:clamp(20px,8vw,110px);bottom:clamp(90px,12vw,150px);width:clamp(150px,19vw,260px);aspect-ratio:1;border:1px solid rgba(217,255,240,.23);border-radius:50%;opacity:.78}
.ml-orbit::before,.ml-orbit::after{position:absolute;inset:18%;border:1px solid rgba(217,255,240,.23);border-radius:50%;content:""}
.ml-orbit::after{inset:37%;background:rgba(174,245,215,.1);box-shadow:0 0 55px rgba(125,255,205,.15)}
.ml-orbit-dot{position:absolute;top:13%;right:22%;width:10px;height:10px;border-radius:50%;background:#c6f6df;box-shadow:0 0 18px #c6f6df}
.ml-brand-bottom{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:8px}
.ml-feature{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(4,63,50,.24);padding:9px 11px;color:#e3f9ef;font-size:11px;font-weight:700}
.ml-login{display:flex;min-width:0;flex-direction:column;align-items:center;justify-content:center;padding:clamp(24px,6vw,76px) clamp(18px,5vw,64px);background:#f5f7f3}
.ml-wrap{perspective:none;width:100%;max-width:440px}
.ml-card-in{border:1px solid #e1e8e2;border-radius:22px;background:#fff;padding:clamp(22px,3vw,38px);box-shadow:0 24px 60px -38px rgba(8,67,51,.28)}
.ml-login-kicker{display:flex;align-items:center;gap:10px;color:#087b60;font-size:11px;font-weight:900;letter-spacing:.12em}
.ml-login-kicker::after{height:1px;flex:1;background:#dce8df;content:""}
.ml-field{height:3.1rem;width:100%;border:1px solid #d8e2dc;border-radius:12px;background:#fbfcfa;padding-left:2.9rem;font-size:15px;color:#10251f;outline:none;transition:border-color .2s,background .2s,box-shadow .2s}
.ml-field::placeholder{color:#9aa9a1}
.ml-field:focus{border-color:#07936d;background:#fff;box-shadow:0 0 0 4px rgba(8,147,109,.12)}
.ml-field:-webkit-autofill{-webkit-text-fill-color:#10251f;box-shadow:0 0 0 40px #fff inset}
.ml-btn{position:relative;overflow:hidden;border-radius:12px;background:#087b60;box-shadow:0 12px 22px -15px rgba(8,123,96,.7);transition:transform .15s,background .15s,box-shadow .15s}
.ml-btn:hover:not(:disabled){transform:translateY(-1px);background:#066b53;box-shadow:0 16px 25px -15px rgba(8,123,96,.8)}
.ml-btn:active:not(:disabled){transform:translateY(1px)}
.ml-footer a{color:#087b60!important}
.ml-footer a:hover{color:#055c48!important}
.ml-powered{color:#718078}
@media (min-width:1024px){.ml-frame{grid-template-columns:1fr 1fr}.ml-brand{min-height:calc(100svh - clamp(20px,4.8vw,60px))}}
@media (max-width:1023px){.ml-brand{min-height:240px}.ml-orbit{left:5%;bottom:20px}.ml-copy{padding-block:26px}}
@media (max-width:560px){.ml-root{padding:0}.ml-frame{min-height:100svh;border:0;border-radius:0}.ml-brand{min-height:210px;padding:22px 22px 18px}.ml-brand::after{width:240px;left:-28%}.ml-edition{font-size:9px}.ml-copy{padding-block:22px 12px}.ml-copy h1{font-size:1.75rem}.ml-copy p:last-child{margin-top:8px;font-size:12px;line-height:1.8}.ml-orbit{width:125px;left:-3%;bottom:22px}.ml-brand-bottom{gap:6px}.ml-feature{padding:7px 8px;font-size:10px}.ml-login{justify-content:flex-start;padding:22px 17px 28px}.ml-card-in{border-radius:18px;padding:22px 19px}.ml-login-kicker{font-size:10px}}
@media (prefers-reduced-motion:reduce){.ml-root *{scroll-behavior:auto!important;transition:none!important}}
`

function Wordmark() {
  return <NoonLogo size="lg" tone="dark" tagline={null} />
}

export function ManagementLogin({ onLogin, footer }: Props) {
  const [credentials, setCredentials] = useState({ username: "", password: "", rememberMe: false })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showReset, setShowReset] = useState(false)
  const [inviteLink, setInviteLink] = useState<{ email: string; code: string } | null>(null)

  // Read invitation links that open the password setup flow.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("set_password") !== "1") return
    setInviteLink({ email: params.get("email") || "", code: params.get("code") || "" })
    setShowReset(true)
  }, [])

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

  return <main dir="rtl" className="ml-root">
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <div className="ml-frame">
      <aside className="ml-brand">
        <div className="ml-brand-top">
          <Wordmark />
          <span className="ml-edition"><span className="h-1.5 w-1.5 rounded-full bg-[#b6f0d6]" />CONTROL · 01</span>
        </div>
        <div className="ml-orbit" aria-hidden="true"><span className="ml-orbit-dot" /></div>
        <div className="ml-copy">
          <p className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#c3f3dd]"><Sparkles className="h-3.5 w-3.5" />بوابة الإدارة</p>
          <h1>منصة واحدة،<br /><span>رؤية أوضح.</span></h1>
          <p>إدارة مركزية للشركات والاشتراكات والبيانات، بتجربة واضحة وآمنة من أول دخول.</p>
        </div>
        <div className="ml-brand-bottom">
          {[
            { icon: Building2, label: "إدارة الشركات" },
            { icon: Database, label: "بيانات موحّدة" },
            { icon: ShieldCheck, label: "وصول آمن" },
          ].map(item => <span key={item.label} className="ml-feature"><item.icon className="h-3.5 w-3.5" />{item.label}</span>)}
        </div>
      </aside>

      <section className="ml-login">
        <div className="ml-wrap">
          <div className="ml-card-in">
            <div className="mb-8">
              <div className="ml-login-kicker"><BarChart3 className="h-4 w-4" />ADMIN PORTAL</div>
              <h2 className="mt-6 text-3xl font-black tracking-tight text-[#10251f]">تسجيل دخول الإدارة</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">سجّل الدخول للمتابعة إلى بوابة الإدارة</p>
            </div>

            <form onSubmit={submit} className="space-y-5" noValidate={false}>
              {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
              </div>}

              <div className="space-y-2">
                <label htmlFor="mgmt-username" className="text-sm font-bold text-slate-700">البريد الإلكتروني أو اسم المستخدم</label>
                <div className="relative" dir="ltr">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-stone-500" />
                  <input id="mgmt-username" dir="ltr" style={credentialStyle} className="ml-field pr-4" autoComplete="username" autoFocus required spellCheck={false} autoCapitalize="none"
                    placeholder="name@company.com" value={credentials.username} onChange={event => setCredentials(current => ({ ...current, username: event.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="mgmt-password" className="text-sm font-bold text-slate-700">كلمة المرور</label>
                  <button type="button" onClick={() => setShowReset(true)} className="shrink-0 text-xs font-bold text-emerald-700 transition hover:text-emerald-800 hover:underline">نسيت كلمة المرور؟</button>
                </div>
                <div className="relative" dir="ltr">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-stone-500" />
                  <input id="mgmt-password" dir="ltr" style={credentialStyle} type={showPassword ? "text" : "password"} className="ml-field pr-12" autoComplete="current-password" required
                    placeholder="••••••••" value={credentials.password} onChange={event => setCredentials(current => ({ ...current, password: event.target.value }))} />
                  <button type="button" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-slate-900">
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
                <Switch checked={credentials.rememberMe} onCheckedChange={rememberMe => setCredentials(current => ({ ...current, rememberMe }))} />
                تذكرني على هذا الجهاز
              </label>

              <button type="submit" disabled={loading} className="ml-btn group flex h-12 w-full items-center justify-center gap-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-70">
                {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />جاري التحقق…</> : <>دخول<ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /></>}
              </button>
            </form>

            {footer && <div className="ml-footer mt-6 border-t border-[#e5ece6] pt-5 text-center text-sm text-stone-500">ليس لديك حساب؟ {footer}</div>}
          </div>
        </div>
        <p className="ml-powered mt-6 flex items-center gap-1.5 text-xs"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />اتصال مشفّر <span className="mx-1 text-slate-300">/</span><span dir="ltr">Noon ERP</span></p>
        <PoweredBy className="mt-3" />
      </section>
    </div>
  </main>
}
