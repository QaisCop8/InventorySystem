import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"

// مندوب العميل الافتراضي لشاشات الحركات: customers.salesman يحفظ المندوب كنص (اسمه غالباً، أو رمزه/معرّفه
// في بيانات قديمة) ⇐ يُطابَق مع salesmen. لا مندوب/غير موجود ⇐ salesman_id = null (تبقى قيمة الشاشة كما هي).
export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const accountId = Number(request.nextUrl.searchParams.get("account_id") || 0)
    if (!Number.isInteger(accountId) || accountId <= 0) return NextResponse.json({ salesman_id: null })
    const row = (await sql`
      SELECT s.id, s.name
      FROM customers c
      JOIN salesmen s ON BTRIM(c.salesman) <> ''
        AND (BTRIM(c.salesman) = BTRIM(s.name) OR UPPER(BTRIM(c.salesman)) = UPPER(BTRIM(s.code)) OR BTRIM(c.salesman) = s.id::text)
      WHERE c.account_id = ${accountId} AND COALESCE(c.isDeleted, false) = false AND COALESCE(s.is_active, true) = true
      ORDER BY CASE WHEN BTRIM(c.salesman) = s.id::text THEN 0 WHEN UPPER(BTRIM(c.salesman)) = UPPER(BTRIM(s.code)) THEN 1 ELSE 2 END, s.id
      LIMIT 1
    `)[0] as any
    return NextResponse.json(row ? { salesman_id: Number(row.id), salesman_name: String(row.name || "") } : { salesman_id: null })
  } catch (error) {
    console.error("[customers] default-salesman failed", error)
    return NextResponse.json({ salesman_id: null })
  }
}
