"use client"

import type { PrintDocument } from "./document"

// زر "واتساب" في شريط أدوات الحركات: يُعلَّم أن الطباعة التالية مُوجّهة لواتساب (مع حساب العميل) ثم يُستدعى
// مسار الطباعة المعتاد للشاشة (الذي يحفظ السند أولاً عند الحاجة ويبني مستند الطباعة). محرك الطباعة
// (print.ts) يلتقط العلامة ويرسل المستند لنافذة واتساب (VoucherWhatsAppHost) بدل الطابعة.

const ARM_TTL_MS = 30_000
let armed: { accountId: number | null; at: number } | null = null

export const VOUCHER_WHATSAPP_EVENT = "voucher-whatsapp-share"
export type VoucherWhatsAppDetail = { document: PrintDocument; accountId: number | null }

export function armVoucherWhatsApp(accountId: unknown) {
  armed = { accountId: Number(accountId) || null, at: Date.now() }
}

export function cancelVoucherWhatsApp() {
  armed = null
}

/** يُستهلك مرة واحدة: null إن لم يُطلب واتساب (أو انتهت مهلة الطلب). */
export function takeVoucherWhatsApp(): { accountId: number | null } | null {
  const current = armed
  armed = null
  if (!current || Date.now() - current.at > ARM_TTL_MS) return null
  return { accountId: current.accountId }
}

export function dispatchVoucherWhatsApp(detail: VoucherWhatsAppDetail) {
  window.dispatchEvent(new CustomEvent<VoucherWhatsAppDetail>(VOUCHER_WHATSAPP_EVENT, { detail }))
}
