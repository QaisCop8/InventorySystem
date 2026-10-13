import { defineCloudflareConfig } from "@opennextjs/cloudflare"

// إعداد OpenNext لبناء Cloudflare (npx opennextjs-cloudflare build).
// بلا ذاكرة تخزين مؤقت (incremental cache) — صفحات النظام ديناميكية ولا تعتمد على ISR.
export default defineCloudflareConfig()
