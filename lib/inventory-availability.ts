import sql, { resolveCurrentDbName } from "@/lib/database"

export type InventoryAvailabilityResult = {
  product_id: number
  product_name: string
  parent_product_name: string
  store_id: number
  quantity: number
  available_stock: number
  available: boolean
  source_type: "component" | "product"
  features?: Record<string, string>
  voucher_date?: string
  product_code?: string
  barcode?: string
  unit_id?: number | null
  unit_name?: string
  unit_price?: number
  measurment_id?: number
  length?: number | null
  width?: number | null
  height?: number | null
  count?: number | null
}

export type ItemAvailabilityParameters = {
  item_id: number
  unit_id: number | null
  store_id: number
  expiry_date?: string | null
  voucher_date?: string
  attribute_value_ids?: number[]
  features?: Record<string, string> | string[]
}

export type ItemAvailability = {
  item_id: number
  unit_id: number | null
  store_id: number
  expiry_date: string | null
  voucher_date: string
  to_main_unit_quantity: number
  available_main_unit_quantity: number
  available_unit_quantity: number
  attribute_value_ids: number[]
}

const IN_TYPES = [8, 15, 16, 17, 18]
const OUT_TYPES = [9, 11, 12, 13, 14, 19]
const INTERNAL_TRANSFER_TYPE = 10
const preparedDatabases = new Set<string>()

async function ensureMainUnitQuantity() {
  const databaseName = await resolveCurrentDbName()
  if (preparedDatabases.has(databaseName)) return
  await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS main_unit_quantity NUMERIC(20,6)`
  await sql`CREATE TABLE IF NOT EXISTS attributes_tbl (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)`
  await sql`CREATE TABLE IF NOT EXISTS attribute_values_tbl (id SERIAL PRIMARY KEY, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(attr_id, name))`
  await sql`CREATE TABLE IF NOT EXISTS product_atrributes_values_tbl (id BIGSERIAL UNIQUE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, value_id INTEGER NOT NULL REFERENCES attribute_values_tbl(id) ON DELETE CASCADE, image_url TEXT, PRIMARY KEY(product_id, attr_id, value_id))`
  await sql`
    UPDATE voucher_items_tbl vi SET main_unit_quantity = (COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) * COALESCE((
      SELECT pu.to_main_qnty FROM product_units pu
      WHERE pu.product_id=vi.item_id AND pu.unit_id=vi.unit_id LIMIT 1
    ), 1)
    WHERE vi.main_unit_quantity IS DISTINCT FROM (COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) * COALESCE((
      SELECT pu.to_main_qnty FROM product_units pu
      WHERE pu.product_id=vi.item_id AND pu.unit_id=vi.unit_id LIMIT 1
    ), 1)
  `
  await sql`
    CREATE OR REPLACE FUNCTION set_voucher_item_main_unit_quantity() RETURNS trigger AS $$
    BEGIN
      NEW.main_unit_quantity := (COALESCE(NEW.qnty, 0) + COALESCE(NEW.bonus, 0)) * COALESCE((
        SELECT pu.to_main_qnty FROM product_units pu
        WHERE pu.product_id=NEW.item_id AND pu.unit_id=NEW.unit_id LIMIT 1
      ), 1);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `
  await sql`DROP TRIGGER IF EXISTS voucher_item_main_unit_quantity_trigger ON voucher_items_tbl`
  await sql`CREATE TRIGGER voucher_item_main_unit_quantity_trigger BEFORE INSERT OR UPDATE OF item_id, unit_id, qnty, bonus ON voucher_items_tbl FOR EACH ROW EXECUTE FUNCTION set_voucher_item_main_unit_quantity()`
  preparedDatabases.add(databaseName)
}

/** Global stock lookup used by drafts, vouchers, sales documents and stock pages. */
export async function getItemAvailability(parameters: ItemAvailabilityParameters): Promise<ItemAvailability> {
  await ensureMainUnitQuantity()
  const itemId = Number(parameters.item_id)
  const unitId = Number(parameters.unit_id || 0) || null
  const storeId = Number(parameters.store_id)
  const expiryDate = parameters.expiry_date ? String(parameters.expiry_date).slice(0, 10) : null
  const voucherDate = parameters.voucher_date ? String(parameters.voucher_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
  const featureNames = Array.isArray(parameters.features) ? parameters.features.map(String) : Object.values(parameters.features || {}).map(String)
  const resolvedFeatureRows: any[] = featureNames.length ? await sql`
    SELECT DISTINCT pav.id FROM product_atrributes_values_tbl pav
    JOIN attribute_values_tbl av ON av.id=pav.value_id
    WHERE pav.product_id=${itemId} AND av.name=ANY(${featureNames}::text[])
  ` : []
  const attributeValueIds = [...new Set([...(parameters.attribute_value_ids || []).map(Number), ...resolvedFeatureRows.map((row) => Number(row.id))].filter(Boolean))]
  const unitRows: any[] = unitId ? await sql`SELECT COALESCE(to_main_qnty,1) AS to_main_qnty FROM product_units WHERE product_id=${itemId} AND unit_id=${unitId} LIMIT 1` : []
  const toMainUnitQuantity = Number(unitRows[0]?.to_main_qnty || 1)
  const rows = await sql`
    SELECT COALESCE(SUM(
      CASE
        WHEN vh.vch_type = ${INTERNAL_TRANSFER_TYPE} AND vh.from_store_id = ${storeId}
          THEN -COALESCE(vi.main_unit_quantity, (COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) * COALESCE(pu.to_main_qnty, 1), 0)
        WHEN vh.vch_type = ${INTERNAL_TRANSFER_TYPE} AND COALESCE(vh.to_store_id, vi.store_id) = ${storeId}
          THEN COALESCE(vi.main_unit_quantity, (COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) * COALESCE(pu.to_main_qnty, 1), 0)
        WHEN vh.vch_type = ANY(${IN_TYPES}::int[]) AND COALESCE(vi.store_id, vh.to_store_id) = ${storeId}
          THEN COALESCE(vi.main_unit_quantity, (COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) * COALESCE(pu.to_main_qnty, 1), 0)
        WHEN vh.vch_type = ANY(${OUT_TYPES}::int[]) AND COALESCE(vi.store_id, vh.to_store_id) = ${storeId}
          THEN -COALESCE(vi.main_unit_quantity, (COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) * COALESCE(pu.to_main_qnty, 1), 0)
        ELSE 0
      END
    ), 0) AS available_main
    FROM voucher_items_tbl vi
    JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
    LEFT JOIN product_units pu ON pu.product_id = vi.item_id AND pu.unit_id = vi.unit_id
    WHERE vi.item_id = ${itemId}
      AND vh.status = 2
      AND vh.vch_date::date <= ${voucherDate}::date
      AND (${expiryDate}::date IS NULL OR vi.expiry_date = ${expiryDate}::date)
      AND (${attributeValueIds.length} = 0 OR (
        SELECT COUNT(DISTINCT via.product_attribute_value_id)
        FROM voucher_item_attributes_tbl via
        WHERE via.voucher_item_id=vi.id AND via.product_attribute_value_id=ANY(${attributeValueIds}::bigint[])
      ) = ${attributeValueIds.length})
      AND vh.vch_type = ANY(${[...IN_TYPES, ...OUT_TYPES, INTERNAL_TRANSFER_TYPE]}::int[])
  `
  const availableMain = Number((rows as any[])[0]?.available_main || 0)
  return { item_id: itemId, unit_id: unitId, store_id: storeId, expiry_date: expiryDate, voucher_date: voucherDate, to_main_unit_quantity: toMainUnitQuantity, available_main_unit_quantity: availableMain, available_unit_quantity: availableMain / toMainUnitQuantity, attribute_value_ids: attributeValueIds }
}

export async function getAvailableMainUnitQuantity(parameters: ItemAvailabilityParameters): Promise<number> {
  return (await getItemAvailability(parameters)).available_main_unit_quantity
}

export async function checkDraftSpecifications(items: any[]): Promise<string[]> {
  const productIds = items.map((item) => Number(item.product_id)).filter(Boolean)
  if (!productIds.length) return []
  const componentRows: any[] = await sql`SELECT product_id, component_id FROM product_manufacturing_components WHERE product_id = ANY(${productIds}::int[])`
  const allIds = [...new Set([...productIds, ...componentRows.map((row) => Number(row.component_id))])]
  const attributeRows: any[] = await sql`SELECT pav.product_id, pav.attr_id, a.name FROM product_atrributes_values_tbl pav JOIN attributes_tbl a ON a.id=pav.attr_id WHERE pav.product_id=ANY(${allIds}::int[]) GROUP BY pav.product_id,pav.attr_id,a.name`
  const errors: string[] = []
  for (const item of items) {
    const specifications = item.specifications && typeof item.specifications === "object" ? item.specifications : {}
    const productAttributes = attributeRows.filter((row) => Number(row.product_id) === Number(item.product_id))
    const components = componentRows.filter((row) => Number(row.product_id) === Number(item.product_id))
    const missingProduct = productAttributes.find((row) => !specifications.product?.[row.attr_id])
    const missingComponent = components.flatMap((component) => attributeRows.filter((row) => Number(row.product_id) === Number(component.component_id)).map((row) => ({ ...row, component_id: component.component_id }))).find((row) => !specifications.components?.[row.component_id]?.[row.attr_id])
    if ((productAttributes.length || components.some((component) => attributeRows.some((row) => Number(row.product_id) === Number(component.component_id)))) && !specifications.reviewed) errors.push(`${item.product_name}: لم تتم مراجعة المتغيرات والخصائص`)
    else if (missingProduct) errors.push(`${item.product_name}: الخاصية ${missingProduct.name} غير محددة`)
    else if (missingComponent) errors.push(`${item.product_name}: خاصية مكون التصنيع ${missingComponent.name} غير محددة`)
  }
  return errors
}

export async function checkDraftProductionAvailability(draftId: number) {
  await ensureMainUnitQuantity()
  const items: any[] = await sql`
    SELECT i.*, d.order_date AS voucher_date, COALESCE(pu.to_main_qnty, 1) AS to_main_qnty,
           p.product_code, p.barcode AS product_barcode,
           (SELECT u2.unit_name FROM product_units pu2 JOIN units u2 ON u2.id=pu2.unit_id WHERE pu2.product_id=p.id ORDER BY CASE WHEN COALESCE(pu2.to_main_qnty,1)=1 THEN 0 ELSE 1 END, pu2.id LIMIT 1) AS main_unit,
           p.last_purchase_price,
           (SELECT pu2.unit_id FROM product_units pu2 WHERE pu2.product_id=p.id ORDER BY CASE WHEN COALESCE(pu2.to_main_qnty,1)=1 THEN 0 ELSE 1 END, pu2.id LIMIT 1) AS main_unit_id,
           COALESCE(p.measurment_id, 1) AS product_measurment_id
    FROM sales_order_draft_items i
    JOIN sales_order_drafts d ON d.id=i.draft_id
    JOIN products p ON p.id=i.product_id
    LEFT JOIN product_units pu ON pu.product_id=i.product_id AND pu.unit_id=i.unit_id
    WHERE i.draft_id=${draftId}
    ORDER BY i.id
  `
  const productIds = items.map((item) => Number(item.product_id)).filter(Boolean)
  const components: any[] = productIds.length ? await sql`
    SELECT pmc.product_id, pmc.component_id, pmc.quantity, pmc.length, pmc.width, pmc.height, pmc.count,
           p.product_name, p.product_code, p.barcode,
           (SELECT u2.unit_name FROM product_units pu2 JOIN units u2 ON u2.id=pu2.unit_id WHERE pu2.product_id=p.id ORDER BY CASE WHEN COALESCE(pu2.to_main_qnty,1)=1 THEN 0 ELSE 1 END, pu2.id LIMIT 1) AS main_unit,
           p.last_purchase_price,
           (SELECT pu2.unit_id FROM product_units pu2 WHERE pu2.product_id=p.id ORDER BY CASE WHEN COALESCE(pu2.to_main_qnty,1)=1 THEN 0 ELSE 1 END, pu2.id LIMIT 1) AS main_unit_id,
           COALESCE(p.measurment_id, 1) AS measurment_id
    FROM product_manufacturing_components pmc
    JOIN products p ON p.id=pmc.component_id
    WHERE pmc.product_id=ANY(${productIds}::int[])
  ` : []
  const requirements = new Map<string, InventoryAvailabilityResult>()
  for (const item of items) {
    const storeId = Number(item.store_id || 0)
    const parentMainQuantity = Number(item.quantity || 0) * Number(item.to_main_qnty || 1)
    const itemComponents = components.filter((component) => Number(component.product_id) === Number(item.product_id))
    const requiredRows = itemComponents.length ? itemComponents.map((component) => ({ id: Number(component.component_id), name: component.product_name, quantity: parentMainQuantity * Number(component.quantity), source_type: "component" as const, features: item.specifications?.components?.[component.component_id] || {}, product_code: component.product_code, barcode: component.barcode, unit_id: component.main_unit_id == null ? null : Number(component.main_unit_id), unit_name: component.main_unit, unit_price: Number(component.last_purchase_price || 0), measurment_id: Number(component.measurment_id || 1), length: component.length == null ? null : Number(component.length), width: component.width == null ? null : Number(component.width), height: component.height == null ? null : Number(component.height), count: component.count == null ? null : parentMainQuantity * Number(component.count) })) : [{ id: Number(item.product_id), name: item.product_name, quantity: parentMainQuantity, source_type: "product" as const, features: item.specifications?.product || {}, product_code: item.product_code, barcode: item.product_barcode, unit_id: item.main_unit_id == null ? null : Number(item.main_unit_id), unit_name: item.main_unit, unit_price: Number(item.last_purchase_price || 0), measurment_id: Number(item.product_measurment_id || 1), length: item.length == null ? null : Number(item.length), width: item.width == null ? null : Number(item.width), height: item.height == null ? null : Number(item.height), count: item.count == null ? null : Number(item.count) }]
    for (const required of requiredRows) {
      const featureKey = Object.entries(required.features).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}:${value}`).join("|")
      const measurementKey = `${required.measurment_id}|${required.length}|${required.width}|${required.height}`
      const key = `${required.id}|${storeId}|${featureKey}|${measurementKey}`
      const existing = requirements.get(key)
      if (existing) { existing.quantity += required.quantity; if (existing.count != null && required.count != null) existing.count += required.count }
      else requirements.set(key, { product_id: required.id, product_name: required.name, parent_product_name: item.product_name, store_id: storeId, quantity: required.quantity, available_stock: 0, available: false, source_type: required.source_type, features: required.features, voucher_date: String(item.voucher_date || "").slice(0, 10), product_code: required.product_code, barcode: required.barcode, unit_id: required.unit_id, unit_name: required.unit_name, unit_price: required.unit_price, measurment_id: required.measurment_id, length: required.length, width: required.width, height: required.height, count: required.count })
    }
  }
  for (const requirement of requirements.values()) {
    requirement.available_stock = await getAvailableMainUnitQuantity({ item_id: requirement.product_id, unit_id: null, store_id: requirement.store_id, voucher_date: requirement.voucher_date, features: requirement.features })
    requirement.available = requirement.available_stock + 1e-9 >= requirement.quantity
  }
  return { items: [...requirements.values()], specification_errors: await checkDraftSpecifications(items) }
}
