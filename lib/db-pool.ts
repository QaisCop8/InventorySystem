import { Pool } from "pg"

// Cloudflare Workers لا يسمح باستخدام اتصال TCP فُتح أثناء طلب HTTP في طلب آخر ("Cannot perform I/O on
// behalf of a different request"). على Workers يُنشأ Pool لكل طلب (مفتاحه سياق الطلب الذي يضعه OpenNext
// في AsyncLocalStorage — كائن جديد لكل طلب)، فتُعاد الاتصالات داخل الطلب الواحد ولا تنتقل لطلب آخر،
// ويغلقها Workers عند انتهاء الطلب. على Node (محلياً/Docker) Pool واحد لكل رابط طيلة عمر العملية كما كان.
const cloudflareContextSymbol = Symbol.for("__cloudflare-context__")

// على Workers يُستخدم pg عبر TCP حتى لقواعد Neon بدل عميل neon() المبني على HTTP: كل استعلام HTTP طلب
// فرعي (subrequest) مستقل، وWorkers يحدّ عددها لكل طلب (50 بالخطة المجانية) ← "Too many subrequests" في
// الشاشات كثيرة الاستعلامات. فتح اتصال TCP يُحسب طلباً فرعياً واحداً مهما نُفِّذ عليه من استعلامات.
export const isWorkersRuntime =
  typeof navigator !== "undefined" && (navigator as { userAgent?: string }).userAgent === "Cloudflare-Workers"
const processPools = new Map<string, Pool>()
const requestPools = new WeakMap<object, Map<string, Pool>>()

function currentRequestContext(): object | undefined {
  const context = (globalThis as Record<symbol, unknown>)[cloudflareContextSymbol]
  return context && typeof context === "object" ? context : undefined
}

export function getPool(connectionString: string): Pool {
  const requestContext = currentRequestContext()
  let pools = processPools
  if (requestContext) {
    pools = requestPools.get(requestContext) ?? new Map<string, Pool>()
    requestPools.set(requestContext, pools)
  }
  let pool = pools.get(connectionString)
  if (!pool) {
    pool = new Pool(requestContext ? { connectionString, max: 5, idleTimeoutMillis: 1000 } : { connectionString })
    // بلا مستمع لحدث "error" يرمي pg الخطأ عند انقطاع اتصال خامل — على Workers تُقطع اتصالات الطلب عند انتهائه،
    // فكان ذلك يُسقط الـ Worker ويعرض صفحة خطأ HTML للطلب التالي (مثل تسجيل الدخول).
    pool.on("error", (error) => console.error("[db-pool] idle connection error:", error.message))
    pools.set(connectionString, pool)
  }
  return pool
}
