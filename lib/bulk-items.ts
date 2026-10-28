import sql, { withTenantTransaction } from "@/lib/database"
import { validateLeafAccountFields } from "@/lib/leaf-accounts"
import { BULK_ITEM_FIELDS, type BulkItemField, type BulkItemFilters, type BulkPriceChange } from "@/lib/bulk-items-shared"

/**
 * أدوات ⇐ تعديل الأصناف: تعديل جماعي لحقول الأصناف المطابقة للفلاتر (المجموعة، التصنيف، نوع المخزون، العلامة
 * التجارية...) ورفع/خفض أسعار البيع بنسبة مئوية من السعر الحالي. الحقول من قائمة بيضاء (BULK_ITEM_FIELDS) فقط.
 */

/** شرط WHERE للفلاتر — معاملات مرقّمة ($n) لاستخدامه داخل sql.unsafe */
function filterClause(filters: BulkItemFilters, values: unknown[]) {
  const add = (value: unknown) => { values.push(value); return `$${values.length}` }
  const where = ["COALESCE(p.deleted, false) = false", "COALESCE(p.status, 1) <> 3"]
  const ids = (list?: unknown[]) => (Array.isArray(list) ? list.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [])
  const groups = ids(filters.groupIds)
  if (groups.length) where.push(`p.main_stock_id = ANY(${add(groups)}::int[])`)
  const categories = ids(filters.categoryIds)
  if (categories.length) where.push(`p.category_id = ANY(${add(categories)}::int[])`)
  const productTypes = (filters.productTypes || []).map(String).filter(Boolean)
  if (productTypes.length) where.push(`COALESCE(NULLIF(p.product_type::text, ''), '1') = ANY(${add(productTypes)}::text[])`)
  const brands = ids(filters.brandIds)
  if (brands.length) where.push(`EXISTS (SELECT 1 FROM product_brands_tbl pb WHERE pb.product_id = p.id AND pb.brand_id = ANY(${add(brands)}::int[]))`)
  const taxClasses = ids(filters.taxClassificationIds)
  if (taxClasses.length) where.push(`p.tax_classification_id = ANY(${add(taxClasses)}::int[])`)
  if (filters.itemKind === "item") where.push("COALESCE(p.type, 1) = 1")
  if (filters.itemKind === "service") where.push("COALESCE(p.type, 1) = 2")
  if (filters.status === "active") where.push("COALESCE(p.status, 1) = 1")
  if (filters.status === "frozen") where.push("COALESCE(p.status, 1) = 2")
  const search = String(filters.search || "").trim()
  if (search) where.push(`(p.product_code ILIKE ${add(`%${search}%`)} OR p.product_name ILIKE $${values.length} OR COALESCE(p.barcode, '') = ${add(search)})`)
  if (filters.codeFrom) where.push(`p.product_code >= ${add(String(filters.codeFrom).trim())}`)
  if (filters.codeTo) where.push(`p.product_code <= ${add(String(filters.codeTo).trim())}`)
  return where.join(" AND ")
}

export async function ensureBulkItemSchema() {
  await sql`CREATE TABLE IF NOT EXISTS product_brands_tbl (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, brand_type_id INTEGER, required_in_transactions INTEGER, brand_id INTEGER)`
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_order_quantity NUMERIC(15,4) NOT NULL DEFAULT 0`
}

/** الأصناف المطابقة مع سعر فئة السعر المختارة (للمعاينة) */
export async function previewBulkItems(filters: BulkItemFilters, priceCategoryId: number | null) {
  await ensureBulkItemSchema()
  const values: unknown[] = []
  const where = filterClause(filters, values)
  values.push(priceCategoryId || 1)
  const priceParam = `$${values.length}`
  return sql.unsafe(`
    SELECT p.id, p.product_code, p.product_name, COALESCE(p.type, 1) AS type, COALESCE(p.status, 1) AS status,
      COALESCE(NULLIF(p.product_type::text, ''), '1') AS product_type, g.group_name, pc.name AS category_name,
      p.tax_rate, p.discount_rate, w.warehouse_name AS default_store_name,
      price.price AS sale_price, price.unit_name AS price_unit_name, price.units_count
    FROM products p
    LEFT JOIN item_groups g ON g.id = p.main_stock_id
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    LEFT JOIN warehouses w ON w.id = p.default_store
    LEFT JOIN LATERAL (
      SELECT pr.price, u.unit_name, (SELECT COUNT(*) FROM product_prices x WHERE x.product_id = p.id AND x.price_category_id = ${priceParam}::int) AS units_count
      FROM product_prices pr
      LEFT JOIN product_units pu ON pu.product_id = pr.product_id AND pu.unit_id = pr.unit_id
      LEFT JOIN units u ON u.id = pr.unit_id
      WHERE pr.product_id = p.id AND pr.price_category_id = ${priceParam}::int
      ORDER BY pu.id NULLS LAST, pr.id LIMIT 1
    ) price ON true
    WHERE ${where}
    ORDER BY p.product_code
    LIMIT 5000
  `, values)
}

const roundTo = (value: number, step: number) => (step > 0 ? Math.round(value / step) * step : Math.round(value * 1000) / 1000)

/**
 * يطبّق التعديلات على الأصناف المحددة (productIds ضمن نتيجة الفلاتر) داخل معاملة واحدة:
 * changes = { field: value } من BULK_ITEM_FIELDS، price = نسبة على أسعار البيع لفئة أو لكل الفئات.
 */
export async function applyBulkItems(input: { filters: BulkItemFilters; productIds: number[]; changes: Partial<Record<BulkItemField, unknown>>; price?: BulkPriceChange | null }) {
  await ensureBulkItemSchema()
  const values: unknown[] = []
  const where = filterClause(input.filters, values)
  const requested = [...new Set((input.productIds || []).map(Number).filter((id) => id > 0))]
  if (!requested.length) throw new Error("حدد صنفاً واحداً على الأقل")
  values.push(requested)
  // المعرّفات المرسلة تُقيَّد بنتيجة الفلاتر نفسها — لا تعديل لصنف خارجها
  const ids = ((await sql.unsafe(`SELECT p.id FROM products p WHERE ${where} AND p.id = ANY($${values.length}::int[])`, values)) as any[]).map((row) => Number(row.id))
  if (!ids.length) throw new Error("لا توجد أصناف مطابقة للتعديل")

  const sets: string[] = []
  const setValues: unknown[] = []
  const accountChecks: Record<string, unknown> = {}
  for (const [field, raw] of Object.entries(input.changes || {}) as [BulkItemField, unknown][]) {
    const def = BULK_ITEM_FIELDS[field] as { label: string; kind: string; max?: number; required?: boolean; maxLength?: number; options?: { label: string; value: string | number }[] }
    if (!def) throw new Error(`حقل غير مسموح: ${field}`)
    let value: unknown
    if (def.kind === "number") {
      const number = Number(raw)
      if (raw === "" || raw == null || !Number.isFinite(number) || number < 0 || (def.max != null && number > def.max)) throw new Error(`قيمة "${def.label}" غير صالحة`)
      value = number
    } else if (def.kind === "lookup" || def.kind === "account") {
      const id = Number(raw)
      value = Number.isInteger(id) && id > 0 ? id : null
      if (def.required && !value) throw new Error(`اختر "${def.label}"`)
      if (def.kind === "account" && value) accountChecks[def.label] = value
    } else if (def.kind === "option") {
      const option = def.options?.find((entry) => String(entry.value) === String(raw))
      if (!option) throw new Error(`قيمة "${def.label}" غير صالحة`)
      value = option.value
    } else {
      value = String(raw ?? "").trim().slice(0, def.maxLength || 200) || null
    }
    setValues.push(value)
    sets.push(`${field} = $${setValues.length}`)
    // أعمدة رمز الحساب المرافقة (selling_account_code...) تُحدَّث مع المعرّف
    if (def.kind === "account") sets.push(`${field.replace(/_id$/, "_code")} = (SELECT code FROM account_tbl WHERE id = $${setValues.length})`)
  }
  const leafError = Object.keys(accountChecks).length ? await validateLeafAccountFields(accountChecks) : null
  if (leafError) throw new Error(leafError)

  const price = input.price && Number(input.price.percent) ? input.price : null
  if (!sets.length && !price) throw new Error("اختر حقلاً واحداً على الأقل للتعديل أو نسبة تعديل الأسعار")
  if (price) {
    const percent = Number(price.percent)
    if (!Number.isFinite(percent) || percent <= -100 || percent > 1000) throw new Error("نسبة تعديل السعر يجب أن تكون أكبر من -100% وحتى 1000%")
  }

  return withTenantTransaction(async () => {
    let updatedItems = 0, updatedPrices = 0
    if (sets.length) {
      setValues.push(ids)
      const result = await sql.unsafe(`UPDATE products SET ${sets.join(", ")}, updated_at = NOW() WHERE id = ANY($${setValues.length}::int[]) RETURNING id`, setValues)
      updatedItems = (result as any[]).length
    }
    if (price) {
      const factor = 1 + Number(price.percent) / 100
      const step = Number(price.roundTo) || 0
      const categoryId = Number(price.priceCategoryId) || 0
      const rows = (await sql`
        SELECT id, price FROM product_prices
        WHERE product_id = ANY(${ids}::int[]) AND (${categoryId} = 0 OR price_category_id = ${categoryId})
          AND COALESCE(price, 0) > 0
      `) as any[]
      for (const row of rows) {
        await sql`UPDATE product_prices SET price = ${roundTo(Number(row.price) * factor, step)} WHERE id = ${Number(row.id)}`
      }
      updatedPrices = rows.length
    }
    return { matched: ids.length, updatedItems, updatedPrices }
  })
}
