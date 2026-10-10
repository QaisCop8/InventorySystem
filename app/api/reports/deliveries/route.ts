import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { reportAccessDenied } from "@/lib/report-permissions"
import { reportAmountSql } from "@/lib/report-currency"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// تقارير الإرساليات (منقولة من ShamelAPI: DeliveryReport، InternalDeliveryReport، InvoicesFromConsignmentReport)
//  deliveries            تقرير الإرساليات: إرساليات المبيعات (13) وبرسم البيع (14) ومرتجعها (15) والمشتريات (18)
//                        مع حالة الفوترة (الفواتير/المرتجعات المرتبطة بأسطرها عبر delivery_item_id)
//  internal              تقرير الإرساليات الداخلية (10) بين المستودعات
//  consignment-invoices  الفواتير والمرتجعات الصادرة من إرسالية برسم البيع محددة + المتبقي لكل صنف
// ─────────────────────────────────────────────────────────────────────────────────────────────

const KINDS = {
  deliveries: "deliveries-report",
  internal: "internal-deliveries-report",
  "consignment-invoices": "consignment-invoices-report",
} as const
type Kind = keyof typeof KINDS

const DELIVERY_TYPES = [13, 14, 15, 18]
const TYPE_NAMES: Record<number, string> = { 10: "إرسالية داخلية", 12: "فاتورة مبيعات", 13: "إرسالية مبيعات", 14: "إرسالية برسم البيع", 15: "مرتجع إرسالية برسم البيع", 17: "فاتورة مشتريات", 18: "إرسالية مشتريات" }
const ids = (value: string | null) => String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
const isoDate = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)
const round = (value: number, digits = 2) => Math.round((Number(value) || 0) * 10 ** digits) / 10 ** digits

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const p = request.nextUrl.searchParams
    const kind = (p.get("kind") && p.get("kind")! in KINDS ? p.get("kind") : "deliveries") as Kind
    const denied = await reportAccessDenied(request, [KINDS[kind]])
    if (denied) return denied
    await ensureVoucherTables()

    const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${user.user_id}`
    const permitted = memberships.map((row: any) => Number(row.branch_id)).filter(Number.isFinite)
    const branchIds = ids(p.get("branch_ids"))
    const effectiveBranches = branchIds.length ? branchIds.filter((id) => !permitted.length || permitted.includes(id)) : permitted
    if (branchIds.length && !effectiveBranches.length) return NextResponse.json({ error: "لا تملك صلاحية على الفروع المحددة" }, { status: 403 })
    const branchSql = effectiveBranches.length ? `vh.branch_id = ANY(ARRAY[${effectiveBranches.join(",")}]::int[])` : "TRUE"

    const [currencies, branches, warehouses, products, accounts, consignments] = await Promise.all([
      sql`SELECT id, currency_code, currency_name FROM currency WHERE COALESCE(is_active, true) ORDER BY id`,
      effectiveBranches.length
        ? sql`SELECT id, branch_code, branch_name FROM branches WHERE id = ANY(${effectiveBranches}::int[]) AND COALESCE(status, 1) <> 3 ORDER BY branch_name`
        : sql`SELECT id, branch_code, branch_name FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY branch_name`,
      sql`SELECT id, warehouse_code code, warehouse_name name FROM warehouses WHERE COALESCE(status, 1) <> 3 ORDER BY warehouse_code`,
      sql`SELECT id, product_code code, product_name name FROM products WHERE COALESCE(deleted, false) = false AND COALESCE(status, 1) <> 3 ORDER BY product_code`,
      kind === "deliveries" ? sql`SELECT id, code, name FROM account_tbl WHERE COALESCE(status, 1) <> 3 AND type IN (2, 3, 5) ORDER BY code` : Promise.resolve([]),
      kind === "consignment-invoices"
        ? sql`SELECT vh.id, vh.vch_code, vh.vch_date::date::text AS vch_date, COALESCE(NULLIF(a.name, ''), vh.customer_name, '') AS customer_name, s.name AS salesman_name
              FROM voucher_header_tbl vh LEFT JOIN account_tbl a ON a.id = vh.account_id LEFT JOIN salesmen s ON s.id = vh.salesman_id
              WHERE vh.vch_type = 14 AND vh.status <> 3 AND ${sql.unsafe(branchSql)} ORDER BY vh.vch_date DESC, vh.id DESC LIMIT 500`
        : Promise.resolve([]),
    ])
    const meta = { currencies, branches, warehouses, products, accounts, consignments, voucher_types: DELIVERY_TYPES.map((id) => ({ id, name: TYPE_NAMES[id] })) }
    if (p.get("meta") === "1") return NextResponse.json({ meta })

    const today = new Date().toISOString().slice(0, 10)
    const fromDate = isoDate(p.get("from_date"), `${today.slice(0, 7)}-01`)
    const toDate = isoDate(p.get("to_date"), today)
    const statusSql = p.get("status") === "posted" ? "vh.status = 2" : "vh.status <> 3"
    const baseId = Number(currencies[0]?.id)
    const targetId = Number(p.get("report_currency_id") || baseId)
    const targetCurrency = currencies.find((currency: any) => Number(currency.id) === targetId)
    if (!targetCurrency) return NextResponse.json({ error: "العملة المحددة غير موجودة" }, { status: 400 })
    const amountSql = reportAmountSql(targetId, baseId, "vh")
    const itemIds = ids(p.get("item_ids"))
    // سندات تحتوي جميع الأصناف المحددة (كما في شامل)
    const itemsSql = itemIds.length
      ? `(SELECT COUNT(DISTINCT x.item_id) FROM voucher_items_tbl x WHERE x.voucher_id = vh.id AND x.item_id = ANY(ARRAY[${itemIds.join(",")}]::int[])) = ${itemIds.length}`
      : "TRUE"
    const base = { kind, currency: targetCurrency, filters: { from_date: fromDate, to_date: toDate } }

    // ═════════ تقرير الإرساليات ═════════
    if (kind === "deliveries") {
      const types = ids(p.get("voucher_types")).filter((id) => DELIVERY_TYPES.includes(id))
      const accountIds = ids(p.get("account_ids"))
      const invoiceStatus = p.get("invoice_status") || "all"
      const rows = (await sql`
        SELECT vh.id, vh.vch_type, vh.vch_code, vh.vch_date::date::text AS vch_date, vh.status,
          COALESCE(NULLIF(a.name, ''), vh.customer_name, '') AS customer_name, a.code AS account_code,
          s.name AS salesman_name, c.name AS car_name, c.plate_number, d.name AS driver_name,
          COALESCE(vh.manual_voucher, '') AS manual_voucher, COALESCE(vh.note, '') AS note,
          (${sql.unsafe(amountSql)})::float AS amount,
          COALESCE((SELECT SUM(COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) FROM voucher_items_tbl vi WHERE vi.voucher_id = vh.id), 0)::float AS quantity,
          COALESCE((SELECT string_agg(DISTINCT w.warehouse_name, '، ') FROM voucher_items_tbl vi JOIN warehouses w ON w.id = vi.store_id WHERE vi.voucher_id = vh.id), '') AS warehouses,
          COALESCE((
            SELECT SUM(COALESCE(li.qnty, 0) + COALESCE(li.bonus, 0)) FROM voucher_items_tbl li JOIN voucher_header_tbl lh ON lh.id = li.voucher_id
            WHERE lh.status <> 3 AND lh.vch_type IN (12, 15, 17) AND li.delivery_item_id IN (SELECT id FROM voucher_items_tbl WHERE voucher_id = vh.id)
          ), 0)::float AS invoiced_quantity,
          COALESCE((
            SELECT string_agg(DISTINCT lh.vch_code || ' (' || lh.vch_date::date::text || ')', '، ') FROM voucher_items_tbl li JOIN voucher_header_tbl lh ON lh.id = li.voucher_id
            WHERE lh.status <> 3 AND lh.vch_type IN (12, 15, 17) AND li.delivery_item_id IN (SELECT id FROM voucher_items_tbl WHERE voucher_id = vh.id)
          ), '') AS invoices
        FROM voucher_header_tbl vh
        LEFT JOIN account_tbl a ON a.id = vh.account_id
        LEFT JOIN salesmen s ON s.id = vh.salesman_id
        LEFT JOIN cars c ON c.id = NULLIF(vh.shipping_info->>'car_id', '')::int
        LEFT JOIN drivers d ON d.id = NULLIF(vh.shipping_info->>'driver_id', '')::int
        WHERE vh.vch_type = ANY(${types.length ? types : DELIVERY_TYPES}::int[])
          AND ${sql.unsafe(statusSql)} AND ${sql.unsafe(branchSql)} AND ${sql.unsafe(itemsSql)}
          AND (${accountIds.length === 0} OR vh.account_id = ANY(${accountIds}::int[]))
          AND vh.vch_date::date BETWEEN ${fromDate}::date AND ${toDate}::date
        ORDER BY vh.vch_date, vh.id
      `) as any[]
      const result = rows
        .map((row) => {
          const quantity = Number(row.quantity) || 0
          const invoiced = Number(row.invoiced_quantity) || 0
          const invoiceState = invoiced <= 0.000001 ? "none" : invoiced + 0.000001 >= quantity ? "full" : "partial"
          return {
            ...row, type_name: TYPE_NAMES[Number(row.vch_type)] || "", amount: round(row.amount), quantity: round(quantity, 3),
            invoiced_quantity: round(invoiced, 3), remaining_quantity: round(Math.max(0, quantity - invoiced), 3), invoice_state: invoiceState,
            car_label: [row.car_name, row.plate_number].filter(Boolean).join(" · "),
          }
        })
        .filter((row) => invoiceStatus === "all" || (invoiceStatus === "invoiced" ? row.invoice_state === "full" : invoiceStatus === "partial" ? row.invoice_state === "partial" : row.invoice_state === "none"))
      return NextResponse.json({ ...base, shape: "deliveries", rows: result })
    }

    // ═════════ تقرير الإرساليات الداخلية ═════════
    if (kind === "internal") {
      const fromStores = ids(p.get("from_store_ids"))
      const toStores = ids(p.get("to_store_ids"))
      const rows = (await sql`
        SELECT vh.id, vh.vch_type, vh.vch_code, vh.vch_date::date::text AS vch_date, vh.status,
          fw.warehouse_name AS from_store, tw.warehouse_name AS to_store,
          COALESCE(vh.manual_voucher, '') AS manual_voucher, COALESCE(vh.note, '') AS note,
          c.name AS car_name, d.name AS driver_name,
          (${sql.unsafe(amountSql)})::float AS amount,
          (SELECT COUNT(*) FROM voucher_items_tbl vi WHERE vi.voucher_id = vh.id)::int AS lines,
          COALESCE((SELECT SUM(COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) FROM voucher_items_tbl vi WHERE vi.voucher_id = vh.id), 0)::float AS quantity
        FROM voucher_header_tbl vh
        LEFT JOIN warehouses fw ON fw.id = vh.from_store_id
        LEFT JOIN warehouses tw ON tw.id = vh.to_store_id
        LEFT JOIN cars c ON c.id = NULLIF(vh.shipping_info->>'car_id', '')::int
        LEFT JOIN drivers d ON d.id = NULLIF(vh.shipping_info->>'driver_id', '')::int
        WHERE vh.vch_type = 10 AND ${sql.unsafe(statusSql)} AND ${sql.unsafe(branchSql)} AND ${sql.unsafe(itemsSql)}
          AND (${fromStores.length === 0} OR vh.from_store_id = ANY(${fromStores}::int[]))
          AND (${toStores.length === 0} OR vh.to_store_id = ANY(${toStores}::int[]))
          AND vh.vch_date::date BETWEEN ${fromDate}::date AND ${toDate}::date
        ORDER BY vh.vch_date, vh.id
      `) as any[]
      return NextResponse.json({ ...base, shape: "internal", rows: rows.map((row) => ({ ...row, amount: round(row.amount), quantity: round(row.quantity, 3) })) })
    }

    // ═════════ الفواتير الصادرة من إرسالية برسم البيع ═════════
    const consignmentId = Number(p.get("consignment_id")) || 0
    if (!consignmentId) return NextResponse.json({ error: "الرجاء اختيار رقم الارسالية" }, { status: 400 })
    const header = ((await sql`
      SELECT vh.id, vh.vch_code, vh.vch_date::date::text AS vch_date, COALESCE(NULLIF(a.name, ''), vh.customer_name, '') AS customer_name, s.name AS salesman_name,
        (${sql.unsafe(amountSql)})::float AS amount
      FROM voucher_header_tbl vh LEFT JOIN account_tbl a ON a.id = vh.account_id LEFT JOIN salesmen s ON s.id = vh.salesman_id
      WHERE vh.id = ${consignmentId} AND vh.vch_type = 14
    `) as any[])[0]
    if (!header) return NextResponse.json({ error: "رقم الارسالية المدخل غير صحيح" }, { status: 400 })
    const invoices = (await sql`
      SELECT vh.id, vh.vch_type, vh.vch_code, vh.vch_date::date::text AS vch_date, vh.status, a.code AS account_code,
        COALESCE(NULLIF(a.name, ''), vh.customer_name, '') AS account_name, COALESCE(vh.note, '') AS note,
        (${sql.unsafe(amountSql)})::float AS amount,
        CASE WHEN vh.account_id IS NULL THEN NULL ELSE (
          SELECT COALESCE(SUM(CASE WHEN j.credit_debit = 1 THEN 1 ELSE -1 END * ABS(j.amount * COALESCE(j.rate, 1))), 0)
          FROM voucher_journal_detail_tbl j JOIN voucher_header_tbl jh ON jh.id = j.voucher_id
          WHERE j.account_id = vh.account_id AND jh.status <> 3
        ) END::float AS account_balance
      FROM voucher_header_tbl vh LEFT JOIN account_tbl a ON a.id = vh.account_id
      WHERE vh.status <> 3 AND vh.vch_type IN (12, 15)
        AND EXISTS (SELECT 1 FROM voucher_items_tbl li WHERE li.voucher_id = vh.id AND li.delivery_item_id IN (SELECT id FROM voucher_items_tbl WHERE voucher_id = ${consignmentId}))
      ORDER BY vh.vch_date, vh.id
    `) as any[]
    const includeDetails = p.get("include_details") === "1"
    const details = includeDetails && invoices.length ? (await sql`
      SELECT li.voucher_id, COALESCE(pr.product_name, li.item_name) AS item_name, pr.product_code, u.unit_name,
        COALESCE(li.qnty, 0)::float AS quantity, COALESCE(li.bonus, 0)::float AS bonus, COALESCE(li.price, 0)::float AS price, COALESCE(li.discount, 0)::float AS discount,
        (COALESCE(li.qnty, 0) * COALESCE(li.price, 0) * (1 - COALESCE(li.discount, 0) / 100.0))::float AS line_amount
      FROM voucher_items_tbl li LEFT JOIN products pr ON pr.id = li.item_id LEFT JOIN units u ON u.id = li.unit_id
      WHERE li.voucher_id = ANY(${invoices.map((row) => Number(row.id))}::int[]) ORDER BY li.voucher_id, li.id
    `) as any[] : []
    // المتبقي لكل صنف في الإرسالية: الكمية − المفوتر − المرتجع
    const balance = (await sql`
      SELECT ci.id, COALESCE(pr.product_name, ci.item_name) AS item_name, pr.product_code, u.unit_name,
        (COALESCE(ci.qnty, 0) + COALESCE(ci.bonus, 0))::float AS quantity,
        COALESCE((SELECT SUM(COALESCE(li.qnty, 0) + COALESCE(li.bonus, 0)) FROM voucher_items_tbl li JOIN voucher_header_tbl lh ON lh.id = li.voucher_id WHERE lh.status <> 3 AND lh.vch_type = 12 AND li.delivery_item_id = ci.id), 0)::float AS invoiced,
        COALESCE((SELECT SUM(COALESCE(li.qnty, 0) + COALESCE(li.bonus, 0)) FROM voucher_items_tbl li JOIN voucher_header_tbl lh ON lh.id = li.voucher_id WHERE lh.status <> 3 AND lh.vch_type = 15 AND li.delivery_item_id = ci.id), 0)::float AS returned
      FROM voucher_items_tbl ci LEFT JOIN products pr ON pr.id = ci.item_id LEFT JOIN units u ON u.id = ci.unit_id
      WHERE ci.voucher_id = ${consignmentId} ORDER BY ci.id
    `) as any[]
    return NextResponse.json({
      ...base,
      shape: "consignment",
      consignment: { ...header, amount: round(header.amount) },
      rows: invoices.map((row) => ({
        ...row, type_name: TYPE_NAMES[Number(row.vch_type)] || "", status_name: Number(row.status) === 2 ? "مرحل" : "محفوظ",
        amount: round(row.amount * (Number(row.vch_type) === 15 ? -1 : 1)), account_balance: row.account_balance == null ? null : round(row.account_balance),
        details: details.filter((line) => Number(line.voucher_id) === Number(row.id)).map((line) => ({ ...line, line_amount: round(line.line_amount) })),
      })),
      items: balance.map((row) => ({ ...row, remaining: round(Number(row.quantity) - Number(row.invoiced) - Number(row.returned), 3) })),
    })
  } catch (error) {
    if ((error as { code?: string })?.code === "22012") {
      return NextResponse.json({ error: "لا يوجد سعر صرف صالح لعملة التقرير بتاريخ أحد السندات." }, { status: 400 })
    }
    console.error("Deliveries report error:", error)
    return NextResponse.json({ error: "تعذر تحميل تقرير الإرساليات" }, { status: 500 })
  }
}
