"use client"

import { appModeSection, OFFLINE_LAUNCH_KEYS } from "@/lib/app-mode"

// الدخول دون اتصال في تطبيقات الكاشير/المطعم (مشغّل ويندوز وتطبيقا أندرويد — lib/app-mode.ts):
// كل تشغيل للمشغّل يطلب الدخول من جديد. متصلاً: تُمسح الجلسة ويسجّل المستخدم الدخول عادياً. دون اتصال لا يمكن الدخول من
// الخادم، فتبقى الجلسة المحفوظة (الكاشير ينسخها لـlocalStorage — pos-cashier) وتُقفل بشاشة كلمة مرور تُطابَق محلياً مع
// بصمة PBKDF2 تُحفظ عند آخر دخول ناجح متصلاً (لا تُحفظ كلمة المرور نفسها). خارج وضع التطبيق لا يُحفظ شيء.

const STORE_KEY = "noon_offline_login"
const LOCK_KEY = OFFLINE_LAUNCH_KEYS.lock
const ITERATIONS = 150_000
const MAX_ENTRIES = 5

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

/** بعد دخول ناجح متصلاً (وضع التطبيق فقط): يحفظ بصمة كلمة المرور لفتح القفل لاحقاً دون اتصال */
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
