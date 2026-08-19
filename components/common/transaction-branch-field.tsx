"use client"

import { useEffect, useMemo, useState } from "react"
import { Label } from "@/components/ui/label"

interface BranchOption {
  id: number
  branch_code?: string
  branch_name: string
}

const FAMILY_BY_VOUCHER_TYPE: Record<number, string> = {
  1: "journal", 4: "receipt", 5: "payment", 6: "credit_note", 7: "debit_note",
  8: "stock_in", 9: "stock_out", 10: "internal_delivery", 11: "stock_use",
  12: "sales_invoice", 13: "sales_delivery", 14: "consignment_delivery",
  15: "consignment_return", 16: "sales_return", 17: "purchase_invoice",
  18: "purchase_delivery", 19: "purchase_return",
}

export default function TransactionBranchField({
  voucherType,
  family: familyProp,
  action = "create",
  value,
  onChange,
  disabled = false,
}: {
  voucherType?: number
  family?: string
  action?: "create" | "update"
  value: number | null | undefined
  onChange: (branchId: number) => void
  disabled?: boolean
}) {
  const family = familyProp || FAMILY_BY_VOUCHER_TYPE[Number(voucherType)]
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [defaultBranchId, setDefaultBranchId] = useState<number | null>(null)

  useEffect(() => {
    if (!family) return
    let cancelled = false
    fetch(`/api/transaction-permissions/branches?family=${family}&action=${action}`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data?.error || "تعذر تحميل الفروع المصرح بها")
        return data
      })
      .then((data) => {
        if (cancelled) return
        const options = Array.isArray(data.branches) ? data.branches : []
        setBranches(options)
        setDefaultBranchId(Number(data.default_branch_id) || null)
      })
      .catch(() => !cancelled && setBranches([]))
    return () => { cancelled = true }
  }, [action, family])

  const allowedIds = useMemo(() => new Set(branches.map((branch) => Number(branch.id))), [branches])
  useEffect(() => {
    if (value || branches.length === 0) return
    const next = defaultBranchId && allowedIds.has(defaultBranchId) ? defaultBranchId : Number(branches[0].id)
    if (next > 0) onChange(next)
  }, [allowedIds, branches, defaultBranchId, onChange, value])

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`transaction-branch-${voucherType}`}>الفرع *</Label>
      <select
        id={`transaction-branch-${voucherType}`}
        value={value ?? ""}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled || branches.length === 0}
        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100"
      >
        <option value="">اختر الفرع</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.branch_code ? `${branch.branch_code} - ` : ""}{branch.branch_name}</option>
        ))}
      </select>
    </div>
  )
}
