import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensurePortalTables } from "@/lib/customer-portal"

// دفعات بوابة العملاء للمراجعة: GET ?status=pending|approved|rejected|all (بدون محتوى الملف)
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensurePortalTables()
    // فروع الشركة المسموحة للمستخدم (لا عضويات = كل الفروع) — لاختيار فرع سند القبض عند القبول
    const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id=${user.user_id}`
    const branchIds = memberships.map((row: any) => Number(row.branch_id)).filter((id: number) => Number.isInteger(id) && id > 0)
    const branches = await sql`
      SELECT id, branch_name name FROM branches
      WHERE COALESCE(status,1)<>3 AND (${branchIds.length === 0} OR id=ANY(${branchIds}::int[])) ORDER BY branch_name`
    const requested = request.nextUrl.searchParams.get("status") || "pending"
    const status = ["pending", "approved", "rejected", "all"].includes(requested) ? requested : "pending"
    const rows = await sql`
      SELECT p.id, p.account_id, a.code account_code, a.name account_name, p.amount, p.currency_id, c.currency_code, p.rate,
        p.transfer_date::text AS transfer_date, p.reference, p.payer_name, p.bank_name, p.note, p.status, p.created_at,
        p.reviewed_by, p.reviewed_at, p.review_note, p.receipt_voucher_id, p.proof_mime, p.proof_name,
        (p.proof_data IS NOT NULL) has_proof,
        (SELECT vh.vch_code FROM voucher_header_tbl vh WHERE vh.id=p.receipt_voucher_id) receipt_code
      FROM customer_portal_payments_tbl p
      JOIN account_tbl a ON a.id=p.account_id LEFT JOIN currency c ON c.id=p.currency_id
      WHERE (${status === "all"} OR p.status=${status})
      ORDER BY p.created_at DESC LIMIT 300`
    return NextResponse.json({ payments: rows, branches })
  } catch (error) {
    console.error("Customer portal payments error:", error)
    return NextResponse.json({ error: "تعذر تحميل الدفعات" }, { status: 500 })
  }
}
