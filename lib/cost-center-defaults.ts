import sql, { resolveCurrentDbName } from "@/lib/database"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// مراكز التكلفة الافتراضية لسطر صنف بالسند — نفس منطق شامل (ShamelAPI GetItemDefaultCostCenterF و
// ItemsAndServices.GetItem): تبدأ بمراكز تكلفة حساب الصنف (account_costcenters_tbl)، ثم تُستبدل كلياً
// بمراكز تكلفة المستودع إن عُرّف له أي مركز (warehouse_costcenters_tbl)، ثم تُستبدل كلياً بمراكز تكلفة
// الصنف إن عُرّف له أي مركز (product_costcenters_tbl). الأولوية الفعلية: الصنف ← المستودع ← الحساب.
// كل جدول: صف لكل نوع مركز تكلفة (cost_center_type_id) مع المركز الافتراضي والإلزام.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type CostCenterSelection = { cost_center_type_id: number; cost_center_id: number; cost_center_name: string }
export type CostCenterDefaultRow = { cost_center_type_id: number; default_cost_center_id: number | null; required_in_transactions: number }

// لكل قاعدة شركة على حدة — حفظ "جاهز" مرة واحدة لكل عملية خادم كان يجعل كل شركة بعد أول شركة تتخطى
// إنشاء الجدول، فيفشل GET /api/warehouses ("relation does not exist") وتظهر قائمة المستودعات فارغة.
const warehouseTableReady = new Map<string, Promise<void>>()
export async function ensureWarehouseCostCentersTable() {
  const dbName = await resolveCurrentDbName()
  let pending = warehouseTableReady.get(dbName)
  if (!pending) {
    pending = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS warehouse_costcenters_tbl (
          id SERIAL PRIMARY KEY,
          warehouse_id INTEGER NOT NULL,
          cost_center_type_id INTEGER NOT NULL,
          required_in_transactions INTEGER NOT NULL DEFAULT 1,
          default_cost_center_id INTEGER,
          UNIQUE (warehouse_id, cost_center_type_id)
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS idx_warehouse_costcenters_warehouse ON warehouse_costcenters_tbl(warehouse_id)`
    })().catch((error) => { warehouseTableReady.delete(dbName); throw error })
    warehouseTableReady.set(dbName, pending)
  }
  return pending
}

export async function getWarehouseCostCenters(warehouseId: number): Promise<CostCenterDefaultRow[]> {
  await ensureWarehouseCostCentersTable()
  const rows = await sql`
    SELECT cost_center_type_id, default_cost_center_id, required_in_transactions
    FROM warehouse_costcenters_tbl WHERE warehouse_id = ${warehouseId} ORDER BY cost_center_type_id
  `
  return (rows as any[]).map((row) => ({
    cost_center_type_id: Number(row.cost_center_type_id),
    default_cost_center_id: row.default_cost_center_id == null ? null : Number(row.default_cost_center_id),
    required_in_transactions: Number(row.required_in_transactions || 1),
  }))
}

/** استبدال كامل لمراكز تكلفة المستودع (نفس أسلوب persistProductCostCenters). */
export async function saveWarehouseCostCenters(warehouseId: number, rows: unknown) {
  await ensureWarehouseCostCentersTable()
  if (!Array.isArray(rows)) return
  await sql`DELETE FROM warehouse_costcenters_tbl WHERE warehouse_id = ${warehouseId}`
  for (const row of rows as any[]) {
    const typeId = Number(row?.cost_center_type_id ?? 0)
    if (!(typeId > 0)) continue
    const centerId = Number(row?.default_cost_center_id) > 0 ? Number(row.default_cost_center_id) : null
    const required = [1, 2, 3].includes(Number(row?.required_in_transactions)) ? Number(row.required_in_transactions) : 1
    if (!centerId && required === 1) continue
    await sql`
      INSERT INTO warehouse_costcenters_tbl (warehouse_id, cost_center_type_id, required_in_transactions, default_cost_center_id)
      VALUES (${warehouseId}, ${typeId}, ${required}, ${centerId})
      ON CONFLICT (warehouse_id, cost_center_type_id) DO UPDATE
      SET required_in_transactions = EXCLUDED.required_in_transactions, default_cost_center_id = EXCLUDED.default_cost_center_id
    `
  }
}

async function tableExists(name: string) {
  const rows = await sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`
  return Boolean((rows as any[])[0]?.ok)
}

/** الأسطر التي لها مركز افتراضي فعلاً، بأسماء المراكز. */
async function selectionsFor(table: "account_costcenters_tbl" | "warehouse_costcenters_tbl" | "product_costcenters_tbl", ownerId: number) {
  if (!(ownerId > 0) || !(await tableExists(table))) return []
  const ownerColumn = table === "account_costcenters_tbl" ? "account_id" : table === "warehouse_costcenters_tbl" ? "warehouse_id" : "product_id"
  const rows = (await sql.unsafe(
    `SELECT t.cost_center_type_id, t.default_cost_center_id, cc.name AS cost_center_name
     FROM ${table} t
     JOIN cost_centers cc ON cc.id = t.default_cost_center_id AND COALESCE(cc.status, 1) <> 3
     WHERE t.${ownerColumn} = $1 AND t.default_cost_center_id IS NOT NULL
     ORDER BY t.cost_center_type_id`,
    [ownerId],
  )) as any[]
  return rows.map((row) => ({
    cost_center_type_id: Number(row.cost_center_type_id),
    cost_center_id: Number(row.default_cost_center_id),
    cost_center_name: String(row.cost_center_name || ""),
  }))
}

/** مراكز التكلفة الافتراضية لسطر صنف: الصنف ← المستودع ← حساب الصنف (أول مصدر له أي مركز يفوز). */
export async function resolveLineCostCenters(params: { accountId?: number | null; productId?: number | null; warehouseId?: number | null }) {
  const product = await selectionsFor("product_costcenters_tbl", Number(params.productId) || 0)
  if (product.length) return { source: "product" as const, cost_centers: product }
  await ensureWarehouseCostCentersTable()
  const warehouse = await selectionsFor("warehouse_costcenters_tbl", Number(params.warehouseId) || 0)
  if (warehouse.length) return { source: "warehouse" as const, cost_centers: warehouse }
  const account = await selectionsFor("account_costcenters_tbl", Number(params.accountId) || 0)
  return { source: account.length ? ("account" as const) : null, cost_centers: account }
}
