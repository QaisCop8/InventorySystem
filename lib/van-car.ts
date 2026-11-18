import sql from "@/lib/database"
import { ensureCarsTable } from "@/app/api/cars/_lib"
import { runSchemaOnce } from "@/lib/schema-once"

// صندوق السيارة المقفل (البيع المتجول، 2026-11-18):
//   • المندوب مرتبط بمستخدم (salesmen.user_id) ⇐ عند دخوله تُعبّأ فواتيره وسندات قبضه بمندوبه ومستودع سيارته.
//   • القاعدة الأساسية على الخادم: سند بيع نقدي/مرتجع نقدي أو سند قبض نقدي لمندوب سيارة (أو بسطر من مستودع سيارة)
//     تذهب نقديته دائماً إلى صندوق السيارة — مهما أدخل المستخدم — فيبقى رصيد السيارة = مبيعات − مصاريف − تسليمات.

export type VanCar = {
  id: number; car_code: string; name: string; salesman_id: number | null; salesman_name: string
  warehouse_id: number | null; warehouse_name: string; cash_account_id: number; cash_account_code: string; cash_account_name: string
}

export const ensureSalesmanUserColumn = () => runSchemaOnce("lib/van-car.ts#salesman-user", async () => {
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS user_id VARCHAR(64)`
})

const toCar = (row: any): VanCar => ({
  id: Number(row.id), car_code: String(row.car_code || ""), name: String(row.name || ""),
  salesman_id: Number(row.salesman_id) || null, salesman_name: String(row.salesman_name || ""),
  warehouse_id: Number(row.warehouse_id) || null, warehouse_name: String(row.warehouse_name || ""),
  cash_account_id: Number(row.cash_account_id), cash_account_code: String(row.cash_account_code || ""), cash_account_name: String(row.cash_account_name || ""),
})

/** سيارة المندوب (أولاً) أو سيارة أحد المستودعات — فقط السيارات المعرّف لها صندوق. */
export async function vanCarFor(input: { salesmanId?: number | null; warehouseIds?: number[] }): Promise<VanCar | null> {
  const salesmanId = Number(input.salesmanId) || 0
  const warehouseIds = [...new Set((input.warehouseIds || []).map(Number).filter((id) => id > 0))]
  if (!salesmanId && !warehouseIds.length) return null
  await ensureCarsTable()
  const rows = (await sql`
    SELECT c.id, c.car_code, c.name, c.salesman_id, c.warehouse_id, c.cash_account_id, s.name AS salesman_name, w.warehouse_name, a.code AS cash_account_code, a.name AS cash_account_name
    FROM cars c
    LEFT JOIN salesmen s ON s.id = c.salesman_id
    LEFT JOIN warehouses w ON w.id = c.warehouse_id
    LEFT JOIN account_tbl a ON a.id = c.cash_account_id
    WHERE COALESCE(c.status, 1) <> 3 AND c.cash_account_id IS NOT NULL
      AND ((${salesmanId}::int > 0 AND c.salesman_id = ${salesmanId}) OR c.warehouse_id = ANY(${warehouseIds}::int[]))
    ORDER BY (c.salesman_id = ${salesmanId}) DESC, c.id
    LIMIT 1`) as any[]
  return rows[0] ? toCar(rows[0]) : null
}

/** المستخدم الحالي ⇐ مندوبه المرتبط ⇐ سيارته (للتعبئة الافتراضية في الشاشات). */
export async function vanForUser(userId: string) {
  if (!userId) return null
  await ensureSalesmanUserColumn()
  const [salesman] = (await sql`SELECT id, code, name FROM salesmen WHERE user_id = ${String(userId)} AND COALESCE(is_active, true) ORDER BY id LIMIT 1`) as any[]
  if (!salesman) return null
  const car = await vanCarFor({ salesmanId: Number(salesman.id) })
  return { salesman_id: Number(salesman.id), salesman_name: String(salesman.name || ""), car }
}

const SALE_INVOICE = 12, SALE_RETURN = 16, RECEIPT = 4

/**
 * يفرض صندوق السيارة على السند قبل الحفظ (يعدّل data). يُعيد السيارة إن طُبّق.
 *  • فاتورة مبيعات/مرتجع مبيعات نقدي (بلا حساب عميل، خارج نقاط البيع): cash_account_id = صندوق السيارة.
 *  • سند قبض فيه نقدي: cash_account_id = صندوق سيارة مندوب السند.
 */
export async function enforceVanCash(data: any): Promise<VanCar | null> {
  const vchType = Number(data?.vch_type)
  if (vchType === SALE_INVOICE || vchType === SALE_RETURN) {
    if (Number(data.account_id) > 0 || Number(data.pos_point_id) > 0) return null
    const items = Array.isArray(data.items) ? data.items : []
    const car = await vanCarFor({ salesmanId: data.salesman_id, warehouseIds: items.map((item: any) => Number(item?.store_id ?? item?.warehouse_id)) })
    if (car) data.cash_account_id = car.cash_account_id
    return car
  }
  if (vchType === RECEIPT) {
    if (!(Number(data.cash_amount) > 0)) return null
    const car = await vanCarFor({ salesmanId: data.salesman_id })
    if (car) data.cash_account_id = car.cash_account_id
    return car
  }
  return null
}
