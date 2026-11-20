"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CompanyLicenseBar, LicenseRequestsPanel } from "@/components/management/company-license-admin"
import { PricingPanel } from "@/components/management/pricing-panel"
import { FeatureRequestsAdmin } from "@/components/management/feature-requests-admin"
import { ChangePasswordDialog } from "@/components/management/change-password-dialog"
import { Loader2, ShieldAlert, Check, X, ArrowRight, UserCheck, UserX, Ban, RefreshCw, Clock, Plus, Trash2, Edit, KeyRound, Database, Phone } from "lucide-react"
import { UserLoginReport } from "@/components/management/user-login-report"
import { SiteActivityReport } from "@/components/management/site-activity-report"
import { BackupsPanel } from "@/components/management/backups-panel"

interface PendingCompany {
  id: number
  name: string
  status: string
  created_at: string
  requested_by_name: string
  requested_by_email: string
  // بطاقة للمبيعات (شركة بانتظار الدفع): الاعتماد يسجّل دفعة يدوية ويكمل كإتمام الدفع
  lead_phone?: string | null
  lead_whatsapp?: string | null
  lead_notes?: string | null
  quote_total?: number
  quote_currency?: string
}

interface AllCompany {
  id: number
  name: string
  status: "pending" | "approved" | "rejected" | "stopped"
  created_at: string
  expiry_date?: string | null
  db_name?: string | null
  requested_by_name?: string | null
  requested_by_email?: string | null
  number_of_users?: number
  number_of_branches?: number
  number_of_pos_points?: number
  number_of_restaurant_locations?: number
  usage?: { users: number; branches: number; pos_points?: number; restaurant_locations?: number } | null
  storage_bytes?: number | null
  pending_license_requests?: number
}

const isCompanyExpired = (company: AllCompany) =>
  !!company.expiry_date && new Date(company.expiry_date).getTime() < Date.now()

const formatDatabaseStorage = (bytes?: number | null) => {
  if (bytes == null || !Number.isFinite(bytes)) return "غير متاح"
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${units[unitIndex]}`
}

interface ManagedUser {
  id: number
  full_name: string
  mobile?: string | null
  email: string
  is_platform_admin: boolean
  is_active: boolean
  email_verified: boolean
  created_at: string
}

interface AccessCategory {
  id: number
  name: string
}

interface AccessDefinition {
  id: number
  name: string
  category_id: number | null
  category_name: string | null
}

export default function ManagementAdminPage() {
  const [tab, setTab] = useState<"pending" | "companies" | "licenses" | "users" | "login-report" | "site-activity" | "permissions" | "pricing" | "feature-requests" | "backups">("pending")
  const [companies, setCompanies] = useState<PendingCompany[]>([])
  const [allCompanies, setAllCompanies] = useState<AllCompany[]>([])
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [subscriptionBusyId, setSubscriptionBusyId] = useState<number | null>(null)
  const [error, setError] = useState("")

  // تبويب "تعريف الصلاحيات" — الفئات (access_category) وعناصر الصلاحيات (access_list) بقاعدة
  // الإدارة، المصدر الوحيد للحقيقة لكل الشركات (تُزامَن نسخة منها تلقائياً لكل شركة عند كل تحميل
  // صفحة رئيسية، انظر lib/permissions.ts وsyncPermissionDefinitions).
  const [accessCategories, setAccessCategories] = useState<AccessCategory[]>([])
  const [accessDefinitions, setAccessDefinitions] = useState<AccessDefinition[]>([])
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newAccessName, setNewAccessName] = useState("")
  const [newAccessCategoryId, setNewAccessCategoryId] = useState("")
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState("")
  const [editingAccessId, setEditingAccessId] = useState<number | null>(null)
  const [editingAccessName, setEditingAccessName] = useState("")
  const [editingAccessCategoryId, setEditingAccessCategoryId] = useState("")
  const [permBusy, setPermBusy] = useState(false)

  const load = async () => {
    try {
      const res = await fetch("/api/management/admin/companies?status=pending")
      /*if (res.status === 403) {
        setForbidden(true)
        return
      }*/
      const data = await res.json()
      setCompanies(Array.isArray(data) ? data : [])
    } catch {
      setError(tr("تعذّر تحميل الشركات"))
    } finally {
      setLoading(false)
    }
  }

  const loadAllCompanies = async () => {
    try {
      const res = await fetch("/api/management/admin/companies?usage=1")
      const data = await res.json()
      setAllCompanies(Array.isArray(data) ? data : [])
    } catch {
      setError(tr("تعذّر تحميل جميع الشركات"))
    }
  }

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/management/admin/users")
      const data = await res.json()
      setUsers(Array.isArray(data) ? data : [])
    } catch {
      setError(tr("تعذّر تحميل المستخدمين"))
    }
  }

  const loadAccessCategories = async () => {
    try {
      const res = await fetch("/api/management/admin/access-definitions/categories")
      const data = await res.json()
      setAccessCategories(Array.isArray(data) ? data : [])
    } catch {
      setError(tr("تعذّر تحميل فئات الصلاحيات"))
    }
  }

  const loadAccessDefinitions = async () => {
    try {
      const res = await fetch("/api/management/admin/access-definitions")
      const data = await res.json()
      setAccessDefinitions(Array.isArray(data) ? data : [])
    } catch {
      setError(tr("تعذّر تحميل الصلاحيات"))
    }
  }

  // تحديث: إعادة جلب بيانات اللوحة وإعادة تحميل اللوحات المستقلة (التقارير/الأسعار/النسخ...) بتغيير مفتاحها
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refreshAll = async () => {
    setRefreshing(true)
    setError("")
    setRefreshKey((key) => key + 1)
    try {
      await Promise.all([load(), loadAllCompanies(), loadUsers(), loadAccessCategories(), loadAccessDefinitions()])
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    loadAllCompanies()
    loadUsers()
    loadAccessCategories()
    loadAccessDefinitions()
  }, [])

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return
    setPermBusy(true)
    setError("")
    try {
      const res = await fetch("/api/management/admin/access-definitions/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || tr("تعذّر إضافة الفئة"))
        return
      }
      setNewCategoryName("")
      await loadAccessCategories()
    } catch {
      setError(tr("تعذّر الاتصال بالخادم"))
    } finally {
      setPermBusy(false)
    }
  }

  const handleSaveCategory = async (id: number) => {
    if (!editingCategoryName.trim()) return
    setPermBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/management/admin/access-definitions/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingCategoryName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || tr("تعذّر تعديل الفئة"))
        return
      }
      setEditingCategoryId(null)
      await loadAccessCategories()
      await loadAccessDefinitions()
    } catch {
      setError(tr("تعذّر الاتصال بالخادم"))
    } finally {
      setPermBusy(false)
    }
  }

  const handleDeleteCategory = async (id: number) => {
    setPermBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/management/admin/access-definitions/categories/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || tr("تعذّر حذف الفئة"))
        return
      }
      await loadAccessCategories()
    } catch {
      setError(tr("تعذّر الاتصال بالخادم"))
    } finally {
      setPermBusy(false)
    }
  }

  const handleAddAccess = async () => {
    if (!newAccessName.trim()) return
    setPermBusy(true)
    setError("")
    try {
      const res = await fetch("/api/management/admin/access-definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newAccessName.trim(), category_id: newAccessCategoryId ? Number(newAccessCategoryId) : null }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || tr("تعذّر إضافة الصلاحية"))
        return
      }
      setNewAccessName("")
      setNewAccessCategoryId("")
      await loadAccessDefinitions()
    } catch {
      setError(tr("تعذّر الاتصال بالخادم"))
    } finally {
      setPermBusy(false)
    }
  }

  const handleSaveAccess = async (id: number) => {
    if (!editingAccessName.trim()) return
    setPermBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/management/admin/access-definitions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingAccessName.trim(),
          category_id: editingAccessCategoryId ? Number(editingAccessCategoryId) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || tr("تعذّر تعديل الصلاحية"))
        return
      }
      setEditingAccessId(null)
      await loadAccessDefinitions()
    } catch {
      setError(tr("تعذّر الاتصال بالخادم"))
    } finally {
      setPermBusy(false)
    }
  }

  const handleDeleteAccess = async (id: number) => {
    setPermBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/management/admin/access-definitions/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || tr("تعذّر حذف الصلاحية"))
        return
      }
      await loadAccessDefinitions()
    } catch {
      setError(tr("تعذّر الاتصال بالخادم"))
    } finally {
      setPermBusy(false)
    }
  }

  const handleSubscriptionAction = async (companyId: number, action: "stop" | "unstop" | "extend") => {
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
        setError(data.error || tr("تعذّر تنفيذ الإجراء"))
        return
      }
      await loadAllCompanies()
    } catch {
      setError(tr("تعذّر الاتصال بالخادم"))
    } finally {
      setSubscriptionBusyId(null)
    }
  }

  const handleToggleUser = async (user: ManagedUser) => {
    setBusyId(user.id)
    setError("")
    try {
      const res = await fetch(`/api/management/admin/users/${user.id}/${user.is_active ? "deactivate" : "activate"}`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || tr("تعذّر تحديث حالة المستخدم"))
        return
      }
      await loadUsers()
    } catch {
      setError(tr("تعذّر الاتصال بالخادم"))
    } finally {
      setBusyId(null)
    }
  }

  const handleApprove = async (id: number) => {
    setBusyId(id)
    setError("")
    try {
      const lead = companies.find((company) => company.id === id)?.lead_phone
      if (lead && !window.confirm(tr("اعتماد هذه الشركة يسجّل دفع الاشتراك (خارج النظام) ويفعّلها لسنة كاملة كأنه تم إتمام الدفع. متابعة؟"))) return
      const res = await fetch(`/api/management/admin/companies/${id}/approve`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || tr("تعذّر اعتماد الشركة"))
        return
      }
      await load()
    } catch {
      setError(tr("تعذّر الاتصال بالخادم"))
    } finally {
      setBusyId(null)
    }
  }

  const handleReject = async (id: number) => {
    setBusyId(id)
    setError("")
    try {
      const res = await fetch(`/api/management/admin/companies/${id}/reject`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || tr("تعذّر رفض الشركة"))
        return
      }
      await load()
    } catch {
      setError(tr("تعذّر الاتصال بالخادم"))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div dir={appDir()} className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
        <ShieldAlert className="h-12 w-12 text-red-400" />
        <p className="text-slate-600">{tr("لا تملك صلاحية الوصول لهذه الصفحة")}</p>
        <Link href="/management/companies" className="text-sm text-violet-600 hover:underline">
          {tr("العودة لشركاتي")}
        </Link>
      </div>
    )
  }

  return (
    <div dir={appDir()} className="min-h-screen bg-slate-50 px-3 py-5 sm:px-6 sm:py-10">
      <div className="w-full">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800">{tr("لوحة التحكم")}</h1>
            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {tr("تحديث")}
            </button>
          </div>
          <Link href="/management/companies" className="flex items-center gap-1 text-sm text-slate-500 hover:underline">
            <ArrowRight className="h-4 w-4" />{tr(" شركاتي")}
          </Link>
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto border-b border-slate-200">
          <button
            onClick={() => setTab("pending")}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${tab === "pending" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            {tr("الشركات بانتظار الموافقة")}
          </button>
          <button
            onClick={() => setTab("companies")}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${tab === "companies" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            {tr("الشركات")}
          </button>
          <button
            onClick={() => setTab("licenses")}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${tab === "licenses" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            {tr("طلبات الترخيص")}
            {allCompanies.reduce((sum, company) => sum + Number(company.pending_license_requests || 0), 0) > 0 && (
              <span className="ms-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                {allCompanies.reduce((sum, company) => sum + Number(company.pending_license_requests || 0), 0)}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("users")}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${tab === "users" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            {tr("المستخدمون")}
          </button>
          <button
            onClick={() => setTab("login-report")}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${tab === "login-report" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            {tr("سجل الدخول")}
          </button>
          <button
            onClick={() => setTab("site-activity")}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${tab === "site-activity" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            {tr("سجل الدخول للموقع")}
          </button>
          <button
            onClick={() => setTab("permissions")}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${tab === "permissions" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            {tr("تعريف الصلاحيات")}
          </button>
          <button
            onClick={() => setTab("pricing")}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${tab === "pricing" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            {tr("الأسعار")}
          </button>
          <button
            onClick={() => setTab("feature-requests")}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${tab === "feature-requests" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            {tr("بريد الرسائل والتحسينات")}
          </button>
          <button
            onClick={() => setTab("backups")}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${tab === "backups" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            {tr("النسخ الاحتياطي")}
          </button>
        </div>
        {tab === "backups" && <BackupsPanel key={refreshKey} />}
        {tab === "pricing" && <PricingPanel key={refreshKey} />}
        {tab === "feature-requests" && <FeatureRequestsAdmin key={refreshKey} />}
        {tab === "login-report" && <UserLoginReport key={refreshKey} companies={allCompanies.map(({ id, name }) => ({ id, name }))} />}
        {tab === "site-activity" && <SiteActivityReport key={refreshKey} companies={allCompanies.map(({ id, name }) => ({ id, name }))} />}

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {tab === "pending" &&
          (companies.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">{tr("لا توجد شركات بانتظار الموافقة")}</div>
          ) : (
            <div className="space-y-3">
              {companies.map((company) => (
                <div key={company.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div>
                    <div className="font-semibold text-slate-800">{company.name}</div>
                    <div className="text-sm text-slate-500">
                      {company.requested_by_name} · {company.requested_by_email}
                    </div>
                    {company.lead_phone && (
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 ring-1 ring-amber-200">{tr("بطاقة للمبيعات — الاعتماد يعادل إتمام الدفع")}</span>
                        <div>
                          {tr("الهاتف: ")}<span dir="ltr">{company.lead_phone}</span>
                          {company.lead_whatsapp && <>{tr(" · واتساب: ")}<span dir="ltr">{company.lead_whatsapp}</span></>}
                          {company.quote_total != null && <>{tr(" · مبلغ الاشتراك: ")}<span dir="ltr" className="font-semibold">{Number(company.quote_total).toFixed(2)} {company.quote_currency}</span></>}
                        </div>
                        {company.lead_notes && <div className="text-slate-500">{tr("ملاحظات: ")}{company.lead_notes}</div>}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" className="gap-1 border-red-200 text-red-600 hover:bg-red-50" disabled={busyId === company.id} onClick={() => handleReject(company.id)}>
                      <X className="h-4 w-4" />{tr(" رفض")}
                    </Button>
                    <Button size="sm" className="gap-1" disabled={busyId === company.id} onClick={() => handleApprove(company.id)}>
                      {busyId === company.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{tr(" اعتماد")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {tab === "companies" &&
          (allCompanies.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">{tr("لا توجد شركات")}</div>
          ) : (
            <div className="space-y-3">
              {allCompanies.map((company) => {
                const expired = isCompanyExpired(company)
                const statusLabel =
                  company.status === "approved"
                    ? tr("معتمدة")
                    : company.status === "pending"
                      ? tr("بانتظار الموافقة")
                      : company.status === "rejected"
                        ? tr("مرفوضة")
                        : tr("موقوفة")
                const statusClasses =
                  company.status === "approved"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                    : company.status === "pending"
                      ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                      : company.status === "rejected"
                        ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                        : "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200"

                return (
                  <div key={company.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                        {company.name}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses}`}>{statusLabel}</span>
                        {expired && (
                          <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                            <Clock className="h-3 w-3" />{tr(" الاشتراك منتهي")}
                          </span>
                        )}
                      </div>
                      {company.requested_by_name && (
                        <div className="text-sm text-slate-500">
                          {company.requested_by_name} · {company.requested_by_email}
                        </div>
                      )}
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                        <Database className="h-3.5 w-3.5 text-violet-600" />
                        {tr("مساحة قاعدة البيانات: ")}<span dir="ltr" className="font-semibold tabular-nums text-slate-800">{formatDatabaseStorage(company.storage_bytes)}</span>
                      </div>
                      {company.expiry_date && (
                        <div className={"mt-1 flex items-center gap-1 text-sm " + (expired ? "font-medium text-rose-600" : "text-slate-500")}>
                          <Clock className="h-3.5 w-3.5" />
                          {tr("تاريخ انتهاء الاشتراك: ")}{new Date(company.expiry_date).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {(company.status === "approved" || company.status === "stopped") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className={
                            company.status === "stopped"
                              ? "gap-1 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                              : "gap-1 border-amber-200 text-amber-700 hover:bg-amber-50"
                          }
                          disabled={subscriptionBusyId === company.id}
                          onClick={() => handleSubscriptionAction(company.id, company.status === "stopped" ? "unstop" : "stop")}
                        >
                          {subscriptionBusyId === company.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : company.status === "stopped" ? (
                            <RefreshCw className="h-3.5 w-3.5" />
                          ) : (
                            <Ban className="h-3.5 w-3.5" />
                          )}
                          {company.status === "stopped" ? tr("إلغاء الإيقاف") : tr("إيقاف")}
                        </Button>
                      )}

                      {expired && (
                        <Button
                          size="sm"
                          className="gap-1 bg-violet-600 text-white hover:bg-violet-700"
                          disabled={subscriptionBusyId === company.id}
                          onClick={() => handleSubscriptionAction(company.id, "extend")}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          {tr("تمديد الاشتراك")}
                        </Button>
                      )}
                    </div>
                  </div>
                  <CompanyLicenseBar company={company} onSaved={() => void loadAllCompanies()} onError={setError} />
                  </div>
                )
              })}
            </div>
          ))}

        {tab === "licenses" && <LicenseRequestsPanel key={refreshKey} onChanged={() => void loadAllCompanies()} />}

        {tab === "users" &&
          (users.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">{tr("لا يوجد مستخدمون")}</div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                      {user.full_name}
                      {user.is_platform_admin && (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
                          {tr("مسؤول الموقع")}
                        </span>
                      )}
                      {!user.is_active && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                          {tr("موقوف")}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-500">{user.email}</div>
                    {user.mobile ? (
                      <a href={`tel:${user.mobile}`} className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline" dir="ltr">
                        <Phone className="h-3.5 w-3.5" />{user.mobile}
                      </a>
                    ) : (
                      <div className="mt-0.5 text-xs text-slate-400">{tr("لا يوجد رقم جوال")}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1 border-violet-200 text-violet-700 hover:bg-violet-50" onClick={() => setPasswordUser(user)}>
                    <KeyRound className="h-4 w-4" />{tr(" تغيير كلمة المرور")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={user.is_active ? "gap-1 border-red-200 text-red-600 hover:bg-red-50" : "gap-1 border-emerald-200 text-emerald-600 hover:bg-emerald-50"}
                    disabled={busyId === user.id}
                    onClick={() => handleToggleUser(user)}
                  >
                    {busyId === user.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : user.is_active ? (
                      <>
                        <UserX className="h-4 w-4" />{tr(" إيقاف")}
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4" />{tr(" تفعيل")}
                      </>
                    )}
                  </Button>
                  </div>
                </div>
              ))}
              <ChangePasswordDialog open={Boolean(passwordUser)} onOpenChange={(open) => { if (!open) setPasswordUser(null) }} target={passwordUser} />
            </div>
          ))}

        {tab === "permissions" && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-semibold text-slate-800">{tr("الفئات (")}{accessCategories.length})</h2>
              <div className="mb-3 flex gap-2">
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={tr("اسم الفئة الجديدة")}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                />
                <Button size="sm" disabled={permBusy || !newCategoryName.trim()} onClick={handleAddCategory}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {accessCategories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2 text-sm">
                    {editingCategoryId === category.id ? (
                      <input
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName(e.target.value)}
                        className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
                        autoFocus
                      />
                    ) : (
                      <span>{category.name}</span>
                    )}
                    <div className="flex gap-1">
                      {editingCategoryId === category.id ? (
                        <Button size="sm" variant="outline" disabled={permBusy} onClick={() => handleSaveCategory(category.id)}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingCategoryId(category.id)
                            setEditingCategoryName(category.name)
                          }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50"
                        disabled={permBusy}
                        onClick={() => handleDeleteCategory(category.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-semibold text-slate-800">{tr("الصلاحيات (")}{accessDefinitions.length})</h2>
              <div className="mb-3 space-y-2">
                <input
                  value={newAccessName}
                  onChange={(e) => setNewAccessName(e.target.value)}
                  placeholder={tr("اسم الصلاحية الجديدة")}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                />
                <div className="flex gap-2">
                  <select
                    value={newAccessCategoryId}
                    onChange={(e) => setNewAccessCategoryId(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  >
                    <option value="">{tr("بلا فئة")}</option>
                    {accessCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" disabled={permBusy || !newAccessName.trim()} onClick={handleAddAccess}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="max-h-[500px] space-y-2 overflow-y-auto">
                {accessDefinitions.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-100 p-2 text-sm">
                    {editingAccessId === item.id ? (
                      <div className="space-y-2">
                        <input
                          value={editingAccessName}
                          onChange={(e) => setEditingAccessName(e.target.value)}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                          autoFocus
                        />
                        <select
                          value={editingAccessCategoryId}
                          onChange={(e) => setEditingAccessCategoryId(e.target.value)}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                        >
                          <option value="">{tr("بلا فئة")}</option>
                          {accessCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" variant="outline" disabled={permBusy} onClick={() => handleSaveAccess(item.id)}>
                          <Check className="h-3.5 w-3.5" />{tr(" حفظ")}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <div>{item.name}</div>
                          <div className="text-xs text-slate-400">{item.category_name || tr("بلا فئة")}</div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingAccessId(item.id)
                              setEditingAccessName(item.name)
                              setEditingAccessCategoryId(item.category_id ? String(item.category_id) : "")
                            }}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-200 text-red-600 hover:bg-red-50"
                            disabled={permBusy}
                            onClick={() => handleDeleteAccess(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
