"use client"

// الجانب المتصفح لموافقات الصلاحيات برمز التفعيل (lib/permission-approvals.ts): أي طلب لـ /api/pos/* أو /api/restaurant/*
// يُرفض بـ403 ومعه permission_required يفتح نافذة "لا يوجد لديك صلاحية - اسم الصلاحية" (PermissionApprovalHost)؛ بعد
// التحقق من الرمز يُعاد نفس الطلب تلقائياً مع رمز الموافقة في الترويسة x-permission-approval فتكمل العملية كما هي.

export type ApprovalScope = "pos" | "restaurant"
export type PermissionRequest = { scope: ApprovalScope; key: string; name: string; scopeId: number | null; message?: string }

export const APPROVAL_HEADER = "x-permission-approval"
const APPROVAL_REQUEST_HEADER = "x-approval-request"
const uniqueId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`)
const PAGE_READ_ID = `read-${uniqueId()}`.slice(0, 64)
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

/** موافقة محفوظة لم يستهلكها الخادم بعد؟ (الموافقة لمرة واحدة — يُسأل الخادم لأن المتصفح لا يعرف متى استُهلكت) */
async function storedApprovalStillValid(scope: ApprovalScope, key: string) {
  const entry = tokens.get(tokenKey(scope, key))
  if (!entry || entry.expires <= Date.now()) return false
  try {
    const response = await fetch("/api/permission-approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", tokens: [entry.token] }) })
    const data = await response.json().catch(() => ({}))
    if (response.ok && Array.isArray(data.valid) && data.valid.includes(entry.token)) return true
  } catch { /* بلا اتصال ⇐ تُطلب موافقة جديدة */ }
  tokens.delete(tokenKey(scope, key))
  return false
}

/** يفتح نافذة طلب رمز التفعيل؛ true عند التحقق من الرمز (رمز الموافقة محفوظ للطلب التالي الذي يحتاجه). */
export async function askPermissionApproval(request: Omit<PermissionRequest, "scopeId"> & { scopeId?: number | null }): Promise<boolean> {
  if (await storedApprovalStillValid(request.scope, request.key)) return true
  if (!asker) return false
  const id = tokenKey(request.scope, request.key)
  const existing = pendingAsks.get(id)
  if (existing) return existing
  const scopeId = request.scopeId ?? scopeProviders.get(request.scope)?.() ?? null
  const pending = asker({ ...request, scopeId }).finally(() => pendingAsks.delete(id))
  pendingAsks.set(id, pending)
  return pending
}

/** صلاحية من قائمة صلاحيات المستخدم المخزّنة (user_Access_List للفرع النشط)؛ null = غير معروفة (يقرر الخادم) */
export function storedPermissionGranted(userId: string | number | null | undefined, branchId: string | number | null | undefined, name: string): boolean | null {
  if (!userId || typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(`user_Access_List:${userId}:${branchId || "default"}`)
    const list = raw ? JSON.parse(raw) : null
    if (!Array.isArray(list)) return null
    const matches = list.filter((entry: any) => String(entry?.access_name || "").trim() === name)
    if (!matches.length) return null
    return matches.every((entry: any) => entry.is_granted === true || entry.is_granted === 1 || entry.is_granted === "true")
  } catch {
    return null
  }
}

/**
 * قبل فتح نافذة إجراء أو تنفيذه: الصلاحية ممنوحة ⇐ true؛ غير ممنوحة ⇐ نافذة رمز التفعيل أولاً (true بعد التحقق).
 * granted = null (غير معروفة) يُترك للخادم.
 */
export async function ensurePermissionBefore(request: Omit<PermissionRequest, "scopeId"> & { scopeId?: number | null }, granted: boolean | null): Promise<boolean> {
  if (granted !== false) return true
  return askPermissionApproval(request)
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
      // الخادم يستهلك الموافقة بأول طلب يستخدمها (لمرة واحدة): معرّف فريد لكل عملية حفظ، ومعرّف ثابت لقراءات هذه الصفحة
      // (بحث داخل نافذة الفواتير بعد الموافقة لا يطلب رمزاً جديداً؛ فتح النافذة مرة أخرى يطلبه لأن الفحص المسبق يجدها مستهلكة)
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase()
      headers.set(APPROVAL_REQUEST_HEADER, method === "GET" ? PAGE_READ_ID : uniqueId())
      return original(input, { ...init, headers })
    }
    const response = await send()
    if (response.status !== 403) return response
    const body = await response.clone().json().catch(() => null)
    const required = body?.permission_required
    if (!required?.scope || !required?.key) return response
    // رفض الخادم ⇐ أي موافقة محفوظة لهذه الصلاحية استُهلكت أو انتهت: تُحذف لتُطلب من جديد
    tokens.delete(tokenKey(String(required.scope), String(required.key)))
    const approved = await askPermissionApproval({ scope: required.scope, key: String(required.key), name: String(required.name || ""), message: String(body?.error || "") })
    // إلغاء ⇐ يعود الرفض الأصلي للشاشة فتعرض رسالتها كالمعتاد
    return approved ? send() : response
  }
}
