import sql from "@/lib/database"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// دفتر "الدفعات" المخزنية: رصيد الصنف مفصَّلاً حسب ما يميّز وحداته فعلياً داخل المستودع —
//   • تاريخ الصلاحية والرقم التشغيلي (has_expiry_date / has_batch_number)
//   • المتغيرات (قيم الخصائص المختارة بالسطر — voucher_item_attributes_tbl)
//   • الأبعاد لأصناف نوع القياس غير العادي (الطول/العرض/الارتفاع) مع عدد القطع (count)
// نفس قواعد اتجاه الحركة في lib/voucher-inventory-valuation.ts (getProductBalances):
//   وارد 8,15,16,17,18 · صادر 9,11,12,13,14,19 · تحويل 10 حسب المستودع المصدر/الهدف ·
//   تُتجاهل أسطر 12/17 المرتبطة بإرسالية (delivery_item_id) لأن الإرسالية نفسها هي الحركة.
// الأعمدة تُقرأ عبر to_jsonb(vi) لأن مخطط voucher_items_tbl يختلف بين قواعد الشركات (قواعد قديمة
// بلا store_id/unit_id/batch_no/bonus) — عمود غير موجود يُقرأ NULL بدل أن يُسقط الاستعلام.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const INCOMING_VCH_TYPES = [8, 15, 16, 17, 18]
export const OUTGOING_VCH_TYPES = [9, 11, 12, 13, 14, 19]
export const TRANSFER_VCH_TYPE = 10
/** تاريخ صلاحية اصطلاحي للأصناف غير المتتبَّعة (انظر NO_EXPIRY_SENTINEL_DATE بسندات المخزون) = بلا صلاحية. */
export const NO_EXPIRY_DATE = "1990-01-01"

export type LotRow = {
  item_id: number
  expiry_date: string | null
  batch_no: string
  attribute_value_ids: number[]
  length: number | null
  width: number | null
  height: number | null
  quantity: number
  pieces: number
}

export type LotQuery = {
  warehouseId: number
  productIds?: number[]
  branchId?: number | null
  toDate?: string | null
  excludeVoucherId?: number | null
  /** posted = المرحّل فقط (الجرد والتقارير) · active = المحفوظ والمرحّل (توفّر الكمية عند إدخال سند) */
  mode?: "posted" | "active"
  /** يفصل الرصيد حسب الأبعاد (أصناف نوع القياس غير العادي) */
  splitDimensions?: boolean
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6
const dimensionValue = (value: unknown) => {
  const number = value == null || value === "" ? null : Number(value)
  return number != null && Number.isFinite(number) && number > 0 ? round6(number) : null
}

export const normalizeExpiry = (value: unknown) => {
  if (!value) return null
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
  return !text || text === NO_EXPIRY_DATE ? null : text
}

/** مفتاح ثابت لتمييز الدفعة: صلاحية | رقم تشغيلي | قيم خصائص مرتّبة | أبعاد. */
export function lotKey(lot: { expiry_date?: unknown; batch_no?: unknown; attribute_value_ids?: number[] | null; length?: unknown; width?: unknown; height?: unknown }) {
  const attributes = [...(lot.attribute_value_ids || [])].map(Number).filter((id) => id > 0).sort((a, b) => a - b).join(".")
  const dims = [lot.length, lot.width, lot.height].map((value) => dimensionValue(value) ?? "").join("x")
  return [normalizeExpiry(lot.expiry_date) ?? "", String(lot.batch_no ?? "").trim().toUpperCase(), attributes, dims === "xx" ? "" : dims].join("|")
}

async function hasVariantTables() {
  const rows = await sql`SELECT to_regclass('voucher_item_attributes_tbl') IS NOT NULL AND to_regclass('product_atrributes_values_tbl') IS NOT NULL AS ok`
  return Boolean((rows as any[])[0]?.ok)
}

/** أرصدة الدفعات لمستودع (بالوحدة الرئيسية) — صف لكل (صنف، دفعة) رصيدها غير صفري. */
export async function lotBalances(query: LotQuery): Promise<LotRow[]> {
  const productIds = query.productIds || []
  const warehouseId = Number(query.warehouseId)
  const branchId = Number(query.branchId) > 0 ? Number(query.branchId) : null
  const toDate = query.toDate ? String(query.toDate).slice(0, 10) : null
  const postedOnly = (query.mode || "posted") === "posted"
  const variants = await hasVariantTables()

  const lines = (await sql`
    SELECT vi.id, vi.item_id, vh.vch_type, vh.from_store_id, vh.to_store_id,
      NULLIF(to_jsonb(vi)->>'store_id', '')::int AS store_id,
      COALESCE(NULLIF(to_jsonb(vi)->>'qnty', '')::numeric, 0) + COALESCE(NULLIF(to_jsonb(vi)->>'bonus', '')::numeric, 0) AS qty,
      NULLIF(to_jsonb(vi)->>'count', '')::numeric AS pieces,
      NULLIF(to_jsonb(vi)->>'length', '')::numeric AS length,
      NULLIF(to_jsonb(vi)->>'width', '')::numeric AS width,
      NULLIF(to_jsonb(vi)->>'height', '')::numeric AS height,
      NULLIF(to_jsonb(vi)->>'expiry_date', '') AS expiry_date,
      COALESCE(to_jsonb(vi)->>'batch_no', to_jsonb(vi)->>'batch_number', '') AS batch_no,
      COALESCE(NULLIF(pu.to_main_qnty, 0), 1) AS unit_factor
    FROM voucher_items_tbl vi
    JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
    LEFT JOIN LATERAL (
      SELECT to_main_qnty FROM product_units
      WHERE product_id = vi.item_id AND unit_id = NULLIF(to_jsonb(vi)->>'unit_id', '')::int ORDER BY id LIMIT 1
    ) pu ON TRUE
    WHERE COALESCE(vh.status, 1) <> 3
      AND (${postedOnly} = false OR vh.vch_status = 2)
      AND (${toDate}::date IS NULL OR vh.vch_date::date <= ${toDate}::date)
      AND vh.id <> ${Number(query.excludeVoucherId) || -1}
      AND vh.vch_type = ANY(${[...INCOMING_VCH_TYPES, ...OUTGOING_VCH_TYPES, TRANSFER_VCH_TYPE]}::int[])
      AND (vh.vch_type NOT IN (12, 17) OR COALESCE(NULLIF(to_jsonb(vi)->>'delivery_item_id', '')::int, 0) = 0)
      AND (${branchId}::int IS NULL OR vh.branch_id = ${branchId}::int)
      AND (${productIds.length} = 0 OR vi.item_id = ANY(${productIds}::int[]))
      AND (
        NULLIF(to_jsonb(vi)->>'store_id', '')::int = ${warehouseId}
        OR (vh.vch_type = ${TRANSFER_VCH_TYPE} AND (vh.from_store_id = ${warehouseId} OR vh.to_store_id = ${warehouseId}))
        OR (NULLIF(to_jsonb(vi)->>'store_id', '') IS NULL AND (vh.to_store_id = ${warehouseId} OR vh.from_store_id = ${warehouseId}))
      )
  `) as any[]

  const attributesByLine = new Map<number, number[]>()
  if (variants && lines.length) {
    const rows = (await sql`
      SELECT voucher_item_id, product_attribute_value_id FROM voucher_item_attributes_tbl
      WHERE voucher_item_id = ANY(${lines.map((line) => Number(line.id))}::int[])
    `) as any[]
    for (const row of rows) {
      const list = attributesByLine.get(Number(row.voucher_item_id)) || []
      list.push(Number(row.product_attribute_value_id))
      attributesByLine.set(Number(row.voucher_item_id), list)
    }
  }

  const lots = new Map<string, LotRow>()
  for (const line of lines) {
    const type = Number(line.vch_type)
    let sign = 0
    if (type === TRANSFER_VCH_TYPE) {
      const into = Number(line.to_store_id) === warehouseId
      const outOf = Number(line.from_store_id) === warehouseId
      sign = into === outOf ? 0 : into ? 1 : -1
    } else if (INCOMING_VCH_TYPES.includes(type)) sign = 1
    else if (OUTGOING_VCH_TYPES.includes(type)) sign = -1
    if (!sign) continue

    const lot = {
      item_id: Number(line.item_id),
      expiry_date: normalizeExpiry(line.expiry_date),
      batch_no: String(line.batch_no || "").trim(),
      attribute_value_ids: (attributesByLine.get(Number(line.id)) || []).sort((a, b) => a - b),
      length: query.splitDimensions ? dimensionValue(line.length) : null,
      width: query.splitDimensions ? dimensionValue(line.width) : null,
      height: query.splitDimensions ? dimensionValue(line.height) : null,
    }
    const key = `${lot.item_id}#${lotKey(lot)}`
    const current = lots.get(key) || { ...lot, quantity: 0, pieces: 0 }
    current.quantity = round6(current.quantity + sign * Number(line.qty || 0) * Number(line.unit_factor || 1))
    current.pieces = round6(current.pieces + sign * Number(line.pieces || 0))
    lots.set(key, current)
  }
  return [...lots.values()].filter((lot) => Math.abs(lot.quantity) > 1e-6 || Math.abs(lot.pieces) > 1e-6)
}

/** الكمية المتاحة (بالوحدة الرئيسية) لدفعة واحدة — صنف/مستودع/رقم تشغيلي/صلاحية. */
export async function lotAvailable(params: { productId: number; warehouseId: number; batchNo?: string | null; expiryDate?: string | null; excludeVoucherId?: number | null }) {
  const lots = await lotBalances({
    warehouseId: params.warehouseId,
    productIds: [params.productId],
    excludeVoucherId: params.excludeVoucherId,
    mode: "active",
  })
  const batch = String(params.batchNo || "").trim().toUpperCase()
  const expiry = normalizeExpiry(params.expiryDate)
  return round6(
    lots
      .filter((lot) => String(lot.batch_no).toUpperCase() === batch && lot.expiry_date === expiry)
      .reduce((sum, lot) => sum + lot.quantity, 0),
  )
}
