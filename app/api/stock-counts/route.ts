import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { generateCountLines, jsonError, requireStockCountPermission } from "@/lib/stock-counts"

export const dynamic = "force-dynamic"

// GET: وثائق الجرد مع ملخص لكل منها (عدد الأسطر، المجرود، أسطر الفروقات)
export async function GET(request: NextRequest) {
  try {
    const permission = await requireStockCountPermission(request, "view")
    if (!permission.ok) return permission.response
    const params = request.nextUrl.searchParams
    const status = Number(params.get("status") || 0)
    const rows = await sql`
      SELECT c.id, c.count_no, c.warehouse_id, w.warehouse_name, c.branch_id, b.branch_name, c.count_date, c.status, c.blind, c.notes,
        c.created_at, c.posted_at, c.in_voucher_id, c.out_voucher_id,
        inv.vch_code AS in_voucher_code, outv.vch_code AS out_voucher_code,
        COALESCE(s.lines, 0)::int AS lines, COALESCE(s.counted, 0)::int AS counted,
        COALESCE(s.with_difference, 0)::int AS with_difference
      FROM stock_counts c
      LEFT JOIN warehouses w ON w.id = c.warehouse_id
      LEFT JOIN branches b ON b.id = c.branch_id
      LEFT JOIN voucher_header_tbl inv ON inv.id = c.in_voucher_id
      LEFT JOIN voucher_header_tbl outv ON outv.id = c.out_voucher_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS lines,
          COUNT(*) FILTER (WHERE i.counted_qty IS NOT NULL) AS counted,
          COUNT(*) FILTER (WHERE i.counted_qty IS NOT NULL AND ABS(i.counted_qty - i.system_qty) > 0.000001) AS with_difference
        FROM stock_count_items i WHERE i.count_id = c.id
      ) s ON true
      WHERE (${status} = 0 OR c.status = ${status})
      ORDER BY c.id DESC
      LIMIT 500
    `
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } })
  } catch (error: any) {
    console.error("Error loading stock counts:", error)
    return jsonError(error?.message || "تعذر تحميل وثائق الجرد", 500)
  }
}

// POST: إنشاء وثيقة جرد جديدة (فرع + مستودع + تاريخ قطع) وتوليد أسطرها من أرصدة ذلك الفرع والمستودع
export async function POST(request: NextRequest) {
  try {
    const permission = await requireStockCountPermission(request, "create")
    if (!permission.ok) return permission.response
    const data = await request.json().catch(() => ({}))
    const warehouseId = Number(data.warehouse_id)
    const branchId = Number(data.branch_id)
    const countDate = String(data.count_date || "").slice(0, 10)
    if (!(branchId > 0)) return jsonError("يجب اختيار الفرع")
    if (!(warehouseId > 0)) return jsonError("يجب اختيار المستودع")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(countDate)) return jsonError("يجب تحديد تاريخ الجرد")
    const branch = await sql`SELECT id FROM branches WHERE id = ${branchId}`
    if (!branch.length) return jsonError("الفرع غير موجود")
    const warehouse = await sql`SELECT id FROM warehouses WHERE id = ${warehouseId} AND COALESCE(status, 1) <> 3`
    if (!warehouse.length) return jsonError("المستودع غير موجود")
    // وثيقة واحدة مفتوحة لكل فرع+مستودع — جردان متزامنان لنفس النطاق يُنتجان فروقات مكررة عند الترحيل
    const open = await sql`SELECT count_no FROM stock_counts WHERE warehouse_id = ${warehouseId} AND branch_id = ${branchId} AND status IN (1, 2) LIMIT 1`
    if (open.length) return jsonError(`يوجد جرد مفتوح لهذا الفرع والمستودع (رقم ${open[0].count_no}) — أنهِه أو ألغِه أولاً`)

    const userId = String((permission as any).user?.user_id ?? "")
    const created = await sql`
      INSERT INTO stock_counts (warehouse_id, branch_id, count_date, blind, include_zero, notes, created_by)
      VALUES (${warehouseId}, ${branchId}, ${countDate}, ${Boolean(data.blind)}, ${Boolean(data.include_zero)}, ${String(data.notes || "")}, ${userId})
      RETURNING id
    `
    const countId = Number(created[0].id)
    await sql`UPDATE stock_counts SET count_no = LPAD(${String(countId)}, 6, '0') WHERE id = ${countId}`
    const categoryIds = Array.isArray(data.category_ids) ? data.category_ids.map(Number).filter((id: number) => id > 0) : []
    const lines = await generateCountLines(countId, { warehouseId, branchId, countDate }, Boolean(data.include_zero), categoryIds)
    return NextResponse.json({ id: countId, lines }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating stock count:", error)
    return jsonError(error?.message || "تعذر إنشاء وثيقة الجرد", 500)
  }
}
