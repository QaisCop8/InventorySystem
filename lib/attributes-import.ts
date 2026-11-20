import sql, { withTenantTransaction } from "@/lib/database"

/**
 * أدوات ⇐ استيراد المتغيرات والخصائص من اكسل (2026-11-20).
 * كل سطر = صنف + متغير + خاصية (قيمة) + سعرها لكل فئة سعر (عمود باسم الفئة). الصنف يتكرر بعدد خصائصه:
 *   1001 | الحجم | صغير | 5 | 6
 *   1001 | الحجم | كبير | 8 | 9
 *   1001 | الطعم | حار  |   |        ⇐ خلية فارغة = سعر الصنف نفسه في تلك الفئة
 * "دمج": يُضاف المتغير/الخاصية الجديدان وتُحدَّث أسعار الموجودة (الخلايا المعبأة فقط) — ما ليس في الملف يبقى.
 * "استبدال": متغيرات وخصائص كل صنف في الملف = ما في الملف فقط.
 * الأسعار بصيغة value_prices[قيمة] = { [price_category_id]: السعر الفعلي } (lib/attribute-prices.ts).
 */

export type AttributesImportMode = "merge" | "replace"
export type AttributesImportInput = { key: string; product_code: string; attribute: string; value: string; prices: Record<string, unknown> }
export type AttributesImportRow = {
  key: string
  product_name: string
  /** الخاصية موجودة مسبقاً على الصنف (تُحدَّث أسعارها) */
  exists: boolean
  errors: string[]
  warnings: string[]
}

export class AttributesImportError extends Error {}

const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max)
const lower = (value: string) => value.toLocaleLowerCase()
const round4 = (value: number) => Math.round(value * 10000) / 10000

function parsePrice(raw: unknown): number | null | "invalid" {
  const value = String(raw ?? "").replace(/,/g, "").trim()
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && number <= 100_000_000 ? round4(number) : "invalid"
}

type ProductInfo = { id: number; code: string; name: string; type: number; attributes: any[]; categoryPrices: Map<number, number> }

async function loadContext(inputs: AttributesImportInput[]) {
  const codes = [...new Set(inputs.map((row) => text(row.product_code, 100)).filter(Boolean))]
  const products = codes.length
    ? await sql`SELECT id, product_code, product_name, COALESCE(type, 1) AS type, attributes FROM products WHERE product_code = ANY(${codes}::text[]) AND COALESCE(status, 1) <> 3` as any[]
    : []
  const ids = products.map((row) => Number(row.id))
  // سعر الصنف لكل فئة (الوحدة الرئيسية أولاً) — السعر الافتراضي للخاصية الجديدة في الفئات غير المعبأة
  const prices = ids.length
    ? await sql`
        SELECT DISTINCT ON (pp.product_id, pp.price_category_id) pp.product_id, pp.price_category_id, pp.price::float AS price
        FROM product_prices pp
        LEFT JOIN product_units pu ON pu.product_id = pp.product_id AND pu.unit_id = pp.unit_id
        WHERE pp.product_id = ANY(${ids}::int[])
        ORDER BY pp.product_id, pp.price_category_id, COALESCE(pu.to_main_qnty, 1), pp.id` as any[]
    : []
  const byCode = new Map<string, ProductInfo>()
  for (const row of products) {
    const categoryPrices = new Map<number, number>()
    for (const price of prices) if (Number(price.product_id) === Number(row.id)) categoryPrices.set(Number(price.price_category_id), Number(price.price) || 0)
    byCode.set(lower(String(row.product_code)), { id: Number(row.id), code: String(row.product_code), name: String(row.product_name || ""), type: Number(row.type) || 1, attributes: Array.isArray(row.attributes) ? row.attributes : [], categoryPrices })
  }
  const categories = await sql`SELECT id FROM pricecategory WHERE COALESCE(status, 1) <> 3` as any[]
  return { byCode, categoryIds: new Set(categories.map((row) => Number(row.id))) }
}

export async function validateAttributesImport(inputs: AttributesImportInput[], mode: AttributesImportMode): Promise<AttributesImportRow[]> {
  if (inputs.length > 5000) throw new AttributesImportError("الحد الأقصى 5000 سطر في المرة الواحدة")
  const { byCode, categoryIds } = await loadContext(inputs)
  const seen = new Set<string>()
  return inputs.map((input) => {
    const errors: string[] = []
    const warnings: string[] = []
    const code = text(input.product_code, 100)
    const attribute = text(input.attribute, 100)
    const value = text(input.value, 100)
    const product = code ? byCode.get(lower(code)) : undefined
    if (!code) errors.push("رقم الصنف مطلوب")
    else if (!product) errors.push("الصنف غير موجود")
    else if (product.type === 2) errors.push("الخدمات لا تدعم المتغيرات والخصائص")
    if (!attribute) errors.push("المتغير مطلوب")
    if (!value) errors.push("الخاصية مطلوبة")
    const duplicateKey = `${lower(code)}|${lower(attribute)}|${lower(value)}`
    if (code && attribute && value) {
      if (seen.has(duplicateKey)) errors.push("سطر مكرر لنفس الصنف والمتغير والخاصية")
      seen.add(duplicateKey)
    }
    for (const [categoryId, raw] of Object.entries(input.prices || {})) {
      const price = parsePrice(raw)
      if (price === "invalid") errors.push("سعر غير صالح")
      else if (price !== null && product && !product.categoryPrices.has(Number(categoryId)) && categoryIds.has(Number(categoryId))) warnings.push("فئة سعر غير معرّفة في أسعار الصنف")
    }
    const group = product?.attributes.find((row: any) => lower(String(row?.name || "").trim()) === lower(attribute))
    const exists = mode === "merge" && Boolean(group && (Array.isArray(group.values) ? group.values : []).some((item: unknown) => lower(String(item || "").trim()) === lower(value)))
    return { key: String(input.key), product_name: product?.name || "", exists, errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
  })
}

/** نفس persistProductAttributes في app/api/inventory/products/route.ts: تحديث في المكان (لا حذف شامل) — روابط السندات ON DELETE CASCADE */
async function persistAttributeLinks(productId: number, attributes: any[]) {
  await sql`CREATE TABLE IF NOT EXISTS attributes_tbl (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)`
  await sql`CREATE TABLE IF NOT EXISTS attribute_values_tbl (id SERIAL PRIMARY KEY, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(attr_id, name))`
  await sql`CREATE TABLE IF NOT EXISTS product_atrributes_values_tbl (id BIGSERIAL UNIQUE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, value_id INTEGER NOT NULL REFERENCES attribute_values_tbl(id) ON DELETE CASCADE, image_url TEXT, PRIMARY KEY(product_id, attr_id, value_id))`
  const kept: number[] = []
  for (const attribute of attributes) {
    const [attr] = await sql`INSERT INTO attributes_tbl (name) VALUES (${attribute.name}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id` as any[]
    for (const value of attribute.values as string[]) {
      const [row] = await sql`INSERT INTO attribute_values_tbl (attr_id, name) VALUES (${Number(attr.id)}, ${value}) ON CONFLICT (attr_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id` as any[]
      const [link] = await sql`
        INSERT INTO product_atrributes_values_tbl (product_id, attr_id, value_id, image_url) VALUES (${productId}, ${Number(attr.id)}, ${Number(row.id)}, ${attribute.value_images?.[value] || null})
        ON CONFLICT (product_id, attr_id, value_id) DO UPDATE SET image_url = EXCLUDED.image_url RETURNING id` as any[]
      if (link?.id) kept.push(Number(link.id))
    }
  }
  await sql`DELETE FROM product_atrributes_values_tbl WHERE product_id = ${productId} AND NOT (id = ANY(${kept}::bigint[]))`
}

export async function saveAttributesImport(inputs: AttributesImportInput[], mode: AttributesImportMode) {
  const checks = await validateAttributesImport(inputs, mode)
  const valid = inputs.filter((input) => !checks.find((check) => check.key === String(input.key))?.errors.length)
  if (!valid.length) return { rows: checks, products: 0, added: 0, updated: 0, failed: inputs.length }
  const { byCode } = await loadContext(valid)
  const groupsByProduct = new Map<number, { product: ProductInfo; rows: AttributesImportInput[] }>()
  for (const input of valid) {
    const product = byCode.get(lower(text(input.product_code, 100)))!
    const entry = groupsByProduct.get(product.id) || { product, rows: [] }
    entry.rows.push(input)
    groupsByProduct.set(product.id, entry)
  }
  let added = 0
  let updated = 0
  await withTenantTransaction(async () => {
    for (const { product, rows } of groupsByProduct.values()) {
      const defaults = Object.fromEntries([...product.categoryPrices].map(([id, price]) => [String(id), price]))
      // نسخة قابلة للتعديل من متغيرات الصنف الحالية (أو فارغة في الاستبدال)
      const attributes: any[] = mode === "replace" ? [] : product.attributes.map((group: any) => ({
        ...group,
        values: Array.isArray(group?.values) ? [...group.values] : [],
        value_images: { ...(group?.value_images || {}) },
        value_prices: { ...(group?.value_prices || {}) },
      }))
      for (const input of rows) {
        const name = text(input.attribute, 100)
        const value = text(input.value, 100)
        let group = attributes.find((row) => lower(String(row.name || "").trim()) === lower(name))
        if (!group) { group = { name, values: [], value_images: {}, value_prices: {} }; attributes.push(group) }
        const existingValue = (group.values as string[]).find((item) => lower(String(item).trim()) === lower(value))
        const key = existingValue ?? value
        if (!existingValue) { group.values.push(value); added += 1 } else updated += 1
        // السعر الحالي (كائن لكل فئة؛ الصيغة القديمة رقم ⇐ يُبدأ من أسعار الصنف) ثم الخلايا المعبأة من الملف
        const current = group.value_prices[key]
        const prices: Record<string, number> = current && typeof current === "object" ? { ...current } : { ...defaults }
        for (const [categoryId, raw] of Object.entries(input.prices || {})) {
          const price = parsePrice(raw)
          if (typeof price === "number" && Number(categoryId) > 0) prices[String(Math.trunc(Number(categoryId)))] = price
        }
        group.value_prices[key] = prices
      }
      // سعر الصنف المرجعي (للصيغة القديمة) = أول سعر أكبر من صفر — كما يحفظه نموذج الصنف
      const reference = [...product.categoryPrices.values()].find((price) => price > 0) ?? 0
      const cleaned = attributes
        .map((group) => ({ ...group, name: String(group.name || "").trim(), base_price: Number.isFinite(Number(group.base_price)) ? Number(group.base_price) : reference }))
        .filter((group) => group.name && group.values.length)
      await sql`UPDATE products SET attributes = ${JSON.stringify(cleaned)}::jsonb WHERE id = ${product.id}`
      await persistAttributeLinks(product.id, cleaned)
    }
  })
  return { rows: checks, products: groupsByProduct.size, added, updated, failed: inputs.length - valid.length }
}
