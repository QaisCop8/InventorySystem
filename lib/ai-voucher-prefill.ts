"use client"

// فاتورة مقروءة من مرفق في المساعد الذكي ⇐ تُفتح شاشة الفاتورة (مبيعات 12 / مشتريات 17) بسند جديد معبّأ للمراجعة.
// تُحفظ في sessionStorage حتى تُستهلك مرة واحدة من شاشة الفاتورة (sales-delivery ⇐ unified-sales-delivery).

export type VoucherPrefill = {
  vch_type: 12 | 17
  account_id: number | null
  account_name: string
  vch_date: string | null
  manual_voucher: string
  note: string
  lines: { product_id: number; unit_id: number | null; quantity: number; unit_price: number | null; discount_percent: number | null }[]
  unmatched?: string[]
  /** بعد التعبئة يُحفظ السند تلقائياً غير مرحّل (status 1) بنفس فحوصات شاشة الفاتورة، ويبقى معروضاً برقمه الجديد */
  autoSave?: boolean
}

const KEY = "ai-voucher-prefill"
const TTL_MS = 10 * 60_000
export const VOUCHER_PREFILL_EVENT = "ai-voucher-prefill"

/** نفس قيمة sessionStorage التي يقرؤها peekVoucherPrefill — لتمريرها لتبويب جديد (lib/new-tab-handoff) */
export function voucherPrefillSessionItems(prefill: VoucherPrefill): Record<string, string> {
  return { [KEY]: JSON.stringify({ ...prefill, created_at: Date.now() }) }
}

export function storeVoucherPrefill(prefill: VoucherPrefill) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...prefill, created_at: Date.now() })) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(VOUCHER_PREFILL_EVENT, { detail: { vch_type: prefill.vch_type } }))
}

/** المعلّق لهذا النوع (دون استهلاكه) */
export function peekVoucherPrefill(vchType: number): VoucherPrefill | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || "null")
    if (!value || Number(value.vch_type) !== Number(vchType)) return null
    if (Date.now() - Number(value.created_at || 0) > TTL_MS) { sessionStorage.removeItem(KEY); return null }
    return value as VoucherPrefill
  } catch {
    return null
  }
}

export function takeVoucherPrefill(vchType: number): VoucherPrefill | null {
  const value = peekVoucherPrefill(vchType)
  if (value) try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
  return value
}
