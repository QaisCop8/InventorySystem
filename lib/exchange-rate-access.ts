import type { NextRequest } from "next/server"
import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { requirePermissionByName } from "@/lib/tenant-auth"
import { EXCHANGE_RATE_PERMISSIONS } from "@/lib/transaction-permission-definitions"

// صلاحيات أسعار الصرف (lib/transaction-permission-definitions.ts EXCHANGE_RATE_PERMISSIONS):
// - تاريخ قبل اليوم (بتوقيت فلسطين) ⇐ «تعديل سعر صرف ليوم سابق»
// - سعر اليوم أدخله مستخدم سابقاً (entered_at) ⇐ «تعديل سعر صرف»
// - سعر اليوم لم يُدخَل بعد (لا صف، أو صف منسوخ تلقائياً من آخر سعر — getOrCreateRatesForDate) ⇐ «اضافة سعر الصرف»
// entered_at/entered_by يميّزان الإدخال الفعلي عن النسخ التلقائي، ويظهران في «تقرير اسعار الصرف».

export const EXCHANGE_RATE_TIME_ZONE = "Asia/Hebron"

export function ensureExchangeRateAuditColumns() {
  return runSchemaOnce("lib/exchange-rate-access.ts#audit-columns", async () => {
    await sql`ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS entered_at TIMESTAMP`
    await sql`ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS entered_by INTEGER`
  })
}

export type ExchangeRateTarget = { rowId: number | null; rateDate: string; entered: boolean; isPast: boolean }

/** السطر المستهدف بالحفظ: type 1 = سعر عملة بتاريخ (اليوم إن لم يُمرَّر)، غير ذلك = سطر بمعرّفه. */
export async function resolveExchangeRateTarget(id: unknown, rates: { type?: unknown; currency_id?: unknown; rate_date?: unknown }): Promise<ExchangeRateTarget | null> {
  await ensureExchangeRateAuditColumns()
  const [today] = await sql`SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE ${EXCHANGE_RATE_TIME_ZONE})::date, 'YYYY-MM-DD') AS d`
  const todayText = String(today.d)
  if (Number(rates.type) === 1) {
    const requested = typeof rates.rate_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rates.rate_date) ? rates.rate_date : todayText
    const [row] = await sql`
      SELECT id, entered_at FROM exchange_rates
      WHERE currency_id = ${Number(rates.currency_id)} AND rate_date = ${requested}::date
      ORDER BY id DESC LIMIT 1
    `
    return { rowId: row ? Number(row.id) : null, rateDate: requested, entered: Boolean(row?.entered_at), isPast: requested < todayText }
  }
  const [row] = await sql`SELECT id, entered_at, to_char(rate_date, 'YYYY-MM-DD') AS rate_date FROM exchange_rates WHERE id = ${Number(id)} LIMIT 1`
  if (!row) return null
  const rateDate = String(row.rate_date || todayText)
  return { rowId: Number(row.id), rateDate, entered: Boolean(row.entered_at), isPast: rateDate < todayText }
}

export function exchangeRatePermissionFor(target: Pick<ExchangeRateTarget, "entered" | "isPast"> | null): string {
  if (!target) return EXCHANGE_RATE_PERMISSIONS.add
  if (target.isPast) return EXCHANGE_RATE_PERMISSIONS.editPast
  return target.entered ? EXCHANGE_RATE_PERMISSIONS.edit : EXCHANGE_RATE_PERMISSIONS.add
}

export async function authorizeExchangeRateChange(request: NextRequest, permissionName: string) {
  return requirePermissionByName(request, permissionName)
}

/** بعد الحفظ: السطر صار «مُدخَلاً» من مستخدم (تعديله اللاحق اليوم يتطلب «تعديل سعر صرف»). */
export async function markExchangeRateEntered(rowId: number, userId: string | number) {
  await sql`UPDATE exchange_rates SET entered_at = CURRENT_TIMESTAMP, entered_by = ${Number(userId) || null} WHERE id = ${rowId}`
}
