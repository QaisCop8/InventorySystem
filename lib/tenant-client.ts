// منطق اختيار شركة مشترك بين كل الأماكن التي تسمح للمستخدم بالتنقّل بين شركاته (شركاتي،
// القائمة المنسدلة باختيار الشركة بالهيدر، وإعادة تعمير التبويب من رابط ?company=) — كي لا تتكرر
// نفس خطوات ضبط sessionStorage (الخاصة بهذا التبويب فقط) وتسجيل الدخول التلقائي في أكثر من مكان.
export interface ActivateCompanyResult {
  success: boolean
  error?: string
  dbName?: string
  /** active_elsewhere: المستخدم مسجَّل الدخول من جهاز آخر — يُعاد الطلب بـforce بعد تأكيده */
  code?: string
  device?: { user_agent: string | null; ip_address: string | null; created_at: string; last_seen_at?: string | null }
  /** الحساب المقصود (حساب الإدارة الحالي في هذا المتصفح قد يختلف عمّا يظنه المستخدم) */
  account?: { name: string | null; email: string | null }
}

export async function activateCompany(companyId: number, options: { force?: boolean } = {}): Promise<ActivateCompanyResult> {
  let res: Response
  try {
    res = await fetch("/api/management/select-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, force: options.force === true }),
    })
  } catch (error) {
    console.warn("[tenant] Unable to reach the company selection endpoint", error)
    return {
      success: false,
      error: "تعذّر الاتصال بالخادم. تأكد من تشغيل النظام ثم حاول مرة أخرى.",
    }
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { success: false, error: data.error || "تعذّر فتح الشركة", code: data.code, device: data.device, account: data.account }
  }

  sessionStorage.setItem("active_tenant_db", data.dbName)
  sessionStorage.setItem("active_company_id", String(companyId))

  // يُكتَب أيضاً في localStorage (المشتركة بين كل تبويبات نفس المتصفح) كقيمة افتراضية لأي تبويب
  // جديد يُفتَح لاحقاً (رابط بتبويب جديد، Ctrl+Click...) — لا يملك sessionStorage خاصة به إطلاقاً
  // فيبدو للنظام بلا شركة مُختارة ولا جلسة، فيُحوَّل خطأً لتسجيل الدخول رغم وجود جلسة صالحة فعلياً.
  // sessionStorage يبقى له الأولوية عند القراءة (انظر protected-route.tsx وauth-context.tsx) فتبقى
  // ميزة فتح شركات مختلفة في تبويبات مختلفة تعمل كما هي: أي تبويب بدّل شركته صراحة يحتفظ باختياره
  // الخاص، والتبويبات الجديدة فقط هي من تعتمد على هذه القيمة المشتركة.
  localStorage.setItem("active_tenant_db", data.dbName)
  localStorage.setItem("active_company_id", String(companyId))

  if (data.user && data.token) {
    const session = JSON.stringify({ timestamp: new Date().getTime(), rememberMe: false })
    sessionStorage.setItem("erp_user", JSON.stringify(data.user))
    sessionStorage.setItem("erp_token", data.token)
    sessionStorage.setItem("erp_session", session)
    localStorage.setItem("erp_user", JSON.stringify(data.user))
    localStorage.setItem("erp_token", data.token)
    localStorage.setItem("erp_session", session)
  }

  return { success: true, dbName: data.dbName }
}
