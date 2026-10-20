// يُشغَّل بعد "npx cap add android" (المجلد android/ يُولَّد في كل بناء ولا يُحفظ في git):
// - صلاحيات الكاميرا (مسح الباركود من المتصفح) وحالة الشبكة.
// - رقم الإصدار من APP_VERSION_CODE / APP_VERSION_NAME (GitHub: رقم التشغيل).
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const manifestPath = join(root, "android", "app", "src", "main", "AndroidManifest.xml")
const gradlePath = join(root, "android", "app", "build.gradle")
if (!existsSync(manifestPath)) throw new Error("android/ غير موجود — شغّل npx cap add android أولاً")

let manifest = readFileSync(manifestPath, "utf8")
const permissions = ["android.permission.CAMERA", "android.permission.ACCESS_NETWORK_STATE"]
for (const permission of permissions) {
  if (!manifest.includes(`"${permission}"`)) {
    manifest = manifest.replace("</manifest>", `    <uses-permission android:name="${permission}" />\n</manifest>`)
  }
}
// الكاميرا اختيارية: لا تمنع تثبيت التطبيق على أجهزة بلا كاميرا
if (!manifest.includes("android.hardware.camera")) {
  manifest = manifest.replace("</manifest>", `    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>`)
}
writeFileSync(manifestPath, manifest)

const versionCode = Number.parseInt(process.env.APP_VERSION_CODE || "", 10)
const versionName = String(process.env.APP_VERSION_NAME || "").trim()
if (existsSync(gradlePath)) {
  let gradle = readFileSync(gradlePath, "utf8")
  if (versionCode > 0) gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  if (versionName) gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`)
  // فحص lint يعمل تلقائياً مع assembleRelease وقد يوقف البناء على تحذيرات لا تخص غلاف Capacitor
  if (!gradle.includes("checkReleaseBuilds")) {
    gradle = gradle.replace(/android\s*\{/, (match) => `${match}\n    lint {\n        checkReleaseBuilds false\n        abortOnError false\n    }`)
  }
  writeFileSync(gradlePath, gradle)
}
console.log("Android project patched")
