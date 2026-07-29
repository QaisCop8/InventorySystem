"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
  Building2,
  Plus,
  Loader2,
  LogOut,
  ShieldCheck,
  Clock,
  XCircle,
  Calendar,
  ChevronLeft,
  Sparkles,
  LayoutGrid,
  Ban,
  RefreshCw,
} from "lucide-react"
import { activateCompany } from "@/lib/tenant-client"

interface Company {
  id: number
  name: string
  status: "pending" | "approved" | "rejected" | "stopped"
  created_at: string
  expiry_date?: string | null
  db_name?: string | null
  requested_by_name?: string | null
  requested_by_email?: string | null
}

// نفس تدرّجات ألوان النظام (indigo/violet/fuchsia بشاشات الدخول) موزَّعة على الشركات بالتناوب —
// "شعار" بصري مميَّز لكل شركة (أول حرف من اسمها) بلا حاجة لرفع شعارات فعلية.
const AVATAR_PALETTES = [
  "from-indigo-500 to-violet-500",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-fuchsia-500 to-pink-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-red-500",
]
function paletteFor(id: number) {
  return AVATAR_PALETTES[id % AVATAR_PALETTES.length]
}

const STATUS_CONFIG: Record<Company["status"], { label: string; icon: typeof ShieldCheck; classes: string }> = {
  approved: { label: "جاهزة", icon: ShieldCheck, classes: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" },
  pending: { label: "في انتظار الموافقة", icon: Clock, classes: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200" },
  rejected: { label: "مرفوضة", icon: XCircle, classes: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200" },
  stopped: { label: "موقوفة", icon: Ban, classes: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200" },
}

export default function ManagementCompaniesPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState("")
  const [saving, setSaving] = useState(false)
  const [selecting, setSelecting] = useState<number | null>(null)
  const [subscriptionBusyId, setSubscriptionBusyId] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)

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
    loadCompanies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) return
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/management/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCompanyName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "حدث خطأ أثناء إنشاء الشركة")
        return
      }
      setShowAddDialog(false)
      setNewCompanyName("")
      await loadCompanies()
    } catch {
      setError("تعذّر الاتصال بالخادم")
    } finally {
      setSaving(false)
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

  const handleSubscriptionAction = async (companyId: number, action: "stop" | "extend") => {
    setSubscriptionBusyId(companyId)
    setError("")
    try {
      const res = await fetch(`/api/management/companies/${companyId}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "تعذّر تنفيذ الإجراء")
        return
      }
      await loadCompanies()
    } catch {
      setError("تعذّر الاتصال بالخادم")
    } finally {
      setSubscriptionBusyId(null)
    }
  }

  const handleLogout = async () => {
    await fetch("/api/management/auth/logout", { method: "POST" }).catch(() => {})
    router.push("/management/login")
  }

  const isCompanyExpired = (company: Company) => !!company.expiry_date && new Date(company.expiry_date).getTime() < Date.now()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    )
  }

  return (
    <div dir="rtl" className="relative min-h-screen overflow-x-hidden bg-slate-50">
      {/* لمسات لونية خفيفة بنفس هوية شاشات الدخول (indigo/violet/fuchsia) — تمنح الصفحة طابعاً
          أكثر حيوية بدل الخلفية الرمادية المسطّحة السابقة، بلا تأثير على قابلية القراءة. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(99,102,241,0.06),transparent_40%),radial-gradient(circle_at_90%_10%,rgba(217,70,239,0.05),transparent_35%)]" />

      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_6px_18px_-6px_rgba(139,92,246,0.5)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" aria-hidden="true">
              <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 2.3L6 8.2v7.6l6 2.9 6-2.9V8.2l-6-2.9z" fill="currentColor" />
              <path d="M12 8.8l3.4 1.9v3.8L12 16.4l-3.4-1.9v-3.8L12 8.8z" fill="currentColor" opacity="0.65" />
            </svg>
          </div>
          <span className="hidden text-sm font-semibold text-slate-700 sm:inline">أساس لإدارة الحلول المحاسبية</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          {isPlatformAdmin && (
            <a
              href="/management/admin"
              className="rounded-md px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              لوحة الإدارة
            </a>
          )}
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600">
            <LogOut className="h-4 w-4" /> تسجيل الخروج
          </Button>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">شركاتي</h1>
            <p className="text-sm text-slate-500">اختر شركة للمتابعة إلى نظامها، أو أضف شركة جديدة</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <button
            onClick={() => setShowAddDialog(true)}
            className="group flex min-h-[190px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-slate-300 bg-white/60 p-8 text-slate-400 transition-all hover:border-violet-400 hover:bg-violet-50/50 hover:text-violet-600"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 transition-colors group-hover:bg-violet-100">
              <Plus className="h-7 w-7" />
            </div>
            <span className="font-semibold">اضافة شركة جديدة</span>
          </button>

          {companies.map((company) => {
            const status = STATUS_CONFIG[company.status]
            const StatusIcon = status.icon
            const isApproved = company.status === "approved"
            const isSelecting = selecting === company.id
            const isExpired = isCompanyExpired(company)
            const createdDate = new Date(company.created_at)
            const canOpenCompany = isApproved && !isExpired && selecting === null

            return (
              <div
                key={company.id}
                role="button"
                tabIndex={0}
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
                  "group relative flex min-h-[220px] flex-col items-start gap-4 overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 text-right shadow-sm transition-all " +
                  (canOpenCompany
                    ? "cursor-pointer hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg"
                    : "cursor-not-allowed opacity-70")
                }
              >
                <div className="flex w-full items-start justify-between">
                  <div
                    className={
                      "flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold text-white shadow-md " +
                      paletteFor(company.id)
                    }
                  >
                    {isSelecting ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      company.name.trim().charAt(0).toUpperCase() || <Building2 className="h-6 w-6" />
                    )}
                  </div>

                  {isApproved && !isExpired && (
                    <ChevronLeft className="mt-2 h-5 w-5 text-slate-300 transition-all group-hover:-translate-x-1 group-hover:text-violet-500" />
                  )}
                </div>

                <div className="flex w-full flex-1 flex-col gap-2">
                  <h3 className="line-clamp-2 text-base font-bold text-slate-900">{company.name}</h3>

                  <span className={"inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " + status.classes}>
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </span>

                  {isExpired && (
                    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700">
                      <Clock className="h-3 w-3" />
                      الاشتراك منتهي
                    </span>
                  )}
                </div>

                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Calendar className="h-3.5 w-3.5" />
                    {createdDate.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {company.status === "approved" && !isExpired && isPlatformAdmin && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1 border-amber-200 text-amber-700 hover:bg-amber-50"
                        disabled={subscriptionBusyId === company.id || selecting !== null}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleSubscriptionAction(company.id, "stop")
                        }}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        إيقاف
                      </Button>
                    )}

                    {(isExpired || company.status === "stopped") && isPlatformAdmin && (
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1 bg-violet-600 text-white hover:bg-violet-700"
                        disabled={subscriptionBusyId === company.id || selecting !== null}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleSubscriptionAction(company.id, "extend")
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        تمديد الاشتراك
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {companies.length === 0 && (
          <p className="mt-8 text-center text-sm text-slate-400">
            <Sparkles className="mx-auto mb-2 h-5 w-5 text-violet-300" />
            لا توجد شركات بعد — أضف أول شركة لك للبدء باستخدام النظام
          </p>
        )}
      </main>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>اضافة شركة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>اسم الشركة</Label>
            <Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} className="text-right" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleAddCompany} disabled={saving || !newCompanyName.trim()}>
              {saving ? "جاري الإنشاء..." : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
