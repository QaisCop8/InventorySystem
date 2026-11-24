import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction, type TransactionAction } from "@/lib/transaction-permissions"
import { ProductionError, defaultProductionWarehouses } from "@/lib/production-vouchers"
import {
  changeOrderStatus,
  deleteOrder,
  ensureProductionOrderTables,
  listOrders,
  loadOrder,
  materialRequirements,
  nextOrderCode,
  openSalesOrderLines,
  orderRequirements,
  saveOrder,
} from "@/lib/production-orders"

export const dynamic = "force-dynamic"

// أوامر الانتاج (lib/production-orders.ts) — نفس صلاحيات "سند انتاج بضاعة" على فرع الأمر:
//   GET list · ?id · ?requirements=<id>[&raw_store_id] · ?plan=1 (POST-less: lines JSON) · ?sales_lines=1&q · ?next_code=1 · ?meta=1
//   POST إنشاء · PUT تعديل · PATCH { id, action: cancel | close | reopen } · DELETE ?id

function fail(error: unknown, fallback: string) {
  if (error instanceof ProductionError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error("production orders", error)
  return NextResponse.json({ error: error instanceof Error ? error.message || fallback : fallback }, { status: 500 })
}

const authorize = (request: NextRequest, action: TransactionAction, branchId?: unknown) => authorizeTransaction(request, "production", action, branchId)

async function storedBranch(id: number) {
  const row = ((await sql`SELECT branch_id FROM production_orders_tbl WHERE id = ${id}`) as any[])[0]
  if (!row) throw new ProductionError("أمر الانتاج غير موجود", 404)
  return Number(row.branch_id)
}

export async function GET(request: NextRequest) {
  try {
    await ensureProductionOrderTables()
    const params = request.nextUrl.searchParams
    const id = Number(params.get("id"))
    if (id > 0) {
      const auth = await authorize(request, "view", await storedBranch(id))
      if (!auth.ok) return auth.response
      return NextResponse.json(await loadOrder(id))
    }
    const requirementsId = Number(params.get("requirements"))
    if (requirementsId > 0) {
      const auth = await authorize(request, "view", await storedBranch(requirementsId))
      if (!auth.ok) return auth.response
      return NextResponse.json(await orderRequirements(requirementsId, Number(params.get("raw_store_id")) || null))
    }
    // فحص سريع قبل الحفظ: lines=[{item_id, quantity}]
    if (params.has("plan_lines")) {
      const auth = await authorize(request, "view")
      if (!auth.ok) return auth.response
      let lines: any[] = []
      try { lines = JSON.parse(String(params.get("plan_lines"))) } catch { throw new ProductionError("أصناف غير صالحة") }
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(params.get("date"))) ? String(params.get("date")) : new Date().toISOString().slice(0, 10)
      return NextResponse.json(await materialRequirements(
        (Array.isArray(lines) ? lines : []).slice(0, 200).map((line) => ({ item_id: Number(line?.item_id), quantity: Number(line?.quantity) })),
        Number(params.get("raw_store_id")) || null, date,
      ))
    }
    if (params.get("sales_lines") === "1") {
      const auth = await authorize(request, "view")
      if (!auth.ok) return auth.response
      return NextResponse.json(await openSalesOrderLines(auth.branchIds, String(params.get("q") || "")))
    }
    if (params.get("next_code") === "1") {
      const auth = await authorize(request, "view", params.get("branch_id") || undefined)
      if (!auth.ok) return auth.response
      return NextResponse.json({ code: await nextOrderCode(Number(params.get("branch_id")) || auth.branchId) })
    }
    if (params.get("meta") === "1") {
      const auth = await authorize(request, "view", params.get("branch_id") || undefined)
      if (!auth.ok) return auth.response
      const [warehouses, defaults] = await Promise.all([
        sql`SELECT id, warehouse_name AS name FROM warehouses WHERE COALESCE(status, 1) <> 3 AND COALESCE(is_active, true) = true ORDER BY id`,
        defaultProductionWarehouses(auth.userId, auth.branchId),
      ])
      return NextResponse.json({ warehouses, defaults, branch_id: auth.branchId })
    }
    const auth = await authorize(request, "view", params.get("branch_id") || undefined)
    if (!auth.ok) return auth.response
    const date = (key: string) => (/^\d{4}-\d{2}-\d{2}$/.test(String(params.get(key))) ? String(params.get(key)) : null)
    return NextResponse.json(await listOrders(auth.branchIds, { from: date("from_date"), to: date("to_date"), status: Number(params.get("status")) || 0, q: String(params.get("q") || "") }))
  } catch (error) {
    return fail(error, "تعذر تحميل أوامر الانتاج")
  }
}

async function save(request: NextRequest, mode: "create" | "update") {
  await ensureProductionOrderTables()
  const data = await request.json().catch(() => ({}))
  const existingId = mode === "update" ? Number(data.id) : null
  if (mode === "update") {
    if (!(Number(existingId) > 0)) throw new ProductionError("معرف أمر الانتاج مطلوب")
    const old = await authorize(request, "update", await storedBranch(Number(existingId)))
    if (!old.ok) return old.response
  }
  const auth = await authorize(request, mode, data.branch_id)
  if (!auth.ok) return auth.response
  const id = await saveOrder(data, auth.userId, auth.branchId, existingId)
  return NextResponse.json(await loadOrder(id), { status: mode === "create" ? 201 : 200 })
}

export async function POST(request: NextRequest) {
  try { return await save(request, "create") } catch (error) { return fail(error, "تعذر حفظ أمر الانتاج") }
}

export async function PUT(request: NextRequest) {
  try { return await save(request, "update") } catch (error) { return fail(error, "تعذر تعديل أمر الانتاج") }
}

export async function PATCH(request: NextRequest) {
  try {
    await ensureProductionOrderTables()
    const data = await request.json().catch(() => ({}))
    const id = Number(data.id)
    if (!(id > 0)) throw new ProductionError("معرف أمر الانتاج مطلوب")
    const auth = await authorize(request, "update", await storedBranch(id))
    if (!auth.ok) return auth.response
    await changeOrderStatus(id, String(data.action || ""), auth.userId)
    return NextResponse.json(await loadOrder(id))
  } catch (error) {
    return fail(error, "تعذر تنفيذ الإجراء")
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureProductionOrderTables()
    const id = Number(request.nextUrl.searchParams.get("id"))
    if (!(id > 0)) throw new ProductionError("معرف أمر الانتاج غير صالح")
    const auth = await authorize(request, "delete", await storedBranch(id))
    if (!auth.ok) return auth.response
    await deleteOrder(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return fail(error, "تعذر حذف أمر الانتاج")
  }
}
