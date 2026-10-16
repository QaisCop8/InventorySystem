import sql from "@/lib/database"
import { PROMO_BUY_GET, PROMO_DISCOUNT, PROMO_SPECIAL_PRICE, PROMO_DEFAULT_VCH_TYPES } from "@/lib/promotions"

export class PromotionInputError extends Error {}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const ids = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))]
const ALLOWED_VCH_TYPES = [12, 13, 14]

export type PromotionPayload = Awaited<ReturnType<typeof parsePromotion>>

export async function parsePromotion(data: any) {
  const name = String(data?.name || "").trim()
  const code = String(data?.code || "").trim().toUpperCase()
  const type = Number(data?.promo_type)
  const start = String(data?.start_date || "").slice(0, 10)
  const end = data?.end_date ? String(data.end_date).slice(0, 10) : null
  if (!name) throw new PromotionInputError("اسم العرض مطلوب")
  if (![PROMO_SPECIAL_PRICE, PROMO_DISCOUNT, PROMO_BUY_GET].includes(type)) throw new PromotionInputError("نوع العرض غير صالح")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new PromotionInputError("تاريخ بداية العرض مطلوب")
  if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new PromotionInputError("تاريخ النهاية غير صالح")
  if (end && end < start) throw new PromotionInputError("تاريخ النهاية يسبق تاريخ البداية")

  const allCustomers = data?.all_customers !== false
  const customerIds = allCustomers ? [] : ids(data?.customer_ids)
  if (!allCustomers && !customerIds.length) throw new PromotionInputError("اختر عميلاً واحداً على الأقل أو فعّل «كل العملاء»")
  const vchTypes = ids(data?.vch_types).filter((value) => ALLOWED_VCH_TYPES.includes(value))
  const branchIds = ids(data?.branch_ids)

  const rawItems = Array.isArray(data?.items) ? data.items : []
  const items = rawItems.map((item: any, index: number) => {
    const line = index + 1
    const productId = num(item?.product_id)
    const unitId = num(item?.unit_id)
    const minQuantity = Math.max(0, num(item?.min_quantity) ?? 0)
    if (type === PROMO_SPECIAL_PRICE) {
      const price = num(item?.special_price)
      if (!productId) throw new PromotionInputError(`السطر ${line}: اختر الصنف`)
      if (price === null || price < 0) throw new PromotionInputError(`السطر ${line}: السعر الخاص مطلوب`)
      return { product_id: productId, unit_id: unitId, special_price: price, discount_percent: null, min_quantity: minQuantity, buy_quantity: null, get_product_id: null, get_unit_id: null, get_quantity: null, max_times: 0 }
    }
    if (type === PROMO_DISCOUNT) {
      const percent = num(item?.discount_percent)
      if (percent === null || percent <= 0 || percent > 100) throw new PromotionInputError(`السطر ${line}: نسبة الخصم بين 0 و 100`)
      return { product_id: productId, unit_id: productId ? unitId : null, special_price: null, discount_percent: percent, min_quantity: minQuantity, buy_quantity: null, get_product_id: null, get_unit_id: null, get_quantity: null, max_times: 0 }
    }
    const buy = num(item?.buy_quantity)
    const get = num(item?.get_quantity)
    if (!productId) throw new PromotionInputError(`السطر ${line}: اختر الصنف المشترى`)
    if (!buy || buy <= 0) throw new PromotionInputError(`السطر ${line}: كمية الشراء مطلوبة`)
    if (!get || get <= 0) throw new PromotionInputError(`السطر ${line}: الكمية المجانية مطلوبة`)
    const getProductId = num(item?.get_product_id) || productId
    return {
      product_id: productId, unit_id: unitId, special_price: null, discount_percent: null, min_quantity: 0,
      buy_quantity: buy, get_product_id: getProductId, get_unit_id: num(item?.get_unit_id), get_quantity: get,
      max_times: Math.max(0, Math.floor(num(item?.max_times) ?? 0)),
    }
  })
  if (!items.length) throw new PromotionInputError(type === PROMO_DISCOUNT ? "أضف سطر خصم واحداً على الأقل (اترك الصنف فارغاً للخصم على كل الأصناف)" : "أضف صنفاً واحداً على الأقل")

  const productIds = [...new Set(items.flatMap((item: any) => [item.product_id, item.get_product_id]).filter(Boolean))] as number[]
  if (productIds.length) {
    const found = await sql`SELECT id FROM products WHERE id = ANY(${productIds}::int[]) AND COALESCE(status, 1) <> 3`
    if (found.length !== productIds.length) throw new PromotionInputError("يوجد صنف غير موجود أو محذوف")
  }
  if (customerIds.length) {
    const found = await sql`SELECT id FROM account_tbl WHERE id = ANY(${customerIds}::int[]) AND COALESCE(status, 1) <> 3`
    if (found.length !== customerIds.length) throw new PromotionInputError("يوجد عميل غير موجود")
  }

  return {
    code,
    name: name.slice(0, 200),
    promo_type: type,
    start_date: start,
    end_date: end,
    status: Number(data?.status) === 2 ? 2 : 1,
    priority: Math.max(0, Math.min(1000, Math.round(num(data?.priority) ?? 0))),
    all_customers: allCustomers,
    currency_id: num(data?.currency_id),
    vch_types: vchTypes.length ? vchTypes : PROMO_DEFAULT_VCH_TYPES,
    branch_ids: branchIds,
    notes: String(data?.notes || "").slice(0, 2000) || null,
    customer_ids: customerIds,
    items,
  }
}

export async function savePromotionChildren(promotionId: number, payload: PromotionPayload) {
  await sql`DELETE FROM promotion_customers_tbl WHERE promotion_id = ${promotionId}`
  await sql`DELETE FROM promotion_items_tbl WHERE promotion_id = ${promotionId}`
  for (const accountId of payload.customer_ids) {
    await sql`INSERT INTO promotion_customers_tbl (promotion_id, account_id) VALUES (${promotionId}, ${accountId})`
  }
  for (const [index, item] of payload.items.entries()) {
    await sql`
      INSERT INTO promotion_items_tbl (promotion_id, line_no, product_id, unit_id, special_price, discount_percent, min_quantity, buy_quantity, get_product_id, get_unit_id, get_quantity, max_times)
      VALUES (${promotionId}, ${index + 1}, ${item.product_id}, ${item.unit_id}, ${item.special_price}, ${item.discount_percent}, ${item.min_quantity}, ${item.buy_quantity}, ${item.get_product_id}, ${item.get_unit_id}, ${item.get_quantity}, ${item.max_times})
    `
  }
}

export async function loadPromotion(id: number) {
  const header = (await sql`
    SELECT p.*, p.start_date::text start_date, p.end_date::text end_date
    FROM promotions_tbl p WHERE p.id = ${id} AND p.status <> 3
  `)[0] as any
  if (!header) return null
  const [customers, items] = await Promise.all([
    sql`SELECT c.account_id, a.code account_code, a.name account_name FROM promotion_customers_tbl c JOIN account_tbl a ON a.id = c.account_id WHERE c.promotion_id = ${id} ORDER BY a.code`,
    sql`
      SELECT i.*, i.special_price::float8 special_price, i.discount_percent::float8 discount_percent, i.min_quantity::float8 min_quantity,
        i.buy_quantity::float8 buy_quantity, i.get_quantity::float8 get_quantity,
        p.product_code, p.product_name, u.unit_name, gp.product_code get_product_code, gp.product_name get_product_name, gu.unit_name get_unit_name
      FROM promotion_items_tbl i
      LEFT JOIN products p ON p.id = i.product_id
      LEFT JOIN units u ON u.id = i.unit_id
      LEFT JOIN products gp ON gp.id = i.get_product_id
      LEFT JOIN units gu ON gu.id = i.get_unit_id
      WHERE i.promotion_id = ${id} ORDER BY i.line_no
    `,
  ])
  return { ...header, customers, customer_ids: (customers as any[]).map((row) => Number(row.account_id)), items }
}
