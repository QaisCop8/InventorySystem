import sql from "@/lib/database"
import { ensureProductUnitRoleColumns } from "@/lib/product-unit-roles-schema"

/**
 * وحدة التقارير (تبويب الوحدات في تعريف الصنف): تقارير أرصدة الأصناف تعرض الكميات بها بدل الوحدة الرئيسية.
 * الكميات ÷ معامل الوحدة، وأسعار/تكاليف الوحدة × المعامل (القيم الإجمالية لا تتغير)، و main_unit = اسم وحدة التقارير.
 * أصناف بلا وحدة تقارير مؤشَّرة تبقى بالوحدة الرئيسية. الحسابات الداخلية (جرد، تقييم، أرباح) تبقى بالوحدة الرئيسية —
 * التحويل يتم فقط عند إخراج التقرير.
 */
export async function applyReportUnits<T extends Record<string, any>>(
  rows: T[],
  options: { idField?: string; quantityFields: string[]; unitPriceFields?: string[]; unitNameField?: string },
): Promise<T[]> {
  const idField = options.idField || "id"
  const unitNameField = options.unitNameField || "main_unit"
  const ids = [...new Set(rows.map((row) => Number(row[idField])).filter((id) => id > 0))]
  if (!ids.length) return rows
  await ensureProductUnitRoleColumns()
  const units = await sql`
    SELECT DISTINCT ON (pu.product_id) pu.product_id, pu.to_main_qnty, u.unit_name
    FROM product_units pu
    LEFT JOIN units u ON u.id = pu.unit_id
    WHERE pu.product_id = ANY(${ids}::int[]) AND pu.is_report_unit AND COALESCE(pu.to_main_qnty, 0) > 0
    ORDER BY pu.product_id, pu.id
  `
  const byProduct = new Map((units as any[]).map((row) => [Number(row.product_id), { factor: Number(row.to_main_qnty), name: String(row.unit_name || "") }]))
  if (!byProduct.size) return rows
  const round = (value: number) => Math.round(value * 1e6) / 1e6
  return rows.map((row) => {
    const unit = byProduct.get(Number(row[idField]))
    if (!unit || unit.factor === 1) return unit ? { ...row, [unitNameField]: unit.name || row[unitNameField] } : row
    const next: Record<string, any> = { ...row, [unitNameField]: unit.name || row[unitNameField], report_unit_factor: unit.factor }
    for (const field of options.quantityFields) if (row[field] != null && row[field] !== "") next[field] = round(Number(row[field]) / unit.factor)
    for (const field of options.unitPriceFields || []) if (row[field] != null && row[field] !== "") next[field] = round(Number(row[field]) * unit.factor)
    return next as T
  })
}
