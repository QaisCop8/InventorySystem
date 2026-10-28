import { authorizeStoredProduct } from "@/app/api/inventory/products/_permissions"
import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

async function ensureTable() { return runSchemaOnce("app/api/inventory/products/[id]/related-items/route.ts#ensureTable", async () => {
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS related_items_mode INTEGER NOT NULL DEFAULT 1`
  await sql`CREATE TABLE IF NOT EXISTS product_related_items (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, related_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, UNIQUE(product_id, related_id), CHECK (product_id <> related_id))`
  await sql`CREATE INDEX IF NOT EXISTS idx_product_related_items_product ON product_related_items(product_id)`
  // اضافة السعر عند الاختيار (لا = يُضاف التابع بسعر صفر) / عدم الطباعة في فواتير المطبخ والمطعم
  await sql`ALTER TABLE product_related_items ADD COLUMN IF NOT EXISTS add_price BOOLEAN NOT NULL DEFAULT TRUE`
  await sql`ALTER TABLE product_related_items ADD COLUMN IF NOT EXISTS no_kitchen_print BOOLEAN NOT NULL DEFAULT FALSE`
}) }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permission = await authorizeStoredProduct(request, (await params).id, "lookup")
    if (!permission.ok) return permission.response
    await ensureTable()
    const productId = Number((await params).id)
    if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: "رقم الصنف غير صالح" }, { status: 400 })
    const rows = await sql`SELECT pri.id, pri.product_id, pri.related_id, pri.add_price, pri.no_kitchen_print, p.product_code AS related_code, p.product_name AS related_name FROM product_related_items pri JOIN products p ON p.id = pri.related_id WHERE pri.product_id = ${productId} ORDER BY pri.id`
    if (new URL(request.url).searchParams.get("includeMode") === "1") {
      const product = (await sql`SELECT related_items_mode FROM products WHERE id = ${productId} LIMIT 1`)[0]
      return NextResponse.json({
        related_items_mode: Math.min(4, Math.max(1, Number(product?.related_items_mode || 1))),
        related_items: rows,
      })
    }
    return NextResponse.json(rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر تحميل الأصناف التابعة" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permission = await authorizeStoredProduct(request, (await params).id, "update")
  if (!permission.ok) return permission.response
  const client = await (await import("@/lib/database")).getTenantPool().then((pool) => pool.connect())
  try {
    await ensureTable()
    const productId = Number((await params).id)
    const body = await request.json()
    // related_items: [{ related_id, add_price, no_kitchen_print }] — related_ids (أرقام فقط) للتوافق مع النسخ السابقة
    const flags = new Map<number, { add_price: boolean; no_kitchen_print: boolean }>()
    if (Array.isArray(body.related_items)) for (const row of body.related_items) flags.set(Number(row?.related_id), { add_price: row?.add_price !== false, no_kitchen_print: row?.no_kitchen_print === true })
    const relatedIds: number[] = Array.from(new Set<number>((Array.isArray(body.related_items) ? body.related_items.map((row: any) => row?.related_id) : Array.isArray(body.related_ids) ? body.related_ids : []).map(Number)))
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
    for (const relatedId of relatedIds) {
      const flag = flags.get(relatedId) || { add_price: true, no_kitchen_print: false }
      await client.query("INSERT INTO product_related_items (product_id, related_id, add_price, no_kitchen_print) VALUES ($1, $2, $3, $4)", [productId, relatedId, flag.add_price, flag.no_kitchen_print])
    }
    await client.query("COMMIT")
    return NextResponse.json({ success: true, related_ids: relatedIds })
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => {})
    return NextResponse.json({ error: error.message || "تعذر حفظ الأصناف التابعة" }, { status: 400 })
  } finally { client.release() }
}
