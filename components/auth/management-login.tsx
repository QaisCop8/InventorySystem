"use client"

import { useState, type CSSProperties, type ReactNode } from "react"
import { PasswordReset } from "./password-reset"
import { Switch } from "@/components/ui/switch"
import { AlertCircle, ArrowLeft, Building2, Database, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react"

// The app sets `[dir="rtl"] input { direction: rtl }` globally, which overrides an input's own dir
// attribute: typing Latin text then leaves the caret at the left edge. Setting direction inline wins
// over that rule, and plaintext bidi keeps the caret right after the last typed character.
const credentialStyle: CSSProperties = { direction: "ltr", unicodeBidi: "plaintext", textAlign: "left" }

type Props = {
  onLogin: (credentials: { username: string; password: string; rememberMe: boolean }) => void | Promise<void>
  footer?: ReactNode
}

function Wordmark({ light = false }: { light?: boolean }) {
  return <div className="flex items-center gap-3" dir="ltr">
    <span className={`relative grid h-12 w-12 place-items-center rounded-2xl ${light ? "bg-white/10 ring-1 ring-white/20" : "bg-gradient-to-br from-emerald-500 to-teal-700 shadow-lg shadow-emerald-700/25"}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <path d="M16 4 4 28h5.2l2.4-5.2h8.8l2.4 5.2H28L16 4Zm-2.6 14.6L16 12.8l2.6 5.8h-5.2Z" fill="currentColor" className="text-white" />
      </svg>
    </span>
    <span className="leading-none">
      <span className={`block text-2xl font-black tracking-[0.18em] ${light ? "text-white" : "text-slate-900"}`}>ARAAK</span>
      <span className={`mt-1 block text-[11px] font-bold tracking-[0.42em] ${light ? "text-emerald-300" : "text-emerald-600"}`}>ERP SYSTEM</span>
    </span>
  </div>
}

export function ManagementLogin({ onLogin, footer }: Props) {
  const [credentials, setCredentials] = useState({ username: "", password: "", rememberMe: false })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showReset, setShowReset] = useState(false)

  if (showReset) return <PasswordReset onBack={() => setShowReset(false)} />

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

  const inputClass = "h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"

  return <main dir="rtl" className="grid min-h-screen bg-slate-100 lg:grid-cols-[1.05fr_1fr]">
    <aside className="relative hidden overflow-hidden bg-[#06201c] text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(16,185,129,0.28),transparent_34%),radial-gradient(circle_at_88%_88%,rgba(20,184,166,0.22),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full border border-emerald-400/10" />
      <div className="pointer-events-none absolute -bottom-16 -left-8 h-64 w-64 rounded-full border border-emerald-400/10" />

      <div className="relative z-10"><Wordmark light /></div>

      <div className="relative z-10 max-w-lg">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />بوابة إدارة النظام
        </p>
        <h1 className="text-4xl font-black leading-[1.35] xl:text-5xl">نظام أراك لتخطيط<br />موارد المؤسسات</h1>
        <p className="mt-5 max-w-md text-[15px] leading-8 text-slate-300">مساحة واحدة لإدارة شركاتك وقواعد بياناتها واشتراكاتها، والدخول إلى أي منها بأمان.</p>
        <ul className="mt-9 space-y-4">
          {[
            { icon: Building2, title: "عدة شركات", text: "كل شركة بقاعدة بيانات مستقلة وبياناتها المعزولة" },
            { icon: Database, title: "اشتراكات وتراخيص", text: "متابعة صلاحية الاشتراك وحالة كل شركة" },
            { icon: ShieldCheck, title: "أمان وصلاحيات", text: "جلسات آمنة وصلاحيات دقيقة لكل مستخدم" },
          ].map(item => <li key={item.title} className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-emerald-300 ring-1 ring-white/10"><item.icon className="h-5 w-5" /></span>
            <span><b className="block text-sm">{item.title}</b><span className="text-sm text-slate-400">{item.text}</span></span>
          </li>)}
        </ul>
      </div>

      <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6 text-xs text-slate-400">
        <span dir="ltr">© {new Date().getFullYear()} ARAAK ERP</span>
        <span className="flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5 text-emerald-400" />اتصال مشفّر</span>
      </div>
    </aside>

    <section className="flex min-h-screen flex-col items-center justify-center px-5 py-10 sm:px-8">
      <div className="mb-8 lg:hidden"><Wordmark /></div>
      <div className="w-full max-w-[420px] rounded-3xl border border-slate-200/80 bg-white p-7 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] sm:p-9">
        <div className="mb-7">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"><KeyRound className="h-6 w-6" /></span>
          <h2 className="text-2xl font-black text-slate-900">تسجيل الدخول</h2>
          <p className="mt-1.5 text-sm text-slate-500">ادخل إلى بوابة إدارة <b className="font-bold text-slate-700" dir="ltr">ARAAK ERP</b></p>
        </div>

        <form onSubmit={submit} className="space-y-5" noValidate={false}>
          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
          </div>}

          <div className="space-y-2">
            <label htmlFor="mgmt-username" className="text-sm font-bold text-slate-700">البريد الإلكتروني أو اسم المستخدم</label>
            <div className="relative" dir="ltr">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
              <input id="mgmt-username" dir="ltr" style={credentialStyle} className={`${inputClass} pr-4`} autoComplete="username" autoFocus required spellCheck={false} autoCapitalize="none"
                placeholder="name@company.com" value={credentials.username} onChange={event => setCredentials(current => ({ ...current, username: event.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="mgmt-password" className="text-sm font-bold text-slate-700">كلمة المرور</label>
              <button type="button" onClick={() => setShowReset(true)} className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline">نسيت كلمة المرور؟</button>
            </div>
            <div className="relative" dir="ltr">
              <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
              <input id="mgmt-password" dir="ltr" style={credentialStyle} type={showPassword ? "text" : "password"} className={`${inputClass} pr-12`} autoComplete="current-password" required
                placeholder="••••••••" value={credentials.password} onChange={event => setCredentials(current => ({ ...current, password: event.target.value }))} />
              <button type="button" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
            <Switch checked={credentials.rememberMe} onCheckedChange={rememberMe => setCredentials(current => ({ ...current, rememberMe }))} />
            تذكرني على هذا الجهاز
          </label>

          <button type="submit" disabled={loading} className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-700 text-sm font-black text-white shadow-lg shadow-emerald-700/20 transition hover:shadow-xl hover:shadow-emerald-700/25 disabled:cursor-not-allowed disabled:opacity-70">
            {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />جاري التحقق…</> : <>دخول<ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /></>}
          </button>
        </form>

        {footer && <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">ليس لديك حساب؟ {footer}</div>}
      </div>
      <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-400 lg:hidden"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />اتصال مشفّر · <span dir="ltr">ARAAK ERP</span></p>
    </section>
  </main>
}
