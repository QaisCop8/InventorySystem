import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"

// اسم ورقم واتساب العميل/المورد المرتبط بحساب — لزر "واتساب" في الحركات (إرسال السند PDF).
export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const accountId = Number(request.nextUrl.searchParams.get("account_id") || 0)
    if (!Number.isInteger(accountId) || accountId <= 0) return NextResponse.json({ name: "", phone: "" })
    const row = (await sql`
      SELECT COALESCE(NULLIF(BTRIM(c.name), ''), a.name) name,
        COALESCE(NULLIF(BTRIM(c.whatsapp1), ''), NULLIF(BTRIM(c.whatsapp2), ''), NULLIF(BTRIM(c.mobile1), ''), NULLIF(BTRIM(c.mobile2), ''), '') phone
      FROM account_tbl a
      LEFT JOIN customers c ON c.account_id = a.id AND COALESCE(c.isDeleted, false) = false
      WHERE a.id = ${accountId}
      LIMIT 1
    `)[0] as any
    return NextResponse.json({ name: String(row?.name || ""), phone: String(row?.phone || "") })
  } catch (error) {
    console.error("[customers] contact failed", error)
    return NextResponse.json({ name: "", phone: "" })
  }
}
