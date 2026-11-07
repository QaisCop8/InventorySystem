import sql from "@/lib/database"

// وحدة مكوّن التصنيع: product_manufacturing_components.quantity يبقى دائماً بالوحدة الرئيسية (يقرؤه
// سند الانتاج وفحص توفر المواد كما هو)، والوحدة المختارة والكمية المُدخلة بها تُحفظان بجانبه للعرض.

export type ComponentUnit = { unit_id: number; unit_name: string; factor: number }

export async function ensureComponentUnitColumns(query: (text: string) => Promise<unknown> = (text) => sql.unsafe(text)) {
  await query("ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS unit_id INTEGER")
  await query("ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS unit_quantity NUMERIC(18,6)")
}

/** وحدات كل مكوّن — الرئيسية (معامل 1) أولاً. */
export async function loadComponentUnits(componentIds: number[]) {
  const ids = [...new Set(componentIds.map(Number).filter((id) => id > 0))]
  const map = new Map<number, ComponentUnit[]>()
  if (!ids.length) return map
  const rows = (await sql`
    SELECT pu.product_id, pu.unit_id, COALESCE(u.unit_name, '') AS unit_name, COALESCE(pu.to_main_qnty, 1) AS factor
    FROM product_units pu LEFT JOIN units u ON u.id = pu.unit_id
    WHERE pu.product_id = ANY(${ids}::int[])
    ORDER BY pu.product_id, CASE WHEN COALESCE(pu.to_main_qnty, 1) = 1 THEN 0 ELSE 1 END, pu.id
  `) as any[]
  for (const row of rows) {
    const list = map.get(Number(row.product_id)) || []
    if (!list.some((unit) => unit.unit_id === Number(row.unit_id))) list.push({ unit_id: Number(row.unit_id), unit_name: String(row.unit_name || ""), factor: Number(row.factor) > 0 ? Number(row.factor) : 1 })
    map.set(Number(row.product_id), list)
  }
  return map
}

/**
 * يحوّل الكمية المُدخلة بوحدة المكوّن إلى الوحدة الرئيسية. الأصناف ذات القياس (طول/عرض...) تبقى بوحدتها
 * الرئيسية لأن كميتها محسوبة من الأبعاد. يرمي خطأً إن كانت الوحدة ليست من وحدات الصنف.
 */
export function resolveComponentUnit(units: ComponentUnit[] | undefined, unitId: unknown, enteredQuantity: number, measurmentId: number) {
  const main = units?.[0]
  if (measurmentId !== 1) return { unit_id: main?.unit_id ?? null, unit_quantity: enteredQuantity, quantity: enteredQuantity }
  const wanted = Number(unitId)
  const unit = wanted > 0 ? units?.find((row) => row.unit_id === wanted) : main
  if (wanted > 0 && !unit) throw new Error("الوحدة المختارة ليست من وحدات مكون التصنيع")
  const factor = unit?.factor ?? 1
  return { unit_id: unit?.unit_id ?? null, unit_quantity: enteredQuantity, quantity: enteredQuantity * factor }
}

/** البحث برقم الصنف أو باركوده أو باركود إحدى وحداته (استيراد Excel) — بضاعة فقط، بلا الصنف نفسه. */
export async function lookupComponentsByCode(codes: string[], excludeProductId: number) {
  const list = [...new Set(codes.map((code) => String(code || "").trim()).filter(Boolean))].slice(0, 10000)
  if (!list.length) return []
  const query = (withUnitBarcodes: boolean) => sql`
    WITH wanted AS (SELECT code FROM unnest(${list}::text[]) AS code)
    SELECT DISTINCT ON (w.code) w.code, p.id, p.product_code, p.product_name, COALESCE(p.measurment_id, 1) AS measurment_id, hit.unit_id AS barcode_unit_id
    FROM wanted w
    JOIN LATERAL (
      SELECT p.id, NULL::int AS unit_id, 0 AS rank FROM products p WHERE UPPER(p.product_code) = UPPER(w.code)
      UNION ALL SELECT p.id, NULL::int, 1 FROM products p WHERE p.barcode = w.code
      ${withUnitBarcodes ? sql.unsafe("UNION ALL SELECT b.product_id, b.unit_id, 2 FROM product_unit_barcodes b WHERE b.barcode = w.code") : sql.unsafe("")}
    ) hit ON true
    JOIN products p ON p.id = hit.id
    WHERE COALESCE(p.deleted, false) = false AND COALESCE(p.status, 1) <> 3 AND COALESCE(p.type, 1) <> 2 AND p.id <> ${excludeProductId}
    ORDER BY w.code, hit.rank, p.id
  `
  // product_unit_barcodes يُنشأ مع أول حفظ صنف — قد لا يوجد في شركة جديدة
  const hasUnitBarcodes = Boolean(((await sql`SELECT to_regclass('product_unit_barcodes') IS NOT NULL AS ok`) as any[])[0]?.ok)
  const rows = (await query(hasUnitBarcodes)) as any[]
  const units = await loadComponentUnits(rows.map((row) => Number(row.id)))
  return rows.map((row) => ({
    code: String(row.code),
    id: Number(row.id),
    product_code: String(row.product_code || ""),
    product_name: String(row.product_name || ""),
    measurment_id: Number(row.measurment_id || 1),
    barcode_unit_id: row.barcode_unit_id == null ? null : Number(row.barcode_unit_id),
    units: units.get(Number(row.id)) || [],
  }))
}
