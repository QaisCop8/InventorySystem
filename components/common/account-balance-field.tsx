"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

type BalanceResult = { allowed: boolean; balance?: number; side?: string; currency_code?: string; credit_limit?: number }

const fmt = (value: number) => Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })

/**
 * حقل "الرصيد" في شاشات الحركات: رصيد الحساب المختار (عميل/مورد/حساب) من /api/accounts/[id]/balance.
 * يظهر الرقم فقط لمن يملك صلاحية "السماح بمشاهدة رصيد الحساب في الحركات"، وإلا يُعرض مخفياً.
 * refreshKey: يُعاد الحساب عند تغيّره (مثلاً بعد حفظ/ترحيل السند أو فتح سند آخر).
 */
export default function AccountBalanceField({ accountId, refreshKey, label = "الرصيد", className = "grid gap-1.5", inputClassName = "bg-slate-50", labelClassName }: {
  accountId: number | string | null | undefined
  refreshKey?: unknown
  label?: string
  className?: string
  inputClassName?: string
  labelClassName?: string
}) {
  const id = Number(accountId) || 0
  const [result, setResult] = useState<BalanceResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id) { setResult(null); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/accounts/${id}/balance`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!cancelled) setResult(data) })
      .catch(() => { if (!cancelled) setResult(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, refreshKey])

  const denied = result?.allowed === false
  const balance = Number(result?.balance || 0)
  const overLimit = Boolean(result?.credit_limit && result.credit_limit > 0 && balance > result.credit_limit)
  const text = !id ? "" : loading ? "..." : denied ? "••••••" : result ? `${fmt(balance)} ${result.side || ""} ${result.currency_code || ""}`.trim() : "—"
  const title = denied
    ? "لا تملك صلاحية «السماح بمشاهدة رصيد الحساب في الحركات»"
    : overLimit ? `الرصيد تجاوز حد الائتمان (${fmt(Number(result?.credit_limit))})` : "رصيد الحساب الحالي: كل السندات غير الملغاة"

  return (
    <div className={className}>
      {label && <Label className={labelClassName}>{label}</Label>}
      <Input
        value={text}
        readOnly
        tabIndex={-1}
        title={title}
        dir="ltr"
        className={`text-right font-mono ${inputClassName} ${denied ? "tracking-widest text-slate-400" : balance > 0.0005 ? "text-rose-700" : balance < -0.0005 ? "text-emerald-700" : ""} ${overLimit ? "border-rose-400" : ""}`}
      />
    </div>
  )
}
