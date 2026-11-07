"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useRef, useState } from "react"
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
  Send,
} from "lucide-react"
import { ONLINE_COMPANY_PAYMENT_VISIBLE, priceFor, type Pricing } from "@/lib/company-pricing"
import { SubscriptionDialog } from "@/components/management/subscription-dialog"
import { ChangePasswordDialog } from "@/components/management/change-password-dialog"
import { activateCompany, type ActivateCompanyResult } from "@/lib/tenant-client"
import Messages from "@/components/common/Messages"
import { deviceLabel, formatSessionTime } from "@/lib/device-label"
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
  /** نسخة تجريبية أنشأها المستخدم الحالي (تبقى حتى بعد تحويلها لحقيقية) — حد شركتين */
  my_trial?: boolean
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
  approved: { label: tr("جاهزة"), icon: ShieldCheck, classes: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" },
  pending: { label: tr("في انتظار الموافقة"), icon: Clock, classes: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200" },
  rejected: { label: tr("مرفوضة"), icon: XCircle, classes: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200" },
  stopped: { label: tr("موقوفة"), icon: Ban, classes: "bg-stone-50 text-slate-600 ring-1 ring-inset ring-[#ece3d3]" },
  awaiting_payment: { label: tr("بانتظار الدفع"), icon: CreditCard, classes: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200" },
  provisioning: { label: tr("جاري اعتماد الشركة"), icon: Loader2, classes: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" },
  provisioning_failed: { label: tr("فشل اعتماد الشركة"), icon: XCircle, classes: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200" },
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
  const [newCompanyMobile, setNewCompanyMobile] = useState("")
  const [newCompanyUsers, setNewCompanyUsers] = useState("1")
  const [newCompanyBranches, setNewCompanyBranches] = useState("1")
  const [newCompanyPosPoints, setNewCompanyPosPoints] = useState("0")
  const [newCompanyRestaurants, setNewCompanyRestaurants] = useState("0")
  const [saving, setSaving] = useState(false)
  const [selecting, setSelecting] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  // جهاز واحد لكل مستخدم: رسالة «مسجَّل الدخول من جهاز آخر» بزر المتابعة هنا (app/api/management/select-company)
  const sessionMessagesRef = useRef<any>(null)
  // حساب الإدارة المسجَّل في هذا المتصفح (دخول واحد لكل متصفح — آخر من دخل) يظهر في الرأس حتى لا يُظن أنه حساب آخر
  const [account, setAccount] = useState<{ name: string; email: string } | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  // شركة تجريبية (اعتماد فوري ذاتي، اشتراك TRIAL_EXPIRY_DAYS يوماً — انظر
  // app/api/management/companies/trial/route.ts) — حوار منفصل عن "اضافة شركة جديدة" العادية
  // (التي تبقى بانتظار موافقة مسؤول المنصة) حتى يبقى الفرق بين المسارين واضحاً للمستخدم.
  const [showTrialDialog, setShowTrialDialog] = useState(false)
  const [trialCompanyName, setTrialCompanyName] = useState("")
  const [trialMobile, setTrialMobile] = useState("")
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
      .then((data) => {
        setIsPlatformAdmin(!!data?.isPlatformAdmin)
        setAccount(data ? { name: data.fullName || "", email: data.email || "" } : null)
        // رقم جوال الحساب (من آخر شركة أضافها) يُعبَّأ مسبقاً في نافذتي إضافة الشركة
        const mobile = String(data?.mobile || "")
        setNewCompanyMobile((current) => current || mobile)
        setTrialMobile((current) => current || mobile)
      })
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
      setError(tr("تعذّر تحميل الشركات"))
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
      if (!res.ok) throw new Error(data.error || tr("تعذّرت إعادة المحاولة"))
      await loadCompanies()
    } catch (e) {
      toast({ title: tr("خطأ"), description: e instanceof Error ? e.message : tr("تعذّرت إعادة المحاولة"), variant: "destructive" })
    } finally {
      setRetryingId(null)
    }
  }

  // تحديث تلقائي كل 4 ثوانٍ ما دامت شركة "جاري اعتماد الشركة" — تظهر جاهزة (أو فشل مع "اعادة المحاولة") بلا تحديث يدوي
  const provisioningActive = companies.some((company) => company.status === "provisioning" && !company.provisioning_stale)
  useEffect(() => {
    if (!provisioningActive) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadCompanies()
    }, 10000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provisioningActive])

  useEffect(() => {
    loadCompanies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const newCompanyMobileValid = /^\+?\d{9,15}$/.test(newCompanyMobile.replace(/[\s-]/g, ""))
  const handleAddCompany = async () => {
    // الخطأ يظهر توستاً فقط هنا — الحوار يبقى مفتوحاً عند الفشل (لا setShowAddDialog(false) إلا بالنجاح)،
    // وشارة الصفحة تُرسَم خلف الحوار المفتوح فتبقى غير مرئية عملياً بدل توست يظهر فوق كل شيء.
    if (!newCompanyName.trim() || !newCompanyMobileValid) return
    setSaving(true)
    try {
      const res = await fetch("/api/management/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCompanyName.trim(), mobile: newCompanyMobile.trim(), number_of_users: Number(newCompanyUsers), number_of_branches: Number(newCompanyBranches), number_of_pos_points: Number(newCompanyPosPoints || 0), number_of_restaurant_locations: Number(newCompanyRestaurants || 0), pay: paymentEnabled }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: tr("خطأ"), description: data.error || tr("حدث خطأ أثناء إنشاء الشركة"), variant: "destructive" })
        return
      }
      setShowAddDialog(false)
      setNewCompanyName("")
      setNewCompanyPosPoints("0")
      setNewCompanyRestaurants("0")
      await loadCompanies()
      if (data.payment_required && data.company?.id) await startPayment(Number(data.company.id))
    } catch {
      toast({ title: tr("خطأ"), description: tr("تعذّر الاتصال بالخادم"), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // رقم الجوال إلزامي — نفس فحص الخادم (9-15 رقماً، + اختيارية، المسافات والشرطات مسموحة)
  const trialMobileValid = /^\+?\d{9,15}$/.test(trialMobile.replace(/[\s-]/g, ""))
  const trialLimitReached = companies.filter((company) => company.my_trial).length >= 2
  const handleAddTrialCompany = async () => {
    // نفس سبب عدم استخدام شارة الصفحة بـhandleAddCompany أعلاه.
    if (!trialCompanyName.trim() || !trialMobileValid) return
    setTrialSaving(true)
    setNotice("")
    try {
      const res = await fetch("/api/management/companies/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trialCompanyName.trim(), mobile: trialMobile.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        // detail يحمل رسالة الخطأ الفعلية من provisionCompanyDatabase (إنشاء قاعدة كاملة — عدة نقاط فشل
        // محتملة)، تُرفَق بالتوست عند توفّرها بدل رسالة "حدث خطأ" العامة وحدها.
        const message = data.detail ? tr("{0} ({1})", data.error || "حدث خطأ أثناء إنشاء الشركة التجريبية", data.detail) : data.error || tr("حدث خطأ أثناء إنشاء الشركة التجريبية")
        toast({ title: tr("خطأ"), description: message, variant: "destructive" })
        return
      }
      setShowTrialDialog(false)
      setTrialCompanyName("")
      setTrialMobile("")
      const expiryLabel = data.expiryDate ? formatArabicDate(new Date(data.expiryDate)) : formatArabicDate(new Date(Date.now() + TRIAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000))
      const successMessage = tr("تم إنشاء الشركة التجريبية واعتمادها تلقائياً — ستنتهي صلاحيتها بتاريخ {0}", expiryLabel)
      setNotice(successMessage)
      toast({ title: tr("تم الإنشاء"), description: successMessage })
      await loadCompanies()
    } catch {
      toast({ title: tr("خطأ"), description: tr("تعذّر الاتصال بالخادم"), variant: "destructive" })
    } finally {
      setTrialSaving(false)
    }
  }

  const showDeviceConflict = (company: Company, device: ActivateCompanyResult["device"], conflictAccount?: ActivateCompanyResult["account"]) => {
    const since = formatSessionTime(device?.last_seen_at || device?.created_at)
    sessionMessagesRef.current?.clear?.()
    sessionMessagesRef.current?.show?.([{
      severity: "warn",
      sticky: true,
      closable: false,
      content: (
        <div className="flex w-full flex-col gap-3" dir={appDir()}>
          <div>
            <div className="font-bold">{tr("حسابك مسجَّل الدخول الآن من جهاز آخر")}</div>
            {conflictAccount?.name || conflictAccount?.email ? (
              <div className="mt-1 text-sm">
                {tr("الحساب: {0}", conflictAccount.name || conflictAccount.email || "")}
                {conflictAccount.name && conflictAccount.email ? <span dir="ltr"> ({conflictAccount.email})</span> : null}
              </div>
            ) : null}
            <div className="mt-1 text-sm">
              {tr("الجهاز: {0}", deviceLabel(device?.user_agent))}
              {since ? <span> · {tr("آخر نشاط")} <span dir="ltr">{since}</span></span> : null}
            </div>
            <div className="mt-1 text-sm">{tr("هل تريد تسجيل الخروج من الجهاز الآخر والدخول من هذا الجهاز؟")}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { sessionMessagesRef.current?.clear?.(); void handleSelectCompany(company, true) }} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white hover:bg-amber-700">
              <LogOut className="h-4 w-4" />{tr("نعم، سجّل الخروج من الجهاز الآخر وادخل هنا")}
            </button>
            <button type="button" onClick={() => sessionMessagesRef.current?.clear?.()} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50">
              {tr("إلغاء")}
            </button>
          </div>
        </div>
      ),
    }])
  }

  // هذا الجهاز أُخرج: الحساب فُتح من جهاز آخر أو أُوقف المستخدم (auth-context ⇐ ?reason=)
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason")
    if (reason !== "other_device" && reason !== "account_disabled") return
    sessionMessagesRef.current?.show?.([reason === "other_device"
      ? { severity: "info", sticky: true, summary: "", detail: tr("تم تسجيل خروجك لأن حسابك فُتح من جهاز آخر") }
      : { severity: "error", sticky: true, summary: "", detail: tr("تم إيقاف حسابك — راجع مدير النظام") }])
    window.history.replaceState(null, "", window.location.pathname)
  }, [])

  const handleSelectCompany = async (company: Company, force = false) => {
    if (company.status !== "approved") return
    setSelecting(company.id)
    try {
      const result = await activateCompany(company.id, { force })
      if (result.code === "active_elsewhere") {
        setSelecting(null)
        showDeviceConflict(company, result.device, result.account)
        return
      }
      if (!result.success) {
        setError(result.error || tr("تعذّر فتح الشركة"))
        setSelecting(null)
        return
      }
      window.location.href = `/?company=${company.id}`
    } catch {
      setError(tr("تعذّر الاتصال بالخادم"))
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
    <div dir={appDir()} className="cp-root min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="cp-aurora" aria-hidden="true" />
      <div className="cp-dots" aria-hidden="true" />
      <div className="cp-blob -start-24 top-0 h-80 w-80 bg-amber-200/60" aria-hidden="true" />
      <div className="cp-blob -end-24 bottom-0 h-96 w-96 bg-emerald-200/50 [animation-delay:-6s]" aria-hidden="true" />

      <header className="sticky top-0 z-20 border-b border-[#ece3d3] bg-[#f8f4ec]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-1.5 sm:gap-2">
            {account && (
              <div className="hidden min-w-0 max-w-56 text-end sm:block">
                <div className="truncate text-sm font-bold text-slate-700">{account.name || account.email}</div>
                {account.name && <div className="truncate text-[11px] text-slate-400" dir="ltr">{account.email}</div>}
              </div>
            )}
            {isPlatformAdmin && (
              <a href="/management/admin" className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-stone-100 hover:text-slate-900">
                <LayoutDashboard className="h-4 w-4" />{tr(" لوحة الإدارة")}
              </a>
            )}
            <button type="button" onClick={() => setChangePasswordOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-stone-100 hover:text-slate-900">
              <KeyRound className="h-4 w-4" />{tr(" تغيير كلمة المرور")}
            </button>
            <button type="button" onClick={handleLogout} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-rose-50 hover:text-rose-800">
              <LogOut className="h-4 w-4" />{tr(" تسجيل الخروج")}
            </button>
          </div>
        </div>
      </header>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />

      <main className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <section className="cp-rise mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#ece3d3] bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />{tr("بوابة الشركات")}
            </p>
            <h1 className="text-4xl font-black leading-tight sm:text-5xl">
              {tr("شركاتي ")}<span className="bg-gradient-to-l from-emerald-300 via-cyan-300 to-violet-300 bg-clip-text text-transparent">{tr("بضغطة واحدة")}</span>
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-slate-600">{tr("اختر شركة للمتابعة إلى نظامها، أو أضف شركة جديدة أو تجريبية.")}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:min-w-[420px]">
            {[
              { icon: Building2, label: tr("كل الشركات"), value: companies.length, tone: "text-cyan-700" },
              { icon: CheckCircle2, label: tr("جاهزة للدخول"), value: readyCount, tone: "text-emerald-700" },
              { icon: Hourglass, label: tr("بانتظار الموافقة"), value: pendingCount, tone: "text-amber-700" },
            ].map((stat) => (
              <div key={stat.label} className="cp-glass rounded-2xl p-3.5">
                <stat.icon className={`h-[18px] w-[18px] ${stat.tone}`} />
                <div className="mt-2 text-2xl font-black tabular-nums">{stat.value}</div>
                <div className="text-xs text-stone-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <Messages innerRef={sessionMessagesRef} />
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
                    "cp-card-in group flex min-h-[230px] flex-col gap-4 p-6 text-start outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 " +
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
                        {tr("نسخة تجريبية")}
                      </span>
                    )}
                    {isExpired && (
                      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                        <Clock className="h-3 w-3" />
                        {tr("الاشتراك منتهي")}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 border-t border-[#ece3d3] pt-3 text-xs">
                    <div className="flex items-center gap-1.5 text-stone-500">
                      <Calendar className="h-3.5 w-3.5" />
                      {tr("أُنشئت ")}{createdDate.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
                    </div>
                    {company.expiry_date && (
                      <div className={"flex items-center gap-1.5 " + (isExpired ? "font-bold text-rose-700" : "text-stone-500")}>
                        <Clock className="h-3.5 w-3.5" />
                        {tr("ينتهي الاشتراك ")}{new Date(company.expiry_date).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
                      </div>
                    )}
                  </div>

                  {company.status === "provisioning" && !company.provisioning_stale && (
                    <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="cp-progress" />
                      <p className="text-xs leading-5 text-emerald-700">{tr("تم استلام الدفع — يتم الآن تجهيز قاعدة بيانات الشركة واعتمادها تلقائياً، لحظات وتصبح جاهزة.")}</p>
                    </div>
                  )}
                  {(company.status === "provisioning_failed" || (company.status === "provisioning" && company.provisioning_stale)) && (
                    <div className="space-y-2">
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                        {company.status === "provisioning_failed" ? tr("تعذّر اعتماد الشركة") : tr("تأخر اعتماد الشركة")}{tr(" — الدفع محفوظ ولن يُطلب منك الدفع مرة أخرى.")}
                        {company.provisioning_error ? <span className="mt-1 block text-rose-700/80" dir="auto">{company.provisioning_error}</span> : null}
                      </p>
                      <button
                        type="button"
                        disabled={retryingId !== null}
                        onClick={(event) => { event.stopPropagation(); void retryProvisioning(company.id) }}
                        className="cp-btn inline-flex h-10 w-full items-center justify-center gap-2 text-sm font-black text-white"
                      >
                        {retryingId === company.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{tr("اعادة المحاولة")}
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
                        {company.is_trial ? <><Sparkles className="h-4 w-4" />{tr("التحويل إلى نسخة حقيقية")}</> : <><CalendarClock className="h-4 w-4" />{tr("تمديد الاشتراك")}</>}
                      </button>
                    ) : (
                      <p className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-slate-600">{company.is_trial ? tr("للتحويل إلى نسخة حقيقية") : tr("لتمديد الاشتراك")}{tr(" تواصل مع إدارة النظام.")}</p>
                    )
                  )}
                  {company.status === "awaiting_payment" && (
                    <button
                      type="button"
                      disabled={payingId !== null}
                      onClick={(event) => { event.stopPropagation(); void startPayment(company.id) }}
                      className="cp-btn inline-flex h-10 w-full items-center justify-center gap-2 text-sm font-black text-white"
                    >
                      {payingId === company.id ? <Loader2 className="h-4 w-4 animate-spin" /> : ONLINE_COMPANY_PAYMENT_VISIBLE ? <CreditCard className="h-4 w-4" /> : <Send className="h-4 w-4" />}{ONLINE_COMPANY_PAYMENT_VISIBLE ? tr("إكمال الدفع") : tr("إرسال للمبيعات")}
                    </button>
                  )}
                  {canOpenCompany && (
                    <span className="inline-flex items-center gap-1.5 self-start text-sm font-black text-emerald-700 transition group-hover:text-emerald-800">
                      {tr("دخول الشركة ")}<ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
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
            <span className="text-base font-black">{tr("اضافة شركة جديدة")}</span>
            <span className="text-xs text-stone-500">{paymentEnabled ? (ONLINE_COMPANY_PAYMENT_VISIBLE ? tr("ادفع إلكترونياً وتُفعَّل فوراً") : tr("أرسل طلبك للمبيعات وتُفعَّل بعد الاعتماد")) : tr("تُفعَّل بعد موافقة إدارة النظام")}</span>
          </button>

          <button type="button" disabled={trialLimitReached} onClick={() => setShowTrialDialog(true)} className="cp-action is-trial cp-rise group flex min-h-[230px] flex-col items-center justify-center gap-3 p-8 text-violet-700 disabled:cursor-not-allowed disabled:opacity-60">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 ring-1 ring-violet-200 transition group-hover:bg-violet-500/25">
              <Gift className="h-7 w-7" />
            </span>
            <span className="text-base font-black">{tr("شركة تجريبية")}</span>
            {/* معلومة الانتهاء على الزر نفسه بلا حاجة لفتح الحوار؛ التاريخ الفعلي (اليوم + المدة) يُحسب داخل الحوار. */}
            <span className="text-xs text-violet-700/80">{trialLimitReached ? tr("استخدمت الحد الأقصى: شركتان تجريبيتان") : <>{tr("مجانية لمدة ")}{TRIAL_EXPIRY_DAYS}{tr(" أيام — اعتماد فوري بلا انتظار")}</>}</span>
          </button>
        </div>

        {companies.length === 0 && (
          <p className="mt-10 text-center text-sm text-stone-500">
            <Sparkles className="mx-auto mb-2 h-5 w-5 text-emerald-700" />
            {tr("لا توجد شركات بعد — أضف أول شركة لك للبدء باستخدام النظام")}
          </p>
        )}

        <p className="mt-12 flex items-center justify-center gap-1.5 text-xs text-stone-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />{tr("اتصال مشفّر · ")}<span dir="ltr">Noon ERP</span></p>
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
          account={account}
          onLeadSent={() => toast({ title: tr("تم إرسال طلبك"), description: tr("سيتواصل معك فريق المبيعات قريباً، ويُفعَّل الاشتراك فور اعتماده من الإدارة.") })}
          onClose={() => setSubscription(null)}
          onDone={(expiryDate) => {
            const label = subscription.purpose === "upgrade" ? tr("تم تحويل الشركة إلى نسخة حقيقية") : tr("تم تمديد الاشتراك")
            setSubscription(null)
            const message = expiryDate ? tr("{0} — ينتهي الاشتراك في {1}", label, formatArabicDate(new Date(expiryDate))) : label
            setNotice(message)
            toast({ title: tr("تم الدفع"), description: message })
            void loadCompanies()
          }}
        />
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent dir={appDir()} className="cp-dialog max-w-md">
          <style dangerouslySetInnerHTML={{ __html: css }} />
          <DialogHeader className="text-start">
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-900"><Building2 className="h-5 w-5 text-emerald-700" />{tr("اضافة شركة جديدة")}</DialogTitle>
            <DialogDescription className="text-stone-500">{paymentEnabled ? (ONLINE_COMPANY_PAYMENT_VISIBLE ? tr("ادفع الاشتراك إلكترونياً وتُفعَّل الشركة فوراً.") : tr("أرسل طلبك لفريق المبيعات وتُفعَّل الشركة لسنة كاملة فور اعتمادها.")) : tr("تُرسل للموافقة من إدارة النظام قبل تفعيلها.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="new-company-name" className="text-sm font-bold text-slate-700">{tr("اسم الشركة")}</label>
            <input id="new-company-name" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} className="cp-field text-start" autoFocus />
          </div>
          <div className="space-y-2">
            <label htmlFor="new-company-mobile" className="text-sm font-bold text-slate-700">{tr("رقم الجوال")} <span className="text-rose-600">*</span></label>
            <input id="new-company-mobile" type="tel" inputMode="tel" dir="ltr" placeholder="05XXXXXXXX" value={newCompanyMobile} onChange={(e) => setNewCompanyMobile(e.target.value)} className="cp-field text-start" aria-invalid={Boolean(newCompanyMobile.trim()) && !newCompanyMobileValid} />
            {newCompanyMobile.trim() && !newCompanyMobileValid && <p className="text-xs font-semibold text-rose-600">{tr("رقم الجوال غير صحيح")}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: tr("عدد المستخدمين"), value: newCompanyUsers, set: setNewCompanyUsers, min: 1 },
              { label: tr("عدد الفروع"), value: newCompanyBranches, set: setNewCompanyBranches, min: 1 },
              { label: tr("عدد نقاط البيع"), value: newCompanyPosPoints, set: setNewCompanyPosPoints, min: 0 },
              { label: tr("مواقع المطاعم"), value: newCompanyRestaurants, set: setNewCompanyRestaurants, min: 0 },
            ].map((field) => (
              <div key={field.label} className="space-y-2">
                <label className="text-xs font-bold text-slate-600">{field.label}</label>
                <input type="number" min={field.min} value={field.value} onChange={(e) => field.set(e.target.value)} className="cp-field text-start tabular-nums" />
              </div>
            ))}
          </div>
          {paymentEnabled && pricing ? (() => {
            const quote = priceFor(pricing, { users: Number(newCompanyUsers) || 1, branches: Number(newCompanyBranches) || 1, posPoints: Number(newCompanyPosPoints) || 0, restaurantLocations: Number(newCompanyRestaurants) || 0 })
            return (
              <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-sm font-black text-emerald-700"><CreditCard className="h-4 w-4" />{tr("تكلفة الاشتراك السنوي")}</p>
                {/* أسعار الإضافات: كم يزيد الاشتراك عند زيادة كل عدد */}
                <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-emerald-100 bg-white/70 p-2">
                  {[
                    { label: tr("كل مستخدم إضافي"), amount: pricing.per_user },
                    { label: tr("كل فرع إضافي"), amount: pricing.per_branch },
                    { label: tr("كل نقطة بيع"), amount: pricing.per_pos_point },
                    { label: tr("كل موقع مطعم"), amount: Number(pricing.per_restaurant_location) || 0 },
                  ].map((price) => (
                    <div key={price.label} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[11px] text-slate-600">
                      <span>{price.label}</span>
                      <span className="font-bold tabular-nums text-emerald-700" dir="ltr">+{Number(price.amount || 0).toFixed(2)} {quote.currency}</span>
                    </div>
                  ))}
                </div>
                {quote.lines.filter((line) => line.amount > 0).map((line) => (
                  <div key={line.label} className="flex justify-between text-xs text-slate-600"><span>{line.label}</span><span className="tabular-nums" dir="ltr">{line.amount.toFixed(2)}</span></div>
                ))}
                <div className="flex justify-between border-t border-[#ece3d3] pt-2 text-base font-black"><span>{tr("الإجمالي")}</span><span className="tabular-nums text-emerald-700" dir="ltr">{quote.total.toFixed(2)} {quote.currency}</span></div>
                <p className="text-[11px] leading-5 text-stone-500">{ONLINE_COMPANY_PAYMENT_VISIBLE ? tr("الدفع ببطاقة عبر بوابة لحظة الآمنة، وتُنشأ الشركة فوراً بعد نجاح الدفع.") : tr("بعد الإنشاء أرسل بطاقة لفريق المبيعات، وتُفعَّل الشركة لسنة كاملة فور اعتمادها.")}</p>
                {ONLINE_COMPANY_PAYMENT_VISIBLE && paymentTestMode && <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-5 text-amber-700" dir={appDir()}>{tr("وضع تجريبي: استخدم البطاقة ")}<span dir="ltr" className="font-mono">4111 1111 1111 1111</span>{tr(" — تاريخ ")}<span dir="ltr" className="font-mono">03/30</span> — CVV <span dir="ltr" className="font-mono">004</span></p>}
              </div>
            )
          })() : (
            <p className="text-xs leading-6 text-stone-500">{tr("العدد المطلوب للترخيص — يُعتمد مع طلب الشركة من إدارة النظام ويمكن زيادته لاحقاً.")}</p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <button type="button" onClick={() => setShowAddDialog(false)} className="h-11 rounded-xl border border-[#ece3d3] px-5 text-sm font-bold text-slate-700 transition hover:bg-stone-100">
              {tr("إلغاء")}
            </button>
            <button
              type="button"
              onClick={handleAddCompany}
              disabled={saving || !newCompanyName.trim() || !newCompanyMobileValid || !(Number(newCompanyUsers) >= 1) || !(Number(newCompanyBranches) >= 1) || !(Number(newCompanyPosPoints || 0) >= 0) || !(Number(newCompanyRestaurants || 0) >= 0)}
              className="cp-btn inline-flex h-11 items-center justify-center gap-2 px-6 text-sm font-black text-white"
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />{paymentEnabled && ONLINE_COMPANY_PAYMENT_VISIBLE ? tr("جاري التحويل للدفع...") : tr("جاري الإنشاء...")}</> : paymentEnabled && ONLINE_COMPANY_PAYMENT_VISIBLE ? <><CreditCard className="h-4 w-4" />{tr("الدفع وإنشاء الشركة")}</> : paymentEnabled ? <><Send className="h-4 w-4" />{tr("إنشاء وإرسال للمبيعات")}</> : tr("إنشاء")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTrialDialog} onOpenChange={setShowTrialDialog}>
        <DialogContent dir={appDir()} className="cp-dialog max-w-md">
          <style dangerouslySetInnerHTML={{ __html: css }} />
          <DialogHeader className="text-start">
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-900"><Gift className="h-5 w-5 text-violet-700" />{tr("شركة تجريبية")}</DialogTitle>
            <DialogDescription className="text-stone-500">{tr("تجربة كاملة للنظام بلا انتظار موافقة.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="trial-company-name" className="text-sm font-bold text-slate-700">{tr("اسم الشركة")}</label>
            <input id="trial-company-name" value={trialCompanyName} onChange={(e) => setTrialCompanyName(e.target.value)} className="cp-field text-start" autoFocus />
          </div>
          <div className="space-y-2">
            <label htmlFor="trial-company-mobile" className="text-sm font-bold text-slate-700">{tr("رقم الجوال")} <span className="text-rose-600">*</span></label>
            <input id="trial-company-mobile" type="tel" inputMode="tel" dir="ltr" placeholder="05XXXXXXXX" value={trialMobile} onChange={(e) => setTrialMobile(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && trialCompanyName.trim() && trialMobileValid && !trialSaving) void handleAddTrialCompany() }} className="cp-field text-start" aria-invalid={Boolean(trialMobile.trim()) && !trialMobileValid} />
            {trialMobile.trim() && !trialMobileValid && <p className="text-xs font-semibold text-rose-600">{tr("رقم الجوال غير صحيح")}</p>}
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm leading-6 text-violet-700">
            <Clock className="mt-1 h-4 w-4 shrink-0 text-violet-700" />
            <span>
              {tr("ستُعتمَد الشركة فوراً بلا انتظار موافقة، وتنتهي صلاحيتها تلقائياً بعد ")}{TRIAL_EXPIRY_DAYS}{tr(" أيام من الآن — بتاريخ")}{" "}
              <strong>{formatArabicDate(new Date(Date.now() + TRIAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000))}</strong>.
            </span>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <button type="button" onClick={() => setShowTrialDialog(false)} className="h-11 rounded-xl border border-[#ece3d3] px-5 text-sm font-bold text-slate-700 transition hover:bg-stone-100">
              {tr("إلغاء")}
            </button>
            <button type="button" onClick={handleAddTrialCompany} disabled={trialSaving || !trialCompanyName.trim() || !trialMobileValid} className="cp-btn is-trial inline-flex h-11 items-center justify-center gap-2 px-6 text-sm font-black text-white">
              {trialSaving ? <><Loader2 className="h-4 w-4 animate-spin" />{tr("جاري الإنشاء...")}</> : tr("إنشاء")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
