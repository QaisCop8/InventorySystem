import sql from "@/lib/database"

// الحركات والتعريفات تقبل الحسابات الفرعية فقط: الحساب الرئيسي (له حساب فرعي واحد على الأقل غير محذوف)
// يُرفض عند الحفظ — نفس قاعدة نوافذ اختيار الحسابات (account-search-dialog.tsx leafOnly).
export const PARENT_ACCOUNT_SAVE_MESSAGE = "لا يمكن استخدام حساب رئيسي (له حسابات فرعية) — اختر حساباً فرعياً"

const toIds = (values: unknown[]) =>
  Array.from(new Set(values.map((value) => Number(value)).filter((id) => Number.isInteger(id) && id > 0)))

export const findParentAccounts = async (accountIds: unknown[]): Promise<{ id: number; code: string; name: string }[]> => {
  const ids = toIds(accountIds)
  if (ids.length === 0) return []
  const rows = await sql`
    SELECT a.id, a.code, a.name
    FROM account_tbl a
    WHERE a.id = ANY(${ids}::int[])
      AND EXISTS (SELECT 1 FROM account_tbl ch WHERE ch.father_id = a.id AND COALESCE(ch.status, 1) <> 3)
    ORDER BY a.code
  `
  return (rows as any[]).map((row) => ({ id: Number(row.id), code: String(row.code || ""), name: String(row.name || "") }))
}

/** null = كل الحسابات فرعية؛ وإلا رسالة الخطأ بأسماء الحسابات الرئيسية. label اختياري لاسم الحقل. */
export const validateLeafAccounts = async (accountIds: unknown[], label?: string): Promise<string | null> => {
  const parents = await findParentAccounts(accountIds)
  if (parents.length === 0) return null
  const names = parents.slice(0, 5).map((account) => `${account.code} - ${account.name}`).join("، ")
  return `${PARENT_ACCOUNT_SAVE_MESSAGE}${label ? ` (${label})` : ""}: ${names}`
}

/** نفس الفحص لحقول معرّفات حسابات بأسمائها: { "حساب المبيعات": 12, ... } — يذكر اسم الحقل في الرسالة. */
export const validateLeafAccountFields = async (fields: Record<string, unknown>): Promise<string | null> => {
  const entries = Object.entries(fields).filter(([, value]) => Number(value) > 0)
  if (entries.length === 0) return null
  const parents = await findParentAccounts(entries.map(([, value]) => value))
  if (parents.length === 0) return null
  const parentIds = new Map(parents.map((account) => [account.id, account]))
  const [label, value] = entries.find(([, value]) => parentIds.has(Number(value)))!
  const account = parentIds.get(Number(value))!
  return `${PARENT_ACCOUNT_SAVE_MESSAGE} (${label}): ${account.code} - ${account.name}`
}
