import sql, { queryRowsViaPool, resolveCurrentDbName } from "@/lib/database"
import { summarizeVoucherInventory, type LineCost } from "@/lib/voucher-inventory-valuation"
import { getSystemSettingValue } from "@/lib/system-settings"
import { ensureLandedCostSchema } from "@/lib/landed-costs"

export const reportDate = (value: string | null, fallback = new Date().toISOString().slice(0, 10)) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback

// includeUnposted: تقييم المخزون وتقارير الأرباح تعتمد كل السندات غير المحذوفة (مرحّلة أو غير مرحّلة)؛
// أرصدة المخزون والقوائم المالية تبقى على السندات المرحّلة فقط.
export type InventoryReportFilters = { productIds?: number[]; excludeProductIds?: number[]; warehouseIds?: number[]; branchIds?: number[]; includeUnposted?: boolean }
export const reportIds = (value: string | null) => [...new Set((value || "").split(",").map(Number).filter(id => Number.isSafeInteger(id) && id > 0))]
export const inventoryFilters = (params: URLSearchParams): InventoryReportFilters => ({
  productIds: reportIds(params.get("product_ids")), excludeProductIds: reportIds(params.get("product_ids_exclude")), warehouseIds: reportIds(params.get("warehouse_ids")), branchIds: reportIds(params.get("branch_ids")),
})
export async function inventoryReportMeta(organizationId: number) {
  const [products, warehouses, branches] = await Promise.all([
    getInventoryReportProducts(organizationId, 0, ""),
    sql`SELECT id,warehouse_code code,warehouse_name name FROM warehouses WHERE COALESCE(status,1)<>3 ORDER BY warehouse_code`,
    sql`SELECT id,branch_code code,branch_name name FROM branches WHERE NOT COALESCE((to_jsonb(branches)->>'is_bank_branch')::boolean, false) AND COALESCE(status,1)<>3 ORDER BY branch_code`,
  ])
  return { products, warehouses, branches }
}

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

// products.initial_price اختياري (غير موجود في بعض قواعد الشركات) — كان يُقرأ عبر to_jsonb(p) لكل صنف
// (~1 ثانية لكل 16 ألف صنف)؛ يُفحص وجوده مرة لكل قاعدة ويُقرأ مباشرة أو يُستبدل بصفر.
const initialPriceByDb = new Map<string, Promise<boolean>>()
async function productsHasInitialPrice() {
  const databaseName = await resolveCurrentDbName()
  let pending = initialPriceByDb.get(databaseName)
  if (!pending) {
    pending = (async () => ((await sql`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'initial_price'`) as any[]).length > 0)()
    pending.catch(() => initialPriceByDb.delete(databaseName))
    initialPriceByDb.set(databaseName, pending)
  }
  return pending
}

// أعمدة خصم/ضريبة الرأس قد لا توجد في قواعد الشركات القديمة — كانت تُقرأ بـ to_jsonb(الرأس) (بطيء جداً لآلاف السندات):
// تُفحص مرة لكل قاعدة وتُقرأ مباشرة، والعمود الغائب قيمة ثابتة
const headerColumnsByDb = new Map<string, Promise<Set<string>>>()
async function costHeaderSelect() {
  const databaseName = await resolveCurrentDbName()
  let pending = headerColumnsByDb.get(databaseName)
  if (!pending) {
    pending = (async () => new Set(((await sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'voucher_header_tbl' AND column_name IN ('vat_included','discount_type','discount_value','discount')`) as any[]).map((row) => String(row.column_name))))()
    pending.catch(() => headerColumnsByDb.delete(databaseName))
    headerColumnsByDb.set(databaseName, pending)
  }
  const has = await pending
  return [
    has.has("vat_included") ? "COALESCE(h.vat_included::text::boolean,false)" : "false",
    has.has("discount_type") ? "h.discount_type::text" : "NULL::text",
    has.has("discount_value") ? "COALESCE(h.discount_value::numeric,0)" : "0::numeric",
    has.has("discount") ? "COALESCE(h.discount::numeric,0)" : "0::numeric",
  ].map((expr, index) => `${expr} AS ${["vat_included", "discount_type", "discount_value", "discount"][index]}`).join(", ")
}

/** آخر سعر صرف نشط للعملة حتى اليوم المعطى (نفس ORDER BY rate_date DESC, id DESC)، أو 0 إن لم يوجد. */
async function exchangeRateLookup() {
  const rows = await sql`SELECT currency_id, rate_date::date::text AS day, exchange_rate FROM exchange_rates
    WHERE COALESCE(is_active,true) ORDER BY currency_id, rate_date, id` as any[]
  const byCurrency = new Map<number, { day: string; rate: number }[]>()
  for (const row of rows) {
    const list = byCurrency.get(Number(row.currency_id)) || []
    list.push({ day: String(row.day), rate: Number(row.exchange_rate) || 0 })
    byCurrency.set(Number(row.currency_id), list)
  }
  return (currencyId: number, day: string) => {
    const list = byCurrency.get(currencyId)
    if (!list?.length) return 0
    let low = 0, high = list.length - 1, found = -1
    while (low <= high) { const mid = (low + high) >> 1; if (list[mid].day <= day) { found = mid; low = mid + 1 } else high = mid - 1 }
    return found < 0 ? 0 : list[found].rate
  }
}

export async function getProductBalances(_organizationId: number, toDate: string, productId: number, search: string, filters: InventoryReportFilters = {}, onLineCost?: (line: any, cost: LineCost) => void) {
  const { productIds = [], excludeProductIds = [], warehouseIds = [], branchIds = [], includeUnposted = false } = filters
  await ensureLandedCostSchema()
  const initialPriceExpr = (await productsHasInitialPrice()) ? "COALESCE(p.initial_price::numeric,0)" : "0::numeric"
  const headerSelect = await costHeaderSelect()
  // sql is already scoped to the current company's database. Neither quantities
  // nor prices for this report depend on the optional movement ledger.
  const [products, lines, includePurchaseReturns] = await Promise.all([
    sql`SELECT p.id,p.product_code,p.product_name,p.barcode,u.unit_name AS main_unit,
               -- مجموعة الصنف: المجموعة الفرعية (category_id) وإلا المجموعة الرئيسية (main_stock_id) — كثير من الأصناف
               -- تحفظ مجموعتها في main_stock_id فقط فكان العمود "—" (نفس منطق كتالوج نقطة البيع)
               COALESCE(NULLIF(groups.group_name,''),NULLIF(main_group.group_name,'')) AS category,p.currency_id,p.last_purchase_price,
               ${sql.unsafe(initialPriceExpr)} AS initial_price
        FROM products p
        LEFT JOIN units u ON u.id=p.measurment_unit
        LEFT JOIN item_groups groups ON groups.id=p.category_id
        LEFT JOIN item_groups main_group ON main_group.id=p.main_stock_id
        WHERE COALESCE(p.deleted,false)=false AND COALESCE(p.status,1)<>3 AND COALESCE(p.type,1)=1
          AND (${productId}=0 OR p.id=${productId})
          AND (${productIds.length}=0 OR p.id=ANY(${productIds}::int[]))
          AND (${excludeProductIds.length}=0 OR NOT (p.id=ANY(${excludeProductIds}::int[])))
          AND (${search}='' OR p.product_code ILIKE ${`%${search}%`} OR p.product_name ILIKE ${`%${search}%`})
        ORDER BY p.product_code,p.product_name`,
    // آلاف أسطر الحركة: عبر Pool لا Neon HTTP (2026-11-16)
    queryRowsViaPool(sql`
      -- تكاليف الشحن والجمارك المحمّلة على سطر الشراء حتى تاريخ التقرير (lib/landed-costs.ts)، بعملة الفاتورة
      WITH landed AS MATERIALIZED (
        SELECT voucher_item_id, SUM(amount) AS amount FROM landed_cost_lines_v
        WHERE doc_date<=${toDate}::date GROUP BY voucher_item_id
      ),
      -- حقول خصم/ضريبة رأس السند ومجموع أسطره تُحسب مرة لكل سند — كانت تُحسب لكل سطر صنف (to_jsonb للرأس لكل سطر
      -- من أسطر السند) فاستغرق التقرير دقيقة مع ~60 ألف سطر
      cost_headers AS MATERIALIZED (
        SELECT h.id, ${sql.unsafe(headerSelect)}
        FROM voucher_header_tbl h WHERE h.vch_type IN (8,17,18,19)
      ),
      -- معامل الوحدة: أول سطر لكل صنف+وحدة (نفس ORDER BY id LIMIT 1 السابق) مرة واحدة بدل بحث لكل سطر
      unit_factors AS MATERIALIZED (
        SELECT DISTINCT ON (product_id, unit_id) product_id, unit_id, to_main_qnty FROM product_units ORDER BY product_id, unit_id, id
      ),
      -- آخر فاتورة شراء مرتبطة بكل سطر إرسالية شراء (نفس ORDER BY السابق) — مرة واحدة بدل LATERAL لكل سطر حركة
      linked_invoices AS MATERIALIZED (
        -- الصنف نفسه فقط: ربط خاطئ (موقع سطر مختلف) كان يأخذ سعر صنف آخر من الفاتورة (2026-11-16)
        SELECT DISTINCT ON (invoice_item.delivery_item_id, invoice_item.item_id) invoice_item.delivery_item_id, invoice_item.item_id, invoice_item.id
        FROM voucher_items_tbl invoice_item
        JOIN voucher_header_tbl invoice ON invoice.id=invoice_item.voucher_id
        WHERE invoice_item.delivery_item_id>0
          AND invoice.vch_type=17 AND (${includeUnposted} OR invoice.vch_status=2) AND COALESCE(invoice.status,1)<>3
          AND invoice.vch_date::date<=${toDate}::date
        ORDER BY invoice_item.delivery_item_id,invoice_item.item_id,invoice.vch_date DESC,invoice_item.id DESC
      ),
      cost_totals AS MATERIALIZED (
        SELECT line.voucher_id, SUM(COALESCE(line.qnty,0)*COALESCE(line.price,0)
          / CASE WHEN ch.vat_included THEN NULLIF(1+COALESCE(line.vat_ratio,0)/100,0) ELSE 1 END
          * (1-COALESCE(line.discount,0)/100)) AS subtotal
        FROM voucher_items_tbl line JOIN cost_headers ch ON ch.id=line.voucher_id
        GROUP BY line.voucher_id
      )
      SELECT vi.id,vh.id AS voucher_id,vi.item_id AS product_id,vh.vch_type,vh.vch_date::date::text AS movement_date,
             vh.from_store_id,vh.to_store_id,vi.store_id,
             vi.qnty,vi.bonus,vi.delivery_item_id,COALESCE(NULLIF(pu.to_main_qnty,0),1) AS unit_factor,
             cost_item.qnty AS cost_qnty,cost_item.bonus AS cost_bonus,cost_item.price AS cost_price,
             cost_item.discount AS cost_discount,cost_item.vat_ratio AS cost_vat_ratio,
             COALESCE(ch.vat_included,false) AS cost_vat_included,
             ch.discount_type AS cost_discount_type,
             COALESCE(ch.discount_value,0) AS cost_discount_value,
             COALESCE(ch.discount,0) AS cost_header_discount,
             COALESCE(NULLIF(cost_unit.to_main_qnty,0),1) AS cost_unit_factor,
             cost_totals.subtotal AS cost_subtotal,COALESCE(landed.amount,0) AS cost_landed,
             -- تحويل العملة يُحسب في JS (rateOn) بدل LATERAL على exchange_rates لكل سطر
             cost_header.currency_id AS cost_currency_id,p.currency_id AS product_currency_id,
             COALESCE(NULLIF(cost_header.rate,0),1) AS cost_rate,cost_header.vch_date::date::text AS cost_date,
             cost_header.id AS cost_voucher_id
      FROM voucher_items_tbl vi
      JOIN voucher_header_tbl vh ON vh.id=vi.voucher_id
      JOIN products p ON p.id=vi.item_id
      LEFT JOIN unit_factors pu ON pu.product_id=vi.item_id AND pu.unit_id=vi.unit_id
      -- A purchase delivery owns the quantity; its posted invoice supplies the
      -- final purchase price, only if that invoice existed by the report date.
      LEFT JOIN linked_invoices linked_invoice ON vh.vch_type=18 AND linked_invoice.delivery_item_id=vi.id AND linked_invoice.item_id=vi.item_id
      -- كلفة السطر تُستخدم فقط للمشتريات (8,17,18) ومرتجعها (19، حسب الإعداد) — summarizeVoucherInventory؛
      -- باقي الحركات (مبيعات/تحويل/إخراج) لا تحتاج هذه الانضمامات الخمسة فتبقى أعمدتها فارغة (2026-11-16)
      LEFT JOIN voucher_items_tbl cost_item ON vh.vch_type IN (8,17,18,19) AND cost_item.id=COALESCE(linked_invoice.id,vi.id)
      LEFT JOIN voucher_header_tbl cost_header ON cost_header.id=cost_item.voucher_id
      LEFT JOIN unit_factors cost_unit ON cost_unit.product_id=cost_item.item_id AND cost_unit.unit_id=cost_item.unit_id
      LEFT JOIN landed ON landed.voucher_item_id=cost_item.id
      LEFT JOIN cost_headers ch ON ch.id=cost_header.id
      LEFT JOIN cost_totals ON cost_totals.voucher_id=cost_header.id
      -- شروط بصيغة يقدّر المخطط عدد صفوفها (COALESCE(col,..) يُقدَّر 0.5%: 13 صفاً بدل 58 ألفاً ← فرز على القرص
      -- وحلقات متداخلة)؛ vch_date من نوع timestamp فـ < اليوم التالي تعادل ::date <= اليوم — 2026-11-16
      WHERE (${includeUnposted} OR vh.vch_status=2) AND vh.status IS DISTINCT FROM 3 AND vh.vch_date<(${toDate}::date+1)
        AND vh.vch_type IN (8,9,10,11,12,13,14,15,16,17,18,19)
        AND (${branchIds.length}=0 OR vh.branch_id=ANY(${branchIds}::int[]))
        AND (${warehouseIds.length}=0 OR vi.store_id=ANY(${warehouseIds}::int[]) OR (vh.vch_type=10 AND (vh.from_store_id=ANY(${warehouseIds}::int[]) OR vh.to_store_id=ANY(${warehouseIds}::int[]))))
        AND (${productIds.length}=0 OR p.id=ANY(${productIds}::int[]))
        AND (${excludeProductIds.length}=0 OR NOT (p.id=ANY(${excludeProductIds}::int[])))
        AND (vh.vch_type NOT IN (12,17) OR COALESCE(vi.delivery_item_id,0)=0)
        AND p.deleted IS NOT TRUE AND p.status IS DISTINCT FROM 3 AND (p.type=1 OR p.type IS NULL)
        AND (${productId}=0 OR p.id=${productId})
        AND (${search}='' OR p.product_code ILIKE ${`%${search}%`} OR p.product_name ILIKE ${`%${search}%`})
      -- بلا ORDER BY: summarizeVoucherInventory يرتّب الأسطر بنفسه (التاريخ، السند، السطر)
    `, { workMem: "32MB" }),
    getSystemSettingValue("include_purchase_returns_in_cost", false),
  ])
  // سعر صرف عملة الصنف بتاريخ سند الكلفة: آخر سعر نشط حتى تاريخه (rate_date DESC, id DESC) — جدول صغير يُقرأ مرة
  // ويُبحث فيه ثنائياً؛ كان LATERAL لكل سطر حركة (~0.7 ثانية مع 60 ألف سطر) — 2026-11-16
  const rateOn = await exchangeRateLookup()
  for (const line of lines as any[]) {
    line.currency_conversion = Number(line.cost_currency_id) === Number(line.product_currency_id) && line.cost_currency_id != null ? 1
      : Number(line.cost_rate) / (rateOn(Number(line.product_currency_id), String(line.cost_date)) || 1)
  }
  const warehouses = new Set(warehouseIds)
  const scopedLines = lines.flatMap((line: any) => {
    if (Number(line.vch_type) !== 10) return [line]
    if (!warehouses.size) return []
    const from = warehouses.has(Number(line.from_store_id)), to = warehouses.has(Number(line.to_store_id))
    // Transfers within the selected warehouses cancel out.
    return from === to ? [] : [{ ...line, vch_type: to ? 15 : 9 }]
  })
  return summarizeVoucherInventory(products, scopedLines, [true, 1, "1", "true"].includes(includePurchaseReturns), onLineCost)
}
