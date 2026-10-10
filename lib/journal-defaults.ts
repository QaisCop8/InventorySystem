import sql from "@/lib/database"
import { buildVoucherCode } from "@/lib/voucher-code"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// الافتراضات المشتركة لكل القيود الآلية (عمليات الشيكات، الأصول الثابتة، قيود عمولة الفيزا، تحويل
// العملة، فرق العملة، قيد الرواتب):
//  • دفتر السندات = الدفتر الافتراضي للمستخدم المنفّذ على نوع سند القيد (3) من صلاحيات دفاتر السندات
//    (is_default=1). إن لم يُحدَّد افتراضي وكان للمستخدم دفتر واحد فقط يُستعمل؛ غير ذلك يُرفض القيد بدل
//    اختيار دفتر عشوائي من دفاتره.
//  • مراكز التكلفة = المراكز الافتراضية لحساب كل سطر (account_costcenters_tbl)، مركز لكل نوع؛ المراكز
//    الصريحة للسطر (كمركز تكلفة الأصل) تتقدّم على الافتراضي من نفس النوع فقط، وبقية الأنواع تُكمَل من
//    افتراضيات الحساب. المراكز الموقوفة (status=3) لا تُستعمل.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const JOURNAL_VOUCHER_TYPE = 3

export class JournalDefaultsError extends Error {}

export type JournalBookContext = { userSettingId: number; bookId: number; bookName: string }

/** userId = user_settings.user_id (هوية الجلسة)؛ صلاحيات الدفاتر مربوطة بـ user_settings.id. */
export async function resolveUserDefaultJournalBook(userId: string | number): Promise<JournalBookContext> {
  const userSetting = (await sql`SELECT id FROM user_settings WHERE user_id::text = ${String(userId)} LIMIT 1`)[0]
  if (!userSetting?.id) throw new JournalDefaultsError("تعذر تحديد المستخدم المنفذ للقيد")
  const books = await sql`
    SELECT permission.vch_book_id, book.name, COALESCE(permission.is_default, 0) AS is_default
    FROM voucher_book_user_permissions_tbl permission
    JOIN voucher_books_tbl book ON book.id = permission.vch_book_id
    WHERE permission.user_id = ${Number(userSetting.id)} AND permission.voucher_type_id = ${JOURNAL_VOUCHER_TYPE}
    ORDER BY permission.vch_book_id
  `
  const book = (books as any[]).find((row) => Number(row.is_default) === 1) ?? (books.length === 1 ? books[0] : null)
  if (!book?.vch_book_id) {
    throw new JournalDefaultsError("يجب تعيين دفتر سندات افتراضي لسند القيد للمستخدم (صلاحيات دفاتر السندات) قبل تنفيذ القيود الآلية")
  }
  return { userSettingId: Number(userSetting.id), bookId: Number(book.vch_book_id), bookName: String(book.name || "") }
}

/** الرقم التالي لسند قيد بدفتر معيّن — يجب استدعاؤها داخل معاملة (القفل مرتبط بها). */
export async function nextJournalVoucherCode(book: JournalBookContext): Promise<string> {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`journal-number:${book.bookId}`}))`
  const settings = await sql`SELECT id, value FROM system_settings WHERE id IN ('journal_prefix', 'journal_start')`
  const values = Object.fromEntries((settings as any[]).map((row) => [row.id, row.value]))
  const prefixValue = String(values.journal_prefix || "J").trim().toUpperCase()
  const prefix = /^[A-Z]{1,3}$/.test(prefixValue) ? prefixValue : "J"
  const startNumber = Math.max(1, Number(values.journal_start) || 1)
  const codePrefix = `${prefix}${book.bookName.trim().toUpperCase()}`
  const existing = await sql`
    SELECT vch_code FROM voucher_header_tbl WHERE vch_type = ${JOURNAL_VOUCHER_TYPE} AND vch_code LIKE ${codePrefix + "%"}
  `
  const maximum = (existing as any[]).reduce((max: number, row) => {
    const suffix = String(row.vch_code || "").slice(codePrefix.length)
    return Math.max(max, Number(suffix.match(/(\d+)$/)?.[1] || 0))
  }, 0)
  return buildVoucherCode(prefix, book.bookName, Math.max(startNumber, maximum + 1))
}

export type JournalCostCenter = { cost_center_type_id: number | null; cost_center_id: number }

/** المراكز الافتراضية (الفعّالة) لكل حساب: accountId ⇐ [{نوع، مركز}]. */
export async function accountDefaultCostCenters(accountIds: number[]): Promise<Map<number, JournalCostCenter[]>> {
  const ids = Array.from(new Set(accountIds.map(Number).filter((id) => id > 0)))
  const result = new Map<number, JournalCostCenter[]>()
  if (!ids.length) return result
  const rows = await sql`
    SELECT link.account_id, link.cost_center_type_id, link.default_cost_center_id
    FROM account_costcenters_tbl link
    JOIN cost_centers center ON center.id = link.default_cost_center_id AND COALESCE(center.status, 1) <> 3
    WHERE link.account_id = ANY(${ids}::int[]) AND link.default_cost_center_id IS NOT NULL
    ORDER BY link.account_id, link.cost_center_type_id, link.id
  `
  for (const row of rows as any[]) {
    const list = result.get(Number(row.account_id)) ?? []
    list.push({ cost_center_type_id: row.cost_center_type_id == null ? null : Number(row.cost_center_type_id), cost_center_id: Number(row.default_cost_center_id) })
    result.set(Number(row.account_id), list)
  }
  return result
}

/** مراكز سطر القيد: الصريحة أولاً، ثم افتراضيات الحساب للأنواع غير المغطاة. */
export async function mergeLineCostCenters(explicitIds: number[], defaults: JournalCostCenter[]): Promise<JournalCostCenter[]> {
  const ids = Array.from(new Set(explicitIds.map(Number).filter((id) => id > 0)))
  let explicit: JournalCostCenter[] = []
  if (ids.length) {
    const rows = await sql`SELECT id, cost_type_id FROM cost_centers WHERE id = ANY(${ids}::int[])`
    const typeById = new Map((rows as any[]).map((row) => [Number(row.id), row.cost_type_id == null ? null : Number(row.cost_type_id)]))
    explicit = ids.map((id) => ({ cost_center_type_id: typeById.get(id) ?? null, cost_center_id: id }))
  }
  const coveredTypes = new Set(explicit.map((item) => item.cost_center_type_id).filter((type) => type != null))
  const merged = [...explicit, ...defaults.filter((item) => item.cost_center_type_id == null || !coveredTypes.has(item.cost_center_type_id))]
  const seen = new Set<number>()
  return merged.filter((item) => (seen.has(item.cost_center_id) ? false : (seen.add(item.cost_center_id), true)))
}
