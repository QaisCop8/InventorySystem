"use client"

import { useEffect, useState } from "react"

// محرر مراكز التكلفة الافتراضية (صف لكل نوع مركز تكلفة: المركز الافتراضي + الإلزام) — نفس بنية
// account_costcenters_tbl / product_costcenters_tbl / warehouse_costcenters_tbl.

export type CostCenterDefaultValue = { cost_center_type_id: number; default_cost_center_id: number | null; required_in_transactions: number }

const REQUIRED_OPTIONS = [
  { value: 1, label: "اختياري" },
  { value: 2, label: "اجباري" },
  { value: 3, label: "ممنوع" },
]

export default function CostCenterDefaultsEditor({ value, onChange, disabled }: {
  value: CostCenterDefaultValue[]
  onChange: (value: CostCenterDefaultValue[]) => void
  disabled?: boolean
}) {
  const [types, setTypes] = useState<{ id: number; name: string }[]>([])
  const [centers, setCenters] = useState<{ id: number; name: string; cost_type_id?: number; status?: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetch("/api/cost-center-types").then((r) => (r.ok ? r.json() : [])), fetch("/api/cost-centers").then((r) => (r.ok ? r.json() : []))])
      .then(([typeRows, centerRows]) => {
        if (cancelled) return
        setTypes((Array.isArray(typeRows) ? typeRows : []).filter((t: any) => Number(t.status ?? 1) !== 3).sort((a: any, b: any) => Number(a.id) - Number(b.id)))
        setCenters((Array.isArray(centerRows) ? centerRows : []).filter((c: any) => Number(c.status ?? 1) !== 3))
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const rowFor = (typeId: number) =>
    value.find((row) => Number(row.cost_center_type_id) === typeId) || { cost_center_type_id: typeId, default_cost_center_id: null, required_in_transactions: 1 }

  const patch = (typeId: number, changes: Partial<CostCenterDefaultValue>) => {
    const others = value.filter((row) => Number(row.cost_center_type_id) !== typeId)
    onChange([...others, { ...rowFor(typeId), ...changes }].sort((a, b) => a.cost_center_type_id - b.cost_center_type_id))
  }

  if (loading) return <div className="py-4 text-center text-xs text-slate-400">جاري تحميل مراكز التكلفة...</div>
  if (!types.length) return <div className="rounded-lg border border-dashed py-4 text-center text-xs text-slate-400">لا توجد أنواع مراكز تكلفة معرّفة</div>

  const selectClass = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-50"
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-emerald-50 text-emerald-900">
          <tr>
            <th className="p-2 text-right font-semibold">نوع المركز</th>
            <th className="p-2 text-right font-semibold">مركز التكلفة الافتراضي</th>
            <th className="w-28 p-2 text-right font-semibold">الإلزام</th>
          </tr>
        </thead>
        <tbody>
          {types.map((type) => {
            const row = rowFor(Number(type.id))
            const options = centers.filter((center) => Number(center.cost_type_id) === Number(type.id))
            return (
              <tr key={type.id} className="border-t">
                <td className="p-2 font-medium text-slate-700">{type.name}</td>
                <td className="p-2">
                  <select className={selectClass} disabled={disabled} value={row.default_cost_center_id ?? ""}
                    onChange={(event) => patch(Number(type.id), { default_cost_center_id: event.target.value ? Number(event.target.value) : null })}>
                    <option value="">— بلا —</option>
                    {options.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}
                  </select>
                </td>
                <td className="p-2">
                  <select className={selectClass} disabled={disabled} value={row.required_in_transactions}
                    onChange={(event) => patch(Number(type.id), { required_in_transactions: Number(event.target.value) })}>
                    {REQUIRED_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
