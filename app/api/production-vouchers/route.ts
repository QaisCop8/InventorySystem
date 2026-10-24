import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction, type TransactionAction } from "@/lib/transaction-permissions"
import {
  ProductionError,
  cancelProductionTransfer,
  defaultProductionWarehouses,
  deleteProduction,
  ensureProductionTables,
  loadProduction,
  nextProductionCode,
  resolveProductionCode,
  postProduction,
  productionProductInfo,
  saveProduction,
  transferProduction,
  unpostProduction,
} from "@/lib/production-vouchers"

export const dynamic = "force-dynamic"

// سند انتاج بضاعة — صلاحيات "سند انتاج بضاعة" (صلاحيات الحركات) على فرع السند:
//   GET list / ?id / ?product_id / ?meta=1 · POST إنشاء (post=true يرحّل) · PUT تعديل · DELETE ?id
//   PATCH { id, action: post | unpost | transfer | cancel_transfer }

function fail(error: unknown, fallback: string) {
  if (error instanceof ProductionError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error("production vouchers", error)
  const message = error instanceof Error ? error.message : fallback
  // رسائل قيود قاعدة البيانات (الفترة المقفلة/سنة العمل) تصل كأخطاء عادية — تُعرض كما هي
  return NextResponse.json({ error: message || fallback }, { status: /فترة|سنة|مقفل/.test(String(message)) ? 400 : 500 })
}

async function authorize(request: NextRequest, action: TransactionAction, branchId?: unknown) {
  return authorizeTransaction(request, "production", action, branchId)
}

async function storedBranch(id: number) {
  const row = ((await sql`SELECT branch_id FROM production_vouchers_tbl WHERE id = ${id}`) as any[])[0]
  if (!row) throw new ProductionError("سند الانتاج غير موجود", 404)
  return Number(row.branch_id)
}

export async function GET(request: NextRequest) {
  try {
    await ensureProductionTables()
    const params = request.nextUrl.searchParams
    const id = Number(params.get("id"))
    if (id > 0) {
      const auth = await authorize(request, "view", await storedBranch(id))
      if (!auth.ok) return auth.response
      return NextResponse.json(await loadProduction(id))
    }
    const productId = Number(params.get("product_id"))
    if (productId > 0) {
      const auth = await authorize(request, "view")
      if (!auth.ok) return auth.response
      return NextResponse.json(await productionProductInfo(productId))
    }
    // رقم السند: التالي لفرع (سند جديد) أو حلّ ما كتبه المستخدم (رقم تسلسلي/كود موجود)
    if (params.get("next_code") === "1" || params.has("resolve_code")) {
      const auth = await authorize(request, "view", params.get("branch_id") || undefined)
      if (!auth.ok) return auth.response
      const branchId = Number(params.get("branch_id")) || auth.branchId
      if (params.has("resolve_code")) return NextResponse.json(await resolveProductionCode(String(params.get("resolve_code")), branchId))
      return NextResponse.json({ code: await nextProductionCode(branchId), id: null })
    }
    if (params.get("meta") === "1") {
      const auth = await authorize(request, "view", params.get("branch_id") || undefined)
      if (!auth.ok) return auth.response
      const [warehouses, defaults] = await Promise.all([
        sql`SELECT id, warehouse_code AS code, warehouse_name AS name FROM warehouses WHERE COALESCE(status, 1) <> 3 AND COALESCE(is_active, true) = true ORDER BY id`,
        defaultProductionWarehouses(auth.userId, auth.branchId),
      ])
      return NextResponse.json({ warehouses, defaults, branch_id: auth.branchId })
    }

    const auth = await authorize(request, "view", params.get("branch_id") || undefined)
    if (!auth.ok) return auth.response
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(params.get("from_date"))) ? String(params.get("from_date")) : null
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(params.get("to_date"))) ? String(params.get("to_date")) : null
    const status = Number(params.get("status")) || 0
    const search = String(params.get("q") || "").trim()
    const rows = await sql`
      SELECT p.id, p.code, p.vch_date::text AS vch_date, p.status, p.branch_id, b.branch_name, p.note,
        wf.warehouse_name AS finished_store_name, wr.warehouse_name AS raw_store_name,
        (SELECT string_agg(pr.product_name, '، ' ORDER BY i.sort_order) FROM production_voucher_items_tbl i JOIN products pr ON pr.id = i.item_id
          WHERE i.production_id = p.id AND i.role = 1) AS produced_names,
        (SELECT COALESCE(SUM(i.quantity * i.price), 0) FROM production_voucher_items_tbl i WHERE i.production_id = p.id AND i.role = 1) AS produced_value,
        (SELECT COALESCE(SUM(i.quantity * i.price), 0) FROM production_voucher_items_tbl i WHERE i.production_id = p.id AND i.role = 2) AS raw_value
      FROM production_vouchers_tbl p
      LEFT JOIN branches b ON b.id = p.branch_id
      LEFT JOIN warehouses wf ON wf.id = p.finished_store_id
      LEFT JOIN warehouses wr ON wr.id = p.raw_store_id
      WHERE p.branch_id = ANY(${auth.branchIds}::int[])
        AND (${from}::date IS NULL OR p.vch_date >= ${from}::date)
        AND (${to}::date IS NULL OR p.vch_date <= ${to}::date)
        AND (${status} = 0 OR p.status = ${status})
        AND (${search} = '' OR p.code ILIKE ${"%" + search + "%"} OR COALESCE(p.note, '') ILIKE ${"%" + search + "%"}
             OR EXISTS (SELECT 1 FROM production_voucher_items_tbl i JOIN products pr ON pr.id = i.item_id
                        WHERE i.production_id = p.id AND (pr.product_name ILIKE ${"%" + search + "%"} OR pr.product_code ILIKE ${"%" + search + "%"})))
      ORDER BY p.vch_date DESC, p.id DESC
      LIMIT 1000
    `
    return NextResponse.json(rows)
  } catch (error) {
    return fail(error, "تعذر تحميل سندات الانتاج")
  }
}

async function save(request: NextRequest, mode: "create" | "update") {
  await ensureProductionTables()
  const data = await request.json().catch(() => ({}))
  const existingId = mode === "update" ? Number(data.id) : null
  if (mode === "update") {
    if (!(Number(existingId) > 0)) throw new ProductionError("معرف سند الانتاج مطلوب")
    // تعديل على فرع السند القديم والجديد معاً
    const old = await authorize(request, "update", await storedBranch(Number(existingId)))
    if (!old.ok) return old.response
  }
  const auth = await authorize(request, mode, data.branch_id)
  if (!auth.ok) return auth.response
  if (data.post) {
    const posting = await authorize(request, "post", auth.branchId)
    if (!posting.ok) return posting.response
  }
  const id = await saveProduction(data, auth.userId, auth.branchId, existingId)
  let posted: any = null
  let postError: string | null = null
  if (data.post) {
    try { posted = await postProduction(request, id, auth.userId) } catch (error) {
      if (!(error instanceof ProductionError)) throw error
      postError = error.message
    }
  }
  return NextResponse.json({ ...(await loadProduction(id)), posted, post_error: postError }, { status: mode === "create" ? 201 : 200 })
}

export async function POST(request: NextRequest) {
  try { return await save(request, "create") } catch (error) { return fail(error, "تعذر حفظ سند الانتاج") }
}

export async function PUT(request: NextRequest) {
  try { return await save(request, "update") } catch (error) { return fail(error, "تعذر تعديل سند الانتاج") }
}

export async function PATCH(request: NextRequest) {
  try {
    await ensureProductionTables()
    const data = await request.json().catch(() => ({}))
    const id = Number(data.id)
    if (!(id > 0)) throw new ProductionError("معرف سند الانتاج مطلوب")
    const branchId = await storedBranch(id)
    const action = String(data.action || "")
    const required: TransactionAction = action === "post" || action === "unpost" ? "post" : "update"
    if (!["post", "unpost", "transfer", "cancel_transfer"].includes(action)) throw new ProductionError("إجراء غير معروف")
    const auth = await authorize(request, required, branchId)
    if (!auth.ok) return auth.response
    let result: any = null
    if (action === "post") result = await postProduction(request, id, auth.userId)
    else if (action === "unpost") await unpostProduction(request, id)
    else if (action === "transfer") result = await transferProduction(request, id, data, auth.userId)
    else await cancelProductionTransfer(request, id, Number(data.transfer_id))
    return NextResponse.json({ ok: true, result, production: await loadProduction(id) })
  } catch (error) {
    return fail(error, "تعذر تنفيذ الإجراء")
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureProductionTables()
    const id = Number(request.nextUrl.searchParams.get("id"))
    if (!(id > 0)) throw new ProductionError("معرف سند الانتاج غير صالح")
    const auth = await authorize(request, "delete", await storedBranch(id))
    if (!auth.ok) return auth.response
    await deleteProduction(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return fail(error, "تعذر حذف سند الانتاج")
  }
}
