import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

/**
 * ختم كتالوج الأصناف (2026-11-20): يتغيّر تلقائياً (مشغّل على مستوى الجملة) عند أي تعديل في الأصناف وأسعارها ووحداتها
 * وباركوداتها وتوابعها ومجموعاتها — من أي شاشة (تعريف الصنف، تعديل الأصناف الجماعي، الاستيراد، ترحيل الشامل…).
 * الكاشير والمطعم يقرآنه كل بضع ثوانٍ (api/pos/catalog-stamp، استعلام صف واحد) ويعيدان تحميل الكتالوج فقط عند تغيّره —
 * كان الكاشير لا يحدّث الأصناف إلا بإعادة فتح الصفحة، والمطعم كل 5 دقائق.
 */
const WATCHED_TABLES = ["products", "product_prices", "product_units", "product_unit_barcodes", "product_related_items", "item_groups", "units"]

export function ensureCatalogStamp() {
  return runSchemaOnce("lib/catalog-stamp.ts#ensureCatalogStamp", async () => {
    await sql`CREATE TABLE IF NOT EXISTS catalog_stamp_tbl (id SMALLINT PRIMARY KEY DEFAULT 1, stamp TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())`
    await sql`INSERT INTO catalog_stamp_tbl (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION touch_catalog_stamp() RETURNS trigger AS $$
      BEGIN
        UPDATE catalog_stamp_tbl SET stamp = clock_timestamp() WHERE id = 1;
        RETURN NULL;
      END
      $$ LANGUAGE plpgsql`)
    for (const table of WATCHED_TABLES) {
      const [exists] = await sql`SELECT to_regclass(${table}) IS NOT NULL AS ok` as any[]
      if (!exists?.ok) continue
      await sql.unsafe(`DROP TRIGGER IF EXISTS catalog_stamp_touch ON ${table}`)
      await sql.unsafe(`CREATE TRIGGER catalog_stamp_touch AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION touch_catalog_stamp()`)
    }
  })
}

export async function readCatalogStamp(): Promise<string> {
  await ensureCatalogStamp()
  const [row] = await sql`SELECT stamp FROM catalog_stamp_tbl WHERE id = 1` as any[]
  return row?.stamp ? new Date(row.stamp).toISOString() : ""
}
