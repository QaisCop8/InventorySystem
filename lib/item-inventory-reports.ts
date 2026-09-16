import sql from "@/lib/database"

async function movementCostSql() {
  const columns = await sql`SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='inventory_transactions' AND column_name='unit_cost' LIMIT 1`
  return columns.length ? 'it.unit_cost' : 'p.last_purchase_price'
}

export const reportDate = (value: string | null, fallback = new Date().toISOString().slice(0, 10)) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback

const signedQuantity = `CASE
  WHEN it.transaction_type = 'out' THEN -ABS(it.quantity)
  WHEN it.transaction_type = 'in' THEN ABS(it.quantity)
  ELSE it.quantity
END`

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

export async function getProductBalances(organizationId: number, toDate: string, productId: number, search: string) {
  const cost = await movementCostSql()
  return sql`
    WITH movements AS (
      SELECT it.product_id,
             SUM(${sql.unsafe(signedQuantity)}) AS balance,
             SUM(CASE WHEN it.transaction_type = 'in' THEN ABS(it.quantity) ELSE 0 END) AS received_quantity,
             SUM(CASE WHEN it.transaction_type = 'out' THEN ABS(it.quantity) ELSE 0 END) AS issued_quantity,
             SUM(CASE WHEN it.transaction_type = 'in' THEN ABS(it.quantity) * COALESCE(${sql.unsafe(cost)}, 0) ELSE 0 END) AS received_value,
             SUM(CASE WHEN it.transaction_type = 'in' AND ${sql.unsafe(cost)} IS NOT NULL THEN ABS(it.quantity) ELSE 0 END) AS cost_quantity,
             (ARRAY_AGG(${sql.unsafe(cost)} ORDER BY it.created_at DESC, it.id DESC)
               FILTER (WHERE it.transaction_type = 'in' AND ${sql.unsafe(cost)} IS NOT NULL))[1] AS last_incoming_cost,
             MAX(it.created_at) AS last_movement_at
      FROM inventory_transactions it JOIN products p ON p.id=it.product_id
      WHERE it.organization_id = ${organizationId} AND it.created_at::date <= ${toDate}::date
      GROUP BY it.product_id
    )
    SELECT p.id, p.product_code, p.product_name, p.barcode, p.measurment_unit AS main_unit, p.category_id AS category,
           p.currency_id, p.last_purchase_price,
           COALESCE(m.balance, 0) AS balance,
           COALESCE(m.received_quantity, 0) AS received_quantity,
           COALESCE(m.issued_quantity, 0) AS issued_quantity,
           COALESCE(m.received_value, 0) AS received_value,
           COALESCE(m.cost_quantity, 0) AS cost_quantity,
           m.last_incoming_cost,
           m.last_movement_at
    FROM products p LEFT JOIN movements m ON m.product_id = p.id
    WHERE COALESCE(p.deleted,false)=false AND COALESCE(p.status,1)<>3 AND COALESCE(p.type,1)=1
      AND (${productId} = 0 OR p.id = ${productId})
      AND (${search} = '' OR p.product_code ILIKE ${`%${search}%`} OR p.product_name ILIKE ${`%${search}%`})
    ORDER BY p.product_code, p.product_name
  `
}

export async function getProductCard(organizationId: number, productId: number, fromDate: string, toDate: string, warehouseIds: number[] = []) {
  const cost = await movementCostSql()
  return sql`
    WITH movements AS (
      SELECT it.id, it.created_at::date AS movement_date, it.transaction_type,
             it.quantity, ${sql.unsafe(cost)} AS unit_cost, it.reference_type, it.reference_id, it.notes,
             ${sql.unsafe(signedQuantity)} AS signed_quantity,
             GREATEST(${sql.unsafe(signedQuantity)},0) AS quantity_in,
             GREATEST(-(${sql.unsafe(signedQuantity)}),0) AS quantity_out
      FROM inventory_transactions it JOIN products p ON p.id=it.product_id
      WHERE it.organization_id = ${organizationId} AND it.product_id = ${productId}
        AND (${warehouseIds.length}=0 OR it.warehouse_id=ANY(${warehouseIds}::int[]))
        AND it.created_at::date <= ${toDate}::date
    ), opening AS (
      SELECT COALESCE(SUM(signed_quantity) FILTER (WHERE movement_date < ${fromDate}::date), 0) AS opening_balance
      FROM movements
    )
    SELECT m.*, opening.opening_balance,
           opening.opening_balance + SUM(m.signed_quantity) OVER (ORDER BY m.movement_date, m.id) AS balance
    FROM movements m CROSS JOIN opening
    WHERE m.movement_date >= ${fromDate}::date
    ORDER BY m.movement_date, m.id
  `
}

export async function getProductOpeningBalance(organizationId: number, productId: number, fromDate: string, warehouseIds: number[] = []) {
  const rows = await sql`SELECT COALESCE(SUM(${sql.unsafe(signedQuantity)}),0) AS balance
    FROM inventory_transactions it
    WHERE it.organization_id=${organizationId} AND it.product_id=${productId}
      AND (${warehouseIds.length}=0 OR it.warehouse_id=ANY(${warehouseIds}::int[]))
      AND it.created_at::date<${fromDate}::date`
  return Number(rows[0]?.balance || 0)
}
