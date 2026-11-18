import type { NextRequest } from "next/server"
import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { getSessionUser } from "@/lib/tenant-auth"

// صلاحيات المستخدمين على المستودعات (2026-11-18) — قائمة منع: بلا سطر = كل المستخدمين مسموح لهم (الشركات الحالية لا تتأثر).
// سطر (warehouse_id, user_id) = المستخدم ممنوع من حركات هذا المستودع. يُفحص عند حفظ/تعديل/حذف سندات المخزون،
// سندات المبيعات/المشتريات (الارساليات والفواتير والمرتجعات)، والطلبيات — من أسطر الأصناف ومستودعات الرأس (من/إلى).

export const ensureWarehouseAccessTable = () => runSchemaOnce("lib/warehouse-access.ts#table", async () => {
  await sql`CREATE TABLE IF NOT EXISTS warehouse_user_denials (
    warehouse_id INTEGER NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (warehouse_id, user_id)
  )`
})

/** كل مستودعات السند: أسطر الأصناف (store_id/warehouse_id) + مستودعات الرأس */
export function voucherWarehouseIds(data: any, items?: any[]): number[] {
  const list = Array.isArray(items) ? items : Array.isArray(data?.items) ? data.items : []
  const ids = [
    ...list.map((item: any) => Number(item?.store_id ?? item?.warehouse_id)),
    Number(data?.from_store_id), Number(data?.to_store_id), Number(data?.store_id), Number(data?.warehouse_id),
  ]
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))]
}

/** رسالة خطأ إن كان المستخدم الحالي ممنوعاً من أحد المستودعات، وإلا null */
export async function warehouseAccessError(request: NextRequest, warehouseIds: number[]): Promise<string | null> {
  const ids = [...new Set(warehouseIds.filter((id) => id > 0))]
  if (!ids.length) return null
  const session = await getSessionUser(request)
  if (!session?.user_id) return null
  await ensureWarehouseAccessTable()
  const denied = (await sql`
    SELECT w.warehouse_name FROM warehouse_user_denials d JOIN warehouses w ON w.id = d.warehouse_id
    WHERE d.user_id = ${String(session.user_id)} AND d.warehouse_id = ANY(${ids}::int[])
    ORDER BY w.warehouse_name`) as any[]
  if (!denied.length) return null
  return `لا توجد لديك صلاحية على المستودع: ${denied.map((row) => row.warehouse_name).join("، ")}`
}

/** مستخدمو الشركة مع حالة السماح على مستودع (للنافذة في تعريف المستودعات) */
export async function warehouseUsers(warehouseId: number) {
  await ensureWarehouseAccessTable()
  const rows = (await sql`
    SELECT us.user_id::text AS user_id, COALESCE(NULLIF(us.full_name, ''), us.username, us.user_id::text) AS name, us.username,
           (d.user_id IS NULL) AS allowed
    FROM user_settings us
    LEFT JOIN warehouse_user_denials d ON d.warehouse_id = ${warehouseId} AND d.user_id = us.user_id::text
    WHERE COALESCE(us.is_deleted, false) = false
    ORDER BY 2`) as any[]
  return rows.map((row) => ({ user_id: String(row.user_id), name: String(row.name || ""), username: String(row.username || ""), allowed: Boolean(row.allowed) }))
}

export async function setWarehouseDenials(warehouseId: number, deniedUserIds: string[], byUserId: string) {
  await ensureWarehouseAccessTable()
  const ids = [...new Set(deniedUserIds.map(String).filter(Boolean))]
  await sql`DELETE FROM warehouse_user_denials WHERE warehouse_id = ${warehouseId} AND NOT (user_id = ANY(${ids}::text[]))`
  for (const userId of ids) {
    await sql`INSERT INTO warehouse_user_denials (warehouse_id, user_id, created_by) VALUES (${warehouseId}, ${userId}, ${byUserId}) ON CONFLICT DO NOTHING`
  }
}

/** مستودعات سند محفوظ (أسطره + رأسه) — يمنع تعديل/حذف سند مستودع ممنوع حتى بتغيير أسطره */
export async function storedVoucherWarehouseIds(voucherId: number): Promise<number[]> {
  if (!(voucherId > 0)) return []
  const rows = (await sql`
    SELECT store_id AS id FROM voucher_items_tbl WHERE voucher_id = ${voucherId} AND store_id IS NOT NULL
    UNION SELECT to_store_id FROM voucher_header_tbl WHERE id = ${voucherId} AND to_store_id IS NOT NULL
    UNION SELECT from_store_id FROM voucher_header_tbl WHERE id = ${voucherId} AND from_store_id IS NOT NULL`.catch(() => [])) as any[]
  return rows.map((row) => Number(row.id)).filter((id) => id > 0)
}

/** مستودعات طلبية محفوظة */
export async function storedOrderWarehouseIds(orderId: number): Promise<number[]> {
  if (!(orderId > 0)) return []
  const rows = (await sql`SELECT DISTINCT store_id AS id FROM order_items WHERE order_id = ${orderId} AND store_id IS NOT NULL`.catch(() => [])) as any[]
  return rows.map((row) => Number(row.id)).filter((id) => id > 0)
}
