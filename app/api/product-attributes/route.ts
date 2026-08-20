import { NextResponse } from "next/server"
import sql from "@/lib/database"

export async function GET() {
  try {
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '[]'::jsonb`
    await sql`ALTER TABLE IF EXISTS product_attributes_tbl RENAME TO attributes_tbl`
    await sql`ALTER TABLE IF EXISTS product_attribute_values_tbl RENAME TO attribute_values_tbl`
    await sql`CREATE TABLE IF NOT EXISTS attributes_tbl (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)`
    await sql`CREATE TABLE IF NOT EXISTS attribute_values_tbl (id SERIAL PRIMARY KEY, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(attr_id, name))`
    await sql`CREATE TABLE IF NOT EXISTS product_atrributes_values_tbl (id BIGSERIAL UNIQUE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, value_id INTEGER NOT NULL REFERENCES attribute_values_tbl(id) ON DELETE CASCADE, image_url TEXT, PRIMARY KEY(product_id, attr_id, value_id))`
    const catalog = new Map<string, { name: string; values: Set<string> }>()
    const saved = await sql`
      SELECT a.name AS attribute_name, v.name AS value_name
      FROM attributes_tbl a
      LEFT JOIN attribute_values_tbl v ON v.attr_id = a.id
      ORDER BY a.name, v.name
    `
    for (const row of saved as any[]) {
      const name = String(row.attribute_name || "").trim()
      if (!name) continue
      const key = name.toLocaleLowerCase()
      if (!catalog.has(key)) catalog.set(key, { name, values: new Set<string>() })
      if (row.value_name) catalog.get(key)!.values.add(String(row.value_name).trim())
    }
    const rows = await sql`SELECT id, attributes FROM products WHERE jsonb_typeof(attributes) = 'array'`
    for (const row of rows as any[]) {
      for (const attribute of Array.isArray(row.attributes) ? row.attributes : []) {
        const name = String(attribute?.name || "").trim()
        if (!name) continue
        const key = name.toLocaleLowerCase()
        if (!catalog.has(key)) catalog.set(key, { name, values: new Set<string>() })
        for (const value of Array.isArray(attribute?.values) ? attribute.values : []) {
          const text = String(value || "").trim()
          if (text) catalog.get(key)!.values.add(text)
        }
        const attributeResult = await sql`INSERT INTO attributes_tbl (name) VALUES (${name}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`
        for (const value of Array.isArray(attribute?.values) ? attribute.values : []) {
          const text = String(value || "").trim()
          if (!text) continue
          const valueResult = await sql`INSERT INTO attribute_values_tbl (attr_id, name) VALUES (${attributeResult[0].id}, ${text}) ON CONFLICT (attr_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`
          const image = attribute?.value_images?.[text] || null
          await sql`INSERT INTO product_atrributes_values_tbl (product_id, attr_id, value_id, image_url) VALUES (${row.id}, ${attributeResult[0].id}, ${valueResult[0].id}, ${image}) ON CONFLICT (product_id, attr_id, value_id) DO UPDATE SET image_url = COALESCE(EXCLUDED.image_url, product_atrributes_values_tbl.image_url)`
        }
      }
    }
    return NextResponse.json(Array.from(catalog.values()).map(({ name, values }) => ({ name, values: Array.from(values) })))
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر تحميل خصائص الأصناف" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body?.name || "").trim()
    const value = String(body?.value || "").trim()
    if (!name) return NextResponse.json({ error: "اسم المتغير مطلوب" }, { status: 400 })
    await sql`CREATE TABLE IF NOT EXISTS attributes_tbl (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)`
    await sql`CREATE TABLE IF NOT EXISTS attribute_values_tbl (id SERIAL PRIMARY KEY, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(attr_id, name))`
    await sql`CREATE TABLE IF NOT EXISTS product_atrributes_values_tbl (id BIGSERIAL UNIQUE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, value_id INTEGER NOT NULL REFERENCES attribute_values_tbl(id) ON DELETE CASCADE, image_url TEXT, PRIMARY KEY(product_id, attr_id, value_id))`
    const attribute = await sql`INSERT INTO attributes_tbl (name) VALUES (${name}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    if (value) await sql`INSERT INTO attribute_values_tbl (attr_id, name) VALUES (${attribute[0].id}, ${value}) ON CONFLICT (attr_id, name) DO NOTHING`
    return NextResponse.json({ name, value: value || null })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر إنشاء المتغير أو القيمة" }, { status: 500 })
  }
}
