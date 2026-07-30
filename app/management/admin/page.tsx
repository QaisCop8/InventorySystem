"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Loader2, ShieldAlert, Check, X, ArrowRight, UserCheck, UserX, Ban, RefreshCw, Clock } from "lucide-react"

interface PendingCompany {
  id: number
  name: string
  status: string
  created_at: string
  requested_by_name: string
  requested_by_email: string
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
}

const isCompanyExpired = (company: AllCompany) =>
  !!company.expiry_date && new Date(company.expiry_date).getTime() < Date.now()

interface ManagedUser {
  id: number
  full_name: string
  email: string
  is_platform_admin: boolean
  is_active: boolean
  email_verified: boolean
  created_at: string
}

export default function ManagementAdminPage() {
  const [tab, setTab] = useState<"pending" | "companies" | "users">("pending")
  const [companies, setCompanies] = useState<PendingCompany[]>([])
  const [allCompanies, setAllCompanies] = useState<AllCompany[]>([])
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [subscriptionBusyId, setSubscriptionBusyId] = useState<number | null>(null)
  const [error, setError] = useState("")

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
      setError("تعذّر تحميل الشركات")
    } finally {
      setLoading(false)
    }
  }

  const loadAllCompanies = async () => {
    try {
      const res = await fetch("/api/management/companies")
      const data = await res.json()
      setAllCompanies(Array.isArray(data) ? data : [])
    } catch {
      setError("تعذّر تحميل جميع الشركات")
    }
  }

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/management/admin/users")
      const data = await res.json()
      setUsers(Array.isArray(data) ? data : [])
    } catch {
      setError("تعذّر تحميل المستخدمين")
    }
  }

  useEffect(() => {
    load()
    loadAllCompanies()
    loadUsers()
  }, [])

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
        setError(data.error || "تعذّر تنفيذ الإجراء")
        return
      }
      await loadAllCompanies()
    } catch {
      setError("تعذّر الاتصال بالخادم")
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
        setError(data.error || "تعذّر تحديث حالة المستخدم")
        return
      }
      await loadUsers()
    } catch {
      setError("تعذّر الاتصال بالخادم")
    } finally {
      setBusyId(null)
    }
  }

  const handleApprove = async (id: number) => {
    setBusyId(id)
    setError("")
    try {
      const res = await fetch(`/api/management/admin/companies/${id}/approve`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "تعذّر اعتماد الشركة")
        return
      }
      await load()
    } catch {
      setError("تعذّر الاتصال بالخادم")
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
        setError(data.error || "تعذّر رفض الشركة")
        return
      }
      await load()
    } catch {
      setError("تعذّر الاتصال بالخادم")
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
      <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
        <ShieldAlert className="h-12 w-12 text-red-400" />
        <p className="text-slate-600">لا تملك صلاحية الوصول لهذه الصفحة</p>
        <Link href="/management/companies" className="text-sm text-violet-600 hover:underline">
          العودة لشركاتي
        </Link>
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">لوحة التحكم</h1>
          <Link href="/management/companies" className="flex items-center gap-1 text-sm text-slate-500 hover:underline">
            <ArrowRight className="h-4 w-4" /> شركاتي
          </Link>
        </div>

        <div className="mb-6 flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 text-sm font-medium ${tab === "pending" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            الشركات بانتظار الموافقة
          </button>
          <button
            onClick={() => setTab("companies")}
            className={`px-4 py-2 text-sm font-medium ${tab === "companies" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            الشركات
          </button>
          <button
            onClick={() => setTab("users")}
            className={`px-4 py-2 text-sm font-medium ${tab === "users" ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"}`}
          >
            المستخدمون
          </button>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {tab === "pending" &&
          (companies.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">لا توجد شركات بانتظار الموافقة</div>
          ) : (
            <div className="space-y-3">
              {companies.map((company) => (
                <div key={company.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div>
                    <div className="font-semibold text-slate-800">{company.name}</div>
                    <div className="text-sm text-slate-500">
                      {company.requested_by_name} · {company.requested_by_email}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1 border-red-200 text-red-600 hover:bg-red-50" disabled={busyId === company.id} onClick={() => handleReject(company.id)}>
                      <X className="h-4 w-4" /> رفض
                    </Button>
                    <Button size="sm" className="gap-1" disabled={busyId === company.id} onClick={() => handleApprove(company.id)}>
                      {busyId === company.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} اعتماد
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {tab === "companies" &&
          (allCompanies.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">لا توجد شركات</div>
          ) : (
            <div className="space-y-3">
              {allCompanies.map((company) => {
                const expired = isCompanyExpired(company)
                const statusLabel =
                  company.status === "approved"
                    ? "معتمدة"
                    : company.status === "pending"
                      ? "بانتظار الموافقة"
                      : company.status === "rejected"
                        ? "مرفوضة"
                        : "موقوفة"
                const statusClasses =
                  company.status === "approved"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                    : company.status === "pending"
                      ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                      : company.status === "rejected"
                        ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                        : "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200"

                return (
                  <div key={company.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-slate-800">
                        {company.name}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses}`}>{statusLabel}</span>
                        {expired && (
                          <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                            <Clock className="h-3 w-3" /> الاشتراك منتهي
                          </span>
                        )}
                      </div>
                      {company.requested_by_name && (
                        <div className="text-sm text-slate-500">
                          {company.requested_by_name} · {company.requested_by_email}
                        </div>
                      )}
                      {company.expiry_date && (
                        <div className={"mt-1 flex items-center gap-1 text-sm " + (expired ? "font-medium text-rose-600" : "text-slate-500")}>
                          <Clock className="h-3.5 w-3.5" />
                          تاريخ انتهاء الاشتراك: {new Date(company.expiry_date).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
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
                          {company.status === "stopped" ? "إلغاء الإيقاف" : "إيقاف"}
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
                          تمديد الاشتراك
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

        {tab === "users" &&
          (users.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">لا يوجد مستخدمون</div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                      {user.full_name}
                      {user.is_platform_admin && (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
                          مسؤول المنصة
                        </span>
                      )}
                      {!user.is_active && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                          موقوف
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-500">{user.email}</div>
                  </div>
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
                        <UserX className="h-4 w-4" /> إيقاف
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4" /> تفعيل
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  )
}
