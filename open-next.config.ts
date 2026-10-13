import { defineCloudflareConfig } from "@opennextjs/cloudflare"

// إعداد OpenNext لبناء Cloudflare (npx opennextjs-cloudflare build).
// بلا ذاكرة تخزين مؤقت (incremental cache) — صفحات النظام ديناميكية ولا تعتمد على ISR.
const config = defineCloudflareConfig()

// CLOUDFLARE_BUILD يفعّل في next.config.mjs إعدادات Workers (استبدال odbc، نسخ pg-cloudflare)،
// ثم scripts/cloudflare-postbuild.cjs يزيل استيراد react-dom/client (للمتصفح فقط) من ملفات الخادم
config.buildCommand = "CLOUDFLARE_BUILD=true npm run build && node scripts/cloudflare-postbuild.cjs"

export default config
