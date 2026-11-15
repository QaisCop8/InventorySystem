import { NextRequest, NextResponse } from "next/server"
import { reportAccessDenied } from "@/lib/report-permissions"
import { getSessionUser } from "@/lib/tenant-auth"
import { getInventoryReportProducts, reportDate } from "@/lib/item-inventory-reports"
import { buildItemCard, type ItemCardLine } from "@/lib/item-card-ledger"
import sql from "@/lib/database"
import { ensureProductionTables } from "@/lib/production-vouchers"
import { ensureVoucherIndexes } from "@/lib/voucher-indexes"

const ids = (value: string | null) => String(value || "").split(",").map(Number).filter(id => Number.isSafeInteger(id) && id > 0)

export async function GET(request: NextRequest) {
  // الفهارس تُبنى بالخلفية مرة لكل قاعدة — لا ينتظرها التقرير
  void ensureVoucherIndexes().catch(() => undefined)
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const reportDenied = await reportAccessDenied(request, ["item-card-report"])
    if (reportDenied) return reportDenied
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
    // سندات الإدخال/الإخراج/الإرسالية المولّدة من سند انتاج تظهر بالبطاقة باسم سند الانتاج ورقمه
    if (tables[0]?.vouchers) await ensureProductionTables()
    // كل سند يُحسب مرة واحدة (رأسه كـJSON، مجموع أسطره، رقم سند الانتاج) بدل تكرارها لكل سطر صنف — بعد ترحيل آلاف
    // السندات كان الصنف الكثير الحركة يستغرق دقائق (to_jsonb للرأس 5 مرات + جمع أسطر السند لكل سطر)
    const lines = tables[0]?.vouchers ? await sql`
      WITH item_lines AS (
        SELECT vi.id, vi.voucher_id, vi.item_id, vi.unit_id, vi.store_id, vi.qnty, vi.bonus, vi.price, vi.discount, vi.vat_ratio,
               vi.delivery_item_id, vi.note, vi.barcode, vi.batch_no, vi.expiry_date
        FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id=vi.voucher_id
        WHERE vi.item_id=${productId} AND vh.vch_status=2 AND COALESCE(vh.status,1)<>3
          AND vh.vch_date::date<=${toDate}::date AND vh.vch_type IN (8,9,10,11,12,13,14,15,16,17,18,19)
          AND (vh.vch_type NOT IN (12,17) OR COALESCE(vi.delivery_item_id,0)=0)
      ),
      vouchers AS (
        SELECT vh.*, to_jsonb(vh) AS j FROM voucher_header_tbl vh WHERE vh.id IN (SELECT DISTINCT voucher_id FROM item_lines)
      ),
      totals AS (
        SELECT item.voucher_id, SUM(COALESCE(item.qnty,0)*COALESCE(item.price,0)
          / CASE WHEN COALESCE((v.j->>'vat_included')::boolean,false) THEN NULLIF(1+COALESCE(item.vat_ratio,0)/100,0) ELSE 1 END
          * (1-COALESCE(item.discount,0)/100)) AS subtotal
        FROM voucher_items_tbl item JOIN vouchers v ON v.id=item.voucher_id
        GROUP BY item.voucher_id
      ),
      production AS (
        SELECT v.id AS voucher_id, COALESCE(
          (SELECT pv.code FROM production_vouchers_tbl pv WHERE pv.in_voucher_id=v.id OR pv.out_voucher_id=v.id LIMIT 1),
          (SELECT pv.code FROM production_transfers_tbl pt JOIN production_vouchers_tbl pv ON pv.id=pt.production_id WHERE pt.voucher_id=v.id LIMIT 1)) AS code
        FROM vouchers v WHERE v.vch_type IN (8,9,10)
      )
      SELECT vi.id,vh.id AS voucher_id,vh.vch_code,vh.vch_type,vh.vch_date::date::text AS movement_date,
             prod.code AS production_code,
             vi.qnty,vi.bonus,vi.price,vi.discount,vi.vat_ratio,vi.delivery_item_id,
             COALESCE(NULLIF(pu.to_main_qnty,0),1) AS unit_factor,u.unit_name AS item_unit,
             vh.to_store_id,vh.from_store_id,vi.store_id,
             store.warehouse_name AS store_name,source.warehouse_name AS from_store_name,destination.warehouse_name AS to_store_name,
             vi.note AS notes,vi.barcode,vi.batch_no,vi.expiry_date::date::text AS expiry_date,
             vh.manual_voucher,a.code AS account_code,COALESCE(NULLIF(vh.customer_name,''),a.name) AS customer_name,
             c.currency_code,c.currency_name,s.name AS salesman_name,
             COALESCE((vh.j->>'vat_included')::boolean,false) AS vat_included,
             vh.j->>'discount_type' AS header_discount_type,
             (vh.j->>'discount_value')::numeric AS header_discount_value,
             COALESCE((vh.j->>'discount')::numeric,0) AS header_discount,totals.subtotal AS header_subtotal
      FROM item_lines vi JOIN vouchers vh ON vh.id=vi.voucher_id
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
      LEFT JOIN totals ON totals.voucher_id=vh.id
      LEFT JOIN production prod ON prod.voucher_id=vh.id
      ORDER BY vh.vch_date, vh.id, vi.id
    ` : []
    return NextResponse.json({ report: "item-card", product: products[0], from_date: fromDate, to_date: toDate,
      ...buildItemCard(lines as ItemCardLine[], fromDate, toDate, warehouseIds, params.get("show_internal_transfers") === "1") })
  } catch (error) {
    console.error("Item card report error:", error)
    return NextResponse.json({ error: "تعذر تحميل بطاقة الصنف" }, { status: 500 })
  }
}
