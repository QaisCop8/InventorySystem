// كل قواعد بيانات الشركات (وقاعدة الإدارة management) تعيش على نفس خادم Postgres/بيانات الاعتماد
// المستخدمة في DATABASE_URL — الفرق الوحيد هو اسم القاعدة نفسها، لذا يكفي استبدال pathname بدل بناء
// سلسلة اتصال جديدة كاملة، مما يُبقي كل التحويلات في مكان واحد بدل تكرارها بكل ملف يحتاجها.
export function withDatabaseName(baseUrl: string, dbName: string): string {
  const url = new URL(baseUrl)
  url.pathname = `/${dbName}`
  return url.toString()
}

export function getDatabaseNameFromUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  return url.pathname.replace(/^\//, "")
}
