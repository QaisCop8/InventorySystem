import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// فهارس جداول السندات والأصناف التي تُقرأ عند فتح كل سند وكشوف الحسابات. قواعد الشركات القديمة (وبعد ترحيل
// آلاف السندات والأصناف من الشامل) ينقصها بعضها، فيصبح فتح السند مسحاً كاملاً لجدول أسطر القيود/الأصناف.
// مرة واحدة لكل قاعدة شركة (runSchemaOnce)؛ الجدول غير الموجود يُتجاوز.

const INDEXES: [table: string, name: string, columns: string][] = [
  ["voucher_journal_detail_tbl", "idx_voucher_journal_detail_voucher", "voucher_id"],
  ["voucher_journal_detail_tbl", "idx_voucher_journal_detail_account", "account_id"],
  ["voucher_items_tbl", "idx_voucher_items_tbl_voucher_id", "voucher_id"],
  ["voucher_items_tbl", "idx_voucher_items_tbl_item", "item_id"],
  ["voucher_items_tbl", "idx_voucher_items_tbl_delivery_item", "delivery_item_id"],
  ["voucher_header_tbl", "idx_voucher_header_type_id", "vch_type, id"],
  ["exchange_rates", "idx_exchange_rates_currency_date", "currency_id, rate_date DESC"],
  // التقارير: فلترة بالتاريخ عبر كل الأنواع، كشف حساب العميل من الرأس، أسطر القيد لحساب ضمن سند
  ["voucher_header_tbl", "idx_voucher_header_date", "vch_date"],
  ["voucher_header_tbl", "idx_voucher_header_account", "account_id"],
  ["voucher_journal_detail_tbl", "idx_voucher_journal_detail_account_voucher", "account_id, voucher_id"],
  ["voucher_items_tbl", "idx_voucher_items_tbl_item_voucher", "item_id, voucher_id"],
  ["cheques_tbl", "idx_cheques_tbl_voucher", "voucher_id"],
  ["voucher_header_tbl", "idx_voucher_header_type_date", "vch_type, vch_date"],
  ["voucher_costcenter_tbl", "idx_voucher_costcenter_tbl_journal", "voucher_journal_id"],
  ["vouchers_items_serials_tbl", "idx_vouchers_items_serials_item", "voucher_item_id"],
  ["voucher_item_attributes_tbl", "idx_voucher_item_attributes_item", "voucher_item_id"],
  ["product_units", "idx_product_units_product_id", "product_id"],
  ["product_unit_barcodes", "idx_product_unit_barcodes_product_id", "product_id"],
  ["product_unit_barcodes", "idx_product_unit_barcodes_barcode", "barcode"],
  ["product_prices", "idx_product_prices_product_id", "product_id"],
  ["product_atrributes_values_tbl", "idx_product_attr_values_product", "product_id"],
  ["inventory_transactions", "idx_inventory_transactions_reference", "reference_type, reference_id"],
  ["inventory_transactions", "idx_inventory_transactions_product_warehouse", "product_id, warehouse_id"],
]

export async function ensureVoucherIndexes() { return runSchemaOnce("lib/voucher-indexes.ts#ensureVoucherIndexes:v2", async () => {
  for (const [table, name, columns] of INDEXES) {
    const [exists] = await sql`SELECT to_regclass(${table}) IS NOT NULL AS ok`
    if (!(exists as any)?.ok) continue
    try {
      await sql.unsafe(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${columns})`)
    } catch (error) {
      console.error(`[voucher-indexes] ${name} failed:`, error)
    }
  }
  await analyzeVoucherTables()
}) }

// بعد إدراج آلاف السندات دفعة واحدة (الترحيل) تبقى إحصاءات المخطِّط قديمة فيختار مسحاً كاملاً بدل الفهرس —
// ANALYZE يحدّثها (ثوانٍ قليلة حتى لجداول كبيرة: عيّنة)
export async function analyzeVoucherTables() {
  for (const table of ["voucher_header_tbl", "voucher_journal_detail_tbl", "voucher_items_tbl", "voucher_costcenter_tbl", "inventory_transactions", "product_stock", "account_tbl", "products"]) {
    const [exists] = await sql`SELECT to_regclass(${table}) IS NOT NULL AS ok`
    if (!(exists as any)?.ok) continue
    await sql.unsafe(`ANALYZE ${table}`).catch((error: unknown) => console.error(`[voucher-indexes] ANALYZE ${table} failed:`, error))
  }
}
