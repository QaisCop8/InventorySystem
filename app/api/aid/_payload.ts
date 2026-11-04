import sql from "@/lib/database"
import { AID_STATUS, AidInputError } from "@/lib/aid-program"

export type ActivityPayload = {
  name: string; donor_name: string | null; donor_account_id: number; currency_id: number
  amount_per_participant: number; budget: number; start_date: string; end_date: string
  all_items: boolean; all_points: boolean; max_redemptions: number | null; status: number; notes: string | null
  items: { product_id: number | null; category_id: number | null }[]; points: number[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const money = (value: unknown) => Math.round(Number(value) * 100) / 100

export async function parseActivity(data: any): Promise<ActivityPayload> {
  const name = String(data?.name || "").trim()
  if (!name) throw new AidInputError("اسم النشاط مطلوب")
  const donorAccountId = Number(data?.donor_account_id)
  if (!(donorAccountId > 0)) throw new AidInputError("اختر حساب الجهة المانحة (الذمة التي تُسجَّل عليها قيمة القسائم)")
  const account = (await sql`SELECT id FROM account_tbl WHERE id = ${donorAccountId} AND COALESCE(status, 1) <> 3`)[0]
  if (!account) throw new AidInputError("حساب الجهة المانحة غير موجود")
  const currencyId = Number(data?.currency_id)
  if (!(currencyId > 0) || !(await sql`SELECT 1 FROM currency WHERE id = ${currencyId}`).length) throw new AidInputError("اختر عملة النشاط")
  const startDate = String(data?.start_date || "")
  const endDate = String(data?.end_date || "")
  if (!DATE.test(startDate) || !DATE.test(endDate) || endDate < startDate) throw new AidInputError("فترة النشاط غير صالحة")
  const amount = money(data?.amount_per_participant)
  const budget = money(data?.budget)
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(budget) || budget < 0) throw new AidInputError("المبالغ يجب أن تكون موجبة")
  const status = [AID_STATUS.active, AID_STATUS.frozen, AID_STATUS.closed].includes(Number(data?.status) as 1) ? Number(data.status) : AID_STATUS.active
  const maxRedemptions = Number(data?.max_redemptions) > 0 ? Math.floor(Number(data.max_redemptions)) : null
  const allItems = data?.all_items !== false
  const allPoints = data?.all_points !== false
  const items = (Array.isArray(data?.items) ? data.items : [])
    .map((row: any) => ({ product_id: Number(row?.product_id) > 0 ? Number(row.product_id) : null, category_id: Number(row?.category_id) > 0 ? Number(row.category_id) : null }))
    .filter((row: any) => row.product_id || row.category_id)
  if (!allItems && !items.length) throw new AidInputError("حدد الأصناف أو مجموعات الأصناف المسموحة، أو اختر كل الأصناف")
  const points = [...new Set((Array.isArray(data?.points) ? data.points : []).map(Number).filter((id: number) => id > 0))] as number[]
  if (!allPoints && !points.length) throw new AidInputError("حدد نقاط البيع المعتمدة، أو اختر كل النقاط")
  return {
    name, donor_name: String(data?.donor_name || "").trim() || null, donor_account_id: donorAccountId, currency_id: currencyId,
    amount_per_participant: amount, budget, start_date: startDate, end_date: endDate, all_items: allItems, all_points: allPoints,
    max_redemptions: maxRedemptions, status, notes: String(data?.notes || "").trim() || null, items, points,
  }
}

export async function saveActivityChildren(activityId: number, payload: ActivityPayload) {
  await sql`DELETE FROM aid_activity_items_tbl WHERE activity_id = ${activityId}`
  await sql`DELETE FROM aid_activity_points_tbl WHERE activity_id = ${activityId}`
  if (!payload.all_items) {
    for (const item of payload.items) {
      await sql`INSERT INTO aid_activity_items_tbl (activity_id, product_id, category_id) VALUES (${activityId}, ${item.product_id}, ${item.category_id})`
    }
  }
  if (!payload.all_points && payload.points.length) {
    await sql`INSERT INTO aid_activity_points_tbl (activity_id, pos_point_id) SELECT ${activityId}, UNNEST(${payload.points}::int[])`
  }
}
