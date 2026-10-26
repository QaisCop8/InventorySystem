"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Building2, CalendarClock, Loader2, RefreshCw, Search, UserRound } from "lucide-react"

type LoginRow = {
  id: number
  user_email: string
  user_name: string | null
  company_id: number | null
  company_name: string | null
  login_type: "management" | "tenant" | "company-switch"
  ip_address: string | null
  logged_at: string
}

type CompanyOption = { id: number; name: string }
type Filters = { user: string; company_id: string; from: string; to: string }

const emptyFilters: Filters = { user: "", company_id: "", from: "", to: "" }
const loginTypeLabel: Record<LoginRow["login_type"], string> = {
  management: "دخول لوحة الإدارة",
  tenant: "دخول مباشر للشركة",
  "company-switch": "دخول عبر اختيار الشركة",
}

function formatLoginDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

export function UserLoginReport({ companies }: { companies: CompanyOption[] }) {
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [rows, setRows] = useState<LoginRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async (nextFilters: Filters) => {
    setLoading(true)
    setError("")
    const params = new URLSearchParams()
    if (nextFilters.user.trim()) params.set("user", nextFilters.user.trim())
    if (nextFilters.company_id) params.set("company_id", nextFilters.company_id)
    if (nextFilters.from) params.set("from", nextFilters.from)
    if (nextFilters.to) params.set("to", nextFilters.to)
    try {
      const response = await fetch(`/api/management/admin/login-audit?${params.toString()}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذّر تحميل سجل الدخول")
      setRows(Array.isArray(data.rows) ? data.rows : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذّر تحميل سجل الدخول")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(emptyFilters) }, [load])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void load(filters)
  }

  const reset = () => {
    setFilters(emptyFilters)
    void load(emptyFilters)
  }

  return (
    <section dir="rtl" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-slate-800"><CalendarClock className="h-5 w-5 text-violet-600" />سجل دخول المستخدمين</h2>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">الشركة ووقت الدخول لكل عملية تسجيل دخول ناجحة</p>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">آخر {rows.length} سجل</span>
      </header>

      <form onSubmit={submit} className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
        <label className="min-w-0 space-y-1.5 text-xs font-semibold text-slate-600">
          <span>المستخدم</span>
          <span className="relative block">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={filters.user} onChange={(event) => setFilters((current) => ({ ...current, user: event.target.value }))} placeholder="الاسم أو البريد الإلكتروني" className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-9 pl-3 text-sm font-normal outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </span>
        </label>
        <label className="min-w-0 space-y-1.5 text-xs font-semibold text-slate-600">
          <span>الشركة</span>
          <span className="relative block">
            <Building2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select value={filters.company_id} onChange={(event) => setFilters((current) => ({ ...current, company_id: event.target.value }))} className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pr-9 pl-3 text-sm font-normal outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
              <option value="">كل الشركات</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </span>
        </label>
        <label className="min-w-0 space-y-1.5 text-xs font-semibold text-slate-600">
          <span>من تاريخ</span>
          <input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
        </label>
        <label className="min-w-0 space-y-1.5 text-xs font-semibold text-slate-600">
          <span>إلى تاريخ</span>
          <input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" disabled={loading} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white transition hover:bg-violet-800 disabled:opacity-60 sm:flex-none">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} تطبيق الفلاتر
          </button>
          <button type="button" disabled={loading} onClick={reset} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className="h-4 w-4" /> مسح
          </button>
        </div>
      </form>

      {error && <p role="alert" className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-violet-600" />جاري تحميل سجل الدخول...</div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-500"><UserRound className="h-8 w-8 text-slate-300" />لا توجد سجلات مطابقة للفلاتر</div>
      ) : (
        <>
          <div className="space-y-3 p-3 md:hidden">
            {rows.map((row) => (
              <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-slate-800">{row.user_name || row.user_email}</div>
                    <div className="truncate text-xs text-slate-500" dir="ltr">{row.user_email}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">{loginTypeLabel[row.login_type] || row.login_type}</span>
                </div>
                <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs">
                  <span className="text-slate-500">الشركة</span><span className="text-left font-semibold text-slate-700">{row.company_name || "لوحة الإدارة"}</span>
                  <span className="text-slate-500">وقت الدخول</span><span className="text-left tabular-nums text-slate-700" dir="ltr">{formatLoginDate(row.logged_at)}</span>
                  <span className="text-slate-500">IP</span><span className="text-left font-mono text-slate-600" dir="ltr">{row.ip_address || "—"}</span>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr>
                <th className="px-4 py-3 font-semibold">المستخدم</th><th className="px-4 py-3 font-semibold">الشركة</th><th className="px-4 py-3 font-semibold">نوع الدخول</th><th className="px-4 py-3 font-semibold">وقت الدخول</th><th className="px-4 py-3 font-semibold">IP</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3"><div className="font-semibold text-slate-800">{row.user_name || "—"}</div><div className="text-xs text-slate-500" dir="ltr">{row.user_email}</div></td>
                  <td className="px-4 py-3">{row.company_name || "لوحة الإدارة"}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">{loginTypeLabel[row.login_type] || row.login_type}</span></td>
                  <td className="px-4 py-3 tabular-nums" dir="ltr">{formatLoginDate(row.logged_at)}</td>
                  <td className="px-4 py-3 font-mono text-xs" dir="ltr">{row.ip_address || "—"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          {rows.length === 500 && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">تظهر أول 500 نتيجة؛ أضف فلاتر لتحديد النتائج.</p>}
        </>
      )}
    </section>
  )
}
