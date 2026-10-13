import { Pool } from "pg"

// Cloudflare Workers لا يسمح باستخدام اتصال TCP فُتح أثناء طلب HTTP في طلب آخر ("Cannot perform I/O on
// behalf of a different request"). على Workers يُنشأ Pool لكل طلب (مفتاحه سياق الطلب الذي يضعه OpenNext
// في AsyncLocalStorage — كائن جديد لكل طلب)، فتُعاد الاتصالات داخل الطلب الواحد ولا تنتقل لطلب آخر،
// ويغلقها Workers عند انتهاء الطلب. على Node (محلياً/Docker) Pool واحد لكل رابط طيلة عمر العملية كما كان.
const cloudflareContextSymbol = Symbol.for("__cloudflare-context__")
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
    pool = new Pool(requestContext ? { connectionString, max: 5 } : { connectionString })
    pools.set(connectionString, pool)
  }
  return pool
}
