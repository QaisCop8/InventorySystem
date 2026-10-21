"use client"

import { useEffect, useState } from "react"
import { Cigarette, Loader2, PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

// عهدة الدخان في الكاشير (lib/pos-tobacco.ts): كميات لا مبالغ.
// mode "open": استلام — الكمية الافتتاحية لكل صنف دخان (مقترحة من تسليم الوردية السابقة عند الاستلام).
// mode "handover": تسليم — الافتتاحي − المباع = المتوقع، ويُدخل الكاشير الكمية الفعلية المسلَّمة (الفرق يظهر فوراً).
type Line = { product_id: number; product_code: string; product_name: string; unit_name: string; opening_qty: number; sold_qty: number; expected_qty: number; counted_qty: number | null }

const fmt = (value: number) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })

export function PosTobaccoDialog({ mode, pointId, onDone, onCancel }: { mode: "open" | "handover"; pointId: number; onDone: () => void; onCancel?: () => void }) {
  const [lines, setLines] = useState<Line[]>([])
  const [values, setValues] = useState<Record<number, string>>({})
  const [received, setReceived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    setLoading(true); setError("")
    fetch(`/api/pos/tobacco?point_id=${pointId}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل عهدة الدخان")
      if (!active) return
      const rows: Line[] = data.lines || []
      setLines(rows); setReceived(Boolean(data.received))
      setValues(Object.fromEntries(rows.map((row) => [row.product_id, String(mode === "open" ? row.opening_qty || "" : row.counted_qty ?? row.expected_qty)])))
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "تعذر تحميل عهدة الدخان"))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [pointId, mode])

  const number = (productId: number) => { const value = Number(values[productId]); return Number.isFinite(value) && value >= 0 ? value : 0 }
  const invalid = Object.values(values).some((value) => value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))

  const save = async () => {
    setSaving(true); setError("")
    try {
      const response = await fetch("/api/pos/tobacco", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, point_id: pointId, lines: lines.map((line) => mode === "open" ? { product_id: line.product_id, qty: number(line.product_id) } : { product_id: line.product_id, counted: number(line.product_id) }) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذر حفظ عهدة الدخان")
      onDone()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ عهدة الدخان")
    } finally { setSaving(false) }
  }

  // إلغاء الاستلام: الوردية بلا عهدة دخان (قد لا يكون مع هذا الكاشير دخان)
  const skip = async () => {
    setSaving(true); setError("")
    try {
      const response = await fetch("/api/pos/tobacco", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "skip", point_id: pointId }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذر إلغاء عهدة الدخان")
      onCancel?.()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إلغاء عهدة الدخان")
    } finally { setSaving(false) }
  }

  const totals = lines.reduce((sum, line) => {
    const counted = number(line.product_id)
    return { opening: sum.opening + line.opening_qty, sold: sum.sold + line.sold_qty, expected: sum.expected + line.expected_qty, counted: sum.counted + counted, diff: sum.diff + (counted - line.expected_qty) }
  }, { opening: 0, sold: 0, expected: 0, counted: 0, diff: 0 })

  return (
    <div className="fixed inset-0 z-[3002] grid place-items-center bg-slate-950/45 p-3" dir="rtl">
      <div role="dialog" aria-modal="true" aria-label={mode === "open" ? "استلام عهدة دخان" : "تسليم عهدة الدخان"} className="flex max-h-[90dvh] w-[min(760px,100%)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className={`flex items-center gap-3 px-5 py-3 text-white ${mode === "open" ? "bg-gradient-to-l from-amber-600 to-orange-600" : "bg-gradient-to-l from-rose-600 to-orange-600"}`}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15"><Cigarette className="h-5 w-5" /></span>
          <div>
            <h2 className="text-base font-bold">{mode === "open" ? "استلام عهدة دخان" : "تسليم عهدة الدخان"}</h2>
            <p className="text-xs text-white/85">{mode === "open"
              ? (received ? "الكميات مقترحة مما سلّمه الكاشير السابق — عدّلها حسب الموجود فعلاً" : "أدخل الكمية الافتتاحية لكل صنف دخان (بالوحدة الرئيسية)")
              : "المتوقع = الافتتاحي − المباع. أدخل الكمية الفعلية المسلَّمة لكل صنف — يُسلَّم الدخان قبل النقد"}</p>
          </div>
        </div>

        <div className="min-h-[180px] flex-1 overflow-auto p-4">
          {loading ? <div className="grid h-40 place-items-center text-sm text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div>
            : lines.length === 0 ? <div className="grid h-40 place-items-center rounded-xl border-2 border-dashed text-center text-sm text-slate-500">لا توجد أصناف دخان معرّفة — فعّل خيار "دخان" في بطاقة الصنف</div>
            : (
              <table className="w-full min-w-[560px] text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
                  <tr>
                    <th className="p-2 text-right">الصنف</th>
                    {mode === "handover" && <><th className="p-2 text-center">الافتتاحي</th><th className="p-2 text-center">المباع</th><th className="p-2 text-center">المتوقع</th></>}
                    <th className="p-2 text-center">{mode === "open" ? "الكمية الافتتاحية" : "المسلَّم فعلاً"}</th>
                    {mode === "handover" && <th className="p-2 text-center">الفرق</th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const diff = number(line.product_id) - line.expected_qty
                    return (
                      <tr key={line.product_id} className="border-t">
                        <td className="p-2"><b className="block">{line.product_name}</b><small className="font-mono text-xs text-slate-500">{line.product_code}{line.unit_name ? ` · ${line.unit_name}` : ""}</small></td>
                        {mode === "handover" && <>
                          <td className="p-2 text-center font-mono">{fmt(line.opening_qty)}</td>
                          <td className="p-2 text-center font-mono text-sky-700">{fmt(line.sold_qty)}</td>
                          <td className="p-2 text-center font-mono font-bold">{fmt(line.expected_qty)}</td>
                        </>}
                        <td className="p-2 text-center">
                          <input
                            type="number" inputMode="decimal" min={0} step="any" dir="ltr" autoFocus={index === 0}
                            value={values[line.product_id] ?? ""}
                            onChange={(event) => setValues((current) => ({ ...current, [line.product_id]: event.target.value }))}
                            onFocus={(event) => event.target.select()}
                            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const next = (event.currentTarget.closest("tr")?.nextElementSibling?.querySelector("input") as HTMLInputElement | null); if (next) next.focus(); else void save() } }}
                            className="h-9 w-28 rounded-lg border border-slate-200 bg-slate-50 px-2 text-center font-mono font-bold focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-100"
                          />
                        </td>
                        {mode === "handover" && <td className={`p-2 text-center font-mono font-bold ${Math.abs(diff) < 0.0001 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-amber-600"}`}>{diff > 0 ? "+" : ""}{fmt(diff)}</td>}
                      </tr>
                    )
                  })}
                </tbody>
                {mode === "handover" && (
                  <tfoot className="border-t-2 bg-slate-50 font-bold dark:bg-slate-800">
                    <tr><td className="p-2">الإجمالي</td><td className="p-2 text-center font-mono">{fmt(totals.opening)}</td><td className="p-2 text-center font-mono">{fmt(totals.sold)}</td><td className="p-2 text-center font-mono">{fmt(totals.expected)}</td><td className="p-2 text-center font-mono">{fmt(totals.counted)}</td><td className={`p-2 text-center font-mono ${Math.abs(totals.diff) < 0.0001 ? "text-emerald-600" : "text-rose-600"}`}>{fmt(totals.diff)}</td></tr>
                  </tfoot>
                )}
              </table>
            )}
          {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-slate-50 px-5 py-3 dark:bg-slate-800">
          <span className="text-xs text-slate-500">{mode === "open" ? "يجب استلام عهدة الدخان قبل البيع" : "بعد التسليم يكمل تسليم النقد"}</span>
          <div className="flex gap-2">
            {mode === "handover" && onCancel && <Button variant="outline" onClick={onCancel} disabled={saving}>إلغاء</Button>}
            {mode === "open" && <Button variant="outline" onClick={() => void skip()} disabled={saving} title="لا توجد عهدة دخان مع هذه الوردية">إلغاء</Button>}
            <Button onClick={() => void save()} disabled={saving || loading || invalid} className="bg-amber-600 hover:bg-amber-700">
              {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <PackageCheck className="ml-2 h-4 w-4" />}{mode === "open" ? "استلام" : "تسليم الدخان"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
