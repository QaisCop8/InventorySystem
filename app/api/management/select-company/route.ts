import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"
import { withTenantDb } from "@/lib/database"
import { authenticateByEmail } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

    const data = await request.json()
    const companyId = Number(data.companyId)
    if (!companyId) return NextResponse.json({ error: "معرّف الشركة مطلوب" }, { status: 400 })

    const rows = await managementSql`
      SELECT c.id, c.db_name, c.status
      FROM companies c
      JOIN user_company uc ON uc.company_id = c.id
      WHERE uc.user_id = ${session.id} AND c.id = ${companyId}
    `
    if (rows.length === 0) return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الشركة" }, { status: 403 })

    const company = rows[0]
    if (company.status !== "approved" || !company.db_name) {
      return NextResponse.json({ error: "الشركة لم تُعتمَد بعد" }, { status: 400 })
    }

    const cookieStore = await cookies()
    cookieStore.set("tenant_db", company.db_name, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })

    // تسجيل دخول تلقائي على قاعدة الشركة المُختارة باستخدام بريد حساب الإدارة نفسه — بلا حاجة
    // لطلب كلمة مرور ثانية، فالهوية مُثبَتة أصلاً عبر جلسة الإدارة أعلاه. withTenantDb يضمن تنفيذ
    // الاستعلام على قاعدة الشركة الصحيحة ضمن هذا الطلب تحديداً، بصرف النظر عن كوكي tenant_db.
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"
    const authResult = await withTenantDb(company.db_name, () =>
      authenticateByEmail(session.email, { ip, userAgent }),
    )

    return NextResponse.json({
      success: true,
      dbName: company.db_name,
      companyId: company.id,
      ...(authResult.success ? { user: authResult.user, token: authResult.token } : {}),
    })
  } catch (error) {
    console.error("[management/select-company] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء اختيار الشركة" }, { status: 500 })
  }
}
