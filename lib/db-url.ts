// كل قواعد بيانات الشركات (وقاعدة الإدارة management) تعيش على نفس خادم Postgres/بيانات الاعتماد
// المستخدمة في DATABASE_URL — الفرق الوحيد هو اسم القاعدة نفسها، لذا يكفي استبدال pathname بدل بناء
// سلسلة اتصال جديدة كاملة، مما يُبقي كل التحويلات في مكان واحد بدل تكرارها بكل ملف يحتاجها.
function parseDatabaseUrl(connectionUrl: string): URL | null {
  const value = String(connectionUrl || "").trim()
  if (!value) return null

  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function withDatabaseName(baseUrl: string, dbName: string): string {
  if (!baseUrl || !dbName) return ""

  const url = parseDatabaseUrl(baseUrl)
  if (!url) return ""

  url.pathname = `/${dbName}`
  return url.toString()
}

export function getDatabaseNameFromUrl(baseUrl: string): string {
  const url = parseDatabaseUrl(baseUrl)
  if (!url) return ""

  return url.pathname.replace(/^\//, "")
}

// Cloudflare Workers لا يسمح باستخدام اتصال TCP فُتح أثناء طلب HTTP في طلب آخر ("Cannot perform I/O on
// behalf of a different request")، وكل Pool هنا مُخزَّن على مستوى العملية ويُعيد استخدام اتصالاته بين
// الطلبات. على Workers يُغلق كل اتصال بعد استخدام واحد (maxUses: 1) فلا ينتقل لطلب آخر؛ على Node لا تغيير.
const isWorkersRuntime =
  typeof navigator !== "undefined" && (navigator as { userAgent?: string }).userAgent === "Cloudflare-Workers"

export function poolConfig(connectionString: string) {
  return isWorkersRuntime ? { connectionString, maxUses: 1, max: 20 } : { connectionString }
}

export function isNeonDatabaseUrl(connectionUrl: string): boolean {
  const url = parseDatabaseUrl(connectionUrl)
  if (!url) return false

  const hostname = url.hostname.toLowerCase()
  return hostname === "neon.tech" || hostname.endsWith(".neon.tech")
}
