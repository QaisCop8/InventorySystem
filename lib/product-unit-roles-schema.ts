import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

/** أعمدة أدوار الوحدات على product_units (انظر lib/product-unit-roles.ts) — يستدعيها كل من يقرأها أو يكتبها. */
export function ensureProductUnitRoleColumns() {
  return runSchemaOnce("lib/product-unit-roles-schema.ts#ensureProductUnitRoleColumns", async () => {
    await sql`ALTER TABLE product_units ADD COLUMN IF NOT EXISTS is_stock_count_unit BOOLEAN NOT NULL DEFAULT FALSE`
    await sql`ALTER TABLE product_units ADD COLUMN IF NOT EXISTS is_purchase_unit BOOLEAN NOT NULL DEFAULT FALSE`
    await sql`ALTER TABLE product_units ADD COLUMN IF NOT EXISTS is_report_unit BOOLEAN NOT NULL DEFAULT FALSE`
  })
}
