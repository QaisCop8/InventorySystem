import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { getInventoryReportProducts, reportDate } from "@/lib/item-inventory-reports"
import { buildItemCard, type ItemCardLine } from "@/lib/item-card-ledger"
import sql from "@/lib/database"

const ids = (value: string | null) => String(value || "").split(",").map(Number).filter(id => Number.isSafeInteger(id) && id > 0)

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
    if (!Number.isSafeInteger(productId) || productId < 0) return NextResponse.json({ error: "الصنف غير صالح" }, { status: 400 })
    if (!productId) {
      const [products, warehouses, groups] = await Promise.all([
        getInventoryReportProducts(organizationId, 0, ""),
        sql`SELECT id,warehouse_code code,warehouse_name name FROM warehouses WHERE COALESCE(status,1)<>3 AND COALESCE(is_active,true) ORDER BY warehouse_code`,
        sql`SELECT id,group_code code,group_name name FROM item_groups WHERE COALESCE(status,1)<>3 AND COALESCE(is_active,true) ORDER BY group_code`,
      ])
      return NextResponse.json({ report: "item-card", products, warehouses, groups })
    }
    const products = await sql`
      SELECT p.id,p.product_code,p.product_name,u.unit_name AS main_unit
      FROM products p LEFT JOIN units u ON u.id=p.measurment_unit
      WHERE p.id=${productId} AND COALESCE(p.deleted,false)=false AND COALESCE(p.status,1)<>3
    `
    if (!products.length) return NextResponse.json({ error: "الصنف غير موجود" }, { status: 404 })
    // A new company may have products before its first inventory voucher is created.
    const tables = await sql`SELECT to_regclass('voucher_items_tbl') AS vouchers`
    const lines = tables[0]?.vouchers ? await sql`
      SELECT vi.id,vh.id AS voucher_id,vh.vch_code,vh.vch_type,vh.vch_date::date::text AS movement_date,
             vi.qnty,vi.bonus,vi.price,vi.discount,vi.vat_ratio,vi.delivery_item_id,
             COALESCE(NULLIF(pu.to_main_qnty,0),1) AS unit_factor,u.unit_name AS item_unit,
             vh.to_store_id,vh.from_store_id,vi.store_id,
             store.warehouse_name AS store_name,source.warehouse_name AS from_store_name,destination.warehouse_name AS to_store_name,
             vi.note AS notes,vi.barcode,vi.batch_no,vi.expiry_date::date::text AS expiry_date,
             vh.manual_voucher,a.code AS account_code,COALESCE(NULLIF(vh.customer_name,''),a.name) AS customer_name,
             c.currency_code,c.currency_name,s.name AS salesman_name,
             COALESCE((to_jsonb(vh)->>'vat_included')::boolean,false) AS vat_included,
             to_jsonb(vh)->>'discount_type' AS header_discount_type,
             (to_jsonb(vh)->>'discount_value')::numeric AS header_discount_value,
             COALESCE((to_jsonb(vh)->>'discount')::numeric,0) AS header_discount,totals.subtotal AS header_subtotal
      FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id=vi.voucher_id
      LEFT JOIN LATERAL (
        SELECT to_main_qnty FROM product_units WHERE product_id=vi.item_id AND unit_id=vi.unit_id ORDER BY id LIMIT 1
      ) pu ON TRUE
      LEFT JOIN units u ON u.id=vi.unit_id
      LEFT JOIN warehouses store ON store.id=vi.store_id
      LEFT JOIN warehouses source ON source.id=vh.from_store_id
      LEFT JOIN warehouses destination ON destination.id=vh.to_store_id
      LEFT JOIN account_tbl a ON a.id=vh.account_id
      LEFT JOIN currency c ON c.id=vh.currency_id
      LEFT JOIN salesmen s ON s.id=vh.salesman_id
      LEFT JOIN LATERAL (
        SELECT SUM(COALESCE(item.qnty,0)*COALESCE(item.price,0)
          / CASE WHEN COALESCE((to_jsonb(vh)->>'vat_included')::boolean,false)
              THEN NULLIF(1+COALESCE(item.vat_ratio,0)/100,0) ELSE 1 END
          * (1-COALESCE(item.discount,0)/100)) AS subtotal
        FROM voucher_items_tbl item WHERE item.voucher_id=vh.id
      ) totals ON TRUE
      WHERE vi.item_id=${productId} AND vh.vch_status=2 AND COALESCE(vh.status,1)<>3
        AND vh.vch_date::date<=${toDate}::date AND vh.vch_type IN (8,9,10,11,12,13,14,15,16,17,18,19)
        AND (vh.vch_type NOT IN (12,17) OR COALESCE(vi.delivery_item_id,0)=0)
      ORDER BY vh.vch_date, vh.id, vi.id
    ` : []
    return NextResponse.json({ report: "item-card", product: products[0], from_date: fromDate, to_date: toDate,
      ...buildItemCard(lines as ItemCardLine[], fromDate, toDate, warehouseIds, params.get("show_internal_transfers") === "1") })
  } catch (error) {
    console.error("Item card report error:", error)
    return NextResponse.json({ error: "تعذر تحميل بطاقة الصنف" }, { status: 500 })
  }
}
