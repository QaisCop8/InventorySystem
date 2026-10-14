import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { PortalAccessError, portalCompany, portalStatement, withPortalLink } from "@/lib/customer-portal"

// بوابة العملاء (عام — بلا جلسة): كشف حساب العميل صاحب الرابط + آخر دفعاته المرفوعة.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const search = request.nextUrl.searchParams
    return await withPortalLink(token, async (link) => {
      const [company, statement, payments] = await Promise.all([
        portalCompany(),
        portalStatement(link.account_id, search.get("from"), search.get("to")),
        sql`
          SELECT p.id, p.amount, p.transfer_date::text AS transfer_date, p.reference, p.status, p.review_note, p.created_at, c.currency_code,
                 (SELECT vh.vch_code FROM voucher_header_tbl vh WHERE vh.id=p.receipt_voucher_id) receipt_code
          FROM customer_portal_payments_tbl p LEFT JOIN currency c ON c.id=p.currency_id
          WHERE p.account_id=${link.account_id} ORDER BY p.created_at DESC LIMIT 20`,
      ])
      return NextResponse.json({ company, ...statement, payments }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } })
    })
  } catch (error) {
    if (error instanceof PortalAccessError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error("Customer portal statement error:", error)
    return NextResponse.json({ error: "تعذر تحميل كشف الحساب" }, { status: 500 })
  }
}
