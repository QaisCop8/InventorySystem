"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Search, ShieldCheck, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"

// صلاحيات مستخدمي الفرع (زر في بطاقة الفرع بشاشة التعريفات): تحديد/إلغاء المستخدمين الذين يعملون بالفرع
// (user_branches عبر /api/branches/[id]/users). المستخدم "غير المقيَّد" يصل لكل الفروع — إلغاء تحديده
// يمنحه كل الفروع الأخرى صراحةً؛ ولا يُسمح بإزالة آخر فرع لمستخدم (الخادم يرفض برسالة واضحة).
type BranchUser = { user_id: string; username: string; full_name: string; unrestricted: boolean; has_access: boolean; branch_count: number }

export function BranchUsersDialog({ branch, onClose }: { branch: { id: number; branch_name: string }; onClose: () => void }) {
  const [users, setUsers] = useState<BranchUser[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true); setError("")
    fetch(`/api/branches/${branch.id}/users`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "تعذر تحميل المستخدمين")
        if (!active) return
        const list: BranchUser[] = data.users || []
        setUsers(list)
        setSelected(new Set(list.filter((user) => user.has_access).map((user) => user.user_id)))
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "تعذر تحميل المستخدمين"))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [branch.id])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? users.filter((user) => `${user.full_name} ${user.username}`.toLowerCase().includes(term)) : users
  }, [users, search])
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const setAll = (value: boolean) => setSelected((current) => { const next = new Set(current); for (const user of visible) value ? next.add(user.user_id) : next.delete(user.user_id); return next })
  const changed = users.some((user) => user.has_access !== selected.has(user.user_id))

  const save = async () => {
    setSaving(true); setError("")
    try {
      const response = await fetch(`/api/branches/${branch.id}/users`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: [...selected] }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الصلاحيات")
      setSaved(true)
      setTimeout(onClose, 700)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ الصلاحيات")
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[3000] grid place-items-center bg-slate-950/45 p-3" dir="rtl" onKeyDown={(event) => { if (event.key === "Escape" && !saving) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="صلاحيات المستخدمين" className="flex max-h-[88dvh] w-[min(560px,100%)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center gap-3 bg-gradient-to-l from-emerald-600 via-emerald-600 to-teal-600 px-5 py-4 text-white">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25"><ShieldCheck className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">صلاحيات المستخدمين</h2>
            <p className="truncate text-xs text-white/85">المستخدمون الذين يعملون في فرع «{branch.branch_name}»</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 hover:bg-white/25"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3 border-b bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم المستخدم..." className="h-10 w-full rounded-xl border border-slate-200 bg-white pr-9 pl-3 text-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900" />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-300"><Users className="ml-1 inline h-3.5 w-3.5" />{selected.size} من {users.length} مستخدم</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setAll(true)} className="rounded-lg px-2 py-1 font-bold text-emerald-700 hover:bg-emerald-50">تحديد الكل</button>
              <button type="button" onClick={() => setAll(false)} className="rounded-lg px-2 py-1 font-bold text-slate-600 hover:bg-slate-100">إلغاء الكل</button>
            </span>
          </div>
        </div>

        <div className="min-h-[200px] flex-1 overflow-y-auto p-3">
          {loading ? <div className="grid h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
            : visible.length === 0 ? <div className="grid h-40 place-items-center text-sm text-slate-500">لا يوجد مستخدمون</div>
            : (
              <div className="space-y-1.5">
                {visible.map((user) => {
                  const checked = selected.has(user.user_id)
                  return (
                    <label key={user.user_id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${checked ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-slate-200 hover:border-emerald-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}>
                      <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={checked} onChange={() => toggle(user.user_id)} />
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white">{(user.full_name || "?").trim().charAt(0)}</span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-sm text-slate-900 dark:text-slate-100">{user.full_name}</b>
                        <small className="text-xs text-slate-500">{user.username}</small>
                      </span>
                      {user.unrestricted && <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700" title="لا يوجد قيد فروع على هذا المستخدم">كل الفروع</span>}
                      {!user.unrestricted && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{user.branch_count} فرع</span>}
                    </label>
                  )
                })}
              </div>
            )}
          {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
          {saved && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">تم حفظ صلاحيات المستخدمين</p>}
        </div>

        <div className="flex items-center justify-center gap-2 border-t bg-white px-4 py-3 dark:bg-slate-900">
          <Button onClick={() => void save()} disabled={saving || loading || !changed} className="h-10 w-36 rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700">
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving} className="h-10 w-28 rounded-xl">إغلاق</Button>
        </div>
      </div>
    </div>
  )
}
