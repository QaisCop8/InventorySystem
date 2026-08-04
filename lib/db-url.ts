// كل قواعد بيانات الشركات (وقاعدة الإدارة management) تعيش على نفس خادم Postgres/بيانات الاعتماد
// المستخدمة في DATABASE_URL — الفرق الوحيد هو اسم القاعدة نفسها، لذا يكفي استبدال pathname بدل بناء
// سلسلة اتصال جديدة كاملة، مما يُبقي كل التحويلات في مكان واحد بدل تكرارها بكل ملف يحتاجها.
export function withDatabaseName(baseUrl: string, dbName: string): string {
  if (!baseUrl) return ""

  try {
    const url = new URL(baseUrl)
    url.pathname = `/${dbName}`
    return url.toString()
  } catch {
    return ""
  }
}

export function getDatabaseNameFromUrl(baseUrl: string): string {
  if (!baseUrl) return ""

  try {
    const url = new URL(baseUrl)
    return url.pathname.replace(/^\//, "")
  } catch {
    return ""
  }
}

export function isNeonDatabaseUrl(connectionUrl: string): boolean {
  if (!connectionUrl) return false

  try {
    const hostname = new URL(connectionUrl).hostname.toLowerCase()
    return hostname === "neon.tech" || hostname.endsWith(".neon.tech")
  } catch {
    return false
  }
}
