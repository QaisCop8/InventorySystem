import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getGrantedBranchIds, hasNamedPermission } from "@/lib/permissions"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { authorizeProductType } from "@/app/api/inventory/products/_permissions"
import { PURCHASE_PRICE_PERMISSION_CATEGORY, PURCHASE_PRICE_VIEW_PERMISSION } from "@/lib/transaction-permission-definitions"

const intersect = (left: number[], right: number[]) => left.filter((id) => right.includes(id))

export async function GET(request: NextRequest) {
  try {
    const productAccess = await authorizeProductType(request, 1, "lookup")
    if (!productAccess.ok) return productAccess.response

    const purchaseAccess = await authorizeTransaction(request, "purchase_order", "view")
    if (!purchaseAccess.ok) return purchaseAccess.response

    const productBranchIds = await getGrantedBranchIds(productAccess.userId, productAccess.accessId)
    const salesAccess = await authorizeTransaction(request, "sales_invoice", "view")
    const salesReturnAccess = await authorizeTransaction(request, "sales_return", "view")
    const canViewPurchasePrices = await hasNamedPermission(
      productAccess.userId,
      PURCHASE_PRICE_VIEW_PERMISSION,
      PURCHASE_PRICE_PERMISSION_CATEGORY,
      productAccess.branchId,
    )

    const requestedDays = Number(new URL(request.url).searchParams.get("days") || 90)
    const periodDays = Number.isInteger(requestedDays) ? Math.min(365, Math.max(30, requestedDays)) : 90
    const products = await sql`
      SELECT
        p.id,
        p.product_code,
        p.product_name,
        p.supplier_id,
        s.supplier_name,
        s.account_id AS supplier_account_id,
        p.default_store,
        COALESCE(ps.current_stock, 0)::float AS current_stock,
        COALESCE(ps.reserved_stock, 0)::float AS reserved_stock,
        COALESCE(ps.available_stock, COALESCE(ps.current_stock, 0) - COALESCE(ps.reserved_stock, 0))::float AS available_stock,
        COALESCE(ps.reorder_level, p.reorder_point, p.min_stock_level, 0)::float AS reorder_point,
        COALESCE(ps.max_stock_level, p.max_stock_level, 0)::float AS max_stock_level,
        ${canViewPurchasePrices}::boolean AS can_view_purchase_price,
        CASE WHEN ${canViewPurchasePrices}::boolean THEN COALESCE(p.last_purchase_price, 0)::float ELSE NULL END AS last_purchase_price,
        CASE WHEN ${canViewPurchasePrices}::boolean THEN COALESCE(lpc.currency_name, c.currency_name, '') ELSE '' END AS purchase_currency_name,
        pu.unit_id,
        u.unit_name
      FROM products p
      LEFT JOIN product_stock ps ON ps.product_id = p.id AND COALESCE(ps.organization_id, 1) = 1
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN currency c ON c.id = p.currency_id
      LEFT JOIN currency lpc ON lpc.id = p.last_purchase_currency_id
      LEFT JOIN LATERAL (
        SELECT product_unit.unit_id
        FROM product_units product_unit
        WHERE product_unit.product_id = p.id
        ORDER BY product_unit.id ASC
        LIMIT 1
      ) pu ON TRUE
      LEFT JOIN units u ON u.id = pu.unit_id
      WHERE COALESCE(p.type, 1) = 1
        AND (p.deleted IS NULL OR p.deleted = false)
        AND (p.status = 1 OR p.status::text IN ('1', 'نشط', 'active', 'ACTIVE'))
        AND (
          NOT EXISTS (SELECT 1 FROM product_branches pb WHERE pb.product_id = p.id)
          OR EXISTS (
            SELECT 1 FROM product_branches pb
            WHERE pb.product_id = p.id AND pb.branch_id = ANY(${productBranchIds}::int[])
          )
        )
      ORDER BY p.product_name ASC
    `

    const productIds = products.map((product: any) => Number(product.id)).filter((id: number) => Number.isInteger(id) && id > 0)
    if (!productIds.length) {
      return NextResponse.json({ period_days: periodDays, sales_history_available: salesAccess.ok, products: [] })
    }

    const salesBranchIds = salesAccess.ok ? intersect(productBranchIds, salesAccess.branchIds) : []
    const returnBranchIds = salesReturnAccess.ok ? intersect(productBranchIds, salesReturnAccess.branchIds) : []
    const purchaseBranchIds = intersect(productBranchIds, purchaseAccess.branchIds)
    const [salesRows, incomingRows] = await Promise.all([
      salesBranchIds.length || returnBranchIds.length
        ? sql`
            SELECT vi.item_id AS product_id,
                   GREATEST(COALESCE(SUM(
                     CASE WHEN vh.vch_type = 16 THEN -1 ELSE 1 END
                     * (COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0))
                   ), 0), 0)::float AS sold_quantity
            FROM voucher_header_tbl vh
            JOIN voucher_items_tbl vi ON vi.voucher_id = vh.id
            WHERE vh.vch_type IN (12, 16)
              AND COALESCE(vh.status, 1) <> 3
              AND (
                (vh.vch_type = 12 AND vh.branch_id = ANY(${salesBranchIds}::int[]))
                OR (vh.vch_type = 16 AND vh.branch_id = ANY(${returnBranchIds}::int[]))
              )
              AND vh.vch_date >= CURRENT_DATE - (${periodDays}::int * INTERVAL '1 day')
              AND vi.item_id = ANY(${productIds}::int[])
            GROUP BY vi.item_id
          `
        : Promise.resolve([]),
      purchaseBranchIds.length
        ? sql`
            WITH received AS (
              SELECT vi.order_item_id,
                     COALESCE(SUM(COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)), 0) AS received_quantity
              FROM voucher_items_tbl vi
              JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
              WHERE vh.vch_type IN (17, 18)
                AND COALESCE(vh.status, 1) <> 3
                AND vi.order_item_id IS NOT NULL
                AND vh.branch_id = ANY(${purchaseBranchIds}::int[])
              GROUP BY vi.order_item_id
            )
            SELECT oi.product_id,
                   COALESCE(SUM(GREATEST(
                     COALESCE(oi.quantity, 0) + COALESCE(oi.bonus, 0) - COALESCE(received.received_quantity, 0),
                     0
                   )), 0)::float AS incoming_quantity
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN received ON received.order_item_id = oi.id
            WHERE o.order_type = 2
              AND COALESCE(o.deleted, false) = false
              AND o.branch_id = ANY(${purchaseBranchIds}::int[])
              AND COALESCE(o.order_status, 1) IN (1, 2, 3)
              AND COALESCE(oi.item_status, 1) IN (1, 2, 3)
              AND oi.product_id = ANY(${productIds}::int[])
            GROUP BY oi.product_id
          `
        : Promise.resolve([]),
    ])

    const soldByProduct = new Map((salesRows as any[]).map((row) => [Number(row.product_id), Number(row.sold_quantity) || 0]))
    const incomingByProduct = new Map((incomingRows as any[]).map((row) => [Number(row.product_id), Number(row.incoming_quantity) || 0]))
    const result = products.map((product: any) => ({
      ...product,
      sold_quantity: soldByProduct.get(Number(product.id)) || 0,
      incoming_quantity: incomingByProduct.get(Number(product.id)) || 0,
    }))

    return NextResponse.json({
      period_days: periodDays,
      sales_history_available: salesAccess.ok,
      products: result,
    })
  } catch (error) {
    console.error("Purchase planning data error:", error)
    return NextResponse.json({ error: "تعذر تحميل بيانات تخطيط المشتريات" }, { status: 500 })
  }
}
