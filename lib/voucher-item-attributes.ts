import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// خصائص الصنف المختارة في سطر السند ("تهيئة الصنف"): تُحفظ مرتين —
//  1) روابط voucher_item_attributes_tbl إلى product_atrributes_values_tbl (للتقارير والاستعلام)
//  2) نسخة JSON على السطر نفسه voucher_items_tbl.selected_attributes — مرجع لا يضيع: الروابط تُحذف تلقائياً
//     (ON DELETE CASCADE) إن أُعيد إنشاء قيم الصنف، وكانت قيمة لا تطابق جدول القيم تُهمَل بصمت.

export type SelectedAttributes = Record<string, string>

export function ensureSelectedAttributesColumn() {
  return runSchemaOnce("lib/voucher-item-attributes.ts#ensureSelectedAttributesColumn", async () => {
    await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS selected_attributes JSONB`
  })
}

export function cleanSelection(value: unknown): SelectedAttributes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const result: SelectedAttributes = {}
  for (const [name, selected] of Object.entries(value as Record<string, unknown>)) {
    const key = String(name || "").trim(), text = String(selected ?? "").trim()
    if (key && text) result[key] = text
  }
  return result
}

/** يحفظ اختيار الخصائص لسطر سند (ولسطر الطلبية المرتبط إن وُجد) — المطابقة باسم الخاصية واسم القيمة معاً */
export async function saveVoucherItemSelection(voucherItemId: number, productId: number, selection: unknown, orderItemId?: number | null) {
  const selected = cleanSelection(selection)
  const entries = Object.entries(selected)
  await ensureSelectedAttributesColumn()
  await sql`UPDATE voucher_items_tbl SET selected_attributes = ${entries.length ? JSON.stringify(selected) : null}::jsonb WHERE id = ${voucherItemId}`
  if (!entries.length || !(productId > 0)) return
  for (const [name, value] of entries) {
    await sql`
      INSERT INTO voucher_item_attributes_tbl (voucher_item_id, product_attribute_value_id)
      SELECT ${voucherItemId}, pav.id
      FROM product_atrributes_values_tbl pav
      JOIN attributes_tbl a ON a.id = pav.attr_id
      JOIN attribute_values_tbl av ON av.id = pav.value_id
      WHERE pav.product_id = ${productId} AND a.name = ${name} AND av.name = ${value}
      ON CONFLICT DO NOTHING
    `
    if (orderItemId) {
      await sql`
        INSERT INTO order_item_attributes_tbl (order_item_id, product_attribute_value_id)
        SELECT ${orderItemId}, pav.id
        FROM product_atrributes_values_tbl pav
        JOIN attributes_tbl a ON a.id = pav.attr_id
        JOIN attribute_values_tbl av ON av.id = pav.value_id
        WHERE pav.product_id = ${productId} AND a.name = ${name} AND av.name = ${value}
        ON CONFLICT DO NOTHING
      `
    }
  }
}

/** نسخ JSON المحفوظة على الأسطر — تُكمل ما لم تُرجعه روابط الجدول */
export async function savedSelections(itemIds: number[]): Promise<Map<number, SelectedAttributes>> {
  const map = new Map<number, SelectedAttributes>()
  if (!itemIds.length) return map
  await ensureSelectedAttributesColumn()
  const rows = await sql`SELECT id, selected_attributes FROM voucher_items_tbl WHERE id = ANY(${itemIds}::bigint[]) AND selected_attributes IS NOT NULL`
  for (const row of rows as any[]) {
    const selection = cleanSelection(row.selected_attributes)
    if (Object.keys(selection).length) map.set(Number(row.id), selection)
  }
  return map
}

/**
 * يرفض حفظ سطر صنف له خصائص (المتغيرات والخصائص) دون اختيار قيمة صالحة لكل خاصية.
 * يُعيد رسالة الخطأ أو null.
 */
export async function missingSelectionsMessage(items: any[]): Promise<string | null> {
  const rows = (Array.isArray(items) ? items : []).filter((row) => Number(row?.item_id ?? row?.product_id) > 0 && Number(row?.quantity ?? row?.qnty ?? 0) > 0)
  const ids = [...new Set(rows.map((row) => Number(row.item_id ?? row.product_id)))]
  if (!ids.length) return null
  const hasColumn = (await sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'attributes' LIMIT 1`).length > 0
  if (!hasColumn) return null
  const products = await sql`
    SELECT id, product_name, attributes FROM products
    WHERE id = ANY(${ids}::int[]) AND jsonb_typeof(attributes) = 'array' AND jsonb_array_length(attributes) > 0
  `
  const byId = new Map<number, any>((products as any[]).map((row) => [Number(row.id), row]))
  for (const row of rows) {
    const product = byId.get(Number(row.item_id ?? row.product_id))
    if (!product) continue
    const attributes = (Array.isArray(product.attributes) ? product.attributes : [])
      .map((attribute: any) => ({ name: String(attribute?.name || "").trim(), values: (Array.isArray(attribute?.values) ? attribute.values : []).map((value: unknown) => String(value || "").trim()).filter(Boolean) }))
      .filter((attribute: any) => attribute.name && attribute.values.length)
    if (!attributes.length) continue
    const selected = cleanSelection(row.selected_attributes)
    const missing = attributes.filter((attribute: any) => !attribute.values.includes(selected[attribute.name])).map((attribute: any) => attribute.name)
    if (missing.length) return `يجب اختيار خصائص الصنف "${row.product_name || row.item_name || product.product_name}": ${missing.join("، ")}`
  }
  return null
}
