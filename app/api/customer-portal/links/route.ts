import { NextResponse, type NextRequest } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensurePortalTables, newPortalSecret, portalToken, sha256Hex } from "@/lib/customer-portal"

// روابط بوابة العملاء (للموظفين): GET القائمة، POST {account_id} إنشاء رابط جديد (يلغي السابق)، DELETE ?id= إلغاء.
export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensurePortalTables()
    const rows = await sql`
      SELECT l.id, l.account_id, a.code account_code, a.name account_name, l.created_by, l.created_at, l.last_access_at, l.access_count,
        (SELECT c.mobile1 FROM customers c WHERE c.account_id=a.id AND COALESCE(c.isdeleted,false)=false ORDER BY c.id DESC LIMIT 1) mobile,
        (SELECT COUNT(*) FROM customer_portal_payments_tbl p WHERE p.account_id=l.account_id AND p.status='pending') pending
      FROM customer_portal_links_tbl l JOIN account_tbl a ON a.id=l.account_id
      WHERE l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at>NOW())
      ORDER BY l.created_at DESC LIMIT 500`
    return NextResponse.json({ links: rows })
  } catch (error) {
    console.error("Customer portal links error:", error)
    return NextResponse.json({ error: "تعذر تحميل روابط البوابة" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensurePortalTables()
    const body = await request.json().catch(() => ({}))
    const accountId = Number(body?.account_id)
    if (!Number.isInteger(accountId) || accountId <= 0) return NextResponse.json({ error: "اختر العميل" }, { status: 400 })
    const [account] = await sql`SELECT id, name FROM account_tbl WHERE id=${accountId} AND COALESCE(status,1)<>3 AND type IN (2,3,5)`
    if (!account) return NextResponse.json({ error: "الحساب ليس حساب عميل فعّال" }, { status: 400 })
    const secret = newPortalSecret()
    const hash = await sha256Hex(secret)
    await sql`UPDATE customer_portal_links_tbl SET revoked_at=NOW() WHERE account_id=${accountId} AND revoked_at IS NULL`
    const [link] = await sql`INSERT INTO customer_portal_links_tbl (account_id, token_hash, created_by) VALUES (${accountId}, ${hash}, ${user.full_name || user.username || user.user_id}) RETURNING id`
    return NextResponse.json({ id: Number(link.id), path: `/portal/${portalToken(await resolveCurrentDbName(), secret)}`, account_name: account.name }, { status: 201 })
  } catch (error) {
    console.error("Customer portal link create error:", error)
    return NextResponse.json({ error: "تعذر إنشاء رابط البوابة" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensurePortalTables()
    const id = Number(request.nextUrl.searchParams.get("id"))
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "رابط غير صالح" }, { status: 400 })
    await sql`UPDATE customer_portal_links_tbl SET revoked_at=NOW() WHERE id=${id} AND revoked_at IS NULL`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Customer portal link revoke error:", error)
    return NextResponse.json({ error: "تعذر إلغاء الرابط" }, { status: 500 })
  }
}
