// منطق اختيار شركة مشترك بين كل الأماكن التي تسمح للمستخدم بالتنقّل بين شركاته (شركاتي،
// القائمة المنسدلة باختيار الشركة بالهيدر، وإعادة تعمير التبويب من رابط ?company=) — كي لا تتكرر
// نفس خطوات ضبط sessionStorage (الخاصة بهذا التبويب فقط) وتسجيل الدخول التلقائي في أكثر من مكان.
export interface ActivateCompanyResult {
  success: boolean
  error?: string
  dbName?: string
}

export async function activateCompany(companyId: number): Promise<ActivateCompanyResult> {
  const res = await fetch("/api/management/select-company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { success: false, error: data.error || "تعذّر فتح الشركة" }
  }

  sessionStorage.setItem("active_tenant_db", data.dbName)
  sessionStorage.setItem("active_company_id", String(companyId))

  if (data.user && data.token) {
    sessionStorage.setItem("erp_user", JSON.stringify(data.user))
    sessionStorage.setItem("erp_token", data.token)
    sessionStorage.setItem("erp_session", JSON.stringify({ timestamp: new Date().getTime(), rememberMe: false }))
  }

  return { success: true, dbName: data.dbName }
}
