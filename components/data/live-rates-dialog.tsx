"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type LiveRow = { currency_id: number; currency_code: string; currency_name: string; rate: number | null }
type Row = LiveRow & { current: number | null; value: string; selected: boolean }

/**
 * «جلب أسعار الصرف» في شاشة العملات: أسعار حية من open.er-api.com (/api/exchange-rates/live) مقابل عملة الأساس، تُعرض بجانب
 * السعر الحالي للمراجعة والتعديل، ثم تُحفظ المحددة كسعر اليوم (شراء = بيع = صرف) بنفس مسار «إضافة سعر صرف».
 */
export default function LiveRatesDialog({ open, onOpenChange, currentRates, saveRate, onSaved }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRates: Array<{ currency_id: number; exchange_rate: number }>
  saveRate: (currencyId: number, rate: number) => Promise<unknown>
  onSaved: (count: number) => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [meta, setMeta] = useState<{ base: string; updated_at: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/exchange-rates/live", { cache: "no-store" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || tr("تعذر جلب أسعار الصرف"))
      setMeta({ base: data.base, updated_at: data.updated_at })
      setRows((Array.isArray(data.rates) ? data.rates : []).map((row: LiveRow) => {
        const current = currentRates.find((item) => Number(item.currency_id) === row.currency_id)
        return { ...row, current: current ? Number(current.exchange_rate) : null, value: row.rate != null ? String(row.rate) : "", selected: row.rate != null }
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("تعذر جلب أسعار الصرف"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (open) void load() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const chosen = rows.filter((row) => row.selected && Number(row.value) > 0)
    if (!chosen.length) { setError(tr("اختر عملة واحدة على الأقل بسعر صحيح")); return }
    setSaving(true)
    setError("")
    try {
      for (const row of chosen) await saveRate(row.currency_id, Number(row.value))
      onSaved(chosen.length)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("تعذر حفظ أسعار الصرف"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent dir={appDir()} className="w-[calc(100vw-1rem)] max-w-3xl" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader><DialogTitle>{tr("جلب أسعار الصرف تلقائياً")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {tr("الأسعار مقابل عملة الأساس")} <b>{meta?.base || "-"}</b>{meta?.updated_at ? ` — ${tr("آخر تحديث")}: ${new Date(meta.updated_at).toLocaleString()}` : ""}. {tr("راجع الأسعار وعدّلها ثم احفظ المحددة كسعر اليوم.")}
        </p>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{tr("لا توجد عملات غير عملة الأساس")}</div>
        ) : (
          <div className="max-h-[55vh] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="w-10 p-2"><input type="checkbox" checked={rows.every((row) => row.selected)} onChange={(event) => setRows((current) => current.map((row) => ({ ...row, selected: event.target.checked && Number(row.value) > 0 })))} /></th>
                  <th className="p-2 text-start">{tr("العملة")}</th>
                  <th className="p-2 text-start">{tr("السعر الحالي")}</th>
                  <th className="p-2 text-start">{tr("السعر الجديد")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.currency_id} className="border-t">
                    <td className="p-2 text-center"><input type="checkbox" checked={row.selected} disabled={!(Number(row.value) > 0)} onChange={(event) => setRows((current) => current.map((item) => item.currency_id === row.currency_id ? { ...item, selected: event.target.checked } : item))} /></td>
                    <td className="p-2"><span className="font-mono font-bold">{row.currency_code}</span> — {row.currency_name}</td>
                    <td className="p-2 font-mono">{row.current != null ? row.current : "-"}</td>
                    <td className="p-2">
                      {row.rate == null && !row.value ? <span className="text-xs text-amber-700">{tr("غير متوفرة في الخدمة")}</span> : null}
                      <Input type="number" min={0.0001} step="0.0001" dir="ltr" value={row.value} className="h-8 w-36" onChange={(event) => setRows((current) => current.map((item) => item.currency_id === row.currency_id ? { ...item, value: event.target.value, selected: Number(event.target.value) > 0 } : item))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading || saving}><RefreshCw className="me-1 h-4 w-4" />{tr("إعادة الجلب")}</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{tr("إلغاء")}</Button>
          <Button onClick={() => void save()} disabled={saving || loading || !rows.some((row) => row.selected)}>{saving && <Loader2 className="me-1 h-4 w-4 animate-spin" />}{tr("حفظ المحدد كسعر اليوم")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
