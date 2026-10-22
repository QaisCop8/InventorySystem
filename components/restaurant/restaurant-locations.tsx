"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Edit, LayoutGrid, Loader2, MapPin, Plus, RefreshCw, Search, Store, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { useFileAccess } from "@/components/auth/use-file-access"
import { useAuth } from "@/components/auth/auth-context"
import { useNavigationGuard } from "@/lib/navigation-guard"

type Location = {
  id: number; code: string; name: string; branch_id: number; branch_name?: string; pos_point_id: number | null
  pos_point_name?: string | null; sort_order: number; color: string | null; notes: string | null; status: number; tables_count?: number
}
type Option = { id: number; name: string; branch_id?: number }
type Form = { id: number; code: string; name: string; branch_id: string; pos_point_id: string; sort_order: string; color: string; notes: string; active: boolean }

const emptyForm = (branchId: number | null, code = ""): Form => ({
  id: 0, code, name: "", branch_id: branchId ? String(branchId) : "", pos_point_id: "none", sort_order: "0", color: "#0f766e", notes: "", active: true,
})
const toForm = (row: Location): Form => ({
  id: row.id, code: row.code, name: row.name, branch_id: String(row.branch_id), pos_point_id: row.pos_point_id ? String(row.pos_point_id) : "none",
  sort_order: String(row.sort_order ?? 0), color: row.color || "#0f766e", notes: row.notes || "", active: Number(row.status) !== 2,
})
const errorText = async (response: Response, fallback: string) => {
  const data = await response.json().catch(() => ({}))
  return String(data?.error || fallback)
}

export default function RestaurantLocations() {
  const can = useFileAccess("restaurant-locations")
  const canView = can("view"), canCreate = can("create"), canUpdate = can("update"), canDelete = can("delete")
  const { activeBranchId } = useAuth()
  const [rows, setRows] = useState<Location[]>([])
  const [branches, setBranches] = useState<Option[]>([])
  const [points, setPoints] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [branchFilter, setBranchFilter] = useState("all")
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm(null))
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const initialRef = useRef("")
  const nextCodeRef = useRef("")

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const [listRes, optionsRes] = await Promise.all([
        canView ? fetch("/api/restaurant/locations", { cache: "no-store" }) : Promise.resolve(null),
        fetch("/api/restaurant/locations?options=1", { cache: "no-store" }),
      ])
      if (listRes) {
        if (!listRes.ok) throw new Error(await errorText(listRes, "تعذر تحميل المواقع"))
        setRows(await listRes.json())
      }
      if (optionsRes.ok) {
        const options = await optionsRes.json()
        setBranches((options.branches || []).map((b: any) => ({ id: Number(b.id), name: String(b.branch_name || "") })))
        setPoints((options.points || []).map((p: any) => ({ id: Number(p.id), name: String(p.name || ""), branch_id: Number(p.branch_id) })))
        nextCodeRef.current = String(options.next_code || "")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل المواقع")
    } finally {
      setLoading(false)
    }
  }, [canView])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) =>
      (branchFilter === "all" || String(row.branch_id) === branchFilter) &&
      (!term || row.name.toLowerCase().includes(term) || row.code.toLowerCase().includes(term)))
  }, [rows, search, branchFilter])

  const dirty = open && JSON.stringify(form) !== initialRef.current
  useNavigationGuard(() => dirty, (continueNavigation) => {
    void confirmYesNo("توجد تغييرات غير محفوظة على الموقع. هل تريد المتابعة دون حفظ؟").then((ok) => { if (ok) { setOpen(false); continueNavigation() } })
  })

  const openForm = (value: Form) => {
    setForm(value); initialRef.current = JSON.stringify(value); setFormError(""); setOpen(true)
  }
  const closeForm = async () => {
    if (dirty && !(await confirmYesNo("توجد تغييرات غير محفوظة. هل تريد الإغلاق دون حفظ؟"))) return
    setOpen(false)
  }

  const save = async () => {
    if (!form.name.trim()) { setFormError("اسم الموقع مطلوب"); return }
    if (!form.branch_id) { setFormError("الفرع مطلوب"); return }
    setSaving(true); setFormError("")
    try {
      const response = await fetch("/api/restaurant/locations", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id || undefined, code: form.code, name: form.name, branch_id: Number(form.branch_id),
          pos_point_id: form.pos_point_id === "none" ? null : Number(form.pos_point_id), sort_order: Number(form.sort_order) || 0,
          color: form.color, notes: form.notes, status: form.active ? 1 : 2,
        }),
      })
      if (!response.ok) throw new Error(await errorText(response, "تعذر حفظ الموقع"))
      initialRef.current = JSON.stringify(form)
      setOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذر حفظ الموقع")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: Location) => {
    if (!(await confirmYesNo(`حذف الموقع "${row.name}"؟`))) return
    const response = await fetch(`/api/restaurant/locations?id=${row.id}`, { method: "DELETE" })
    if (!response.ok) { setError(await errorText(response, "تعذر حذف الموقع")); return }
    await load()
  }

  const branchPoints = points.filter((point) => String(point.branch_id) === form.branch_id)
  const readOnly = form.id ? !canUpdate : !canCreate

  return (
    <div dir="rtl" className="flex h-full flex-col gap-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-teal-700 to-emerald-600 p-4 text-white shadow">
        <div className="flex items-center gap-3">
          <MapPin className="h-8 w-8" />
          <div>
            <h1 className="text-xl font-bold">مواقع المطعم</h1>
            <p className="text-sm text-teal-50">الصالات والطوابق والمناطق الخارجية — لكل موقع فرعه ونقطة البيع التي يُدفع عليها حساب طاولاته</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="ml-1 h-4 w-4" />تحديث</Button>
          {canCreate && <Button size="sm" className="bg-white text-teal-800 hover:bg-teal-50" onClick={() => openForm(emptyForm(activeBranchId, nextCodeRef.current))}><Plus className="ml-1 h-4 w-4" />إضافة موقع</Button>}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9" placeholder="بحث بالاسم أو الرمز" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="الفرع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفروع</SelectItem>
            {branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!canView && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">لا توجد لديك صلاحية استعلام مواقع المطاعم.</div>}

      {loading ? (
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm" style={{ borderTopColor: row.color || undefined, borderTopWidth: 4 }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-bold">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.code}</div>
                </div>
                <Badge variant={Number(row.status) === 2 ? "secondary" : "default"}>{Number(row.status) === 2 ? "موقوف" : "نشط"}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1"><Store className="h-4 w-4 text-muted-foreground" />{row.branch_name || "-"}</div>
                <div className="flex items-center gap-1"><LayoutGrid className="h-4 w-4 text-muted-foreground" />{row.tables_count ?? 0} طاولة</div>
                <div className="col-span-2 text-muted-foreground">نقطة البيع: {row.pos_point_name || <span className="text-amber-600">غير محددة (لا يمكن الدفع)</span>}</div>
              </div>
              <div className="mt-auto flex justify-end gap-2">
                {(canUpdate || canView) && <Button size="sm" variant="outline" onClick={() => openForm(toForm(row))}><Edit className="ml-1 h-4 w-4" />{canUpdate ? "تعديل" : "عرض"}</Button>}
                {canDelete && <Button size="sm" variant="outline" className="text-red-600" onClick={() => void remove(row)}><Trash2 className="ml-1 h-4 w-4" />حذف</Button>}
              </div>
            </div>
          ))}
          {canView && !filtered.length && <div className="col-span-full rounded-xl border border-dashed p-10 text-center text-muted-foreground">لا توجد مواقع معرّفة</div>}
        </div>
      )}

      <Dialog open={open} onOpenChange={(value) => { if (!value) void closeForm() }}>
        <DialogContent dir="rtl" className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "تعديل موقع" : "إضافة موقع"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>الرمز</Label><Input value={form.code} disabled={readOnly} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="تلقائي" /></div>
            <div className="space-y-1"><Label>اسم الموقع *</Label><Input value={form.name} disabled={readOnly} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الصالة الرئيسية" autoFocus /></div>
            <div className="space-y-1">
              <Label>الفرع *</Label>
              <Select value={form.branch_id} disabled={readOnly} onValueChange={(value) => setForm({ ...form, branch_id: value, pos_point_id: "none" })}>
                <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>نقطة البيع (للدفع)</Label>
              <Select value={form.pos_point_id} disabled={readOnly} onValueChange={(value) => setForm({ ...form, pos_point_id: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {branchPoints.map((point) => <SelectItem key={point.id} value={String(point.id)}>{point.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>الترتيب</Label><Input type="number" min={0} value={form.sort_order} disabled={readOnly} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
            <div className="space-y-1"><Label>اللون</Label><Input type="color" className="h-10 p-1" value={form.color} disabled={readOnly} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>ملاحظات</Label><Textarea rows={2} value={form.notes} disabled={readOnly} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex items-center gap-2 sm:col-span-2"><Switch checked={form.active} disabled={readOnly} onCheckedChange={(value) => setForm({ ...form, active: value })} /><Label>نشط</Label></div>
          </div>
          {formError && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{formError}</div>}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => void closeForm()}>إغلاق</Button>
            {!readOnly && <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}حفظ</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
