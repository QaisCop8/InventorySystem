import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

async function attributesFor(productIds: number[]) {
  if (!productIds.length) return new Map<number, any[]>()
  await sql`CREATE TABLE IF NOT EXISTS attributes_tbl (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)`
  await sql`CREATE TABLE IF NOT EXISTS attribute_values_tbl (id SERIAL PRIMARY KEY, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(attr_id, name))`
  await sql`CREATE TABLE IF NOT EXISTS product_atrributes_values_tbl (id BIGSERIAL UNIQUE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, value_id INTEGER NOT NULL REFERENCES attribute_values_tbl(id) ON DELETE CASCADE, image_url TEXT, PRIMARY KEY(product_id, attr_id, value_id))`
  const rows = await sql`SELECT pav.product_id, a.id AS attribute_id, a.name AS attribute_name, v.id AS value_id, v.name AS value_name, pav.image_url FROM product_atrributes_values_tbl pav JOIN attributes_tbl a ON a.id=pav.attr_id JOIN attribute_values_tbl v ON v.id=pav.value_id WHERE pav.product_id=ANY(${productIds}::int[]) ORDER BY pav.product_id,a.name,v.name`
  const result = new Map<number, any[]>()
  for (const row of rows) {
    const productId = Number(row.product_id)
    const attributes = result.get(productId) || []
    let attribute = attributes.find((item) => Number(item.id) === Number(row.attribute_id))
    if (!attribute) { attribute = { id: Number(row.attribute_id), name: row.attribute_name, values: [] }; attributes.push(attribute); result.set(productId, attributes) }
    attribute.values.push({ id: Number(row.value_id), name: row.value_name, image_url: row.image_url || null })
  }
  return result
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await params).id)
    if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: "رقم الصنف غير صالح" }, { status: 400 })
    await sql`CREATE TABLE IF NOT EXISTS product_manufacturing_components (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, component_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT, quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0), UNIQUE(product_id, component_id), CHECK (product_id <> component_id))`
    const product = (await sql`SELECT id,product_code,product_name,product_image FROM products WHERE id=${productId}`)[0]
    if (!product) return NextResponse.json({ error: "الصنف غير موجود" }, { status: 404 })
    const components = await sql`SELECT pmc.component_id AS id,pmc.quantity,p.product_code,p.product_name,p.product_image FROM product_manufacturing_components pmc JOIN products p ON p.id=pmc.component_id WHERE pmc.product_id=${productId} ORDER BY pmc.id`
    const attributes = await attributesFor([productId, ...components.map((item) => Number(item.id))])
    return NextResponse.json({ ...product, attributes: attributes.get(productId) || [], components: components.map((item) => ({ ...item, attributes: attributes.get(Number(item.id)) || [] })) })
  } catch (error: any) { return NextResponse.json({ error: error.message || "تعذر تحميل مواصفات الصنف" }, { status: 500 }) }
}
