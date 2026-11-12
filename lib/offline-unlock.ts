"use client"

import { appModeSection, OFFLINE_LAUNCH_KEYS } from "@/lib/app-mode"
import { POS_RESUME_KEY } from "@/lib/pos-offline"
import { activateCompany } from "@/lib/tenant-client"

// الدخول دون اتصال في تطبيقات الكاشير/المطعم (مشغّل ويندوز وتطبيقا أندرويد — lib/app-mode.ts). خارج وضع التطبيق لا يُحفظ شيء.
//   • بصمة PBKDF2 لكلمة المرور تُحفظ عند كل دخول ناجح متصلاً (لا تُحفظ كلمة المرور نفسها).
//   • نسخة من آخر جلسة (بيانات المستخدم والشركة والفرع) تُحفظ ما دام التطبيق مفتوحاً، ولا يمسحها تسجيل الخروج.
//   • كل تشغيل للمشغّل يُقفل الجلسة المحفوظة بشاشة كلمة المرور (components/app-mode-shell.tsx): البصمة المحلية أولاً ثم الخادم.
//   • صفحة الدخول دون اتصال (بعد تسجيل الخروج أو جلسة ممسوحة): نفس البريد/اسم المستخدم + كلمة مرور مطابقة للبصمة ⇐ تُستعاد
//     النسخة ويُفتح الكاشير دون اتصال، وعند عودة الاتصال يُعاد الدخول للخادم تلقائياً لمزامنة المبيعات (reconnectAfterOfflineLogin).

const STORE_KEY = "noon_offline_login"
const SNAPSHOT_KEY = "noon_offline_session"
const RELOGIN_KEY = "noon_offline_relogin"
const LOCK_KEY = OFFLINE_LAUNCH_KEYS.lock
const ITERATIONS = 150_000
const MAX_ENTRIES = 5
const SNAPSHOT_MAX_AGE = 7 * 24 * 60 * 60 * 1000
const SESSION_KEYS = ["erp_user", "erp_token", "erp_session", "erp_active_branch", "erp_active_department", "active_tenant_db", "active_company_id"]

type Entry = { salt: string; hash: string; iterations: number; savedAt: number }

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
const normalize = (identity: string) => identity.trim().toLowerCase()

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256)
  return new Uint8Array(bits)
}

function readEntries(): Record<string, Entry> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "{}")
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

/** بعد دخول ناجح متصلاً (وضع التطبيق فقط): يحفظ بصمة كلمة المرور للدخول لاحقاً دون اتصال */
export async function rememberOfflinePassword(identity: string, password: string) {
  try {
    if (!identity || !password || !appModeSection() || !crypto?.subtle) return
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const hash = await derive(password, salt, ITERATIONS)
    const entries = readEntries()
    entries[normalize(identity)] = { salt: toBase64(salt), hash: toBase64(hash), iterations: ITERATIONS, savedAt: Date.now() }
    const kept = Object.entries(entries).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX_ENTRIES)
    localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch { /* اختياري — فشله لا يمنع الدخول */ }
}

/** هل حُفظت بصمة لأحد هذه المعرّفات (البريد/اسم المستخدم)؟ */
export function hasOfflinePassword(identities: Array<string | null | undefined>) {
  const entries = readEntries()
  return identities.some((identity) => identity && entries[normalize(identity)])
}

export async function verifyOfflinePassword(identities: Array<string | null | undefined>, password: string) {
  const entries = readEntries()
  for (const identity of identities) {
    const entry = identity ? entries[normalize(identity)] : null
    if (!entry) continue
    try {
      const hash = toBase64(await derive(password, fromBase64(entry.salt), entry.iterations || ITERATIONS))
      if (hash === entry.hash) return true
    } catch { /* بصمة تالفة */ }
  }
  return false
}

export function offlineLockActive() {
  try { return sessionStorage.getItem(LOCK_KEY) === "1" } catch { return false }
}

export function releaseOfflineLock() {
  try { sessionStorage.removeItem(LOCK_KEY) } catch {}
}

/** شاشة القفل متصلاً بلا بصمة محلية مطابقة: التحقق من كلمة المرور على الخادم (حساب الإدارة) ثم حفظ البصمة */
export async function verifyPasswordOnline(email: string, password: string): Promise<"ok" | "wrong" | "offline"> {
  try {
    const response = await fetch("/api/management/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    if (!response.ok) return "wrong"
    await rememberOfflinePassword(email, password)
    return "ok"
  } catch {
    return "offline"
  }
}

/** نسخة الجلسة الحالية (وضع التطبيق فقط) — تُستدعى من غلاف التطبيق بعد الدخول */
export function saveSessionSnapshot() {
  try {
    if (!appModeSection()) return
    const keys: Record<string, string> = {}
    for (const key of SESSION_KEYS) {
      const value = sessionStorage.getItem(key) || localStorage.getItem(key)
      if (value) keys[key] = value
    }
    if (!keys.erp_user || !keys.erp_token || !keys.active_tenant_db) return
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ keys, savedAt: Date.now() }))
  } catch {}
}

/**
 * دخول دون اتصال من صفحة الدخول: يُقبل فقط لمستخدم آخر جلسة محفوظة (خلال 7 أيام) وبكلمة مرور مطابقة لبصمته.
 * ينجح ⇐ تُستعاد الجلسة وتُحفظ بيانات إعادة الدخول للخادم عند عودة الاتصال (هذا التشغيل فقط — sessionStorage).
 */
export async function loginOffline(identity: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const noConnection = "لا يوجد اتصال بالإنترنت"
  if (!appModeSection()) return { ok: false, error: noConnection }
  let snapshot: { keys: Record<string, string>; savedAt: number } | null = null
  try { snapshot = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "null") } catch { snapshot = null }
  if (!snapshot?.keys?.erp_user || Date.now() - Number(snapshot.savedAt || 0) > SNAPSHOT_MAX_AGE) {
    return { ok: false, error: `${noConnection} — لا توجد جلسة محفوظة على هذا الجهاز للدخول دون اتصال` }
  }
  let user: { id?: string | number; email?: string; username?: string } = {}
  try { user = JSON.parse(snapshot.keys.erp_user) } catch { user = {} }
  const wanted = normalize(identity)
  if (!user.id || ![user.email, user.username].some((value) => value && normalize(value) === wanted)) {
    return { ok: false, error: `${noConnection} — الدخول دون اتصال متاح فقط لآخر مستخدم سجّل الدخول على هذا الجهاز` }
  }
  if (!hasOfflinePassword([identity, user.email, user.username])) {
    return { ok: false, error: `${noConnection} — لم يُحفظ دخول دون اتصال لهذا المستخدم` }
  }
  if (!(await verifyOfflinePassword([identity, user.email, user.username], password))) {
    return { ok: false, error: "كلمة المرور غير صحيحة" }
  }
  const keys: Record<string, string> = { ...snapshot.keys, erp_session: JSON.stringify({ timestamp: Date.now(), rememberMe: false }) }
  for (const [key, value] of Object.entries(keys)) {
    sessionStorage.setItem(key, value)
    localStorage.setItem(key, value)
  }
  localStorage.setItem(POS_RESUME_KEY, `${user.id}@${keys.active_tenant_db}`)
  releaseOfflineLock()
  sessionStorage.setItem(RELOGIN_KEY, JSON.stringify({ email: user.email || identity, password, companyId: Number(keys.active_company_id) || 0 }))
  return { ok: true }
}

/**
 * بعد دخول دون اتصال من صفحة الدخول (جلسة الخادم كانت منتهية): عند عودة الاتصال يُعاد الدخول للخادم بنفس البيانات ثم تُختار
 * الشركة نفسها، فتعمل المزامنة. "failed" ⇐ يجب تسجيل الخروج والدخول يدوياً.
 */
export async function reconnectAfterOfflineLogin(): Promise<"none" | "done" | "offline" | "failed"> {
  let pending: { email: string; password: string; companyId: number } | null = null
  try { pending = JSON.parse(sessionStorage.getItem(RELOGIN_KEY) || "null") } catch { pending = null }
  if (!pending) return "none"
  const login = await verifyPasswordOnline(pending.email, pending.password)
  if (login === "offline") return "offline"
  sessionStorage.removeItem(RELOGIN_KEY)
  if (login === "wrong" || !pending.companyId) return "failed"
  const result = await activateCompany(pending.companyId)
  return result.success ? "done" : "failed"
}
