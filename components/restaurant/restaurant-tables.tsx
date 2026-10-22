"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Circle, Edit, LayoutGrid, Loader2, Plus, RectangleHorizontal, RefreshCw, Search, Square, Trash2, Users } from "lucide-react"
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
import { useNavigationGuard } from "@/lib/navigation-guard"

type Location = { id: number; name: string; branch_id?: number; branch_name?: string }
type TableRow = {
  id: number; location_id: number; location_name: string; branch_name?: string; name: string; seats: number
  shape: string; sort_order: number; notes: string | null; status: number; occupied: boolean
}
type Form = { id: number; location_id: string; name: string; seats: string; shape: string; sort_order: string; notes: string; active: boolean }
type Bulk = { location_id: string; prefix: string; from: string; to: string; seats: string; shape: string }

const SHAPES = [
  { value: "square", label: "مربعة", icon: Square },
  { value: "round", label: "دائرية", icon: Circle },
  { value: "rect", label: "مستطيلة", icon: RectangleHorizontal },
]
const shapeIcon = (shape: string) => SHAPES.find((item) => item.value === shape)?.icon || Square
const errorText = async (response: Response, fallback: string) => String((await response.json().catch(() => ({})))?.error || fallback)

export default function RestaurantTables() {
  const can = useFileAccess("restaurant-tables")
  const canView = can("view"), canCreate = can("create"), canUpdate = can("update"), canDelete = can("delete")
  const [rows, setRows] = useState<TableRow[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [locationFilter, setLocationFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [form, setForm] = useState<Form | null>(null)
  const [bulk, setBulk] = useState<Bulk | null>(null)
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const initialRef = useRef("")

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const [locRes, tableRes] = await Promise.all([
        fetch("/api/restaurant/locations", { cache: "no-store" }),
        canView ? fetch("/api/restaurant/tables", { cache: "no-store" }) : Promise.resolve(null),
      ])
      if (locRes.ok) setLocations((await locRes.json()).map((row: any) => ({ id: Number(row.id), name: String(row.name), branch_id: Number(row.branch_id), branch_name: row.branch_name })))
      if (tableRes) {
        if (!tableRes.ok) throw new Error(await errorText(tableRes, "تعذر تحميل الطاولات"))
        setRows(await tableRes.json())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الطاولات")
    } finally {
      setLoading(false)
    }
  }, [canView])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => (locationFilter === "all" || String(row.location_id) === locationFilter) && (!term || row.name.toLowerCase().includes(term)))
  }, [rows, locationFilter, search])

  const grouped = useMemo(() => {
    const map = new Map<number, { name: string; branch?: string; rows: TableRow[] }>()
    for (const row of filtered) {
      const group = map.get(row.location_id) || { name: row.location_name, branch: row.branch_name, rows: [] }
      group.rows.push(row); map.set(row.location_id, group)
    }
    return [...map.entries()]
  }, [filtered])

  const dirty = (form !== null || bulk !== null) && JSON.stringify(form ?? bulk) !== initialRef.current
  useNavigationGuard(() => dirty, (continueNavigation) => {
    void confirmYesNo("توجد تغييرات غير محفوظة على الطاولة. هل تريد المتابعة دون حفظ؟").then((ok) => { if (ok) { setForm(null); setBulk(null); continueNavigation() } })
  })

  const defaultLocation = locationFilter !== "all" ? locationFilter : locations[0] ? String(locations[0].id) : ""
  const openForm = (value: Form) => { setForm(value); setBulk(null); initialRef.current = JSON.stringify(value); setFormError("") }
  const openBulk = () => {
    const value: Bulk = { location_id: defaultLocation, prefix: "طاولة", from: "1", to: "10", seats: "4", shape: "square" }
    setBulk(value); setForm(null); initialRef.current = JSON.stringify(value); setFormError("")
  }
  const close = async () => {
    if (dirty && !(await confirmYesNo("توجد تغييرات غير محفوظة. هل تريد الإغلاق دون حفظ؟"))) return
    setForm(null); setBulk(null)
  }

  const submit = async (method: "POST" | "PUT", body: unknown) => {
    setSaving(true); setFormError("")
    try {
      const response = await fetch("/api/restaurant/tables", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!response.ok) throw new Error(await errorText(response, "تعذر حفظ الطاولة"))
      const data = await response.json()
      if (data?.skipped) setError(`أُضيفت ${data.created} طاولة، وتم تخطي ${data.skipped} لوجود أسماء مكررة`)
      setForm(null); setBulk(null)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذر حفظ الطاولة")
    } finally {
      setSaving(false)
    }
  }

  const saveForm = () => {
    if (!form) return
    if (!form.location_id) { setFormError("اختر الموقع"); return }
    if (!form.name.trim()) { setFormError("اسم/رقم الطاولة مطلوب"); return }
    void submit(form.id ? "PUT" : "POST", {
      id: form.id || undefined, location_id: Number(form.location_id), name: form.name, seats: Number(form.seats) || 4,
      shape: form.shape, sort_order: Number(form.sort_order) || 0, notes: form.notes, status: form.active ? 1 : 2,
    })
  }
  const saveBulk = () => {
    if (!bulk) return
    if (!bulk.location_id) { setFormError("اختر الموقع"); return }
    void submit("POST", { bulk: true, location_id: Number(bulk.location_id), prefix: bulk.prefix, from: Number(bulk.from), to: Number(bulk.to), seats: Number(bulk.seats) || 4, shape: bulk.shape })
  }

  const remove = async (row: TableRow) => {
    if (!(await confirmYesNo(`حذف الطاولة "${row.name}" من ${row.location_name}؟`))) return
    const response = await fetch(`/api/restaurant/tables?id=${row.id}`, { method: "DELETE" })
    if (!response.ok) { setError(await errorText(response, "تعذر حذف الطاولة")); return }
    await load()
  }

  const readOnly = form ? (form.id ? !canUpdate : !canCreate) : false
  const locationSelect = (value: string, onChange: (value: string) => void, disabled = false) => (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="اختر الموقع" /></SelectTrigger>
      <SelectContent>{locations.map((loc) => <SelectItem key={loc.id} value={String(loc.id)}>{loc.name}{loc.branch_name ? ` — ${loc.branch_name}` : ""}</SelectItem>)}</SelectContent>
    </Select>
  )
  const shapeSelect = (value: string, onChange: (value: string) => void, disabled = false) => (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>{SHAPES.map((shape) => <SelectItem key={shape.value} value={shape.value}>{shape.label}</SelectItem>)}</SelectContent>
    </Select>
  )

  return (
    <div dir="rtl" className="flex h-full flex-col gap-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-amber-600 to-orange-500 p-4 text-white shadow">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-8 w-8" />
          <div>
            <h1 className="text-xl font-bold">طاولات المطعم</h1>
            <p className="text-sm text-amber-50">تعريف الطاولات لكل موقع: الاسم/الرقم، عدد المقاعد والشكل</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="ml-1 h-4 w-4" />تحديث</Button>
          {canCreate && <Button variant="secondary" size="sm" onClick={openBulk} disabled={!locations.length}><LayoutGrid className="ml-1 h-4 w-4" />إضافة مجموعة</Button>}
          {canCreate && <Button size="sm" className="bg-white text-orange-700 hover:bg-orange-50" disabled={!locations.length}
            onClick={() => openForm({ id: 0, location_id: defaultLocation, name: "", seats: "4", shape: "square", sort_order: "0", notes: "", active: true })}>
            <Plus className="ml-1 h-4 w-4" />إضافة طاولة</Button>}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9" placeholder="بحث باسم الطاولة" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="sm:w-64"><SelectValue placeholder="الموقع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المواقع</SelectItem>
            {locations.map((loc) => <SelectItem key={loc.id} value={String(loc.id)}>{loc.name}{loc.branch_name ? ` — ${loc.branch_name}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!locations.length && !loading && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">عرّف موقعاً واحداً على الأقل من شاشة "المواقع" قبل إضافة الطاولات.</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!canView && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">لا توجد لديك صلاحية استعلام طاولات المطاعم.</div>}

      {loading ? (
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-orange-600" /></div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([locationId, group]) => (
            <section key={locationId}>
              <h2 className="mb-2 text-base font-bold">{group.name} <span className="text-sm font-normal text-muted-foreground">{group.branch} · {group.rows.length} طاولة</span></h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {group.rows.map((row) => {
                  const Icon = shapeIcon(row.shape)
                  return (
                    <div key={row.id} className={`flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm ${Number(row.status) === 2 ? "opacity-60" : ""}`}>
                      <div className="flex items-center justify-between">
                        <Icon className="h-5 w-5 text-orange-600" />
                        {row.occupied ? <Badge className="bg-amber-500">مشغولة</Badge> : Number(row.status) === 2 ? <Badge variant="secondary">موقوفة</Badge> : null}
                      </div>
                      <div className="text-lg font-bold">{row.name}</div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground"><Users className="h-4 w-4" />{row.seats} مقاعد</div>
                      <div className="mt-auto flex gap-1">
                        <Button size="sm" variant="outline" className="flex-1 px-2" onClick={() => openForm({ id: row.id, location_id: String(row.location_id), name: row.name, seats: String(row.seats), shape: row.shape, sort_order: String(row.sort_order), notes: row.notes || "", active: Number(row.status) !== 2 })}><Edit className="h-4 w-4" /></Button>
                        {canDelete && <Button size="sm" variant="outline" className="flex-1 px-2 text-red-600" onClick={() => void remove(row)}><Trash2 className="h-4 w-4" /></Button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          {canView && !grouped.length && <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">لا توجد طاولات معرّفة</div>}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(value) => { if (!value) void close() }}>
        <DialogContent dir="rtl" className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id ? "تعديل طاولة" : "إضافة طاولة"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><Label>الموقع *</Label>{locationSelect(form.location_id, (value) => setForm({ ...form, location_id: value }), readOnly)}</div>
              <div className="space-y-1"><Label>اسم/رقم الطاولة *</Label><Input value={form.name} disabled={readOnly} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>عدد المقاعد</Label><Input type="number" min={1} max={99} value={form.seats} disabled={readOnly} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></div>
              <div className="space-y-1"><Label>الشكل</Label>{shapeSelect(form.shape, (value) => setForm({ ...form, shape: value }), readOnly)}</div>
              <div className="space-y-1"><Label>الترتيب</Label><Input type="number" min={0} value={form.sort_order} disabled={readOnly} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
              <div className="col-span-2 space-y-1"><Label>ملاحظات</Label><Textarea rows={2} value={form.notes} disabled={readOnly} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="col-span-2 flex items-center gap-2"><Switch checked={form.active} disabled={readOnly} onCheckedChange={(value) => setForm({ ...form, active: value })} /><Label>نشطة</Label></div>
            </div>
          )}
          {formError && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{formError}</div>}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => void close()}>إغلاق</Button>
            {!readOnly && <Button onClick={saveForm} disabled={saving}>{saving && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}حفظ</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulk !== null} onOpenChange={(value) => { if (!value) void close() }}>
        <DialogContent dir="rtl" className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto">
          <DialogHeader><DialogTitle>إضافة مجموعة طاولات</DialogTitle></DialogHeader>
          {bulk && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><Label>الموقع *</Label>{locationSelect(bulk.location_id, (value) => setBulk({ ...bulk, location_id: value }))}</div>
              <div className="col-span-2 space-y-1"><Label>بادئة الاسم</Label><Input value={bulk.prefix} onChange={(e) => setBulk({ ...bulk, prefix: e.target.value })} placeholder="طاولة" /></div>
              <div className="space-y-1"><Label>من رقم</Label><Input type="number" min={1} value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} /></div>
              <div className="space-y-1"><Label>إلى رقم</Label><Input type="number" min={1} value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value })} /></div>
              <div className="space-y-1"><Label>عدد المقاعد</Label><Input type="number" min={1} value={bulk.seats} onChange={(e) => setBulk({ ...bulk, seats: e.target.value })} /></div>
              <div className="space-y-1"><Label>الشكل</Label>{shapeSelect(bulk.shape, (value) => setBulk({ ...bulk, shape: value }))}</div>
              <p className="col-span-2 text-xs text-muted-foreground">مثال: "{bulk.prefix || "طاولة"} {bulk.from}" حتى "{bulk.prefix || "طاولة"} {bulk.to}". الأسماء الموجودة مسبقاً تُتخطّى.</p>
            </div>
          )}
          {formError && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{formError}</div>}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => void close()}>إغلاق</Button>
            <Button onClick={saveBulk} disabled={saving}>{saving && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
