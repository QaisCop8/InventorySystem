import sql from "@/lib/database"

/**
 * ارسالية برسم البيع (14) ومرتجعها (15) — نفس منطق شامل (ShamelAPI):
 *  - الارسالية تُسلَّم لمندوب (لا عميل)، والبضاعة تخرج من المستودع معها.
 *  - فواتير المبيعات تُصدر منها لعملاء فعليين (نوع الفاتورة "من ارسالية برسم البيع"): كل سطر فاتورة
 *    مربوط بسطر الارسالية (delivery_item_id) ولا يحرّك المخزون مرة ثانية؛ يجوز عدة فواتير جزئية.
 *  - المرتجع يُنشأ من الارسالية فقط، مرة واحدة لكل ارسالية، بالمتبقي (الكمية + البونص − المفوتر).
 *  المتبقي لسطر = (كمية + بونص الارسالية) − (كمية + بونص الفواتير غير الملغاة) − (المرتجعات غير الملغاة).
 */

export const CONSIGNMENT_VCH_TYPE = 14
export const CONSIGNMENT_RETURN_VCH_TYPE = 15
export const SALES_INVOICE_TYPE = 12
/** نوع مصدر الفاتورة: من ارسالية برسم البيع */
export const INVOICE_SOURCE_CONSIGNMENT = 4

export type ConsignmentLine = {
  id: number
  product_id: number
  product_code: string
  product_name: string
  unit_id: number | null
  unit_name: string
  store_id: number | null
  warehouse_name: string | null
  price: number
  discount: number
  batch_no: string | null
  expiry_date: string | null
  original: number
  invoiced: number
  returned: number
  remaining: number
}

/** أسطر ارسالية مع المفوتر والمرتجع والمتبقي (excludeVoucherId: السند الجاري تعديله لا يُحتسب). */
export async function consignmentLines(consignmentId: number, excludeVoucherId = 0): Promise<ConsignmentLine[]> {
  const rows = await sql`
    SELECT vi.id, vi.item_id AS product_id, COALESCE(p.product_code, '') AS product_code,
           COALESCE(p.product_name, vi.item_name, '') AS product_name, vi.unit_id, COALESCE(u.unit_name, '') AS unit_name,
           vi.store_id, w.warehouse_name, COALESCE(vi.price, 0) AS price, COALESCE(vi.discount, 0) AS discount,
           vi.batch_no, vi.expiry_date, p.selling_account_id, p.barcode,
           COALESCE(p.has_expiry_date, false) AS has_expiry, COALESCE(p.serial_tracking, false) AS has_serial,
           COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0) AS original,
           COALESCE((
             SELECT SUM(COALESCE(li.qnty, 0) + COALESCE(li.bonus, 0)) FROM voucher_items_tbl li
             JOIN voucher_header_tbl lh ON lh.id = li.voucher_id
             WHERE li.delivery_item_id = vi.id AND lh.vch_type = ${SALES_INVOICE_TYPE} AND COALESCE(lh.status, 1) <> 3 AND lh.id <> ${excludeVoucherId}
           ), 0) AS invoiced,
           COALESCE((
             SELECT SUM(COALESCE(li.qnty, 0) + COALESCE(li.bonus, 0)) FROM voucher_items_tbl li
             JOIN voucher_header_tbl lh ON lh.id = li.voucher_id
             WHERE li.delivery_item_id = vi.id AND lh.vch_type = ${CONSIGNMENT_RETURN_VCH_TYPE} AND COALESCE(lh.status, 1) <> 3 AND lh.id <> ${excludeVoucherId}
           ), 0) AS returned
    FROM voucher_items_tbl vi
    LEFT JOIN products p ON p.id = vi.item_id
    LEFT JOIN units u ON u.id = vi.unit_id
    LEFT JOIN warehouses w ON w.id = vi.store_id
    WHERE vi.voucher_id = ${consignmentId}
    ORDER BY vi.id
  `
  return (rows as any[]).map((row) => {
    const original = Number(row.original) || 0
    const invoiced = Number(row.invoiced) || 0
    const returned = Number(row.returned) || 0
    return { ...row, id: Number(row.id), product_id: Number(row.product_id), price: Number(row.price) || 0, discount: Number(row.discount) || 0, original, invoiced, returned, remaining: Math.max(0, Math.round((original - invoiced - returned) * 1e6) / 1e6) }
  })
}

/** المرتجع غير الملغى لارسالية (إن وُجد). */
export async function consignmentReturn(consignmentId: number, excludeVoucherId = 0) {
  const rows = await sql`
    SELECT DISTINCT lh.id, lh.vch_code FROM voucher_items_tbl li
    JOIN voucher_header_tbl lh ON lh.id = li.voucher_id
    WHERE lh.vch_type = ${CONSIGNMENT_RETURN_VCH_TYPE} AND COALESCE(lh.status, 1) <> 3 AND lh.id <> ${excludeVoucherId}
      AND li.delivery_item_id IN (SELECT id FROM voucher_items_tbl WHERE voucher_id = ${consignmentId})
    LIMIT 1
  `
  return (rows as any[])[0] as { id: number; vch_code: string } | undefined
}

/** الارساليات المرحّلة المفتوحة (لها متبقٍ ولا مرتجع لها) — لنافذة الاختيار في الفاتورة والمرتجع. */
export async function openConsignments(params: { branchIds: number[]; salesmanId?: number | null; search?: string }) {
  const search = String(params.search || "").trim()
  const rows = await sql`
    SELECT vh.id, vh.vch_code, vh.vch_date, vh.amount, vh.currency_id, vh.rate, vh.salesman_id, vh.branch_id, vh.note,
           s.name AS salesman_name, s.code AS salesman_code, c.currency_code,
           totals.original, totals.used
    FROM voucher_header_tbl vh
    LEFT JOIN salesmen s ON s.id = vh.salesman_id
    LEFT JOIN currency c ON c.id = vh.currency_id
    JOIN LATERAL (
      SELECT SUM(COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) AS original,
             COALESCE(SUM((
               SELECT SUM(COALESCE(li.qnty, 0) + COALESCE(li.bonus, 0)) FROM voucher_items_tbl li
               JOIN voucher_header_tbl lh ON lh.id = li.voucher_id
               WHERE li.delivery_item_id = vi.id AND lh.vch_type IN (${SALES_INVOICE_TYPE}, ${CONSIGNMENT_RETURN_VCH_TYPE}) AND COALESCE(lh.status, 1) <> 3
             )), 0) AS used
      FROM voucher_items_tbl vi WHERE vi.voucher_id = vh.id
    ) totals ON true
    WHERE vh.vch_type = ${CONSIGNMENT_VCH_TYPE} AND vh.status = 2
      AND vh.branch_id = ANY(${params.branchIds}::int[])
      AND (${params.salesmanId ?? null}::int IS NULL OR vh.salesman_id = ${params.salesmanId ?? null}::int)
      AND (${search} = '' OR vh.vch_code ILIKE ${"%" + search + "%"} OR COALESCE(s.name, '') ILIKE ${"%" + search + "%"})
      AND NOT EXISTS (
        SELECT 1 FROM voucher_items_tbl li JOIN voucher_header_tbl lh ON lh.id = li.voucher_id
        WHERE lh.vch_type = ${CONSIGNMENT_RETURN_VCH_TYPE} AND COALESCE(lh.status, 1) <> 3
          AND li.delivery_item_id IN (SELECT id FROM voucher_items_tbl WHERE voucher_id = vh.id)
      )
    ORDER BY vh.vch_date DESC, vh.id DESC
    LIMIT 300
  `
  return (rows as any[])
    .map((row) => ({ ...row, original: Number(row.original) || 0, used: Number(row.used) || 0, remaining: Math.max(0, (Number(row.original) || 0) - (Number(row.used) || 0)) }))
    .filter((row) => row.remaining > 1e-9)
}

/**
 * فاتورة/مرتجع من ارسالية برسم البيع: كل الأسطر مربوطة بأسطر ارسالية واحدة مرحّلة بنفس الفرع،
 * والكميات (كمية + بونص) لا تتجاوز المتبقي، والمرتجع واحد فقط لكل ارسالية.
 * يعيد { error } أو { consignment } (رأس الارسالية) للاستعمال في الحفظ (المندوب...).
 */
export async function validateFromConsignment(params: { vchType: number; items: any[]; branchId: number | null; excludeVoucherId?: number }) {
  const exclude = Number(params.excludeVoucherId || 0)
  const items = (params.items || []).filter((item) => Number(item?.product_id ?? item?.item_id) > 0)
  if (!items.length) return { error: "يجب إدخال صنف واحد على الأقل" }
  const lineIds = items.map((item) => Number(item.delivery_item_id) || 0)
  if (lineIds.some((id) => !id)) {
    return { error: params.vchType === CONSIGNMENT_RETURN_VCH_TYPE ? "كل أسطر المرتجع يجب أن تكون من ارسالية برسم البيع — اختر الارسالية أولاً" : "كل أسطر الفاتورة يجب أن تكون من الارسالية المختارة" }
  }
  const owners = await sql`
    SELECT DISTINCT vh.id, vh.vch_code, vh.vch_type, vh.status, vh.branch_id, vh.salesman_id, vh.currency_id, vh.rate
    FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
    WHERE vi.id = ANY(${lineIds}::int[])
  `
  if ((owners as any[]).length !== 1) return { error: "يجب أن تكون كل الأسطر من ارسالية برسم بيع واحدة" }
  const consignment = (owners as any[])[0]
  if (Number(consignment.vch_type) !== CONSIGNMENT_VCH_TYPE) return { error: "السند المصدر ليس ارسالية برسم البيع" }
  if (Number(consignment.status) !== 2) return { error: `الارسالية ${consignment.vch_code} غير مرحّلة` }
  if (params.branchId && Number(consignment.branch_id) && Number(consignment.branch_id) !== Number(params.branchId)) return { error: "الارسالية من فرع آخر" }
  const existingReturn = await consignmentReturn(Number(consignment.id), exclude)
  if (existingReturn) return { error: `تم عمل مرتجع (${existingReturn.vch_code}) لهذه الارسالية — لا يمكن ${params.vchType === CONSIGNMENT_RETURN_VCH_TYPE ? "عمل مرتجع آخر" : "الفوترة منها"}` }
  const lines = await consignmentLines(Number(consignment.id), exclude)
  const byId = new Map(lines.map((line) => [line.id, line]))
  const requested = new Map<number, number>()
  for (const item of items) {
    const id = Number(item.delivery_item_id)
    const amount = Number(item.quantity ?? item.qnty ?? 0) + Number(item.bonus_quantity ?? item.bonus ?? 0)
    requested.set(id, (requested.get(id) || 0) + amount)
    const line = byId.get(id)
    if (line && Number(item.product_id ?? item.item_id) !== line.product_id) return { error: `الصنف ${line.product_name} لا يطابق سطر الارسالية` }
  }
  for (const [id, amount] of requested) {
    const line = byId.get(id)
    if (!line) return { error: "سطر غير موجود في الارسالية" }
    if (amount - line.remaining > 1e-6) return { error: `الكمية للصنف ${line.product_name} (${amount}) أكبر من المتبقي في الارسالية (${line.remaining})` }
  }
  return { consignment }
}

/** قبل حذف/إلغاء/تعديل ارسالية: هل عليها فواتير أو مرتجع غير ملغى؟ */
export async function consignmentUsage(consignmentId: number) {
  const rows = await sql`
    SELECT DISTINCT lh.vch_code, lh.vch_type FROM voucher_items_tbl li
    JOIN voucher_header_tbl lh ON lh.id = li.voucher_id
    WHERE lh.vch_type IN (${SALES_INVOICE_TYPE}, ${CONSIGNMENT_RETURN_VCH_TYPE}) AND COALESCE(lh.status, 1) <> 3
      AND li.delivery_item_id IN (SELECT id FROM voucher_items_tbl WHERE voucher_id = ${consignmentId})
    LIMIT 5
  `
  return rows as Array<{ vch_code: string; vch_type: number }>
}
