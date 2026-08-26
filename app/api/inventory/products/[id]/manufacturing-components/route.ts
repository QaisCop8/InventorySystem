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
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable()
    const productId = Number((await params).id)
    if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: "رقم الصنف غير صالح" }, { status: 400 })
    const rows = await sql`SELECT pmc.id, pmc.product_id, pmc.component_id, pmc.quantity, p.product_code AS component_code, p.product_name AS component_name FROM product_manufacturing_components pmc JOIN products p ON p.id = pmc.component_id WHERE pmc.product_id = ${productId} ORDER BY pmc.id`
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
    const normalized = components.map((item: any) => ({ id: Number(item.component_id), quantity: Number(item.quantity) }))
    for (const item of normalized) {
      if (!Number.isInteger(item.id) || item.id <= 0) return NextResponse.json({ error: "رقم مكون التصنيع غير صالح" }, { status: 400 })
      if (item.id === productId) return NextResponse.json({ error: "لا يمكن إضافة الصنف نفسه كمكون تصنيع" }, { status: 400 })
      if (seen.has(item.id)) return NextResponse.json({ error: "مكون التصنيع مكرر" }, { status: 400 })
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) return NextResponse.json({ error: "يجب أن تكون كمية كل مكون أكبر من صفر" }, { status: 400 })
      seen.add(item.id)
    }
    const ids = normalized.map((item: any) => item.id)
    const validRows = ids.length ? await sql`SELECT id FROM products WHERE id = ANY(${ids}::int[])` : []
    if (validRows.length !== ids.length) return NextResponse.json({ error: "يوجد مكون تصنيع غير موجود" }, { status: 400 })
    await client.query("BEGIN")
    await client.query("DELETE FROM product_manufacturing_components WHERE product_id = $1", [productId])
    for (const item of normalized) await client.query("INSERT INTO product_manufacturing_components (product_id, component_id, quantity) VALUES ($1, $2, $3)", [productId, item.id, item.quantity])
    await client.query("COMMIT")
    return NextResponse.json({ success: true, components: normalized })
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => {})
    return NextResponse.json({ error: error.message || "تعذر حفظ مكونات التصنيع" }, { status: 400 })
  } finally { client.release() }
}
