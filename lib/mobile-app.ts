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
