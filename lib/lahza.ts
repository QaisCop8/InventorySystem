// بوابة الدفع لحظة (Lahza) — https://docs.lahza.io
//   initialize: POST /transaction/initialize ⇒ authorization_url (صفحة الدفع) + reference
//   verify:     GET  /transaction/verify/:reference ⇒ data.status = "success" عند نجاح الدفع
// المبلغ بأصغر وحدة للعملة (×100). وضع الاختبار = مفتاح sk_test_... (بطاقة الاختبار: 4111 1111 1111 1111، 03/30، CVV 004).
// متغيرات البيئة: LAHZA_SECRET_KEY (إلزامي، للتحقق بالخادم)، LAHZA_PUBLIC_KEY (لنافذة الدفع المنبثقة؛ بدونه يُحوَّل
// المستخدم لصفحة الدفع)، LAHZA_API_URL (اختياري، افتراضياً https://api.lahza.io).

export const LAHZA_CURRENCIES = ["ILS", "USD", "JOD"] as const
export type LahzaCurrency = (typeof LAHZA_CURRENCIES)[number]

const apiUrl = () => String(process.env.LAHZA_API_URL || "https://api.lahza.io").replace(/\/$/, "")
const secretKey = () => String(process.env.LAHZA_SECRET_KEY || "").trim()

export const isLahzaConfigured = () => Boolean(secretKey())
/** المفتاح العام (pk_test_/pk_live_) لنافذة الدفع المنبثقة في المتصفح — LAHZA_PUBLIC_KEY */
export const lahzaPublicKey = () => String(process.env.LAHZA_PUBLIC_KEY || "").trim()
export const isLahzaTestMode = () => secretKey().startsWith("sk_test")
export const toMinorUnits = (amount: number) => Math.round(Number(amount) * 100)

async function lahzaRequest(path: string, init: RequestInit = {}) {
  if (!isLahzaConfigured()) throw new Error("بوابة الدفع لحظة غير مفعّلة على الخادم (LAHZA_SECRET_KEY)")
  const response = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) },
    cache: "no-store",
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body || body.status === false) {
    throw new Error(`Lahza ${response.status}: ${String(body?.message || "طلب غير ناجح")}`)
  }
  return body
}

export async function initializeLahzaTransaction(input: {
  email: string
  amount: number
  currency: LahzaCurrency
  reference: string
  callbackUrl: string
  firstName?: string
  metadata?: Record<string, unknown>
}): Promise<{ authorizationUrl: string; reference: string }> {
  const body = await lahzaRequest("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: String(toMinorUnits(input.amount)),
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      first_name: input.firstName,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    }),
  })
  const authorizationUrl = String(body?.data?.authorization_url || "")
  if (!authorizationUrl) throw new Error("لم تُرجع بوابة الدفع رابط صفحة الدفع")
  return { authorizationUrl, reference: String(body?.data?.reference || input.reference) }
}

export type LahzaVerification = { status: string; amountMinor: number; currency: string; reference: string; gatewayResponse: string; paidAt: string | null }

export async function verifyLahzaTransaction(reference: string): Promise<LahzaVerification> {
  const body = await lahzaRequest(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" })
  const data = body?.data || {}
  return {
    status: String(data.status || ""),
    amountMinor: Number(data.amount || 0),
    currency: String(data.currency || "").toUpperCase(),
    reference: String(data.reference || reference),
    gatewayResponse: String(data.gateway_response || data.message || ""),
    paidAt: data.paid_at ? String(data.paid_at) : null,
  }
}
