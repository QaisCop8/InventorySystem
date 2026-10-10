"use client"

import { useEffect, useState } from "react"
import { Building2, Check, Edit, Loader2, Monitor, Save, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type Usage = { users: number; branches: number; pos_points?: number } | null | undefined
export type LicensedCompany = { id: number; number_of_users?: number; number_of_branches?: number; number_of_pos_points?: number; usage?: Usage; pending_license_requests?: number; status: string }

const RESOURCE_LABEL: Record<string, string> = { users: "المستخدمين", branches: "الفروع", pos_points: "نقاط البيع" }

function Meter({ icon: Icon, label, used, limit }: { icon: typeof Users; label: string; used: number | null; limit: number }) {
  const ratio = used == null ? 0 : Math.min(1, used / Math.max(limit, 1))
  const full = used != null && used >= limit
  return (
    <div className="min-w-[150px] flex-1">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</span>
        <span className={`font-bold ${full ? "text-rose-600" : "text-slate-700"}`}>{used ?? "—"} / {limit}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${full ? "bg-rose-500" : ratio > 0.8 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

/** شريط ترخيص الشركة بلوحة تحكم المنصة: الاستخدام مقابل الحد + تعديل الحد مباشرة. */
export function CompanyLicenseBar({ company, onSaved, onError }: { company: LicensedCompany; onSaved: () => void; onError: (message: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [users, setUsers] = useState(String(company.number_of_users ?? 1))
  const [branches, setBranches] = useState(String(company.number_of_branches ?? 1))
  const [posPoints, setPosPoints] = useState(String(company.number_of_pos_points ?? 0))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setUsers(String(company.number_of_users ?? 1)); setBranches(String(company.number_of_branches ?? 1)); setPosPoints(String(company.number_of_pos_points ?? 0)) }, [company.number_of_users, company.number_of_branches, company.number_of_pos_points])
  if (company.status === "pending" || company.status === "rejected") return null

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/management/admin/companies/${company.id}/license`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number_of_users: Number(users), number_of_branches: Number(branches), number_of_pos_points: Number(posPoints) }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { onError(data.error || "تعذر تحديث الترخيص"); return }
      setEditing(false); onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
      {editing ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600">عدد المستخدمين المرخّص
            <input type="number" min={1} value={users} onChange={(event) => setUsers(event.target.value)} className="mt-1 block w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-slate-600">عدد الفروع المرخّص
            <input type="number" min={1} value={branches} onChange={(event) => setBranches(event.target.value)} className="mt-1 block w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-slate-600">عدد نقاط البيع المرخّص
            <input type="number" min={0} value={posPoints} onChange={(event) => setPosPoints(event.target.value)} className="mt-1 block w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          </label>
          <Button size="sm" className="gap-1" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}حفظ</Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => setEditing(false)}>إلغاء</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <Meter icon={Users} label="المستخدمون" used={company.usage?.users ?? null} limit={Number(company.number_of_users ?? 1)} />
          <Meter icon={Building2} label="الفروع" used={company.usage?.branches ?? null} limit={Number(company.number_of_branches ?? 1)} />
          <Meter icon={Monitor} label="نقاط البيع" used={company.usage?.pos_points ?? null} limit={Number(company.number_of_pos_points ?? 0)} />
          {!!company.pending_license_requests && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">{company.pending_license_requests} طلب زيادة معلق</span>}
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing(true)}><Edit className="h-3.5 w-3.5" />تعديل الترخيص</Button>
        </div>
      )}
    </div>
  )
}

type LicenseRequest = {
  id: number; company_name: string; resource: "users" | "branches" | "pos_points"; quantity: number; approved_quantity: number | null
  limit_before: number | null; used_at_request: number | null; reason: string | null; status: "pending" | "approved" | "rejected"
  requested_by_name: string | null; requested_by_email: string | null; created_at: string; decided_at: string | null
  decision_note: string | null; decided_by_name: string | null; number_of_users: number; number_of_branches: number; number_of_pos_points?: number
}

/** تبويب "طلبات الترخيص": اعتماد طلبات زيادة المستخدمين/الفروع (بعدد قابل للتعديل) أو رفضها بسبب. */
export function LicenseRequestsPanel({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<LicenseRequest[]>([])
  const [filter, setFilter] = useState<"pending" | "all">("pending")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState<number | null>(null)
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [rejecting, setRejecting] = useState<number | null>(null)
  const [note, setNote] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/management/admin/license-requests${filter === "pending" ? "?status=pending" : ""}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الطلبات")
      setRows(data); setError("")
    } catch (cause: any) { setError(cause.message) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [filter])

  const decide = async (row: LicenseRequest, action: "approve" | "reject") => {
    setBusyId(row.id); setError("")
    try {
      const response = await fetch(`/api/management/admin/license-requests/${row.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, approved_quantity: Number(quantities[row.id] ?? row.quantity), note: action === "reject" ? note : undefined }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { setError(data.error || "تعذر معالجة الطلب"); return }
      setRejecting(null); setNote("")
      await load(); onChanged?.()
    } finally { setBusyId(null) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(["pending", "all"] as const).map((value) => (
          <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === value ? "bg-violet-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {value === "pending" ? "بانتظار الاعتماد" : "كل الطلبات"}
          </button>
        ))}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && rows.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">لا توجد طلبات</div>}
      {rows.map((row) => {
        const currentLimit = row.resource === "users" ? row.number_of_users : row.resource === "pos_points" ? Number(row.number_of_pos_points ?? 0) : row.number_of_branches
        const quantity = quantities[row.id] ?? String(row.quantity)
        return (
          <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  {row.company_name}
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200">زيادة {RESOURCE_LABEL[row.resource]} +{row.quantity}</span>
                  {row.status !== "pending" && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${row.status === "approved" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-rose-200"}`}>{row.status === "approved" ? `معتمد (+${row.approved_quantity})` : "مرفوض"}</span>}
                </div>
                <div className="mt-1 text-sm text-slate-500">{row.requested_by_name || "-"}{row.requested_by_email ? ` · ${row.requested_by_email}` : ""} · {new Date(row.created_at).toLocaleString("ar-EG")}</div>
                <div className="mt-1 text-sm text-slate-600">الحد عند الطلب: <b>{row.limit_before ?? "-"}</b> · المستخدم فعلياً: <b>{row.used_at_request ?? "-"}</b> · الحد الحالي: <b>{currentLimit}</b></div>
                {row.reason && <div className="mt-1 text-sm text-slate-600">السبب: {row.reason}</div>}
                {row.decision_note && <div className="mt-1 text-sm text-slate-500">ملاحظة القرار: {row.decision_note}{row.decided_by_name ? ` — ${row.decided_by_name}` : ""}</div>}
              </div>
              {row.status === "pending" && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-slate-500">العدد المعتمد
                    <input type="number" min={1} value={quantity} onChange={(event) => setQuantities((current) => ({ ...current, [row.id]: event.target.value }))} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                  </label>
                  <Button size="sm" variant="outline" className="gap-1 border-red-200 text-red-600 hover:bg-red-50" disabled={busyId === row.id} onClick={() => { setRejecting(row.id); setNote("") }}><X className="h-4 w-4" />رفض</Button>
                  <Button size="sm" className="gap-1" disabled={busyId === row.id} onClick={() => void decide(row, "approve")}>{busyId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}اعتماد</Button>
                </div>
              )}
            </div>
            {rejecting === row.id && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                <input autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="سبب الرفض (إجباري)" className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                <Button size="sm" variant="destructive" disabled={!note.trim() || busyId === row.id} onClick={() => void decide(row, "reject")}>تأكيد الرفض</Button>
                <Button size="sm" variant="outline" onClick={() => setRejecting(null)}>إلغاء</Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
