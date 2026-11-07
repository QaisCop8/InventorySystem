import sql, { getTenantPool } from "@/lib/database"
import { ensureComponentUnitColumns, lookupComponentsByCode, resolveComponentUnit, type ComponentUnit } from "@/lib/manufacturing-component-units"

// أدوات ⇐ استيراد مكونات التصنيع من Excel: كل سطر = صنف منتَج + مكوّن + وحدة + كمية.
// "إضافة فقط": المكوّن الموجود مسبقاً على الصنف خطأ. "تعديل": يُضاف الجديد وتُستبدل وحدة/كمية الموجود.
// نفس قواعد شاشة الصنف (product_manufacturing_components.quantity بالوحدة الرئيسية دائماً).

export type BulkComponentMode = "add" | "update"
export type BulkComponentInput = { key: string; product_code: string; component_code: string; unit: string; quantity: unknown }
export type BulkComponentRow = {
  key: string
  product_id: number | null
  product_name: string
  component_id: number | null
  component_name: string
  measurment_id: number
  units: ComponentUnit[]
  unit_id: number | null
  unit_name: string
  quantity: number | null
  exists: boolean
  existing_unit_name: string
  existing_quantity: number | null
  errors: string[]
  warnings: string[]
}

export class BulkComponentsError extends Error {}

export async function ensureManufacturingComponentsTable() {
  await sql`CREATE TABLE IF NOT EXISTS product_manufacturing_components (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
    UNIQUE(product_id, component_id),
    CHECK (product_id <> component_id)
  )`
  for (const column of ["length", "width", "height", "count"]) await sql.unsafe(`ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS ${column} NUMERIC(18,6)`)
  await ensureComponentUnitColumns()
}

const text = (value: unknown) => String(value ?? "").trim()
const sameText = (a: unknown, b: unknown) => text(a).toLowerCase() === text(b).toLowerCase()

export async function validateBulkComponents(inputs: BulkComponentInput[], mode: BulkComponentMode): Promise<BulkComponentRow[]> {
  if (inputs.length > 5000) throw new BulkComponentsError("الحد الأقصى 5000 سطر في المرة الواحدة")
  await ensureManufacturingComponentsTable()
  const codes = inputs.flatMap((row) => [text(row.product_code), text(row.component_code)])
  const found = new Map((await lookupComponentsByCode(codes, 0)).map((row) => [row.code, row]))

  const productIds = [...new Set(inputs.map((row) => found.get(text(row.product_code))?.id).filter((id): id is number => Boolean(id)))]
  const componentIds = [...new Set(inputs.map((row) => found.get(text(row.component_code))?.id).filter((id): id is number => Boolean(id)))]
  const allIds = [...new Set([...productIds, ...componentIds])]
  // الموجود حالياً: للمطابقة (إضافة/تعديل) ولكشف الحلقات (المكوّن يحتوي الصنف نفسه كمكوّن)
  const existingRows = allIds.length ? (await sql`
    SELECT pmc.product_id, pmc.component_id, COALESCE(pmc.unit_quantity, pmc.quantity) AS quantity, COALESCE(u.unit_name, '') AS unit_name
    FROM product_manufacturing_components pmc LEFT JOIN units u ON u.id = pmc.unit_id
    WHERE pmc.product_id = ANY(${allIds}::int[])
  `) as any[] : []
  const existing = new Map(existingRows.map((row) => [`${row.product_id}:${row.component_id}`, row]))

  const seen = new Map<string, number>()
  const fileEdges = new Set<string>()
  const rows = inputs.map((input, index) => {
    const product = found.get(text(input.product_code))
    const component = found.get(text(input.component_code))
    const row: BulkComponentRow = {
      key: input.key, product_id: product?.id ?? null, product_name: product?.product_name || "", component_id: component?.id ?? null,
      component_name: component?.product_name || "", measurment_id: component?.measurment_id || 1, units: component?.units || [],
      unit_id: null, unit_name: "", quantity: null, exists: false, existing_unit_name: "", existing_quantity: null, errors: [], warnings: [],
    }
    if (!text(input.product_code)) row.errors.push("رقم الصنف مطلوب")
    else if (!product) row.errors.push(`الصنف ${text(input.product_code)} غير موجود أو ليس بضاعة`)
    if (!text(input.component_code)) row.errors.push("رقم المكوّن مطلوب")
    else if (!component) row.errors.push(`المكوّن ${text(input.component_code)} غير موجود أو ليس بضاعة`)
    if (product && component && product.id === component.id) row.errors.push("لا يمكن أن يكون المكوّن هو الصنف نفسه")

    const rawQuantity = text(input.quantity).replace(/,/g, "")
    const quantity = Number(rawQuantity)
    if (!rawQuantity) row.errors.push("الكمية مطلوبة")
    else if (!Number.isFinite(quantity)) row.errors.push("الكمية يجب أن تكون رقماً")
    else if (quantity <= 0) row.errors.push("الكمية يجب أن تكون أكبر من صفر")
    else row.quantity = quantity

    if (component) {
      if (!component.units.length) row.errors.push("المكوّن بلا وحدات معرّفة")
      else if (text(input.unit)) {
        const unit = component.units.find((item) => sameText(item.unit_name, input.unit))
        if (!unit) row.errors.push(`الوحدة ${text(input.unit)} ليست من وحدات المكوّن (${component.units.map((item) => item.unit_name).join("، ")})`)
        else if (component.measurment_id !== 1 && unit.unit_id !== component.units[0].unit_id) row.errors.push(`المكوّن صنف قياس — وحدته الرئيسية فقط (${component.units[0].unit_name})`)
        else { row.unit_id = unit.unit_id; row.unit_name = unit.unit_name }
      } else {
        // بلا وحدة ⇐ الافتراضية: وحدة الباركود إن أُدخل باركود وحدة، وإلا الرئيسية
        const unit = (component.measurment_id === 1 && component.units.find((item) => item.unit_id === component.barcode_unit_id)) || component.units[0]
        row.unit_id = unit.unit_id; row.unit_name = unit.unit_name
        row.warnings.push("الوحدة الافتراضية")
      }
      if (component.measurment_id !== 1) row.warnings.push("صنف قياس: الكمية تُحفظ كعدد بأبعاد 1")
    }

    if (product && component && product.id !== component.id) {
      const pairKey = `${product.id}:${component.id}`
      if (seen.has(pairKey)) row.errors.push(`مكرر — نفس الصنف والمكوّن في السطر ${seen.get(pairKey)}`)
      else seen.set(pairKey, index + 1)
      const current = existing.get(pairKey)
      if (current) {
        row.exists = true
        row.existing_quantity = Number(current.quantity)
        row.existing_unit_name = String(current.unit_name || "")
        if (mode === "add") row.errors.push("المكوّن موجود مسبقاً على الصنف — اختر «تعديل» لتغييره")
      }
      if (existing.has(`${component.id}:${product.id}`) || fileEdges.has(`${component.id}:${product.id}`)) row.errors.push("حلقة: المكوّن يحتوي هذا الصنف ضمن مكوناته")
      fileEdges.add(pairKey)
    }
    return row
  })
  return rows
}

export async function saveBulkComponents(inputs: BulkComponentInput[], mode: BulkComponentMode) {
  const rows = await validateBulkComponents(inputs, mode)
  const valid = rows.filter((row) => !row.errors.length)
  const pool = await getTenantPool()
  const client = await pool.connect()
  let added = 0
  let updated = 0
  try {
    await client.query("BEGIN")
    for (const row of valid) {
      const measured = row.measurment_id !== 1
      const resolved = resolveComponentUnit(row.units, row.unit_id, row.quantity!, row.measurment_id)
      const result = await client.query(
        `INSERT INTO product_manufacturing_components (product_id, component_id, quantity, length, width, height, count, unit_id, unit_quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (product_id, component_id) DO ${mode === "update" ? "UPDATE SET quantity = EXCLUDED.quantity, length = EXCLUDED.length, width = EXCLUDED.width, height = EXCLUDED.height, count = EXCLUDED.count, unit_id = EXCLUDED.unit_id, unit_quantity = EXCLUDED.unit_quantity" : "NOTHING"}
         RETURNING (xmax = 0) AS inserted`,
        [row.product_id, row.component_id, resolved.quantity, measured ? 1 : null, measured ? 1 : null, row.measurment_id === 3 ? 1 : null, measured ? row.quantity : null, resolved.unit_id, resolved.unit_quantity],
      )
      if (!result.rows.length) row.errors.push("المكوّن موجود مسبقاً على الصنف")
      else if (result.rows[0].inserted) added++
      else updated++
    }
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
  return { rows, added, updated, failed: rows.filter((row) => row.errors.length).length }
}
