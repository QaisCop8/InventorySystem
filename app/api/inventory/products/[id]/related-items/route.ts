import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

async function ensureTable() {
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS related_items_mode INTEGER NOT NULL DEFAULT 1`
  await sql`CREATE TABLE IF NOT EXISTS product_related_items (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, related_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, UNIQUE(product_id, related_id), CHECK (product_id <> related_id))`
  await sql`CREATE INDEX IF NOT EXISTS idx_product_related_items_product ON product_related_items(product_id)`
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable()
    const productId = Number((await params).id)
    if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: "رقم الصنف غير صالح" }, { status: 400 })
    const rows = await sql`SELECT pri.id, pri.product_id, pri.related_id, p.product_code AS related_code, p.product_name AS related_name FROM product_related_items pri JOIN products p ON p.id = pri.related_id WHERE pri.product_id = ${productId} ORDER BY pri.id`
    if (new URL(request.url).searchParams.get("includeMode") === "1") {
      const product = (await sql`SELECT related_items_mode FROM products WHERE id = ${productId} LIMIT 1`)[0]
      return NextResponse.json({
        related_items_mode: Math.min(3, Math.max(1, Number(product?.related_items_mode || 1))),
        related_items: rows,
      })
    }
    return NextResponse.json(rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر تحميل الأصناف التابعة" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await (await import("@/lib/database")).getTenantPool().then((pool) => pool.connect())
  try {
    await ensureTable()
    const productId = Number((await params).id)
    const body = await request.json()
    const relatedIds = Array.from(new Set((Array.isArray(body.related_ids) ? body.related_ids : []).map(Number)))
    if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: "رقم الصنف غير صالح" }, { status: 400 })
    if (relatedIds.some((relatedId) => !Number.isInteger(relatedId) || relatedId <= 0)) return NextResponse.json({ error: "رقم الصنف التابع غير صالح" }, { status: 400 })
    if (relatedIds.includes(productId)) return NextResponse.json({ error: "لا يمكن إضافة الصنف نفسه ضمن الأصناف التابعة" }, { status: 400 })
    const validRows = relatedIds.length ? await sql`SELECT id FROM products WHERE id = ANY(${relatedIds}::int[])` : []
    if (validRows.length !== relatedIds.length) return NextResponse.json({ error: "يوجد صنف تابع غير موجود" }, { status: 400 })
    const reverseRows = relatedIds.length ? await sql`SELECT product_id FROM product_related_items WHERE related_id = ${productId} AND product_id = ANY(${relatedIds}::int[])` : []
    if (reverseRows.length) return NextResponse.json({ error: "لا يمكن إضافة علاقة تسبب تكراراً أو دورة بين الأصناف" }, { status: 400 })
    const existingRelations = await sql`SELECT product_id, related_id FROM product_related_items`
    const graph = new Map<number, number[]>()
    for (const row of existingRelations as any[]) graph.set(Number(row.product_id), [...(graph.get(Number(row.product_id)) || []), Number(row.related_id)])
    graph.set(productId, relatedIds)
    const reachesProduct = (start: number, visited = new Set<number>()): boolean => {
      if (start === productId) return true
      if (visited.has(start)) return false
      visited.add(start)
      return (graph.get(start) || []).some((next) => reachesProduct(next, visited))
    }
    if (relatedIds.some((relatedId) => reachesProduct(relatedId))) return NextResponse.json({ error: "لا يمكن إضافة علاقة تسبب تكراراً أو دورة بين الأصناف" }, { status: 400 })
    await client.query("BEGIN")
    await client.query("DELETE FROM product_related_items WHERE product_id = $1", [productId])
    for (const relatedId of relatedIds) await client.query("INSERT INTO product_related_items (product_id, related_id) VALUES ($1, $2)", [productId, relatedId])
    await client.query("COMMIT")
    return NextResponse.json({ success: true, related_ids: relatedIds })
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => {})
    return NextResponse.json({ error: error.message || "تعذر حفظ الأصناف التابعة" }, { status: 400 })
  } finally { client.release() }
}
