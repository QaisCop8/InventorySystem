"use client"

import { useEffect, useRef } from "react"

/**
 * عند اختيار/تغيير العميل في حركة: يُجلب مندوب العميل (customers.salesman) ويُعيَّن في حقل المندوب.
 * عميل بلا مندوب ⇐ لا يتغيّر الحقل. فتح سند محفوظ (تحميل عميله) لا يغيّر مندوبه المحفوظ، ولا يعمل لسند مرحّل/ملغى.
 */
export function useCustomerDefaultSalesman({ recordId, accountId, locked, onSalesman }: {
  recordId: unknown
  accountId: unknown
  locked?: boolean
  onSalesman: (salesmanId: number) => void
}) {
  const onSalesmanRef = useRef(onSalesman)
  onSalesmanRef.current = onSalesman
  const seenRef = useRef<{ record: string; account: number } | null>(null)

  useEffect(() => {
    const record = String(recordId ?? "")
    const account = Number(accountId) || 0
    const seen = seenRef.current
    seenRef.current = { record, account }
    // سند آخر فُتح (أو أول تحميل): عميله المحمّل ليس اختياراً من المستخدم
    if (!seen || (record && seen.record !== record)) return
    if (locked || !account || account === seen.account) return
    let cancelled = false
    fetch(`/api/customers/default-salesman?account_id=${account}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const salesmanId = Number(data?.salesman_id) || 0
        if (!cancelled && salesmanId > 0) onSalesmanRef.current(salesmanId)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [recordId, accountId, locked])
}

/**
 * مندوب العميل مباشرة عند اختيار المستخدم للعميل (أوثق من مراقبة تغيّر الحقل في useCustomerDefaultSalesman،
 * التي قد تتخطّى الاختيار حين يتزامن مع تحميل/تبديل السند). يعيد null إن لم يكن للعميل مندوب.
 */
export async function fetchCustomerDefaultSalesman(accountId: unknown): Promise<number | null> {
  const account = Number(accountId) || 0
  if (account <= 0) return null
  try {
    const response = await fetch(`/api/customers/default-salesman?account_id=${account}`, { cache: "no-store" })
    const data = response.ok ? await response.json() : null
    const salesmanId = Number(data?.salesman_id) || 0
    return salesmanId > 0 ? salesmanId : null
  } catch {
    return null
  }
}
