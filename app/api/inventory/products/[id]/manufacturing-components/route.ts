import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

async function ensureTable() {
  await sql`CREATE TABLE IF NOT EXISTS product_manufacturing_components (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
    UNIQUE(product_id, component_id),
    CHECK (product_id <> component_id)
  )`
  await sql`CREATE INDEX IF NOT EXISTS idx_product_manufacturing_components_product ON product_manufacturing_components(product_id)`
  await sql`ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS length NUMERIC(18,6)`
  await sql`ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS width NUMERIC(18,6)`
  await sql`ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS height NUMERIC(18,6)`
  await sql`ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS count NUMERIC(18,6)`
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable()
    const productId = Number((await params).id)
    if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: "رقم الصنف غير صالح" }, { status: 400 })
    const rows = await sql`SELECT pmc.id, pmc.product_id, pmc.component_id, pmc.quantity, pmc.length, pmc.width, pmc.height, pmc.count, COALESCE(p.measurment_id, 1) AS measurment_id, p.product_code AS component_code, p.product_name AS component_name FROM product_manufacturing_components pmc JOIN products p ON p.id = pmc.component_id WHERE pmc.product_id = ${productId} ORDER BY pmc.id`
    return NextResponse.json(rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر تحميل مكونات التصنيع" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await (await import("@/lib/database")).getTenantPool().then((pool) => pool.connect())
  try {
    await ensureTable()
    const productId = Number((await params).id)
    const body = await request.json()
    const components = Array.isArray(body.components) ? body.components : []
    if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: "رقم الصنف غير صالح" }, { status: 400 })
    const seen = new Set<number>()
    const normalized = components.map((item: any) => ({ id: Number(item.component_id), quantity: Number(item.quantity), length: Number(item.length || 0), width: Number(item.width || 0), height: Number(item.height || 0), count: Number(item.count || 0), measurment_id: 1 }))
    for (const item of normalized) {
      if (!Number.isInteger(item.id) || item.id <= 0) return NextResponse.json({ error: "رقم مكون التصنيع غير صالح" }, { status: 400 })
      if (item.id === productId) return NextResponse.json({ error: "لا يمكن إضافة الصنف نفسه كمكون تصنيع" }, { status: 400 })
      if (seen.has(item.id)) return NextResponse.json({ error: "مكون التصنيع مكرر" }, { status: 400 })
      seen.add(item.id)
    }
    const ids = normalized.map((item: any) => item.id)
    const validRows: any[] = ids.length ? await sql`SELECT id, COALESCE(measurment_id, 1) AS measurment_id FROM products WHERE id = ANY(${ids}::int[])` : []
    if (validRows.length !== ids.length) return NextResponse.json({ error: "يوجد مكون تصنيع غير موجود" }, { status: 400 })
    for (const item of normalized) {
      item.measurment_id = Number(validRows.find((row: any) => Number(row.id) === item.id)?.measurment_id || 1)
      if (item.measurment_id !== 1) {
        if (!(item.length > 0) || !(item.width > 0) || !(item.count > 0) || (item.measurment_id === 3 && !(item.height > 0))) return NextResponse.json({ error: "يجب إدخال أبعاد وعدد مكون التصنيع حسب نوع القياس" }, { status: 400 })
        item.quantity = item.length * item.width * (item.measurment_id === 3 ? item.height : 1) * item.count
      }
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) return NextResponse.json({ error: "يجب أن تكون كمية كل مكون أكبر من صفر" }, { status: 400 })
    }
    await client.query("BEGIN")
    await client.query("DELETE FROM product_manufacturing_components WHERE product_id = $1", [productId])
    for (const item of normalized) await client.query("INSERT INTO product_manufacturing_components (product_id, component_id, quantity, length, width, height, count) VALUES ($1, $2, $3, $4, $5, $6, $7)", [productId, item.id, item.quantity, item.measurment_id === 1 ? null : item.length, item.measurment_id === 1 ? null : item.width, item.measurment_id === 3 ? item.height : null, item.measurment_id === 1 ? null : item.count])
    await client.query("COMMIT")
    return NextResponse.json({ success: true, components: normalized })
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => {})
    return NextResponse.json({ error: error.message || "تعذر حفظ مكونات التصنيع" }, { status: 400 })
  } finally { client.release() }
}
