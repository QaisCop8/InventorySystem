import sql from "@/lib/database"
import { summarizeVoucherInventory } from "@/lib/voucher-inventory-valuation"
import { getSystemSettingValue } from "@/lib/system-settings"

export const reportDate = (value: string | null, fallback = new Date().toISOString().slice(0, 10)) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback

export async function getInventoryReportProducts(organizationId: number, productId: number, search: string) {
  return sql`
    SELECT p.id, p.product_code, p.product_name, p.category_id, p.main_stock_id, p.type
    FROM products p
    WHERE COALESCE(p.deleted,false)=false AND COALESCE(p.status,1)<>3
      AND (${productId} = 0 OR p.id = ${productId})
      AND (${search} = '' OR p.product_code ILIKE ${`%${search}%`} OR p.product_name ILIKE ${`%${search}%`})
    ORDER BY p.product_code, p.product_name
  `
}

export async function getProductBalances(_organizationId: number, toDate: string, productId: number, search: string) {
  // sql is already scoped to the current company's database. Neither quantities
  // nor prices for this report depend on the optional movement ledger.
  const [products, lines, includePurchaseReturns] = await Promise.all([
    sql`SELECT p.id,p.product_code,p.product_name,p.barcode,u.unit_name AS main_unit,
               groups.group_name AS category,p.currency_id,p.last_purchase_price,
               COALESCE((to_jsonb(p)->>'initial_price')::numeric,0) AS initial_price
        FROM products p
        LEFT JOIN units u ON u.id=p.measurment_unit
        LEFT JOIN item_groups groups ON groups.id=p.category_id
        WHERE COALESCE(p.deleted,false)=false AND COALESCE(p.status,1)<>3 AND COALESCE(p.type,1)=1
          AND (${productId}=0 OR p.id=${productId})
          AND (${search}='' OR p.product_code ILIKE ${`%${search}%`} OR p.product_name ILIKE ${`%${search}%`})
        ORDER BY p.product_code,p.product_name`,
    sql`
      SELECT vi.id,vh.id AS voucher_id,vi.item_id AS product_id,vh.vch_type,vh.vch_date::date::text AS movement_date,
             vi.qnty,vi.bonus,vi.delivery_item_id,COALESCE(NULLIF(pu.to_main_qnty,0),1) AS unit_factor,
             cost_item.qnty AS cost_qnty,cost_item.bonus AS cost_bonus,cost_item.price AS cost_price,
             cost_item.discount AS cost_discount,cost_item.vat_ratio AS cost_vat_ratio,
             COALESCE((to_jsonb(cost_header)->>'vat_included')::boolean,false) AS cost_vat_included,
             to_jsonb(cost_header)->>'discount_type' AS cost_discount_type,
             COALESCE((to_jsonb(cost_header)->>'discount_value')::numeric,0) AS cost_discount_value,
             COALESCE((to_jsonb(cost_header)->>'discount')::numeric,0) AS cost_header_discount,
             COALESCE(NULLIF(cost_unit.to_main_qnty,0),1) AS cost_unit_factor,
             cost_totals.subtotal AS cost_subtotal,
             CASE WHEN cost_header.currency_id=p.currency_id THEN 1
                  ELSE COALESCE(NULLIF(cost_header.rate,0),1)/COALESCE(NULLIF(product_rate.exchange_rate,0),1)
             END AS currency_conversion
      FROM voucher_items_tbl vi
      JOIN voucher_header_tbl vh ON vh.id=vi.voucher_id
      JOIN products p ON p.id=vi.item_id
      LEFT JOIN LATERAL (
        SELECT to_main_qnty FROM product_units
        WHERE product_id=vi.item_id AND unit_id=vi.unit_id ORDER BY id LIMIT 1
      ) pu ON TRUE
      -- A purchase delivery owns the quantity; its posted invoice supplies the
      -- final purchase price, only if that invoice existed by the report date.
      LEFT JOIN LATERAL (
        SELECT invoice_item.id
        FROM voucher_items_tbl invoice_item
        JOIN voucher_header_tbl invoice ON invoice.id=invoice_item.voucher_id
        WHERE vh.vch_type=18 AND invoice_item.delivery_item_id=vi.id
          AND invoice.vch_type=17 AND invoice.vch_status=2 AND COALESCE(invoice.status,1)<>3
          AND invoice.vch_date::date<=${toDate}::date
        ORDER BY invoice.vch_date DESC,invoice_item.id DESC LIMIT 1
      ) linked_invoice ON TRUE
      JOIN voucher_items_tbl cost_item ON cost_item.id=COALESCE(linked_invoice.id,vi.id)
      JOIN voucher_header_tbl cost_header ON cost_header.id=cost_item.voucher_id
      LEFT JOIN LATERAL (
        SELECT to_main_qnty FROM product_units
        WHERE product_id=cost_item.item_id AND unit_id=cost_item.unit_id ORDER BY id LIMIT 1
      ) cost_unit ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(COALESCE(line.qnty,0)*COALESCE(line.price,0)
          / CASE WHEN COALESCE((to_jsonb(cost_header)->>'vat_included')::boolean,false)
              THEN NULLIF(1+COALESCE(line.vat_ratio,0)/100,0) ELSE 1 END
          * (1-COALESCE(line.discount,0)/100)) AS subtotal
        FROM voucher_items_tbl line WHERE line.voucher_id=cost_header.id
      ) cost_totals ON TRUE
      LEFT JOIN LATERAL (
        SELECT er.exchange_rate FROM exchange_rates er
        WHERE er.currency_id=p.currency_id AND COALESCE(er.is_active,true)
          AND er.rate_date::date<=cost_header.vch_date::date
        ORDER BY er.rate_date DESC,er.id DESC LIMIT 1
      ) product_rate ON TRUE
      WHERE vh.vch_status=2 AND COALESCE(vh.status,1)<>3 AND vh.vch_date::date<=${toDate}::date
        AND vh.vch_type IN (8,9,11,12,13,14,15,16,17,18,19)
        AND (vh.vch_type NOT IN (12,17) OR COALESCE(vi.delivery_item_id,0)=0)
        AND COALESCE(p.deleted,false)=false AND COALESCE(p.status,1)<>3 AND COALESCE(p.type,1)=1
        AND (${productId}=0 OR p.id=${productId})
        AND (${search}='' OR p.product_code ILIKE ${`%${search}%`} OR p.product_name ILIKE ${`%${search}%`})
      ORDER BY vh.vch_date,vh.id,vi.id
    `,
    getSystemSettingValue("include_purchase_returns_in_cost", false),
  ])
  return summarizeVoucherInventory(products, lines, [true, 1, "1", "true"].includes(includePurchaseReturns))
}
