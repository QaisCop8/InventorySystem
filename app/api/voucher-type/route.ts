import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"

// نوع سند برقمه (voucher_header_tbl.vch_type) — يتحقق رابط ?voucher_id= أن السند من نوع الشاشة قبل فتحه
export async function GET(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  const id = Number(request.nextUrl.searchParams.get("id"))
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "رقم غير صالح" }, { status: 400 })
  const row = (await sql`SELECT vch_type FROM voucher_header_tbl WHERE id = ${id}`)[0] as any
  return NextResponse.json({ vch_type: row ? Number(row.vch_type) : null })
}
