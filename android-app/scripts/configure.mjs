// يضبط عنوان الخادم الذي يفتحه التطبيق: SERVER_URL (من متغيرات GitHub أو البيئة) وإلا القيمة الحالية في
// capacitor.config.json. يكتب أيضاً www/config.js لصفحة "لا يوجد اتصال" (زر إعادة المحاولة).
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const configPath = join(root, "capacitor.config.json")
const config = JSON.parse(readFileSync(configPath, "utf8"))

const requested = String(process.env.SERVER_URL || "").trim()
const serverUrl = (requested || config.server.url).replace(/\/+$/, "")
let parsed
try { parsed = new URL(serverUrl) } catch { throw new Error(`SERVER_URL غير صالح: ${serverUrl}`) }
if (parsed.protocol !== "https:") throw new Error(`يجب أن يكون عنوان الخادم https: ${serverUrl}`)

config.server.url = serverUrl
// روابط نفس الخادم تبقى داخل التطبيق؛ أي رابط آخر (واتساب، خرائط...) يفتح خارج التطبيق.
config.server.allowNavigation = [parsed.host]
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
writeFileSync(join(root, "www", "config.js"), `window.NOON_SERVER_URL = ${JSON.stringify(serverUrl)};\n`)
console.log(`NoonERP Android → ${serverUrl}`)
