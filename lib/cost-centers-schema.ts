import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

/**
 * جداول مراكز التكلفة وأنواعها. الحذف منطقي (status = 3)، لذا تفرّد الاسم يشمل غير المحذوف فقط:
 * يمكن تعريف مركز/نوع جديد باسم مركز محذوف. (كان القيد UNIQUE (name) على كل الصفوف يمنع ذلك.)
 */
export const ensureCostCenterTables = () => runSchemaOnce("lib/cost-centers-schema.ts#ensureCostCenterTables", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS cost_center_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS cost_centers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      cost_type_id INTEGER NOT NULL,
      parent_id INTEGER NULL,
      level INTEGER NOT NULL DEFAULT 1,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT cost_centers_cost_type_fk FOREIGN KEY (cost_type_id) REFERENCES cost_center_types(id),
      CONSTRAINT cost_centers_parent_fk FOREIGN KEY (parent_id) REFERENCES cost_centers(id)
    )
  `
  await sql`ALTER TABLE cost_centers DROP CONSTRAINT IF EXISTS cost_centers_name_unique`
  await sql`ALTER TABLE cost_center_types DROP CONSTRAINT IF EXISTS cost_center_types_name_key`
  await sql`ALTER TABLE cost_center_types DROP CONSTRAINT IF EXISTS cost_center_types_name_unique`
  // بيانات قديمة قد تحوي أسماء مكررة فعّالة — حينها يُترك الفهرس (فحص الاسم في المسارات يبقى يمنع التكرار الجديد)
  try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS cost_centers_name_active_unique ON cost_centers (LOWER(name)) WHERE status <> 3` } catch (error) { console.warn("[cost-centers] active name index skipped", error) }
  try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS cost_center_types_name_active_unique ON cost_center_types (LOWER(name)) WHERE status <> 3` } catch (error) { console.warn("[cost-center-types] active name index skipped", error) }
})

/** اسم مستخدم في سجل غير محذوف (عدا السجل نفسه عند التعديل) */
export async function costCenterNameTaken(table: "cost_centers" | "cost_center_types", name: string, exceptId = 0) {
  const rows = table === "cost_centers"
    ? await sql`SELECT id FROM cost_centers WHERE LOWER(name) = LOWER(${name}) AND COALESCE(status, 1) <> 3 AND id <> ${exceptId} LIMIT 1`
    : await sql`SELECT id FROM cost_center_types WHERE LOWER(name) = LOWER(${name}) AND COALESCE(status, 1) <> 3 AND id <> ${exceptId} LIMIT 1`
  return (rows as any[]).length > 0
}
