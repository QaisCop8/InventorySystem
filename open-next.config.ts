import { defineCloudflareConfig } from "@opennextjs/cloudflare"

// إعداد OpenNext لبناء Cloudflare (npx opennextjs-cloudflare build).
// بلا ذاكرة تخزين مؤقت (incremental cache) — صفحات النظام ديناميكية ولا تعتمد على ISR.
const config = defineCloudflareConfig()

// CLOUDFLARE_BUILD يفعّل في next.config.mjs استبدال الحزم غير المتوافقة مع Workers (odbc، react-dom/client بالخادم)
config.buildCommand = "CLOUDFLARE_BUILD=true npm run build"

export default config
