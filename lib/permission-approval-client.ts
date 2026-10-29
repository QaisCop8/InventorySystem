"use client"

// الجانب المتصفح لموافقات الصلاحيات برمز التفعيل (lib/permission-approvals.ts): أي طلب لـ /api/pos/* أو /api/restaurant/*
// يُرفض بـ403 ومعه permission_required يفتح نافذة "لا يوجد لديك صلاحية - اسم الصلاحية" (PermissionApprovalHost)؛ بعد
// التحقق من الرمز يُعاد نفس الطلب تلقائياً مع رمز الموافقة في الترويسة x-permission-approval فتكمل العملية كما هي.

export type ApprovalScope = "pos" | "restaurant"
export type PermissionRequest = { scope: ApprovalScope; key: string; name: string; scopeId: number | null; message?: string }

export const APPROVAL_HEADER = "x-permission-approval"
const tokens = new Map<string, { token: string; expires: number }>()
const scopeProviders = new Map<ApprovalScope, () => number | null>()
let asker: ((request: PermissionRequest) => Promise<boolean>) | null = null
const pendingAsks = new Map<string, Promise<boolean>>()

const tokenKey = (scope: string, key: string) => `${scope}:${key}`

export function storeApprovalToken(scope: ApprovalScope, key: string, token: string, minutes: number) {
  // هامش دقيقة قبل انتهاء صلاحيته في الخادم
  tokens.set(tokenKey(scope, key), { token, expires: Date.now() + Math.max(1, minutes - 1) * 60_000 })
}

export function hasActiveApproval(scope: ApprovalScope, key: string) {
  const entry = tokens.get(tokenKey(scope, key))
  return Boolean(entry && entry.expires > Date.now())
}

function activeTokens() {
  const now = Date.now()
  const list: string[] = []
  for (const [key, entry] of tokens) {
    if (entry.expires > now) list.push(entry.token)
    else tokens.delete(key)
  }
  return list
}

/** نقطة البيع/الموقع الحالي لكل شاشة — إليه تُرسل رسالة رمز التفعيل */
export function setApprovalScopeProvider(scope: ApprovalScope, provider: () => number | null) {
  scopeProviders.set(scope, provider)
  return () => { if (scopeProviders.get(scope) === provider) scopeProviders.delete(scope) }
}

export function registerApprovalAsker(fn: (request: PermissionRequest) => Promise<boolean>) {
  asker = fn
  return () => { if (asker === fn) asker = null }
}

/** يفتح نافذة طلب رمز التفعيل؛ true عند التحقق من الرمز (رمز الموافقة محفوظ للطلبات التالية). */
export function askPermissionApproval(request: Omit<PermissionRequest, "scopeId"> & { scopeId?: number | null }): Promise<boolean> {
  if (hasActiveApproval(request.scope, request.key)) return Promise.resolve(true)
  if (!asker) return Promise.resolve(false)
  const id = tokenKey(request.scope, request.key)
  const existing = pendingAsks.get(id)
  if (existing) return existing
  const scopeId = request.scopeId ?? scopeProviders.get(request.scope)?.() ?? null
  const pending = asker({ ...request, scopeId }).finally(() => pendingAsks.delete(id))
  pendingAsks.set(id, pending)
  return pending
}

let installed = false
/** مرة واحدة: يضيف رموز الموافقة لطلبات الكاشير/المطعم ويعالج رفض الصلاحية بالنافذة ثم يعيد الطلب. */
export function installPermissionApprovalFetch() {
  if (installed || typeof window === "undefined") return
  installed = true
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (!/\/api\/(pos|restaurant)\//.test(url)) return original(input, init)
    const send = () => {
      const list = activeTokens()
      if (!list.length) return original(input, init)
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
      headers.set(APPROVAL_HEADER, list.join(","))
      return original(input, { ...init, headers })
    }
    const response = await send()
    if (response.status !== 403) return response
    const body = await response.clone().json().catch(() => null)
    const required = body?.permission_required
    if (!required?.scope || !required?.key) return response
    const approved = await askPermissionApproval({ scope: required.scope, key: String(required.key), name: String(required.name || ""), message: String(body?.error || "") })
    // إلغاء ⇐ يعود الرفض الأصلي للشاشة فتعرض رسالتها كالمعتاد
    return approved ? send() : response
  }
}
