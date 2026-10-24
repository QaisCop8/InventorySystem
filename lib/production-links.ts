import sql from "@/lib/database"

// سندات الإدخال/الإخراج/الإرسالية الداخلية التي يولّدها سند الانتاج (lib/production-vouchers.ts) لا تُعدَّل
// ولا تُلغى من شاشاتها مباشرة — فقط من سند الانتاج نفسه (إلغاء الترحيل / إلغاء النقل). أثناء ذلك يضع سند
// الانتاج حالته (أو حالة النقل) مؤقتاً على RELEASING فيسمح هذا الفحص بالإلغاء.
export const PRODUCTION_RELEASING_STATUS = 4
/** سند الانتاج يُنشئ/يعدّل سنداته المرتبطة (حفظ/ترحيل/حذف) — نفس سماح RELEASING */
export const PRODUCTION_SYNCING_STATUS = 5

/** رسالة منع إن كان السند مرتبطاً بسند انتاج مرحّل/نقل فعّال، وإلا null. */
export async function productionLinkError(voucherId: number): Promise<string | null> {
  const id = Number(voucherId)
  if (!Number.isInteger(id) || id <= 0) return null
  const ready = (await sql`SELECT to_regclass('production_vouchers_tbl') IS NOT NULL AND to_regclass('production_transfers_tbl') IS NOT NULL AS ok`) as any[]
  if (!ready[0]?.ok) return null
  const production = ((await sql`
    SELECT code FROM production_vouchers_tbl
    WHERE (in_voucher_id = ${id} OR out_voucher_id = ${id}) AND status IN (1, 2)
    LIMIT 1
  `) as any[])[0]
  if (production) return `هذا السند مُنشأ من سند الانتاج ${production.code} — عدّله (أو ألغِ ترحيله/احذفه) من شاشة سند الانتاج`
  const transfer = ((await sql`
    SELECT p.code FROM production_transfers_tbl t JOIN production_vouchers_tbl p ON p.id = t.production_id
    WHERE t.voucher_id = ${id} AND t.status = 1
    LIMIT 1
  `) as any[])[0]
  if (transfer) return `هذه الإرسالية مُنشأة من "نقل الى مستودع" في سند الانتاج ${transfer.code} — ألغِ النقل من سند الانتاج`
  return null
}
