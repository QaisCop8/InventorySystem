import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { getInventoryReportProducts, getProductCard, getProductOpeningBalance, reportDate } from "@/lib/item-inventory-reports"
import sql from "@/lib/database"

const ids = (value: string | null) => String(value || "").split(",").map(Number).filter(id => Number.isSafeInteger(id) && id > 0)

async function getVoucherCard(productId: number, fromDate: string, toDate: string, warehouseIds: number[]) {
  const vouchers = await sql`
    SELECT vi.id, vh.id AS voucher_id, vh.vch_code, vh.vch_type, vh.vch_date::date AS movement_date,
           vh.to_store_id, vh.from_store_id, vi.store_id, vi.note AS notes,
           (COALESCE(vi.qnty,0)+COALESCE(vi.bonus,0))*COALESCE(pu.to_main_qnty,1) AS quantity,
           COALESCE(vi.cost_price,p.last_purchase_price,0) AS unit_cost
    FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id=vi.voucher_id
    JOIN products p ON p.id=vi.item_id
    LEFT JOIN product_units pu ON pu.product_id=vi.item_id AND pu.unit_id=vi.unit_id
    WHERE vi.item_id=${productId} AND vh.status=2 AND vh.vch_date::date<=${toDate}::date
      AND vh.vch_type IN (8,9,10,11,12,13,16,17,18,19)
    ORDER BY vh.vch_date, vh.id, vi.id
  `
  const movements: any[] = []
  const included = (storeId: unknown) => !warehouseIds.length || warehouseIds.includes(Number(storeId))
  for (const voucher of vouchers) {
    const type=Number(voucher.vch_type), quantity=Number(voucher.quantity || 0)
    if (!quantity) continue
    const stores = type===10
      ? [{store:voucher.from_store_id ?? voucher.store_id,sign:-1},{store:voucher.to_store_id,sign:1}]
      : [{store:voucher.store_id ?? voucher.to_store_id,sign:[8,16,17,18].includes(type)?1:-1}]
    for (const {store,sign} of stores) {
      if (!included(store)) continue
      movements.push({id:`voucher-${voucher.id}-${sign}`,movement_date:voucher.movement_date,
        transaction_type:sign>0?"in":"out",quantity,quantity_in:sign>0?quantity:0,
        quantity_out:sign<0?quantity:0,unit_cost:voucher.unit_cost,
        reference_type:voucher.vch_code || `سند ${type}`,reference_id:voucher.voucher_id,notes:voucher.notes,
        signed_quantity:sign*quantity})
    }
  }
  let balance=0
  for (const movement of movements) {
    if (String(movement.movement_date).slice(0,10)<fromDate) balance+=movement.signed_quantity
  }
  const opening=balance
  const rows=movements.filter(movement=>String(movement.movement_date).slice(0,10)>=fromDate).map(movement=>{
    balance+=movement.signed_quantity
    return {...movement,opening_balance:opening,balance}
  })
  return {rows,opening,closing:balance}
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const params = request.nextUrl.searchParams
    const organizationId = Number((user as any).organization_id || 1)
    const productId = Number(params.get("product_id") || 0)
    const warehouseIds = ids(params.get("warehouse_ids"))
    const fromDate = reportDate(params.get("from_date"), `${new Date().getFullYear()}-01-01`)
    const toDate = reportDate(params.get("to_date"))
    if (fromDate > toDate) return NextResponse.json({ error: "تاريخ البداية يجب أن يسبق تاريخ النهاية" }, { status: 400 })
    if (!productId) {
      const [products, warehouses, groups] = await Promise.all([
        getInventoryReportProducts(organizationId, 0, ""),
        sql`SELECT id,warehouse_code code,warehouse_name name FROM warehouses WHERE COALESCE(status,1)<>3 AND COALESCE(is_active,true) ORDER BY warehouse_code`,
        sql`SELECT id,group_code code,group_name name FROM item_groups WHERE COALESCE(status,1)<>3 AND COALESCE(is_active,true) ORDER BY group_code`,
      ])
      return NextResponse.json({ report: "item-card", products, warehouses, groups, rows: [], opening_balance: 0, closing_balance: 0 })
    }
    // The movement ledger is created when stock vouchers are first used. A newly
    // configured company can therefore have products but no ledger table yet.
    const tables = await sql`SELECT to_regclass('inventory_transactions') AS ledger, to_regclass('voucher_items_tbl') AS vouchers`
    let rows: any[] = [], opening=0, closing=0
    if (tables[0]?.ledger) {
      try {
        [rows,opening] = await Promise.all([
          getProductCard(organizationId, productId, fromDate, toDate, warehouseIds),
          getProductOpeningBalance(organizationId, productId, fromDate, warehouseIds),
        ])
        closing = rows.length ? Number(rows.at(-1)?.balance ?? opening) : opening
      } catch (ledgerError) {
        if (!tables[0]?.vouchers) throw ledgerError
        console.error("Item card movement ledger error; using voucher items:", ledgerError)
      }
    }
    if (!rows.length && !opening && tables[0]?.vouchers) {
      const voucherCard = await getVoucherCard(productId,fromDate,toDate,warehouseIds)
      rows=voucherCard.rows; opening=voucherCard.opening; closing=voucherCard.closing
    }
    return NextResponse.json({ report: "item-card", from_date: fromDate, to_date: toDate, rows, opening_balance: opening, closing_balance: closing })
  } catch (error) {
    console.error("Item card report error:", error)
    return NextResponse.json({ error: error instanceof Error ? `تعذر تحميل بطاقة الصنف: ${error.message}` : "تعذر تحميل بطاقة الصنف" }, { status: 500 })
  }
}
