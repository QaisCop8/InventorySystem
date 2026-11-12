"use client"

// الحسابات الافتراضية المقترحة من هيكل الحسابات الجاهز (data/accounts.json — عمود default_type يصف دور الحساب، مثل
// «حساب الذمم المدينة»): لكل مفتاح إعداد فارغ يُبحث عن حساب الهيكل ذي هذا الدور ثم عن نفس الرقم في حسابات الشركة.
// الاستيراد يكمّل رقم الحساب لعشر خانات بأصفار يميناً (110101000 ⇐ 1101010000). تُستخدم كاقتراح يغيّره المستخدم قبل الحفظ.

export type TemplateDefaultRule = { defaultType?: string; codes?: string[] }

export async function suggestTemplateDefaults(rules: Record<string, TemplateDefaultRule>, current: Record<string, string>): Promise<Record<string, string>> {
  const emptyKeys = Object.keys(rules).filter((key) => !current[key])
  if (!emptyKeys.length) return {}
  const [template, accounts] = await Promise.all([
    fetch("/api/accounts-export-source?type=none").then((response) => (response.ok ? response.json() : { rows: [] })),
    fetch("/api/accounts?type=1").then((response) => (response.ok ? response.json() : [])),
  ])
  const rows: any[] = Array.isArray(template?.rows) ? template.rows : []
  const byCode = new Map<string, string>()
  for (const account of Array.isArray(accounts) ? accounts : []) {
    const code = String(account.code ?? account.account_code ?? "").trim().toUpperCase()
    if (code && account.id != null) byCode.set(code, String(account.id))
  }
  const findId = (code: string) => byCode.get(code.toUpperCase()) || byCode.get(code.toUpperCase().padEnd(10, "0"))
  const suggestions: Record<string, string> = {}
  for (const key of emptyKeys) {
    const rule = rules[key]
    const codes = [
      ...(rule.codes || []),
      ...(rule.defaultType ? rows.filter((row) => String(row?.default_type ?? "").trim() === rule.defaultType).map((row) => String(row.code ?? "").trim()) : []),
    ]
    for (const code of codes) {
      const id = code ? findId(code) : undefined
      if (id) { suggestions[key] = id; break }
    }
  }
  return suggestions
}
