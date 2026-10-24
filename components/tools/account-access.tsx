"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Eye, EyeOff, KeyRound, Loader2, Save, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { useNavigationGuard } from "@/lib/navigation-guard"

// صلاحيات المستخدمين على الحسابات (أدوات): كل الحسابات مسموحة افتراضياً؛ إلغاء "مسموح" يُخفي الحساب عن المستخدم
// في البحث والاختيار بالحركات والتقارير — لكل الفروع أو لفرع محدد. الحفظ يرسل الفروقات فقط (app/api/account-access).

type Row = { id: number; code: string; name: string; type: number; type_name: string | null; has_children: boolean; denied: boolean; denied_all_branches: boolean; denied_branch_ids: number[] | null }
type Option = { id: string | number; name: string; code?: string }

export default function AccountAccess() {
  const [users, setUsers] = useState<Option[]>([])
  const [branches, setBranches] = useState<Option[]>([])
  const [types, setTypes] = useState<ReportOption[]>([])
  const [restricted, setRestricted] = useState<Record<string, number>>({})
  const [userId, setUserId] = useState("")
  const [branchId, setBranchId] = useState("0")
  const [typeIds, setTypeIds] = useState<number[]>([])
  const [search, setSearch] = useState("")
  const [show, setShow] = useState<"all" | "allowed" | "denied">("all")
  const [rows, setRows] = useState<Row[]>([])
  const [allowed, setAllowed] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const original = useRef<Record<number, boolean>>({})

  const changes = useMemo(() => rows.filter((row) => allowed[row.id] !== original.current[row.id]), [rows, allowed])
  useNavigationGuard(() => changes.length > 0, (continueNavigation) => {
    void confirmYesNo("توجد تغييرات غير محفوظة على صلاحيات الحسابات. هل تريد المتابعة دون حفظ؟").then((ok) => { if (ok) continueNavigation() })
  })

  const loadMeta = useCallback(async () => {
    const response = await fetch("/api/account-access?meta=1", { cache: "no-store" })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setMessage({ type: "error", text: data.error || "تعذر تحميل البيانات" }); return }
    setUsers(data.users || []); setBranches(data.branches || []); setTypes(data.types || []); setRestricted(data.restricted || {})
  }, [])
  useEffect(() => { void loadMeta() }, [loadMeta])

  const load = useCallback(async () => {
    if (!userId) { setMessage({ type: "error", text: "اختر المستخدم أولاً" }); return }
    if (changes.length && !(await confirmYesNo("توجد تغييرات غير محفوظة ستُفقد. متابعة؟"))) return
    setLoading(true); setMessage(null)
    try {
      const query = new URLSearchParams({ user_id: userId, branch_id: branchId, types: typeIds.join(","), q: search.trim() })
      const response = await fetch(`/api/account-access?${query}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الحسابات")
      const list: Row[] = data.rows || []
      const state = Object.fromEntries(list.map((row) => [row.id, !row.denied]))
      original.current = state
      setRows(list); setAllowed(state)
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "تعذر تحميل الحسابات" })
    } finally { setLoading(false) }
  }, [userId, branchId, typeIds, search, changes.length])

  // تغيير المستخدم/الفرع يعيد التحميل (القائمة الحالية تخص اختياراً آخر)
  useEffect(() => { if (userId) void load() }, [userId, branchId]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = rows.filter((row) => show === "all" || (show === "allowed" ? allowed[row.id] : !allowed[row.id]))
  const setMany = (value: boolean) => setAllowed((current) => ({ ...current, ...Object.fromEntries(visible.filter((row) => !(Number(branchId) > 0 && row.denied_all_branches)).map((row) => [row.id, value])) }))

  const save = async () => {
    if (!changes.length) return
    setSaving(true); setMessage(null)
    try {
      const deny = changes.filter((row) => !allowed[row.id]).map((row) => row.id)
      const allow = changes.filter((row) => allowed[row.id]).map((row) => row.id)
      const response = await fetch("/api/account-access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, branch_id: Number(branchId), deny, allow }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الصلاحيات")
      original.current = { ...allowed }
      setRows((current) => [...current])
      setMessage({ type: "success", text: `تم الحفظ — منع ${deny.length} وسماح ${allow.length}. يسري على المستخدم عند تحديث شاشاته.` })
      void loadMeta()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "تعذر حفظ الصلاحيات" })
    } finally { setSaving(false) }
  }

  const deniedCount = rows.filter((row) => !allowed[row.id]).length
  const branchName = (id: number) => branches.find((branch) => Number(branch.id) === id)?.name || `فرع ${id}`

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-l from-emerald-700 via-teal-600 to-cyan-600 p-6 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/25"><KeyRound /></div>
          <div>
            <p className="text-xs font-bold text-emerald-100">أدوات</p>
            <h1 className="text-2xl font-black">صلاحيات المستخدمين على الحسابات</h1>
            <p className="mt-1 text-sm text-emerald-50/85">كل الحسابات مسموحة افتراضياً — الحساب غير المسموح لا يظهر للمستخدم في البحث والاختيار بالحركات والتقارير</p>
          </div>
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-1">
          <Label>المستخدم</Label>
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">— اختر المستخدم —</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name}{restricted[String(user.id)] ? ` (${restricted[String(user.id)]} ممنوع)` : ""}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>الفرع</Label>
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="0">كل الفروع</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </div>
        <ReportMultiChoice label="نوع الحساب" options={types} selected={typeIds} onChange={setTypeIds} placeholder="كل الأنواع" />
        <div className="space-y-1"><Label>بحث</Label><Input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load() }} placeholder="رمز الحساب أو اسمه" /></div>
        <div className="flex items-end"><Button className="h-10 w-full gap-2" onClick={() => void load()} disabled={loading || !userId}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}عرض الحسابات</Button></div>
      </section>

      {message && <p role={message.type === "error" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm font-semibold ${message.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message.text}</p>}

      {rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold">{rows.length} حساب</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">مسموح {rows.length - deniedCount}</span>
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">ممنوع {deniedCount}</span>
              {changes.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{changes.length} تغيير غير محفوظ</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={show} onChange={(event) => setShow(event.target.value as any)}>
                <option value="all">عرض الكل</option><option value="allowed">المسموح فقط</option><option value="denied">الممنوع فقط</option>
              </select>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setMany(true)}><Eye className="h-4 w-4" />سماح للمعروض</Button>
              <Button size="sm" variant="outline" className="gap-1 text-rose-700" onClick={() => setMany(false)}><EyeOff className="h-4 w-4" />منع المعروض</Button>
              <Button size="sm" className="gap-1" disabled={!changes.length || saving} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ</Button>
            </div>
          </div>
          <div className="max-h-[calc(100dvh-420px)] min-h-[300px] overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-[1] bg-white text-xs text-slate-500 shadow-sm">
                <tr><th className="w-24 p-2 text-center">مسموح</th><th className="p-2 text-right">رمز الحساب</th><th className="p-2 text-right">اسم الحساب</th><th className="p-2 text-right">نوع الحساب</th><th className="p-2 text-right">ملاحظات</th></tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const lockedByAll = Number(branchId) > 0 && row.denied_all_branches
                  const otherBranches = (row.denied_branch_ids || []).filter((id) => id !== Number(branchId))
                  return (
                    <tr key={row.id} className={`border-t ${allowed[row.id] ? "" : "bg-rose-50/50"}`}>
                      <td className="p-2 text-center">
                        <Checkbox checked={lockedByAll ? false : Boolean(allowed[row.id])} disabled={lockedByAll} onCheckedChange={(value) => setAllowed((current) => ({ ...current, [row.id]: value === true }))} aria-label={`السماح بالحساب ${row.name}`} />
                      </td>
                      <td className="p-2 font-mono text-xs">{row.code}</td>
                      <td className={`p-2 ${row.has_children ? "font-bold" : ""}`}>{row.name}</td>
                      <td className="p-2 text-xs text-slate-500">{row.type_name || "—"}</td>
                      <td className="p-2 text-xs text-slate-500">
                        {lockedByAll && <span className="text-rose-700">ممنوع على كل الفروع — عدّله من "كل الفروع"</span>}
                        {Number(branchId) === 0 && otherBranches.length > 0 && <span>ممنوع أيضاً في: {otherBranches.map(branchName).join("، ")}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!visible.length && <p className="p-8 text-center text-muted-foreground">لا توجد حسابات مطابقة</p>}
          </div>
        </section>
      )}
    </div>
  )
}
