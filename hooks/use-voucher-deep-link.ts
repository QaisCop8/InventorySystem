"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { voucherSection } from "@/lib/voucher-links"

// أنواع لا تُحفظ في voucher_header_tbl (طلب البضاعة الداخلي) — لا فحص للنوع
const NON_HEADER_TYPES = new Set([20])

/**
 * Open a report's voucher once, after its destination screen is ready.
 * رقم سند من نوع آخر بالرابط (مثلاً ?section=journal-vouchers&voucher_id=50 وهو فاتورة مبيعات) لا يُفتح في هذه الشاشة:
 * يُزال voucher_id من الرابط وتُستدعى onMismatch (سند جديد فارغ).
 */
export function useVoucherDeepLink(onOpen: (id: number) => void | Promise<void>, ready = true, type = 0, onMismatch?: () => void | Promise<void>) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const id = Number(params.get("voucher_id"))
  const section = params.get("section")
  const company = params.get("company")
  const opened = useRef<number | null>(null)
  const callback = useRef(onOpen)
  const mismatch = useRef(onMismatch)
  useEffect(() => { callback.current = onOpen; mismatch.current = onMismatch }, [onOpen, onMismatch])
  useEffect(() => {
    if (!ready || !Number.isSafeInteger(id) || id <= 0 || opened.current === id) return
    if (section !== voucherSection(type)) return
    if (company && sessionStorage.getItem("active_company_id") !== company) return
    opened.current = id
    if (NON_HEADER_TYPES.has(type)) { void callback.current(id); return }
    let cancelled = false
    void (async () => {
      const actual = await fetch(`/api/voucher-type?id=${id}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null)
      if (cancelled) return
      const actualType = actual?.vch_type == null ? null : Number(actual.vch_type)
      if (actualType == null || voucherSection(actualType) !== section) {
        const next = new URLSearchParams(params.toString())
        next.delete("voucher_id")
        router.replace(`${pathname}?${next.toString()}`)
        opened.current = null
        await mismatch.current?.()
        return
      }
      await callback.current(id)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ready, type, section, company])
}
