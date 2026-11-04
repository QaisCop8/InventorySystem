"use client"

import { tr, appDir } from "@/lib/i18n"
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { Activity, Building2, CalendarDays, Loader2, LogIn, RefreshCw, Search, UserRound, Users, Wifi, WifiOff } from "lucide-react"

type ActivityUser = {
  db_name: string
  tenant_user_id: number
  company_id: number | null
  company_name: string | null
  user_email: string | null
  user_name: string | null
  last_login_at: string | null
  last_seen_at: string | null
  logged_out_at: string | null
  ip_address: string | null
  is_online: boolean
  logins_in_range: number
  active_days: number
}

type DailyRow = { day: string; visits: number; visitors: number; active_users: number }
type Summary = { online_now: number; active_today: number; visits_today: number; known_users: number }
type CompanyOption = { id: number; name: string }
type Filters = { company_id: string; from: string; to: string }
type StatusFilter = "all" | "online" | "inactive"

const emptyFilters: Filters = { company_id: "", from: "", to: "" }
const REFRESH_MS = 60_000

function formatDateTime(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function formatDay(value: string) {
  const [year, month, day] = value.split("-")
  return `${day}/${month}/${year}`
}

function lastActivity(user: ActivityUser) {
  const times = [user.last_seen_at, user.last_login_at].filter(Boolean).map((value) => new Date(value as string).getTime())
  return times.length ? Math.max(...times) : null
}

function idleLabel(user: ActivityUser) {
  if (user.is_online) return tr("متصل الآن")
  const last = lastActivity(user)
  if (!last) return tr("لا يوجد نشاط")
  const minutes = Math.max(1, Math.round((Date.now() - last) / 60_000))
  if (minutes < 60) return tr("آخر نشاط قبل {0} دقيقة", minutes)
  const hours = Math.round(minutes / 60)
  if (hours < 24) return tr("آخر نشاط قبل {0} ساعة", hours)
  return tr("آخر نشاط قبل {0} يوم", Math.round(hours / 24))
}

function StatusBadge({ user }: { user: ActivityUser }) {
  return user.is_online ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />{tr("نشط")}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
      <span className="h-2 w-2 rounded-full bg-slate-400" />{tr("غير نشط")}
    </span>
  )
}

export function SiteActivityReport({ companies }: { companies: CompanyOption[] }) {
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [applied, setApplied] = useState<Filters>(emptyFilters)
  const [status, setStatus] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const [users, setUsers] = useState<ActivityUser[]>([])
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [range, setRange] = useState({ from: "", to: "", window: 5 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async (nextFilters: Filters, quiet = false) => {
    if (!quiet) setLoading(true)
    setError("")
    const params = new URLSearchParams()
    if (nextFilters.company_id) params.set("company_id", nextFilters.company_id)
    if (nextFilters.from) params.set("from", nextFilters.from)
    if (nextFilters.to) params.set("to", nextFilters.to)
    try {
      const response = await fetch(`/api/management/admin/site-activity?${params.toString()}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || tr("تعذّر تحميل سجل الدخول للموقع"))
      setUsers(Array.isArray(data.users) ? data.users : [])
      setDaily(Array.isArray(data.daily) ? data.daily : [])
      setSummary(data.summary || null)
      setRange({ from: data.from, to: data.to, window: data.online_window_minutes || 5 })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("تعذّر تحميل سجل الدخول للموقع"))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => { void load(applied) }, [load, applied])

  // تحديث تلقائي كل دقيقة لحالة الاتصال
  useEffect(() => {
    const timer = window.setInterval(() => { void load(applied, true) }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load, applied])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setApplied({ ...filters })
  }

  const reset = () => {
    setFilters(emptyFilters)
    setApplied({ ...emptyFilters })
  }

  const counts = useMemo(() => ({
    all: users.length,
    online: users.filter((user) => user.is_online).length,
    inactive: users.filter((user) => !user.is_online).length,
  }), [users])

  const visibleUsers = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return users.filter((user) => {
      if (status === "online" && !user.is_online) return false
      if (status === "inactive" && user.is_online) return false
      if (!needle) return true
      return [user.user_name, user.user_email, user.company_name].some((value) => String(value || "").toLowerCase().includes(needle))
    })
  }, [users, status, search])

  const maxVisits = useMemo(() => Math.max(1, ...daily.map((row) => Math.max(row.visits, row.active_users))), [daily])
  const totals = useMemo(() => daily.reduce((sum, row) => ({ visits: sum.visits + row.visits, active: sum.active + row.active_users }), { visits: 0, active: 0 }), [daily])

  const stats = [
    { label: tr("متصل الآن"), value: summary?.online_now ?? 0, icon: Wifi, tone: "bg-emerald-50 text-emerald-700" },
    { label: tr("مستخدمون نشطون اليوم"), value: summary?.active_today ?? 0, icon: Activity, tone: "bg-sky-50 text-sky-700" },
    { label: tr("زيارات اليوم"), value: summary?.visits_today ?? 0, icon: LogIn, tone: "bg-violet-50 text-violet-700" },
    { label: tr("كل المستخدمين"), value: summary?.known_users ?? 0, icon: Users, tone: "bg-slate-100 text-slate-700" },
  ]

  return (
    <section dir={appDir()} className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-slate-800"><Activity className="h-5 w-5 text-violet-600" />{tr("سجل الدخول للموقع")}</h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{tr("النشط = استخدم النظام خلال آخر {0} دقائق ولم يسجّل خروجه. يتحدث كل دقيقة.", range.window)}</p>
          </div>
          <button type="button" onClick={() => void load(applied)} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{tr("تحديث")}
          </button>
        </header>

        <div className="grid grid-cols-2 gap-3 p-4 sm:p-5 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" /></span>
              <div className="min-w-0">
                <div className="truncate text-xs text-slate-500">{label}</div>
                <div className="text-xl font-bold tabular-nums text-slate-800">{value}</div>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="grid grid-cols-1 gap-3 border-t border-slate-100 p-4 sm:grid-cols-3 sm:p-5">
          <label className="min-w-0 space-y-1.5 text-xs font-semibold text-slate-600">
            <span>{tr("الشركة")}</span>
            <span className="relative block">
              <Building2 className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select value={filters.company_id} onChange={(event) => setFilters((current) => ({ ...current, company_id: event.target.value }))} className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white ps-9 pe-3 text-sm font-normal outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
                <option value="">{tr("كل الشركات")}</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </span>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-semibold text-slate-600">
            <span>{tr("من تاريخ")}</span>
            <input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-semibold text-slate-600">
            <span>{tr("إلى تاريخ")}</span>
            <input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button type="submit" disabled={loading} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white transition hover:bg-violet-800 disabled:opacity-60 sm:flex-none">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{tr(" تطبيق الفلاتر")}
            </button>
            <button type="button" disabled={loading} onClick={reset} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <RefreshCw className="h-4 w-4" />{tr(" مسح")}
            </button>
          </div>
        </form>
        {error && <p role="alert" className="m-4 mt-0 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* المستخدمون: نشط / غير نشط */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h3 className="flex items-center gap-2 font-bold text-slate-800"><Users className="h-4 w-4 text-violet-600" />{tr("المستخدمون")}</h3>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
              {([
                ["all", tr("الكل"), counts.all],
                ["online", tr("نشط"), counts.online],
                ["inactive", tr("غير نشط"), counts.inactive],
              ] as const).map(([value, label, count]) => (
                <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded-md px-2.5 py-1.5 ${status === value ? "bg-violet-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                  {label} <span className="tabular-nums opacity-80">({count})</span>
                </button>
              ))}
            </div>
          </div>
          <div className="border-b border-slate-100 p-3">
            <span className="relative block">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("الاسم أو البريد الإلكتروني أو الشركة")} className="h-9 w-full rounded-lg border border-slate-200 bg-white ps-9 pe-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
            </span>
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-violet-600" />{tr("جاري التحميل...")}</div>
          ) : visibleUsers.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-500"><UserRound className="h-8 w-8 text-slate-300" />{tr("لا يوجد مستخدمون مطابقون")}</div>
          ) : (
            <>
              <div className="space-y-3 p-3 md:hidden">
                {visibleUsers.map((user) => (
                  <article key={`${user.db_name}-${user.tenant_user_id}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-bold text-slate-800">{user.user_name || user.user_email || `#${user.tenant_user_id}`}</div>
                        <div className="truncate text-xs text-slate-500" dir="ltr">{user.user_email || "—"}</div>
                      </div>
                      <StatusBadge user={user} />
                    </div>
                    <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs">
                      <span className="text-slate-500">{tr("الشركة")}</span><span className="text-end font-semibold text-slate-700">{user.company_name || user.db_name}</span>
                      <span className="text-slate-500">{tr("آخر نشاط")}</span><span className="text-end text-slate-700">{idleLabel(user)}</span>
                      <span className="text-slate-500">{tr("آخر دخول")}</span><span className="text-end tabular-nums text-slate-700" dir="ltr">{formatDateTime(user.last_login_at)}</span>
                      <span className="text-slate-500">{tr("الزيارات / أيام النشاط")}</span><span className="text-end tabular-nums text-slate-700">{user.logins_in_range} / {user.active_days}</span>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[820px] text-start text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500"><tr>
                    <th className="px-4 py-3 text-start font-semibold">{tr("المستخدم")}</th>
                    <th className="px-4 py-3 text-start font-semibold">{tr("الشركة")}</th>
                    <th className="px-4 py-3 text-start font-semibold">{tr("الحالة")}</th>
                    <th className="px-4 py-3 text-start font-semibold">{tr("آخر نشاط")}</th>
                    <th className="px-4 py-3 text-start font-semibold">{tr("آخر دخول")}</th>
                    <th className="px-4 py-3 text-center font-semibold">{tr("الزيارات")}</th>
                    <th className="px-4 py-3 text-center font-semibold">{tr("أيام النشاط")}</th>
                    <th className="px-4 py-3 text-start font-semibold">IP</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleUsers.map((user) => (
                      <tr key={`${user.db_name}-${user.tenant_user_id}`} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3"><div className="font-semibold text-slate-800">{user.user_name || `#${user.tenant_user_id}`}</div><div className="text-xs text-slate-500" dir="ltr">{user.user_email || "—"}</div></td>
                        <td className="px-4 py-3">{user.company_name || user.db_name}</td>
                        <td className="px-4 py-3"><StatusBadge user={user} /></td>
                        <td className="px-4 py-3 text-xs text-slate-600">{idleLabel(user)}</td>
                        <td className="px-4 py-3 text-xs tabular-nums" dir="ltr">{formatDateTime(user.last_login_at)}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{user.logins_in_range}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{user.active_days}</td>
                        <td className="px-4 py-3 font-mono text-xs" dir="ltr">{user.ip_address || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* الزيارات اليومية */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h3 className="flex items-center gap-2 font-bold text-slate-800"><CalendarDays className="h-4 w-4 text-violet-600" />{tr("عدد الزيارات كل يوم")}</h3>
            {range.from && <p className="mt-1 text-xs text-slate-500" dir="ltr">{formatDay(range.from)} → {formatDay(range.to)}</p>}
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-violet-500" />{tr("زيارات (عمليات دخول)")}: <b className="tabular-nums text-slate-700">{totals.visits}</b></span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-sky-400" />{tr("مستخدمون نشطون")}</span>
            </div>
          </div>
          {loading ? (
            <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-violet-600" /></div>
          ) : (
            <div className="max-h-[640px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-xs text-slate-500 shadow-[0_1px_0_#e2e8f0]"><tr>
                  <th className="px-3 py-2 text-start font-semibold">{tr("التاريخ")}</th>
                  <th className="px-3 py-2 text-center font-semibold">{tr("الزيارات")}</th>
                  <th className="px-3 py-2 text-center font-semibold">{tr("الزوار")}</th>
                  <th className="px-3 py-2 text-center font-semibold">{tr("النشطون")}</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {daily.map((row) => (
                    <tr key={row.day} className={row.visits || row.active_users ? "" : "text-slate-400"}>
                      <td className="px-3 py-2">
                        <div className="tabular-nums text-xs" dir="ltr">{formatDay(row.day)}</div>
                        <div className="mt-1 space-y-0.5">
                          <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${(row.visits / maxVisits) * 100}%` }} />
                          <div className="h-1.5 rounded-full bg-sky-400" style={{ width: `${(row.active_users / maxVisits) * 100}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center font-semibold tabular-nums">{row.visits}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.visitors}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.active_users}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
