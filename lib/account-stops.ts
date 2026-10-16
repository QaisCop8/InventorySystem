import sql from "@/lib/database"

// "إيقاف الحركات" في تعريف الحساب/العميل/المورد (account_stop_transactions_tbl): لكل نوع سند
// (voucher_types_id = vch_type) تاريخ إيقاف — سند بهذا النوع بتاريخ يساوي تاريخ الإيقاف أو بعده يُرفض عند الحفظ.
// تاريخ إيقاف فارغ = موقوف دائماً لهذا النوع.

const toIds = (values: unknown[]) =>
  Array.from(new Set(values.map((value) => Number(value)).filter((id) => Number.isInteger(id) && id > 0)))

const normalizeDate = (value: unknown): string | null => {
  const text = String(value ?? "").trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

/** null = لا إيقاف؛ وإلا رسالة الخطأ. vchDate فارغ = تاريخ اليوم. */
export const validateAccountStops = async (accountIds: unknown[], vchType: unknown, vchDate?: unknown): Promise<string | null> => {
  const ids = toIds(accountIds)
  const type = Number(vchType)
  if (ids.length === 0 || !Number.isInteger(type) || type <= 0) return null
  const date = normalizeDate(vchDate) ?? new Date().toISOString().slice(0, 10)
  const rows = await sql`
    SELECT a.code, a.name, st.stop_date::date::text AS stop_date, vt.name AS voucher_type_name
    FROM account_stop_transactions_tbl st
    JOIN account_tbl a ON a.id = st.account_id
    LEFT JOIN voucher_types_tbl vt ON vt.id = st.voucher_types_id
    WHERE st.account_id = ANY(${ids}::int[])
      AND st.voucher_types_id = ${type}
      AND (st.stop_date IS NULL OR st.stop_date::date <= ${date}::date)
    ORDER BY a.code
    LIMIT 1
  `
  const row = (rows as any[])[0]
  if (!row) return null
  const typeName = row.voucher_type_name ? `«${row.voucher_type_name}»` : `نوع السند ${type}`
  const since = row.stop_date ? ` اعتباراً من ${row.stop_date}` : ""
  return `الحساب ${row.code} - ${row.name} موقوف عن الحركة في ${typeName}${since}`
}
