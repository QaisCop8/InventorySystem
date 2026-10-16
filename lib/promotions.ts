import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// محرك العروض والأسعار الخاصة لحركات المبيعات (فاتورة/إرسالية/إرسالية برسم البيع):
//  1 سعر خاص: سعر ثابت لصنف (ووحدة) لعملاء محددين أو للجميع ضمن فترة
//  2 خصم لفترة: نسبة خصم على صنف (أو كل الأصناف) عند بلوغ حد أدنى للكمية
//  3 اشترِ X واحصل على Y: كل buy_qty من X تمنح get_qty من Y مجاناً (نفس الصنف ⇐ بونص، صنف آخر ⇐ سطر بخصم 100%)
// الحملات الخاصة بنقطة البيع (lib/pos-campaigns.ts) منفصلة ولا تتأثر.

export const PROMO_SPECIAL_PRICE = 1
export const PROMO_DISCOUNT = 2
export const PROMO_BUY_GET = 3
export const PROMO_TYPES: Record<number, string> = { 1: "سعر خاص", 2: "خصم لفترة", 3: "اشترِ واحصل مجاناً" }
export const PROMO_DEFAULT_VCH_TYPES = [12, 13, 14]

export async function ensurePromotionTables() { return runSchemaOnce("lib/promotions.ts#ensurePromotionTables", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS promotions_tbl (
      id SERIAL PRIMARY KEY,
      code VARCHAR(30) NOT NULL,
      name VARCHAR(200) NOT NULL,
      promo_type SMALLINT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE,
      status SMALLINT NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      all_customers BOOLEAN NOT NULL DEFAULT true,
      currency_id INTEGER,
      vch_types INTEGER[] NOT NULL DEFAULT ARRAY[12,13,14],
      branch_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      notes TEXT,
      created_by VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS ux_promotions_code ON promotions_tbl(UPPER(code)) WHERE status <> 3`
  await sql`
    CREATE TABLE IF NOT EXISTS promotion_customers_tbl (
      promotion_id INTEGER NOT NULL REFERENCES promotions_tbl(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES account_tbl(id),
      PRIMARY KEY (promotion_id, account_id)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS promotion_items_tbl (
      id SERIAL PRIMARY KEY,
      promotion_id INTEGER NOT NULL REFERENCES promotions_tbl(id) ON DELETE CASCADE,
      line_no INTEGER NOT NULL DEFAULT 1,
      product_id INTEGER REFERENCES products(id),
      unit_id INTEGER,
      special_price NUMERIC(18,4),
      discount_percent NUMERIC(7,3),
      min_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,
      buy_quantity NUMERIC(18,3),
      get_product_id INTEGER REFERENCES products(id),
      get_unit_id INTEGER,
      get_quantity NUMERIC(18,3),
      max_times INTEGER NOT NULL DEFAULT 0
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_promotion_items_promo ON promotion_items_tbl(promotion_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_promotion_items_product ON promotion_items_tbl(product_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_promotion_customers_account ON promotion_customers_tbl(account_id)`
}) }

export type EvaluateLine = { key: string; product_id: number; unit_id?: number | null; quantity: number }
export type LineResult = {
  key: string
  special_price?: number
  discount_percent?: number
  bonus_quantity?: number
  promotions: { id: number; code: string; name: string; type: number }[]
}
export type FreeLine = { product_id: number; unit_id: number | null; quantity: number; promotion_id: number; promotion_code: string; promotion_name: string; source_product_id: number }
export type EvaluateResult = { lines: LineResult[]; free_lines: FreeLine[] }

type Rule = {
  promotion_id: number; code: string; name: string; promo_type: number; priority: number; currency_id: number | null
  product_id: number | null; unit_id: number | null; special_price: number | null; discount_percent: number | null
  min_quantity: number; buy_quantity: number | null; get_product_id: number | null; get_unit_id: number | null; get_quantity: number | null; max_times: number
}

const round = (value: number, digits = 3) => Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits

/** القواعد الفعّالة لعميل وتاريخ وفرع ونوع سند. */
export async function activeRules(input: { accountId: number | null; date: string; branchId: number | null; vchType: number; productIds: number[] }): Promise<Rule[]> {
  const rows = await sql`
    SELECT p.id promotion_id, p.code, p.name, p.promo_type, p.priority, p.currency_id,
      i.product_id, i.unit_id, i.special_price::float8 special_price, i.discount_percent::float8 discount_percent,
      i.min_quantity::float8 min_quantity, i.buy_quantity::float8 buy_quantity, i.get_product_id, i.get_unit_id,
      i.get_quantity::float8 get_quantity, i.max_times
    FROM promotions_tbl p
    JOIN promotion_items_tbl i ON i.promotion_id = p.id
    WHERE p.status = 1
      AND p.start_date <= ${input.date}::date
      AND (p.end_date IS NULL OR p.end_date >= ${input.date}::date)
      AND ${input.vchType} = ANY(p.vch_types)
      AND (cardinality(p.branch_ids) = 0 OR ${input.branchId ?? 0} = ANY(p.branch_ids))
      AND (p.all_customers OR EXISTS (SELECT 1 FROM promotion_customers_tbl c WHERE c.promotion_id = p.id AND c.account_id = ${input.accountId ?? 0}))
      AND (i.product_id IS NULL OR i.product_id = ANY(${input.productIds}::int[]))
    ORDER BY p.priority DESC, p.id DESC, i.line_no
  `
  return (rows as any[]).map((row) => ({
    ...row,
    promotion_id: Number(row.promotion_id),
    promo_type: Number(row.promo_type),
    priority: Number(row.priority || 0),
    currency_id: row.currency_id == null ? null : Number(row.currency_id),
    product_id: row.product_id == null ? null : Number(row.product_id),
    unit_id: row.unit_id == null ? null : Number(row.unit_id),
    get_product_id: row.get_product_id == null ? null : Number(row.get_product_id),
    get_unit_id: row.get_unit_id == null ? null : Number(row.get_unit_id),
    min_quantity: Number(row.min_quantity || 0),
    max_times: Number(row.max_times || 0),
  }))
}

/**
 * يحسب أثر العروض على أسطر الحركة (دالة نقية — قابلة للاختبار):
 * - السعر الخاص: أعلى أولوية ثم الأقل سعراً؛ يُطابق الوحدة إن حُدّدت في القاعدة، وعملة القاعدة = عملة السند
 *   (قاعدة بلا عملة ⇐ عملة الأساس).
 * - الخصم: أعلى أولوية ثم الأكبر نسبة بين القواعد التي بلغت حدّها الأدنى (مجموع كمية الصنف بكل الأسطر).
 * - اشترِ واحصل: عدد المرات = floor(كمية X / buy_qty) بحد max_times؛ أعلى أولوية فقط لكل صنف X.
 */
export function computePromotions(lines: EvaluateLine[], rules: Rule[], context: { voucherCurrencyId: number | null; baseCurrencyId: number | null }): EvaluateResult {
  const quantityByProduct = new Map<number, number>()
  for (const line of lines) quantityByProduct.set(line.product_id, (quantityByProduct.get(line.product_id) || 0) + Math.max(0, Number(line.quantity) || 0))
  const currencyOk = (rule: Rule) => {
    const ruleCurrency = rule.currency_id ?? context.baseCurrencyId
    return !context.voucherCurrencyId || !ruleCurrency || Number(ruleCurrency) === Number(context.voucherCurrencyId)
  }
  const tag = (rule: Rule) => ({ id: rule.promotion_id, code: rule.code, name: rule.name, type: rule.promo_type })
  const better = (a: Rule, b: Rule | undefined, pick: (rule: Rule) => number, lowerWins: boolean) => {
    if (!b) return true
    if (a.priority !== b.priority) return a.priority > b.priority
    return lowerWins ? pick(a) < pick(b) : pick(a) > pick(b)
  }

  const results: LineResult[] = lines.map((line) => {
    const result: LineResult = { key: line.key, promotions: [] }
    let price: Rule | undefined
    let discount: Rule | undefined
    for (const rule of rules) {
      const productMatch = rule.product_id === line.product_id
      const unitMatch = rule.unit_id == null || line.unit_id == null || Number(rule.unit_id) === Number(line.unit_id)
      if (rule.promo_type === PROMO_SPECIAL_PRICE && productMatch && unitMatch && rule.special_price != null && currencyOk(rule)
        && (quantityByProduct.get(line.product_id) || 0) >= rule.min_quantity && better(rule, price, (r) => Number(r.special_price), true)) price = rule
      if (rule.promo_type === PROMO_DISCOUNT && (rule.product_id == null || productMatch) && unitMatch && Number(rule.discount_percent) > 0
        && (quantityByProduct.get(line.product_id) || 0) >= rule.min_quantity && better(rule, discount, (r) => Number(r.discount_percent), false)) discount = rule
    }
    if (price) { result.special_price = round(Number(price.special_price), 4); result.promotions.push(tag(price)) }
    if (discount) { result.discount_percent = Math.min(100, round(Number(discount.discount_percent))); if (!result.promotions.some((p) => p.id === discount!.promotion_id)) result.promotions.push(tag(discount)) }
    return result
  })

  const freeLines: FreeLine[] = []
  const bestBuyGet = new Map<number, Rule>()
  for (const rule of rules) {
    if (rule.promo_type !== PROMO_BUY_GET || rule.product_id == null || !(Number(rule.buy_quantity) > 0) || !(Number(rule.get_quantity) > 0)) continue
    const current = bestBuyGet.get(rule.product_id)
    if (!current || rule.priority > current.priority) bestBuyGet.set(rule.product_id, rule)
  }
  for (const [productId, rule] of bestBuyGet) {
    const bought = quantityByProduct.get(productId) || 0
    let times = Math.floor(round(bought / Number(rule.buy_quantity)))
    if (rule.max_times > 0) times = Math.min(times, rule.max_times)
    if (times <= 0) continue
    const freeQuantity = round(times * Number(rule.get_quantity))
    const getProductId = rule.get_product_id ?? productId
    if (getProductId === productId) {
      // نفس الصنف: بونص على أول سطر للصنف (البونص لا يُحتسب بالمبلغ ويُخرج من المخزون)
      const first = results.find((result, index) => lines[index].product_id === productId)
      if (first) {
        first.bonus_quantity = round((first.bonus_quantity || 0) + freeQuantity)
        if (!first.promotions.some((p) => p.id === rule.promotion_id)) first.promotions.push(tag(rule))
      }
    } else {
      freeLines.push({ product_id: getProductId, unit_id: rule.get_unit_id, quantity: freeQuantity, promotion_id: rule.promotion_id, promotion_code: rule.code, promotion_name: rule.name, source_product_id: productId })
    }
  }
  return { lines: results, free_lines: freeLines }
}
