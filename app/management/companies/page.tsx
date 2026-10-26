"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import {
  Building2,
  Plus,
  Loader2,
  LogOut,
  KeyRound,
  ShieldCheck,
  Clock,
  XCircle,
  Calendar,
  ArrowLeft,
  Sparkles,
  Ban,
  Gift,
  LayoutDashboard,
  CheckCircle2,
  Hourglass,
  CreditCard,
  RefreshCw,
  CalendarClock,
} from "lucide-react"
import { priceFor, type Pricing } from "@/lib/company-pricing"
import { SubscriptionDialog } from "@/components/management/subscription-dialog"
import { ChangePasswordDialog } from "@/components/management/change-password-dialog"
import { activateCompany } from "@/lib/tenant-client"
import { useToast } from "@/hooks/use-toast"
import { NoonLogo } from "@/components/brand/noon-logo"
import { PoweredBy } from "@/components/brand/powered-by"

interface Company {
  id: number
  name: string
  status: "pending" | "approved" | "rejected" | "stopped" | "awaiting_payment" | "provisioning" | "provisioning_failed"
  created_at: string
  provisioning_error?: string | null
  provisioning_stale?: boolean | null
  is_trial?: boolean
  renewal_due?: boolean
  number_of_users?: number
  number_of_branches?: number
  number_of_pos_points?: number
  number_of_restaurant_locations?: number
  expiry_date?: string | null
  db_name?: string | null
  requested_by_name?: string | null
  requested_by_email?: string | null
}

// "شعار" بصري مميَّز لكل شركة (أول حرف من اسمها) بتدرّجات هوية شاشة الدخول (زمردي/سماوي/بنفسجي).
const AVATAR_PALETTES = [
  "from-emerald-400 to-cyan-500",
  "from-sky-400 to-indigo-500",
  "from-violet-400 to-fuchsia-500",
  "from-teal-400 to-emerald-600",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
]
function paletteFor(id: number) {
  return AVATAR_PALETTES[id % AVATAR_PALETTES.length]
}

// مطابقة لِـTRIAL_EXPIRY_DAYS بـapp/api/management/companies/trial/route.ts — للعرض فقط هنا (تاريخ
// الانتهاء الفعلي المحفوظ يُحتسَب/يُعاد من الخادم نفسه عند الإنشاء الفعلي، هذا فقط لمعاينة المستخدم
// قبل الضغط على "إنشاء").
const TRIAL_EXPIRY_DAYS = 10
const formatArabicDate = (date: Date) => date.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })

const STATUS_CONFIG: Record<Company["status"], { label: string; icon: typeof ShieldCheck; classes: string }> = {
  approved: { label: "جاهزة", icon: ShieldCheck, classes: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" },
  pending: { label: "في انتظار الموافقة", icon: Clock, classes: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200" },
  rejected: { label: "مرفوضة", icon: XCircle, classes: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200" },
  stopped: { label: "موقوفة", icon: Ban, classes: "bg-stone-50 text-slate-600 ring-1 ring-inset ring-[#ece3d3]" },
  awaiting_payment: { label: "بانتظار الدفع", icon: CreditCard, classes: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200" },
  provisioning: { label: "جاري اعتماد الشركة", icon: Loader2, classes: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" },
  provisioning_failed: { label: "فشل اعتماد الشركة", icon: XCircle, classes: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200" },
}

// نفس هوية شاشة الدخول (components/auth/management-login.tsx): شفق متحرك، نقاط، زجاج، حدّ متدرّج متحرك.
const css = `
@property --cp-angle{syntax:"<angle>";inherits:false;initial-value:0deg}
.cp-root{position:relative;isolation:isolate;overflow-x:hidden;background:#f8f4ec;color:#0f172a}
.cp-aurora{position:fixed;inset:0;z-index:-2;background:
  radial-gradient(60% 50% at 15% 10%,rgba(217,186,140,.28),transparent 70%),
  radial-gradient(50% 45% at 90% 20%,rgba(16,185,129,.07),transparent 70%),
  radial-gradient(55% 55% at 80% 95%,rgba(232,213,180,.35),transparent 70%),
  radial-gradient(45% 45% at 10% 90%,rgba(20,184,166,.06),transparent 70%),linear-gradient(180deg,#fbf8f2,#f5efe4)}
.cp-blob{position:fixed;border-radius:9999px;filter:blur(70px);z-index:-1;opacity:.35;animation:cp-drift 16s ease-in-out infinite}
@keyframes cp-drift{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(40px,-50px,0) scale(1.12)}}
.cp-dots{position:fixed;inset:0;z-index:-1;opacity:.45;background-image:radial-gradient(rgba(120,90,50,.16) 1px,transparent 1.2px);background-size:26px 26px;
  mask-image:radial-gradient(75% 75% at 50% 40%,#000,transparent);-webkit-mask-image:radial-gradient(75% 75% at 50% 40%,#000,transparent)}
.cp-glass{border:1px solid #ece3d3;background:linear-gradient(150deg,rgba(255,255,255,.95),rgba(255,253,249,.85));
  box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 24px 50px -32px rgba(120,90,50,.35)}
.cp-card{position:relative;border-radius:26px;padding:1.5px;background:#ece3d3;transition:transform .25s ease,box-shadow .25s ease}
.cp-card.is-open:hover{transform:translateY(-6px);background:conic-gradient(from var(--cp-angle),rgba(16,185,129,0),#10b981,#38bdf8,#a78bfa,rgba(16,185,129,0) 60%);
  animation:cp-spin 5s linear infinite;box-shadow:0 30px 60px -35px rgba(120,90,50,.45),0 0 50px -25px rgba(16,185,129,.4)}
@keyframes cp-spin{to{--cp-angle:360deg}}
.cp-card-in{height:100%;border-radius:25px;background:#fffdf9;box-shadow:0 1px 0 rgba(255,255,255,.9) inset}
.cp-action{border-radius:26px;border:1.5px dashed #d9c9ae;background:rgba(255,255,255,.55);transition:all .25s ease}
.cp-action:hover{border-color:rgba(52,211,153,.6);background:rgba(16,185,129,.07);transform:translateY(-4px)}
.cp-action.is-trial:hover{border-color:rgba(167,139,250,.65);background:rgba(139,92,246,.08)}
.cp-field{height:3rem;width:100%;border-radius:14px;border:1px solid #e7dccb;background:#fff;padding:0 1rem;font-size:15px;color:#0f172a;outline:none;
  box-shadow:inset 0 1px 2px rgba(120,90,50,.08);transition:border-color .2s,background .2s,box-shadow .2s}
.cp-field:focus{border-color:#10b981;background:#fff;box-shadow:0 0 0 4px rgba(16,185,129,.15)}
.cp-btn{position:relative;overflow:hidden;border-radius:14px;background:linear-gradient(100deg,#10b981,#06b6d4);border-bottom:4px solid #0a6a63;
  box-shadow:0 18px 30px -14px rgba(16,185,129,.8);transition:transform .12s,border-bottom-width .12s,filter .2s}
.cp-btn:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-2px)}
.cp-btn:active:not(:disabled){transform:translateY(3px);border-bottom-width:1px}
.cp-btn:disabled{opacity:.55;cursor:not-allowed}
.cp-btn.is-trial{background:linear-gradient(100deg,#8b5cf6,#6366f1);border-bottom-color:#4c1d95;box-shadow:0 18px 30px -14px rgba(139,92,246,.8)}
.cp-progress{position:relative;height:6px;overflow:hidden;border-radius:9999px;background:#ece3d3}
.cp-progress::after{content:"";position:absolute;inset:0;width:40%;border-radius:9999px;background:linear-gradient(90deg,#10b981,#38bdf8);animation:cp-indeterminate 1.4s ease-in-out infinite}
@keyframes cp-indeterminate{0%{transform:translateX(260%)}100%{transform:translateX(-120%)}}
@keyframes cp-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.cp-rise{animation:cp-rise .65s cubic-bezier(.2,.8,.2,1) both}
.cp-dialog{border:1px solid #ece3d3!important;background:#fffdf9!important;color:#0f172a!important;border-radius:24px!important;
  box-shadow:0 40px 80px -35px rgba(120,90,50,.4),0 0 60px -30px rgba(16,185,129,.3)!important}
.cp-dialog [data-slot="dialog-close"],.cp-dialog button[aria-label="Close"],.cp-dialog>button:last-child{color:#78716c}
@media (prefers-reduced-motion:reduce){.cp-root *{animation:none!important;transition:none!important}}
`

function Wordmark() {
  return <NoonLogo size="md" />
}

export default function ManagementCompaniesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [companies, setCompanies] = useState<Company[]>([])
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState("")
  const [newCompanyUsers, setNewCompanyUsers] = useState("1")
  const [newCompanyBranches, setNewCompanyBranches] = useState("1")
  const [newCompanyPosPoints, setNewCompanyPosPoints] = useState("0")
  const [newCompanyRestaurants, setNewCompanyRestaurants] = useState("0")
  const [saving, setSaving] = useState(false)
  const [selecting, setSelecting] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  // شركة تجريبية (اعتماد فوري ذاتي، اشتراك TRIAL_EXPIRY_DAYS يوماً — انظر
  // app/api/management/companies/trial/route.ts) — حوار منفصل عن "اضافة شركة جديدة" العادية
  // (التي تبقى بانتظار موافقة مسؤول المنصة) حتى يبقى الفرق بين المسارين واضحاً للمستخدم.
  const [showTrialDialog, setShowTrialDialog] = useState(false)
  const [trialCompanyName, setTrialCompanyName] = useState("")
  const [trialSaving, setTrialSaving] = useState(false)
  // الدفع الإلكتروني عبر لحظة عند إنشاء شركة (مفعّل حين يضبط الخادم LAHZA_SECRET_KEY وسعراً أساسياً)
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [paymentEnabled, setPaymentEnabled] = useState(false)
  const [paymentTestMode, setPaymentTestMode] = useState(false)
  const [payingId, setPayingId] = useState<number | null>(null)
  // تجديد الاشتراك / تحويل النسخة التجريبية إلى حقيقية (نافذة لحظة المنبثقة — تتطلب المفتاح العام)
  const [paymentPopup, setPaymentPopup] = useState(false)
  const [subscription, setSubscription] = useState<{ company: Company; purpose: "renewal" | "upgrade" } | null>(null)

  useEffect(() => {
    fetch("/api/management/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setIsPlatformAdmin(!!data?.isPlatformAdmin))
      .catch(() => setIsPlatformAdmin(false))
  }, [])

  const loadCompanies = async () => {
    try {
      const res = await fetch("/api/management/companies")
      if (res.status === 401) {
        router.push("/management/login")
        return
      }
      const data = await res.json()
      setCompanies(Array.isArray(data) ? data : [])
    } catch {
      setError("تعذّر تحميل الشركات")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch("/api/management/pricing", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!data) return; setPricing(data.pricing); setPaymentEnabled(Boolean(data.enabled)); setPaymentPopup(Boolean(data.popup)); setPaymentTestMode(Boolean(data.testMode)) })
      .catch(() => undefined)
  }, [])

  // صفحة "خيارات الدفع" للشركة: الدفع عبر الانترنت (لحظة) أو التواصل مع المبيعات
  const startPayment = async (companyId: number) => {
    setPayingId(companyId)
    window.location.href = `/management/companies/${companyId}/checkout`
  }

  const [retryingId, setRetryingId] = useState<number | null>(null)
  const retryProvisioning = async (companyId: number) => {
    setRetryingId(companyId)
    try {
      const res = await fetch(`/api/management/companies/${companyId}/retry-provisioning`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "تعذّرت إعادة المحاولة")
      await loadCompanies()
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "تعذّرت إعادة المحاولة", variant: "destructive" })
    } finally {
      setRetryingId(null)
    }
  }

  // تحديث تلقائي كل 4 ثوانٍ ما دامت شركة "جاري اعتماد الشركة" — تظهر جاهزة (أو فشل مع "اعادة المحاولة") بلا تحديث يدوي
  const provisioningActive = companies.some((company) => company.status === "provisioning" && !company.provisioning_stale)
  useEffect(() => {
    if (!provisioningActive) return
    const timer = window.setInterval(() => void loadCompanies(), 4000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provisioningActive])

  useEffect(() => {
    loadCompanies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAddCompany = async () => {
    // الخطأ يظهر توستاً فقط هنا — الحوار يبقى مفتوحاً عند الفشل (لا setShowAddDialog(false) إلا بالنجاح)،
    // وشارة الصفحة تُرسَم خلف الحوار المفتوح فتبقى غير مرئية عملياً بدل توست يظهر فوق كل شيء.
    if (!newCompanyName.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/management/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCompanyName.trim(), number_of_users: Number(newCompanyUsers), number_of_branches: Number(newCompanyBranches), number_of_pos_points: Number(newCompanyPosPoints || 0), number_of_restaurant_locations: Number(newCompanyRestaurants || 0), pay: paymentEnabled }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: "خطأ", description: data.error || "حدث خطأ أثناء إنشاء الشركة", variant: "destructive" })
        return
      }
      setShowAddDialog(false)
      setNewCompanyName("")
      setNewCompanyPosPoints("0")
      setNewCompanyRestaurants("0")
      await loadCompanies()
      if (data.payment_required && data.company?.id) await startPayment(Number(data.company.id))
    } catch {
      toast({ title: "خطأ", description: "تعذّر الاتصال بالخادم", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleAddTrialCompany = async () => {
    // نفس سبب عدم استخدام شارة الصفحة بـhandleAddCompany أعلاه.
    if (!trialCompanyName.trim()) return
    setTrialSaving(true)
    setNotice("")
    try {
      const res = await fetch("/api/management/companies/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trialCompanyName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        // detail يحمل رسالة الخطأ الفعلية من provisionCompanyDatabase (إنشاء قاعدة كاملة — عدة نقاط فشل
        // محتملة)، تُرفَق بالتوست عند توفّرها بدل رسالة "حدث خطأ" العامة وحدها.
        const message = data.detail ? `${data.error || "حدث خطأ أثناء إنشاء الشركة التجريبية"} (${data.detail})` : data.error || "حدث خطأ أثناء إنشاء الشركة التجريبية"
        toast({ title: "خطأ", description: message, variant: "destructive" })
        return
      }
      setShowTrialDialog(false)
      setTrialCompanyName("")
      const expiryLabel = data.expiryDate ? formatArabicDate(new Date(data.expiryDate)) : formatArabicDate(new Date(Date.now() + TRIAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000))
      const successMessage = `تم إنشاء الشركة التجريبية واعتمادها تلقائياً — ستنتهي صلاحيتها بتاريخ ${expiryLabel}`
      setNotice(successMessage)
      toast({ title: "تم الإنشاء", description: successMessage })
      await loadCompanies()
    } catch {
      toast({ title: "خطأ", description: "تعذّر الاتصال بالخادم", variant: "destructive" })
    } finally {
      setTrialSaving(false)
    }
  }

  const handleSelectCompany = async (company: Company) => {
    if (company.status !== "approved") return
    setSelecting(company.id)
    try {
      const result = await activateCompany(company.id)
      if (!result.success) {
        setError(result.error || "تعذّر فتح الشركة")
        setSelecting(null)
        return
      }
      window.location.href = `/?company=${company.id}`
    } catch {
      setError("تعذّر الاتصال بالخادم")
      setSelecting(null)
    }
  }

  const handleLogout = async () => {
    await fetch("/api/management/auth/logout", { method: "POST" }).catch(() => {})
    router.push("/management/login")
  }

  const isCompanyExpired = (company: Company) => !!company.expiry_date && new Date(company.expiry_date).getTime() < Date.now()

  const readyCount = companies.filter((company) => company.status === "approved" && !isCompanyExpired(company)).length
  const pendingCount = companies.filter((company) => company.status === "pending").length

  if (loading) {
    return (
      <div className="cp-root flex min-h-screen items-center justify-center">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div className="cp-aurora" aria-hidden="true" />
        <Loader2 className="h-9 w-9 animate-spin text-emerald-700" />
      </div>
    )
  }

  return (
    <div dir="rtl" className="cp-root min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="cp-aurora" aria-hidden="true" />
      <div className="cp-dots" aria-hidden="true" />
      <div className="cp-blob -right-24 top-0 h-80 w-80 bg-amber-200/60" aria-hidden="true" />
      <div className="cp-blob -left-24 bottom-0 h-96 w-96 bg-emerald-200/50 [animation-delay:-6s]" aria-hidden="true" />

      <header className="sticky top-0 z-20 border-b border-[#ece3d3] bg-[#f8f4ec]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isPlatformAdmin && (
              <a href="/management/admin" className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-stone-100 hover:text-slate-900">
                <LayoutDashboard className="h-4 w-4" /> لوحة الإدارة
              </a>
            )}
            <button type="button" onClick={() => setChangePasswordOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-stone-100 hover:text-slate-900">
              <KeyRound className="h-4 w-4" /> تغيير كلمة المرور
            </button>
            <button type="button" onClick={handleLogout} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-rose-50 hover:text-rose-800">
              <LogOut className="h-4 w-4" /> تسجيل الخروج
            </button>
          </div>
        </div>
      </header>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />

      <main className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <section className="cp-rise mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#ece3d3] bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />بوابة الشركات
            </p>
            <h1 className="text-4xl font-black leading-tight sm:text-5xl">
              شركاتي <span className="bg-gradient-to-l from-emerald-300 via-cyan-300 to-violet-300 bg-clip-text text-transparent">بضغطة واحدة</span>
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-slate-600">اختر شركة للمتابعة إلى نظامها، أو أضف شركة جديدة أو تجريبية.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:min-w-[420px]">
            {[
              { icon: Building2, label: "كل الشركات", value: companies.length, tone: "text-cyan-700" },
              { icon: CheckCircle2, label: "جاهزة للدخول", value: readyCount, tone: "text-emerald-700" },
              { icon: Hourglass, label: "بانتظار الموافقة", value: pendingCount, tone: "text-amber-700" },
            ].map((stat) => (
              <div key={stat.label} className="cp-glass rounded-2xl p-3.5">
                <stat.icon className={`h-[18px] w-[18px] ${stat.tone}`} />
                <div className="mt-2 text-2xl font-black tabular-nums">{stat.value}</div>
                <div className="text-xs text-stone-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {error && (
          <div role="alert" className="mb-6 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
          </div>
        )}
        {notice && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company, index) => {
            const status = STATUS_CONFIG[company.status]
            const StatusIcon = status.icon
            const isApproved = company.status === "approved"
            const isSelecting = selecting === company.id
            const isExpired = isCompanyExpired(company)
            const createdDate = new Date(company.created_at)
            const canOpenCompany = isApproved && !isExpired && selecting === null

            return (
              <div key={company.id} className={`cp-card cp-rise ${canOpenCompany ? "is-open" : ""}`} style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-disabled={!canOpenCompany}
                  onClick={() => {
                    if (!canOpenCompany) return
                    handleSelectCompany(company)
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && canOpenCompany) {
                      event.preventDefault()
                      handleSelectCompany(company)
                    }
                  }}
                  className={
                    "cp-card-in group flex min-h-[230px] flex-col gap-4 p-6 text-right outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 " +
                    (canOpenCompany ? "cursor-pointer" : ["awaiting_payment", "provisioning", "provisioning_failed", "approved"].includes(company.status) ? "cursor-default" : "cursor-not-allowed opacity-60")
                  }
                >
                  <div className="flex w-full items-start justify-between">
                    <div className={"grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br text-xl font-black text-white shadow-[0_12px_30px_-10px_rgba(16,185,129,.7)] ring-1 ring-white/25 " + paletteFor(company.id)}>
                      {isSelecting ? <Loader2 className="h-6 w-6 animate-spin" /> : company.name.trim().charAt(0).toUpperCase() || <Building2 className="h-6 w-6" />}
                    </div>
                    <span className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold " + status.classes}>
                      <StatusIcon className={"h-3 w-3" + (company.status === "provisioning" && !company.provisioning_stale ? " animate-spin" : "")} />
                      {status.label}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-2">
                    <h3 className="line-clamp-2 text-lg font-black text-slate-900">{company.name}</h3>
                    {company.is_trial && (
                      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200">
                        <Gift className="h-3 w-3" />
                        نسخة تجريبية
                      </span>
                    )}
                    {isExpired && (
                      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                        <Clock className="h-3 w-3" />
                        الاشتراك منتهي
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 border-t border-[#ece3d3] pt-3 text-xs">
                    <div className="flex items-center gap-1.5 text-stone-500">
                      <Calendar className="h-3.5 w-3.5" />
                      أُنشئت {createdDate.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
                    </div>
                    {company.expiry_date && (
                      <div className={"flex items-center gap-1.5 " + (isExpired ? "font-bold text-rose-700" : "text-stone-500")}>
                        <Clock className="h-3.5 w-3.5" />
                        ينتهي الاشتراك {new Date(company.expiry_date).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
                      </div>
                    )}
                  </div>

                  {company.status === "provisioning" && !company.provisioning_stale && (
                    <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="cp-progress" />
                      <p className="text-xs leading-5 text-emerald-700">تم استلام الدفع — يتم الآن تجهيز قاعدة بيانات الشركة واعتمادها تلقائياً، لحظات وتصبح جاهزة.</p>
                    </div>
                  )}
                  {(company.status === "provisioning_failed" || (company.status === "provisioning" && company.provisioning_stale)) && (
                    <div className="space-y-2">
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                        {company.status === "provisioning_failed" ? "تعذّر اعتماد الشركة" : "تأخر اعتماد الشركة"} — الدفع محفوظ ولن يُطلب منك الدفع مرة أخرى.
                        {company.provisioning_error ? <span className="mt-1 block text-rose-700/80" dir="auto">{company.provisioning_error}</span> : null}
                      </p>
                      <button
                        type="button"
                        disabled={retryingId !== null}
                        onClick={(event) => { event.stopPropagation(); void retryProvisioning(company.id) }}
                        className="cp-btn inline-flex h-10 w-full items-center justify-center gap-2 text-sm font-black text-white"
                      >
                        {retryingId === company.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}اعادة المحاولة
                      </button>
                    </div>
                  )}
                  {company.status === "approved" && (company.is_trial || company.renewal_due) && (
                    paymentPopup && pricing ? (
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); setSubscription({ company, purpose: company.is_trial ? "upgrade" : "renewal" }) }}
                        className={`cp-btn ${company.is_trial ? "is-trial" : ""} inline-flex h-10 w-full items-center justify-center gap-2 text-sm font-black text-white`}
                      >
                        {company.is_trial ? <><Sparkles className="h-4 w-4" />التحويل إلى نسخة حقيقية</> : <><CalendarClock className="h-4 w-4" />تمديد الاشتراك</>}
                      </button>
                    ) : (
                      <p className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-slate-600">{company.is_trial ? "للتحويل إلى نسخة حقيقية" : "لتمديد الاشتراك"} تواصل مع إدارة النظام.</p>
                    )
                  )}
                  {company.status === "awaiting_payment" && (
                    <button
                      type="button"
                      disabled={payingId !== null}
                      onClick={(event) => { event.stopPropagation(); void startPayment(company.id) }}
                      className="cp-btn inline-flex h-10 w-full items-center justify-center gap-2 text-sm font-black text-white"
                    >
                      {payingId === company.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}إكمال الدفع
                    </button>
                  )}
                  {canOpenCompany && (
                    <span className="inline-flex items-center gap-1.5 self-start text-sm font-black text-emerald-700 transition group-hover:text-emerald-800">
                      دخول الشركة <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          <button type="button" onClick={() => setShowAddDialog(true)} className="cp-action cp-rise group flex min-h-[230px] flex-col items-center justify-center gap-3 p-8 text-slate-600 hover:text-emerald-800">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/80 ring-1 ring-[#ece3d3] transition group-hover:bg-emerald-50 group-hover:ring-emerald-200">
              <Plus className="h-7 w-7" />
            </span>
            <span className="text-base font-black">اضافة شركة جديدة</span>
            <span className="text-xs text-stone-500">{paymentEnabled ? "ادفع إلكترونياً وتُفعَّل فوراً" : "تُفعَّل بعد موافقة إدارة النظام"}</span>
          </button>

          <button type="button" onClick={() => setShowTrialDialog(true)} className="cp-action is-trial cp-rise group flex min-h-[230px] flex-col items-center justify-center gap-3 p-8 text-violet-700">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 ring-1 ring-violet-200 transition group-hover:bg-violet-500/25">
              <Gift className="h-7 w-7" />
            </span>
            <span className="text-base font-black">شركة تجريبية</span>
            {/* معلومة الانتهاء على الزر نفسه بلا حاجة لفتح الحوار؛ التاريخ الفعلي (اليوم + المدة) يُحسب داخل الحوار. */}
            <span className="text-xs text-violet-700/80">مجانية لمدة {TRIAL_EXPIRY_DAYS} أيام — اعتماد فوري بلا انتظار</span>
          </button>
        </div>

        {companies.length === 0 && (
          <p className="mt-10 text-center text-sm text-stone-500">
            <Sparkles className="mx-auto mb-2 h-5 w-5 text-emerald-700" />
            لا توجد شركات بعد — أضف أول شركة لك للبدء باستخدام النظام
          </p>
        )}

        <p className="mt-12 flex items-center justify-center gap-1.5 text-xs text-stone-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />اتصال مشفّر · <span dir="ltr">Noon ERP</span></p>
        <div className="mt-2 flex justify-center"><PoweredBy /></div>
      </main>

      {subscription && pricing && (
        <SubscriptionDialog
          company={{
            id: subscription.company.id, name: subscription.company.name, expiry_date: subscription.company.expiry_date,
            number_of_users: Number(subscription.company.number_of_users) || 1, number_of_branches: Number(subscription.company.number_of_branches) || 1,
            number_of_pos_points: Number(subscription.company.number_of_pos_points) || 0,
            number_of_restaurant_locations: Number(subscription.company.number_of_restaurant_locations) || 0,
          }}
          purpose={subscription.purpose}
          pricing={pricing}
          testMode={paymentTestMode}
          onClose={() => setSubscription(null)}
          onDone={(expiryDate) => {
            const label = subscription.purpose === "upgrade" ? "تم تحويل الشركة إلى نسخة حقيقية" : "تم تمديد الاشتراك"
            setSubscription(null)
            const message = expiryDate ? `${label} — ينتهي الاشتراك في ${formatArabicDate(new Date(expiryDate))}` : label
            setNotice(message)
            toast({ title: "تم الدفع", description: message })
            void loadCompanies()
          }}
        />
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent dir="rtl" className="cp-dialog max-w-md">
          <style dangerouslySetInnerHTML={{ __html: css }} />
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-900"><Building2 className="h-5 w-5 text-emerald-700" />اضافة شركة جديدة</DialogTitle>
            <DialogDescription className="text-stone-500">{paymentEnabled ? "ادفع الاشتراك إلكترونياً وتُفعَّل الشركة فوراً." : "تُرسل للموافقة من إدارة النظام قبل تفعيلها."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="new-company-name" className="text-sm font-bold text-slate-700">اسم الشركة</label>
            <input id="new-company-name" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} className="cp-field text-right" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "عدد المستخدمين", value: newCompanyUsers, set: setNewCompanyUsers, min: 1 },
              { label: "عدد الفروع", value: newCompanyBranches, set: setNewCompanyBranches, min: 1 },
              { label: "عدد نقاط البيع", value: newCompanyPosPoints, set: setNewCompanyPosPoints, min: 0 },
              { label: "مواقع المطاعم", value: newCompanyRestaurants, set: setNewCompanyRestaurants, min: 0 },
            ].map((field) => (
              <div key={field.label} className="space-y-2">
                <label className="text-xs font-bold text-slate-600">{field.label}</label>
                <input type="number" min={field.min} value={field.value} onChange={(e) => field.set(e.target.value)} className="cp-field text-right tabular-nums" />
              </div>
            ))}
          </div>
          {paymentEnabled && pricing ? (() => {
            const quote = priceFor(pricing, { users: Number(newCompanyUsers) || 1, branches: Number(newCompanyBranches) || 1, posPoints: Number(newCompanyPosPoints) || 0, restaurantLocations: Number(newCompanyRestaurants) || 0 })
            return (
              <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-sm font-black text-emerald-700"><CreditCard className="h-4 w-4" />تكلفة الاشتراك السنوي</p>
                {quote.lines.filter((line) => line.amount > 0).map((line) => (
                  <div key={line.label} className="flex justify-between text-xs text-slate-600"><span>{line.label}</span><span className="tabular-nums" dir="ltr">{line.amount.toFixed(2)}</span></div>
                ))}
                <div className="flex justify-between border-t border-[#ece3d3] pt-2 text-base font-black"><span>الإجمالي</span><span className="tabular-nums text-emerald-700" dir="ltr">{quote.total.toFixed(2)} {quote.currency}</span></div>
                <p className="text-[11px] leading-5 text-stone-500">الدفع ببطاقة عبر بوابة لحظة الآمنة، وتُنشأ الشركة فوراً بعد نجاح الدفع.</p>
                {paymentTestMode && <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-5 text-amber-700" dir="rtl">وضع تجريبي: استخدم البطاقة <span dir="ltr" className="font-mono">4111 1111 1111 1111</span> — تاريخ <span dir="ltr" className="font-mono">03/30</span> — CVV <span dir="ltr" className="font-mono">004</span></p>}
              </div>
            )
          })() : (
            <p className="text-xs leading-6 text-stone-500">العدد المطلوب للترخيص — يُعتمد مع طلب الشركة من إدارة النظام ويمكن زيادته لاحقاً.</p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <button type="button" onClick={() => setShowAddDialog(false)} className="h-11 rounded-xl border border-[#ece3d3] px-5 text-sm font-bold text-slate-700 transition hover:bg-stone-100">
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleAddCompany}
              disabled={saving || !newCompanyName.trim() || !(Number(newCompanyUsers) >= 1) || !(Number(newCompanyBranches) >= 1) || !(Number(newCompanyPosPoints || 0) >= 0) || !(Number(newCompanyRestaurants || 0) >= 0)}
              className="cp-btn inline-flex h-11 items-center justify-center gap-2 px-6 text-sm font-black text-white"
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />{paymentEnabled ? "جاري التحويل للدفع..." : "جاري الإنشاء..."}</> : paymentEnabled ? <><CreditCard className="h-4 w-4" />الدفع وإنشاء الشركة</> : "إنشاء"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTrialDialog} onOpenChange={setShowTrialDialog}>
        <DialogContent dir="rtl" className="cp-dialog max-w-md">
          <style dangerouslySetInnerHTML={{ __html: css }} />
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-900"><Gift className="h-5 w-5 text-violet-700" />شركة تجريبية</DialogTitle>
            <DialogDescription className="text-stone-500">تجربة كاملة للنظام بلا انتظار موافقة.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="trial-company-name" className="text-sm font-bold text-slate-700">اسم الشركة</label>
            <input id="trial-company-name" value={trialCompanyName} onChange={(e) => setTrialCompanyName(e.target.value)} className="cp-field text-right" autoFocus />
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm leading-6 text-violet-700">
            <Clock className="mt-1 h-4 w-4 shrink-0 text-violet-700" />
            <span>
              ستُعتمَد الشركة فوراً بلا انتظار موافقة، وتنتهي صلاحيتها تلقائياً بعد {TRIAL_EXPIRY_DAYS} أيام من الآن — بتاريخ{" "}
              <strong>{formatArabicDate(new Date(Date.now() + TRIAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000))}</strong>.
            </span>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <button type="button" onClick={() => setShowTrialDialog(false)} className="h-11 rounded-xl border border-[#ece3d3] px-5 text-sm font-bold text-slate-700 transition hover:bg-stone-100">
              إلغاء
            </button>
            <button type="button" onClick={handleAddTrialCompany} disabled={trialSaving || !trialCompanyName.trim()} className="cp-btn is-trial inline-flex h-11 items-center justify-center gap-2 px-6 text-sm font-black text-white">
              {trialSaving ? <><Loader2 className="h-4 w-4 animate-spin" />جاري الإنشاء...</> : "إنشاء"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
