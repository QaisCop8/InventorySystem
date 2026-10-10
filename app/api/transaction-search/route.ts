import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction, transactionFamilyForVoucherType } from "@/lib/transaction-permissions"

export const dynamic = "force-dynamic"

// بحث السندات (زر البحث بجانب "رقم السند" بكل الحركات): نفس صلاحيات التنقل بين السندات
// (/api/transaction-navigation — نوع السند + فروع المستخدم)، مع فلاتر: من/إلى تاريخ، الحالة
// (1 مسودة · 2 مرحل · 3 ملغي)، الحساب (رأس السند أو أي سطر قيد له)، المستودع، الدفتر، رقم السند،
// المبلغ والبيان.
const isoDate = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null)
const positiveInt = (value: string | null) => (Number(value) > 0 ? Number(value) : null)
const amount = (value: string | null) => (value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null)

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams
    const vchType = Number(p.get("vch_type"))
    const family = transactionFamilyForVoucherType(vchType)
    if (!family) return NextResponse.json({ error: "نوع السند غير صالح" }, { status: 400 })
    const authorization = await authorizeTransaction(request, family, "view", p.get("branch_id"))
    if (!authorization.ok) return authorization.response

    const statuses = (p.get("statuses") || "1,2").split(",").map(Number).filter((value) => [1, 2, 3].includes(value))
    const fromDate = isoDate(p.get("from_date"))
    const toDate = isoDate(p.get("to_date"))
    const accountId = positiveInt(p.get("account_id"))
    const warehouseId = positiveInt(p.get("warehouse_id"))
    const bookId = positiveInt(p.get("vch_book_id"))
    const code = String(p.get("code") || "").trim()
    const note = String(p.get("note") || "").trim()
    const amountFrom = amount(p.get("amount_from"))
    const amountTo = amount(p.get("amount_to"))

    const rows = await sql`
      SELECT vh.id, vh.vch_code, vh.vch_date, vh.status, vh.amount, vh.note, vh.manual_voucher,
        c.currency_code, b.branch_name, vb.name AS book_name, u.full_name AS insert_user_name,
        COALESCE(a.name, NULLIF(TRIM(vh.customer_name), '')) AS party_name, a.code AS party_code,
        ws.warehouse_name AS store_name
      FROM voucher_header_tbl vh
      LEFT JOIN account_tbl a ON a.id = vh.account_id
      LEFT JOIN currency c ON c.id = vh.currency_id
      LEFT JOIN branches b ON b.id = vh.branch_id
      LEFT JOIN voucher_books_tbl vb ON vb.id = vh.vch_book_id
      LEFT JOIN user_settings u ON u.user_id = vh.insert_user
      LEFT JOIN warehouses ws ON ws.id = COALESCE(vh.to_store_id, vh.from_store_id)
      WHERE vh.vch_type = ${vchType}
        AND vh.branch_id = ANY(${authorization.branchIds}::int[])
        AND COALESCE(vh.status, 1) = ANY(${statuses.length ? statuses : [1, 2]}::int[])
        AND (${fromDate}::date IS NULL OR vh.vch_date::date >= ${fromDate}::date)
        AND (${toDate}::date IS NULL OR vh.vch_date::date <= ${toDate}::date)
        AND (${bookId}::int IS NULL OR vh.vch_book_id = ${bookId}::int)
        AND (${code} = '' OR vh.vch_code ILIKE ${"%" + code + "%"} OR COALESCE(vh.manual_voucher, '') ILIKE ${"%" + code + "%"})
        AND (${note} = '' OR COALESCE(vh.note, '') ILIKE ${"%" + note + "%"})
        AND (${amountFrom}::numeric IS NULL OR vh.amount >= ${amountFrom}::numeric)
        AND (${amountTo}::numeric IS NULL OR vh.amount <= ${amountTo}::numeric)
        AND (
          ${accountId}::int IS NULL
          OR vh.account_id = ${accountId}::int
          OR vh.to_account_id = ${accountId}::int
          OR EXISTS (SELECT 1 FROM voucher_journal_detail_tbl j WHERE j.voucher_id = vh.id AND j.account_id = ${accountId}::int)
        )
        AND (
          ${warehouseId}::int IS NULL
          OR vh.to_store_id = ${warehouseId}::int
          OR vh.from_store_id = ${warehouseId}::int
          OR EXISTS (SELECT 1 FROM voucher_items_tbl vi WHERE vi.voucher_id = vh.id AND vi.store_id = ${warehouseId}::int)
        )
      ORDER BY vh.vch_date DESC, vh.id DESC
      LIMIT 500
    `
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } })
  } catch (error: any) {
    console.error("Failed to search transactions", error)
    return NextResponse.json({ error: error?.message || "تعذر البحث في السندات" }, { status: 500 })
  }
}
