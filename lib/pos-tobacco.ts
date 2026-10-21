import sql from "@/lib/database"

// عهدة الدخان في الكاشير (نقطة بيع عليها "يوجد عهدة دخان"): كميات (لا مبالغ) لكل صنف دخان (products.is_tobacco).
// - عند فتح/استلام العهدة: يُدخل الكاشير الكمية الافتتاحية لكل صنف (مقترحة من تسليم الوردية السابقة عند الاستلام).
// - المباع: من فواتير الوردية نفسها (voucher_header_tbl.pos_session_id) — مبيعات + هدايا − مرتجعات، بالوحدة الرئيسية.
// - عند التسليم (قبل تسليم النقد): المتوقع = الافتتاحي − المباع، ويُدخل الكاشير الكمية الفعلية المسلَّمة والفرق يُحفظ.

export type TobaccoLine = {
  product_id: number; product_code: string; product_name: string; unit_name: string
  opening_qty: number; sold_qty: number; expected_qty: number; counted_qty: number | null
}

const qty = (value: unknown) => Math.round(Number(value || 0) * 10000) / 10000

export async function tobaccoProducts() {
  return sql`
    SELECT p.id, p.product_code, p.product_name, COALESCE(u.unit_name, '') AS unit_name
    FROM products p LEFT JOIN units u ON u.id = p.measurment_unit
    WHERE COALESCE(p.is_tobacco, false) = true AND COALESCE(p.deleted, false) = false AND COALESCE(p.type, 1) = 1
      AND LOWER(COALESCE(p.status::text, '1')) IN ('1', 'نشط', 'active')
    ORDER BY p.product_code, p.product_name
  ` as Promise<{ id: number; product_code: string; product_name: string; unit_name: string }[]>
}

/** الكمية المباعة لكل صنف دخان في وردية (بالوحدة الرئيسية): 12 بيع + 9 هدية − 16 مرتجع. */
export async function tobaccoSold(sessionId: number) {
  const rows = await sql`
    SELECT vi.item_id AS product_id,
      SUM(CASE WHEN vh.vch_type = 16 THEN -1 ELSE 1 END * (COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) * COALESCE(NULLIF(pu.to_main_qnty, 0), 1)) AS sold
    FROM voucher_items_tbl vi
    JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
    JOIN products p ON p.id = vi.item_id AND COALESCE(p.is_tobacco, false) = true
    LEFT JOIN LATERAL (SELECT to_main_qnty FROM product_units WHERE product_id = vi.item_id AND unit_id = vi.unit_id ORDER BY id LIMIT 1) pu ON TRUE
    WHERE vh.pos_session_id = ${sessionId} AND vh.status <> 3 AND vh.vch_type IN (9, 12, 16)
    GROUP BY vi.item_id
  ` as { product_id: number; sold: number }[]
  return new Map(rows.map((row) => [Number(row.product_id), qty(row.sold)]))
}

/** أسطر عهدة الدخان لوردية: كل أصناف الدخان (حتى غير المُدخلة) مع الافتتاحي والمباع والمتوقع والمسلَّم. */
export async function tobaccoLines(sessionId: number, suggestedOpening?: Map<number, number>): Promise<TobaccoLine[]> {
  const [products, stored, sold] = await Promise.all([
    tobaccoProducts(),
    sql`SELECT product_id, opening_qty, counted_qty FROM pos_tobacco_custody_tbl WHERE session_id = ${sessionId}` as Promise<any[]>,
    tobaccoSold(sessionId),
  ])
  const byProduct = new Map(stored.map((row) => [Number(row.product_id), row]))
  const ids = new Set([...products.map((product) => Number(product.id)), ...byProduct.keys()])
  const productById = new Map(products.map((product) => [Number(product.id), product]))
  const missing = [...ids].filter((id) => !productById.has(id))
  if (missing.length) {
    const extra = await sql`SELECT p.id, p.product_code, p.product_name, COALESCE(u.unit_name, '') AS unit_name FROM products p LEFT JOIN units u ON u.id = p.measurment_unit WHERE p.id = ANY(${missing}::int[])` as any[]
    for (const product of extra) productById.set(Number(product.id), product)
  }
  return [...ids].map((id) => {
    const product = productById.get(id)
    const row = byProduct.get(id)
    const opening = row ? qty(row.opening_qty) : qty(suggestedOpening?.get(id) ?? 0)
    const soldQty = sold.get(id) ?? 0
    return {
      product_id: id, product_code: product?.product_code || "", product_name: product?.product_name || `#${id}`, unit_name: product?.unit_name || "",
      opening_qty: opening, sold_qty: soldQty, expected_qty: qty(opening - soldQty), counted_qty: row?.counted_qty == null ? null : qty(row.counted_qty),
    }
  }).sort((a, b) => a.product_code.localeCompare(b.product_code, "en", { numeric: true }))
}

/** الكميات المقترحة للافتتاح عند استلام عهدة: ما سلّمه الكاشير السابق (counted) لكل صنف. */
export async function suggestedOpeningFor(session: { received_from_session_id?: number | null }) {
  const sourceId = Number(session.received_from_session_id || 0)
  if (!sourceId) return new Map<number, number>()
  const rows = await sql`SELECT product_id, COALESCE(counted_qty, expected_qty, 0) AS qty FROM pos_tobacco_custody_tbl WHERE session_id = ${sourceId}` as any[]
  return new Map(rows.map((row) => [Number(row.product_id), qty(row.qty)]))
}

export async function saveTobaccoOpening(sessionId: number, lines: { product_id: number; qty: number }[]) {
  for (const line of lines) {
    await sql`
      INSERT INTO pos_tobacco_custody_tbl (session_id, product_id, opening_qty) VALUES (${sessionId}, ${line.product_id}, ${qty(line.qty)})
      ON CONFLICT (session_id, product_id) DO UPDATE SET opening_qty = EXCLUDED.opening_qty
    `
  }
  await sql`UPDATE pos_sessions_tbl SET tobacco_opened = true, updated_at = NOW() WHERE id = ${sessionId}`
}

export async function saveTobaccoHandover(sessionId: number, counted: Map<number, number>) {
  const lines = await tobaccoLines(sessionId)
  for (const line of lines) {
    const countedQty = counted.has(line.product_id) ? qty(counted.get(line.product_id)) : line.expected_qty
    await sql`
      INSERT INTO pos_tobacco_custody_tbl (session_id, product_id, opening_qty, sold_qty, expected_qty, counted_qty, handed_over_at)
      VALUES (${sessionId}, ${line.product_id}, ${line.opening_qty}, ${line.sold_qty}, ${line.expected_qty}, ${countedQty}, NOW())
      ON CONFLICT (session_id, product_id) DO UPDATE SET sold_qty = EXCLUDED.sold_qty, expected_qty = EXCLUDED.expected_qty,
        counted_qty = EXCLUDED.counted_qty, handed_over_at = NOW()
    `
  }
  await sql`UPDATE pos_sessions_tbl SET tobacco_handed_over = true, updated_at = NOW() WHERE id = ${sessionId}`
}
