import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// أعمدة خصم سطر السند (نسبة خصم الكاشير المنفصلة عن خصم الحملات + خصم الحملة ومعرّفها). كانت تُضاف فقط عند أول حفظ
// فاتورة (saveSalesVoucherItems)، فشركة جديدة لم تحفظ فاتورة بعد تفشل عندها كل قراءة تستخدمها — ومنها شاشة الأصناف
// (تعبئة آخر سعر شراء في lib/last-purchase.ts): "column vi.pos_discount_percent does not exist".
export function ensureVoucherItemDiscountColumns() {
  return runSchemaOnce("lib/voucher-item-columns.ts#ensureVoucherItemDiscountColumns", async () => {
    await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS campaign_discount DOUBLE PRECISION DEFAULT 0`
    await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS campaign_id INTEGER`
    await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS pos_discount_percent NUMERIC(9,4)`
  })
}
