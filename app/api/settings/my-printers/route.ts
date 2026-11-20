import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { runSchemaOnce } from "@/lib/schema-once"

const ensureUserPrinterColumns = () => runSchemaOnce("app/api/settings/my-printers/route.ts#columns", async () => {
  await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS default_printer VARCHAR(200)`
  await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pos_printer VARCHAR(200)`
})

export const dynamic = "force-dynamic"

// طابعات المستخدم الحالي (تُعرَّف في «اعدادات» — الحسابات والمستودعات الافتراضية): lib/user-printers.ts
//   default_printer: كل الصفحات والتقارير (الطباعة المباشرة عبر المشغّل/CashService)
//   pos_printer: الكاشير والمطاعم (إيصال البيع، الحساب، قسائم المطبخ بلا طابعة صنف/مجموعة)
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser(request)
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureUserPrinterColumns()
    const [row] = await sql`SELECT default_printer, pos_printer FROM user_settings WHERE user_id = ${Number(session.user_id)} LIMIT 1` as any[]
    return NextResponse.json(
      { default_printer: String(row?.default_printer || ""), pos_printer: String(row?.pos_printer || "") },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("my-printers GET", error)
    return NextResponse.json({ default_printer: "", pos_printer: "" })
  }
}
