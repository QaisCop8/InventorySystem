import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

/**
 * وصفة التصنيع (2026-11-24) — امتداد «مكونات التصنيع» في تعريف الصنف:
 * - نسبة الهدر المتوقعة لكل مكوّن (product_manufacturing_components.waste_percent): الكمية المصروفة = الكمية × (1 + الهدر%).
 * - تكاليف معيارية لكل وحدة منتَجة (product_production_settings): أجور عمال، مصاريف تشغيل، تغليف — تُضاف تلقائياً
 *   لتكاليف سند الانتاج الإضافية فتدخل في كلفة المنتَج.
 */
export type RecipeSettings = { labor_cost: number; overhead_cost: number; packaging_cost: number; shelf_life_days: number; note: string }

export const EMPTY_RECIPE_SETTINGS: RecipeSettings = { labor_cost: 0, overhead_cost: 0, packaging_cost: 0, shelf_life_days: 0, note: "" }

/** أنواع التكاليف الإضافية في سند الانتاج — مفتاح ثابت + اسم عربي */
export const PRODUCTION_COST_TYPES: Record<string, string> = {
  labor: "أجور عمال",
  overhead: "مصاريف تشغيل (كهرباء، ماء، استهلاك آلات)",
  packaging: "تغليف وتعبئة",
  other: "أخرى",
}

export async function ensureRecipeSchema() {
  return runSchemaOnce("lib/production-recipe.ts#ensureRecipeSchema", async () => {
    // جدول المكونات يُنشأ في مسار مكونات التصنيع — يُضاف العمود فقط إن كان الجدول موجوداً
    await sql`
      DO $$ BEGIN
        IF to_regclass('product_manufacturing_components') IS NOT NULL THEN
          ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS waste_percent NUMERIC(9,4) NOT NULL DEFAULT 0;
        END IF;
      END $$`
    await sql`
      CREATE TABLE IF NOT EXISTS product_production_settings (
        product_id INTEGER PRIMARY KEY,
        labor_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
        overhead_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
        packaging_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
        note TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    // مدة صلاحية المنتَج بالأيام ⇐ تاريخ صلاحية تلقائي في سند الانتاج (تاريخ السند + المدة)
    await sql`ALTER TABLE product_production_settings ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER NOT NULL DEFAULT 0`
  })
}

const clean = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number * 1e6) / 1e6 : 0
}

export async function loadRecipeSettings(productIds: number[]): Promise<Map<number, RecipeSettings>> {
  await ensureRecipeSchema()
  const ids = [...new Set(productIds.map(Number).filter((id) => id > 0))]
  if (!ids.length) return new Map()
  const rows = (await sql`SELECT product_id, labor_cost, overhead_cost, packaging_cost, shelf_life_days, note FROM product_production_settings WHERE product_id = ANY(${ids}::int[])`) as any[]
  return new Map(rows.map((row) => [Number(row.product_id), {
    labor_cost: Number(row.labor_cost) || 0, overhead_cost: Number(row.overhead_cost) || 0, packaging_cost: Number(row.packaging_cost) || 0, shelf_life_days: Number(row.shelf_life_days) || 0, note: row.note || "",
  }]))
}

export async function saveRecipeSettings(productId: number, input: Partial<RecipeSettings> | null | undefined) {
  await ensureRecipeSchema()
  if (!input) return
  const value = { labor_cost: clean(input.labor_cost), overhead_cost: clean(input.overhead_cost), packaging_cost: clean(input.packaging_cost), shelf_life_days: Math.min(36500, Math.max(0, Math.round(Number(input.shelf_life_days) || 0))), note: String(input.note || "").trim().slice(0, 1000) || null }
  await sql`
    INSERT INTO product_production_settings (product_id, labor_cost, overhead_cost, packaging_cost, shelf_life_days, note, updated_at)
    VALUES (${productId}, ${value.labor_cost}, ${value.overhead_cost}, ${value.packaging_cost}, ${value.shelf_life_days}, ${value.note}, CURRENT_TIMESTAMP)
    ON CONFLICT (product_id) DO UPDATE SET labor_cost = EXCLUDED.labor_cost, overhead_cost = EXCLUDED.overhead_cost,
      packaging_cost = EXCLUDED.packaging_cost, shelf_life_days = EXCLUDED.shelf_life_days, note = EXCLUDED.note, updated_at = CURRENT_TIMESTAMP`
}

/** نسبة هدر صالحة 0–99.99 */
export const cleanWaste = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.min(99.99, Math.round(number * 100) / 100) : 0
}
