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

export function isNeonDatabaseUrl(connectionUrl: string): boolean {
  const url = parseDatabaseUrl(connectionUrl)
  if (!url) return false

  const hostname = url.hostname.toLowerCase()
  return hostname === "neon.tech" || hostname.endsWith(".neon.tech")
}
