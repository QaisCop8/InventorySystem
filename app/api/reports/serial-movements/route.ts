import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { reportAccessDenied } from "@/lib/report-permissions"
import { ensureItemSerialTables } from "@/lib/item-serials"

// تقرير حركات السيريال:
//   GET ?search=&status=all|in_stock|out|none  ⇐ الأرقام التسلسلية مع حالتها الحالية (آخر حركة فعّالة)
//   GET ?serial_id=N                            ⇐ كل السندات التي حرّكت هذا الرقم بالترتيب
// ترتيب الحركات حسب رقم السند (voucher_id) لا رقم سطر الربط — انظر lastMoves في lib/item-serials.ts.
export async function GET(request: NextRequest) {
  try {
    const denied = await reportAccessDenied(request, ["serial-movements-report"])
    if (denied) return denied
    await ensureItemSerialTables()

    const params = request.nextUrl.searchParams
    const serialId = Number(params.get("serial_id") || 0)

    if (serialId > 0) {
      const movements = await sql`
        SELECT vis.id, vis.voucher_id, vis.in_stock, vis.store_id,
          h.vch_type, h.vch_code, h.vch_date, COALESCE(h.status, 1) AS status,
          vt.name AS vch_type_name,
          wh.warehouse_name AS store_name,
          COALESCE(acc.name, h.customer_name, '') AS party_name,
          COALESCE(us.full_name, us.username, h.insert_user::text, '') AS user_name,
          h.insert_date
        FROM vouchers_items_serials_tbl vis
        JOIN voucher_header_tbl h ON h.id = vis.voucher_id
        LEFT JOIN voucher_types_tbl vt ON vt.id = h.vch_type
        LEFT JOIN warehouses wh ON wh.id = vis.store_id
        LEFT JOIN account_tbl acc ON acc.id = h.account_id
        LEFT JOIN user_settings us ON us.user_id::text = h.insert_user::text
        WHERE vis.item_serial_id = ${serialId}
        ORDER BY vis.voucher_id, vis.id
      `
      return NextResponse.json(movements, { headers: { "Cache-Control": "no-store, max-age=0" } })
    }

    const search = `%${(params.get("search") || "").trim()}%`
    const status = params.get("status") || "all"

    const rows = await sql`
      SELECT s.id, s.serial, s.item_id, p.product_code, p.product_name,
        l.in_stock, l.store_id, wh.warehouse_name AS store_name,
        l.voucher_id AS last_voucher_id, h.vch_type AS last_vch_type, h.vch_code AS last_vch_code,
        h.vch_date AS last_vch_date, COALESCE(h.status, 1) AS last_status, vt.name AS last_vch_type_name,
        (
          SELECT COUNT(*)::int FROM vouchers_items_serials_tbl x
          JOIN voucher_header_tbl xh ON xh.id = x.voucher_id AND COALESCE(xh.status, 1) <> 3
          WHERE x.item_serial_id = s.id
        ) AS movements_count
      FROM items_serials_tbl s
      JOIN products p ON p.id = s.item_id
      LEFT JOIN LATERAL (
        SELECT vis.* FROM vouchers_items_serials_tbl vis
        JOIN voucher_header_tbl vh ON vh.id = vis.voucher_id
        WHERE vis.item_serial_id = s.id AND COALESCE(vh.status, 1) <> 3
        ORDER BY vis.voucher_id DESC, vis.id DESC LIMIT 1
      ) l ON true
      LEFT JOIN voucher_header_tbl h ON h.id = l.voucher_id
      LEFT JOIN voucher_types_tbl vt ON vt.id = h.vch_type
      LEFT JOIN warehouses wh ON wh.id = l.store_id
      WHERE (s.serial ILIKE ${search} OR p.product_code ILIKE ${search} OR p.product_name ILIKE ${search})
        AND (
          ${status} = 'all'
          OR (${status} = 'in_stock' AND l.in_stock = true)
          OR (${status} = 'out' AND l.in_stock = false)
          OR (${status} = 'none' AND l.id IS NULL)
        )
      ORDER BY p.product_name, s.serial
      LIMIT 2000
    `
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (error: any) {
    console.error("Error loading serial movements report:", error)
    return NextResponse.json({ error: error?.message || "تعذر تحميل تقرير حركات السيريال" }, { status: 500 })
  }
}
