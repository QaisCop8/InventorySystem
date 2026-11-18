"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useMemo, useState } from "react"
import { Loader2, Search, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { normalizeArabicSearch } from "@/lib/arabic-search"

// صلاحيات المستخدمين على مستودع (lib/warehouse-access.ts): المؤشَّر مسموح له بحركات المستودع، وغير المؤشَّر ممنوع
// عند حفظ سندات المخزون والمبيعات/المشتريات والطلبيات. الافتراضي: الكل مسموح.
type Row = { user_id: string; name: string; username: string; allowed: boolean }

export function WarehouseUsersDialog({ warehouse, onClose }: { warehouse: { id: number; name: string } | null; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!warehouse) return
    let alive = true
    setLoading(true); setError(""); setQuery("")
    fetch(`/api/warehouses/${warehouse.id}/users`, { cache: "no-store" })
      .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data?.error || tr("تعذر تحميل المستخدمين")); return data })
      .then((data) => { if (alive) setRows(data.users || []) })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : tr("تعذر تحميل المستخدمين")) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [warehouse])

  const shown = useMemo(() => {
    const term = normalizeArabicSearch(query.trim())
    return term ? rows.filter((row) => normalizeArabicSearch(`${row.name} ${row.username}`).includes(term)) : rows
  }, [rows, query])
  const deniedCount = rows.filter((row) => !row.allowed).length
  const setAll = (allowed: boolean) => { const ids = new Set(shown.map((row) => row.user_id)); setRows((current) => current.map((row) => ids.has(row.user_id) ? { ...row, allowed } : row)) }

  const save = async () => {
    if (!warehouse) return
    setSaving(true); setError("")
    try {
      const response = await fetch(`/api/warehouses/${warehouse.id}/users`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ denied_user_ids: rows.filter((row) => !row.allowed).map((row) => row.user_id) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || tr("تعذر حفظ صلاحيات المستودع"))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("تعذر حفظ صلاحيات المستودع"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={warehouse !== null} onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent dir={appDir()} className="w-[calc(100vw-1rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" />{tr("صلاحيات المستخدمين — {0}", warehouse?.name || "")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{tr("المستخدم المؤشَّر يستطيع حفظ سندات المخزون والمبيعات والمشتريات والطلبيات على هذا المستودع. أزل التأشير لمنعه.")}</p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 ps-8" placeholder={tr("بحث عن مستخدم")} value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAll(true)}>{tr("تحديد الكل")}</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAll(false)}>{tr("إلغاء الكل")}</Button>
        </div>
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="max-h-[50vh] min-h-[160px] overflow-y-auto rounded-xl border">
          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
          ) : shown.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">{tr("لا يوجد مستخدمون")}</div>
          ) : shown.map((row) => (
            <label key={row.user_id} className={`flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50 ${row.allowed ? "" : "bg-rose-50/60 dark:bg-rose-950/20"}`}>
              <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={row.allowed}
                onChange={(event) => setRows((current) => current.map((item) => item.user_id === row.user_id ? { ...item, allowed: event.target.checked } : item))} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{row.name}</span>
                {row.username && row.username !== row.name && <span className="block truncate text-xs text-muted-foreground" dir="ltr">{row.username}</span>}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${row.allowed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{row.allowed ? tr("مسموح") : tr("ممنوع")}</span>
            </label>
          ))}
        </div>
        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">{deniedCount ? tr("{0} مستخدم ممنوع", deniedCount) : tr("كل المستخدمين مسموح لهم")}</span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={saving} onClick={onClose}>{tr("إلغاء")}</Button>
            <Button disabled={saving || loading} onClick={() => void save()}>{saving ? tr("جاري الحفظ...") : tr("حفظ")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
