import { existsSync, statSync } from "node:fs"
import { join } from "node:path"

// مكان ملف APK لتطبيق أندرويد (android-app/): ANDROID_APK_URL (مثلاً إصدار GitHub "android-latest" الذي
// ينشره .github/workflows/build-android.yml) وإلا ملف محلي public/downloads/NoonERP-System.apk على الخادم.
export const LOCAL_APK_PATH = "/downloads/NoonERP-System.apk"

export function resolveAndroidApk(): { url: string; updatedAt: string | null } | null {
  const configured = String(process.env.ANDROID_APK_URL || "").trim()
  if (/^https:\/\//i.test(configured)) return { url: configured, updatedAt: null }
  const file = join(process.cwd(), "public", LOCAL_APK_PATH)
  if (existsSync(file)) return { url: LOCAL_APK_PATH, updatedAt: statSync(file).mtime.toISOString() }
  return null
}

// ───── تنزيل البرامج (2026-11-18): كاشير/مطعم ويندوز، تطبيقات أندرويد الثلاثة، وخدمة الكاشير CashService ─────
// ملفات ويندوز وCashService في public/downloads (يبنيها launchers/windows/build.mjs، وCashService مضغوطة من مشروعها).
// APK: ملف محلي public/downloads/<الاسم>.apk إن وُجد، وإلا إصدار GitHub «android-latest»: ANDROID_RELEASE_BASE_URL أو
// مجلد ANDROID_APK_URL نفسه (…/releases/download/android-latest/).
export type DownloadItem = { key: string; group: "windows" | "android" | "service"; label: string; hint: string; url: string | null; size: number | null; updatedAt: string | null }

type FileInfo = { url: string; size: number | null; updatedAt: string | null } | null
function localFile(path: string): FileInfo {
  const file = join(process.cwd(), "public", path)
  if (!existsSync(file)) return null
  const stat = statSync(file)
  return { url: path, size: stat.size, updatedAt: stat.mtime.toISOString() }
}

const DEFAULT_RELEASE_BASE = "https://github.com/QaisCop8/InventorySystem/releases/download/android-latest"
function releaseBase() {
  const explicit = String(process.env.ANDROID_RELEASE_BASE_URL || "").trim().replace(/\/+$/, "")
  if (/^https:\/\//i.test(explicit)) return explicit
  const apk = String(process.env.ANDROID_APK_URL || "").trim()
  if (/^https:\/\/.+\/[^/]+\.apk$/i.test(apk)) return apk.replace(/\/[^/]+\.apk$/i, "")
  // الافتراضي: إصدار android-latest في مستودع المشروع (عام — يُحدّثه .github/workflows/build-android.yml)
  return DEFAULT_RELEASE_BASE
}

export function listDownloads(): DownloadItem[] {
  const base = releaseBase()
  const apk = (name: string): FileInfo => localFile(`/downloads/${name}.apk`) || (base ? { url: `${base}/${name}.apk`, size: null, updatedAt: null } : null)
  const system = resolveAndroidApk()
  const items: [DownloadItem["key"], DownloadItem["group"], string, string, FileInfo][] = [
    ["windows-cashier", "windows", "كاشير ويندوز", "NoonERP-Cashier.exe — نافذة الكاشير وحدها، تعمل دون اتصال", localFile("/downloads/NoonERP-Cashier.exe")],
    ["windows-restaurant", "windows", "مطعم ويندوز", "NoonERP-Restaurant.exe — شاشة المطعم وحدها", localFile("/downloads/NoonERP-Restaurant.exe")],
    ["cash-service", "service", "خدمة الكاشير CashService", "الطباعة المباشرة، أجهزة الدفع PinPad، قارئ الشيكات — فك الضغط وشغّل CashierWinService.exe", localFile("/downloads/NoonERP-CashService.zip")],
    ["android-system", "android", "النظام — أندرويد", "NoonERP-System.apk — النظام كاملاً على الجوال", system ? { url: system.url, size: null, updatedAt: system.updatedAt } : apk("NoonERP-System")],
    ["android-cashier", "android", "الكاشير — أندرويد", "NoonERP-Cashier.apk", apk("NoonERP-Cashier")],
    ["android-restaurant", "android", "المطعم — أندرويد", "NoonERP-Restaurant.apk", apk("NoonERP-Restaurant")],
  ]
  return items.map(([key, group, label, hint, file]) => ({ key, group, label, hint, url: file?.url || null, size: file?.size ?? null, updatedAt: file?.updatedAt ?? null }))
}
