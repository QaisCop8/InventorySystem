import { NextResponse, type NextRequest } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"

// طباعة الطلبية حسب المستودع: علامة "تم طباعتها مستودعات" (orders.warehouses_printed_at) +
// بيانات المستودعات وطابعاتها الافتراضية لتوزيع أصناف الطلبية عليها.
//   GET  ?order_id=  ⇒ { printed, printed_at, warehouses: [{ id, name, default_printer }] }
//   POST { order_id } ⇒ يسجّل وقت الطباعة

const ready = new Map<string, Promise<void>>()
async function ensureColumns() {
  const dbName = await resolveCurrentDbName()
  let pending = ready.get(dbName)
  if (!pending) {
    pending = (async () => {
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS warehouses_printed_at TIMESTAMP`
      await sql`ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS default_printer VARCHAR(150)`
    })().catch((error) => { ready.delete(dbName); throw error })
    ready.set(dbName, pending)
  }
  return pending
}

export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureColumns()
    const orderId = Number(request.nextUrl.searchParams.get("order_id")) || 0
    const [order, warehouses] = await Promise.all([
      orderId ? sql`SELECT warehouses_printed_at FROM orders WHERE id = ${orderId}` : Promise.resolve([]),
      sql`SELECT id, warehouse_name AS name, default_printer FROM warehouses WHERE COALESCE(status, 1) <> 3 ORDER BY id`,
    ])
    const printedAt = (order as any[])[0]?.warehouses_printed_at ?? null
    return NextResponse.json({ printed: Boolean(printedAt), printed_at: printedAt, warehouses })
  } catch (error) {
    console.error("Warehouse print status error:", error)
    return NextResponse.json({ error: "تعذر تحميل بيانات الطباعة حسب المستودع" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureColumns()
    const body = await request.json().catch(() => ({}))
    const orderId = Number(body?.order_id) || 0
    if (!orderId) return NextResponse.json({ error: "يجب حفظ الطلبية أولاً" }, { status: 400 })
    const rows = await sql`UPDATE orders SET warehouses_printed_at = CURRENT_TIMESTAMP WHERE id = ${orderId} RETURNING warehouses_printed_at`
    if (!rows.length) return NextResponse.json({ error: "الطلبية غير موجودة" }, { status: 404 })
    return NextResponse.json({ printed: true, printed_at: (rows as any[])[0].warehouses_printed_at })
  } catch (error) {
    console.error("Warehouse print mark error:", error)
    return NextResponse.json({ error: "تعذر تسجيل الطباعة" }, { status: 500 })
  }
}
