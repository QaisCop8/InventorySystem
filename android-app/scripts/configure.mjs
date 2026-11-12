// يضبط عنوان الخادم الذي يفتحه التطبيق: SERVER_URL (من متغيرات GitHub أو البيئة) وإلا القيمة الحالية في
// capacitor.config.json. يكتب أيضاً www/config.js لصفحة "لا يوجد اتصال" (زر إعادة المحاولة).
// APP_VARIANT: system (النظام كاملاً، الافتراضي) أو cashier / restaurant — تطبيق منفصل (معرّف واسم مستقلان) يفتح
// النظام بـ ?app=... فيبدأ مباشرة على شاشة الكاشير/المطعم (lib/app-mode.ts في النظام).
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const configPath = join(root, "capacitor.config.json")
const config = JSON.parse(readFileSync(configPath, "utf8"))

const VARIANTS = {
  system: { appId: "com.noonerp.system", appName: "NoonERP System", query: "" },
  cashier: { appId: "com.noonerp.cashier", appName: "NoonERP Cashier", query: "?app=cashier" },
  restaurant: { appId: "com.noonerp.restaurant", appName: "NoonERP Restaurant", query: "?app=restaurant" },
}
const variantKey = String(process.env.APP_VARIANT || "system").trim() || "system"
const variant = VARIANTS[variantKey]
if (!variant) throw new Error(`APP_VARIANT غير معروف: ${variantKey}`)

const requested = String(process.env.SERVER_URL || "").trim()
let parsed
try { parsed = new URL(requested || config.server.url) } catch { throw new Error(`SERVER_URL غير صالح: ${requested || config.server.url}`) }
if (parsed.protocol !== "https:") throw new Error(`يجب أن يكون عنوان الخادم https: ${parsed.href}`)
// أصل الخادم فقط (بلا مسار/استعلام نسخة سابقة) ثم استعلام نسخة التطبيق
const serverUrl = `${parsed.origin}${variant.query ? `/${variant.query}` : ""}`

config.appId = variant.appId
config.appName = variant.appName
config.server.url = serverUrl
// روابط نفس الخادم تبقى داخل التطبيق؛ أي رابط آخر (واتساب، خرائط...) يفتح خارج التطبيق.
config.server.allowNavigation = [parsed.host]
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
writeFileSync(join(root, "www", "config.js"), `window.NOON_SERVER_URL = ${JSON.stringify(serverUrl)};\n`)
console.log(`NoonERP Android (${variantKey}: ${variant.appName}) → ${serverUrl}`)
