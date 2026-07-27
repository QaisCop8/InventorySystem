"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Loader2, ShieldAlert, Check, X, ArrowRight } from "lucide-react"

interface PendingCompany {
  id: number
  name: string
  status: string
  created_at: string
  requested_by_name: string
  requested_by_email: string
}

export default function ManagementAdminPage() {
  const [companies, setCompanies] = useState<PendingCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
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

  useEffect(() => {
    load()
  }, [])

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
          <h1 className="text-xl font-bold text-slate-800">الشركات بانتظار الموافقة</h1>
          <Link href="/management/companies" className="flex items-center gap-1 text-sm text-slate-500 hover:underline">
            <ArrowRight className="h-4 w-4" /> شركاتي
          </Link>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {companies.length === 0 ? (
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
        )}
      </div>
    </div>
  )
}
