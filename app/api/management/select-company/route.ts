import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { shouldUseSecureCookies } from "@/lib/cookie-security"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"
import { withTenantDb } from "@/lib/database"
import { authenticateByEmail } from "@/lib/auth"
import { createTenantSession } from "@/lib/tenant-auth"

export async function POST(request: NextRequest) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

    const data = await request.json()
    const companyId = Number(data.companyId)
    if (!companyId) return NextResponse.json({ error: "معرّف الشركة مطلوب" }, { status: 400 })

    const rows = await managementSql`
      SELECT c.id, c.db_name, c.status, c.expiry_date
      FROM companies c
      JOIN user_company uc ON uc.company_id = c.id
      WHERE uc.user_id = ${session.id} AND c.id = ${companyId} AND COALESCE(uc.is_active, true) = true
    `
    if (rows.length === 0) return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الشركة" }, { status: 403 })

    const company = rows[0]
    // موقوفة إدارياً (ايقاف من لوحة التحكم) — نفس رسالة انتهاء الاشتراك أدناه؛ زر "تمديد الاشتراك"
    // بلوحة التحكم يُعيدها لحالة approved فيعالج الحالتين معاً بإجراء واحد من جهة المسؤول.
    if (company.status === "stopped") {
      return NextResponse.json({ error: "يجب الاتصال بالشركة المزودة للنظام لتمديد الاشتراك" }, { status: 403 })
    }
    if (company.status !== "approved" || !company.db_name) {
      return NextResponse.json({ error: "الشركة لم تُعتمَد بعد" }, { status: 400 })
    }
    // منتهي اشتراكها (expiry_date تجاوز الآن) — لا كوكي tenant_db يُضبَط ولا تسجيل دخول تلقائي
    // ينفَّذ، فيبقى المستخدم دون دخول فعلياً (يبقى على شركته الحالية إن كان يبدّل من الهيدر، أو
    // يبقى بصفحة الشركات دون دخول إن كان يختارها من هناك للمرة الأولى).
    const isExpired = company.expiry_date && new Date(company.expiry_date).getTime() < Date.now()
    if (isExpired) {
      return NextResponse.json({ error: "يجب الاتصال بالشركة المزودة للنظام لتمديد الاشتراك" }, { status: 403 })
    }

    // تسجيل دخول تلقائي على قاعدة الشركة المُختارة باستخدام بريد حساب الإدارة نفسه — بلا حاجة
    // لطلب كلمة مرور ثانية، فالهوية مُثبَتة أصلاً عبر جلسة الإدارة أعلاه. withTenantDb يضمن تنفيذ
    // الاستعلام على قاعدة الشركة الصحيحة ضمن هذا الطلب تحديداً، بصرف النظر عن كوكي tenant_db.
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"
    const authResult = await withTenantDb(company.db_name, async () => {
      const result = await authenticateByEmail(session.email, { ip, userAgent })
      // بلا هذا، الشاشات التي تتطلب tenant_session (مثل حفظ/تعديل المستخدمين) كانت ترفض كل من
      // يدخل عبر لوحة الإدارة برسالة "يجب تسجيل الدخول" لأن هذا المسار لم يكن يصدر كوكي الجلسة
      // إطلاقاً، خلافاً لمسار تسجيل الدخول المباشر في app/api/auth/login.
      if (result.success && result.user?.id) {
        try {
          await createTenantSession(String(result.user.id))
        } catch (sessionError) {
          console.error("[management/select-company] Failed to create tenant session:", sessionError)
        }
      }
      return result
    })

    if (!authResult.success || !authResult.user || !authResult.token) {
      return NextResponse.json(
        { error: authResult.error || "لا يوجد مستخدم فعّال بهذا البريد في قاعدة بيانات الشركة" },
        { status: 403 },
      )
    }

    // لا تُثبَّت قاعدة الشركة في الكوكي إلا بعد نجاح التحقق من وجود المستخدم داخلها. اسم القاعدة
    // نفسه جاء حصراً من management.companies.db_name بعد فحص user_company أعلاه.
    const cookieStore = await cookies()
    cookieStore.set("tenant_db", company.db_name, {
      httpOnly: true,
      secure: await shouldUseSecureCookies(),
      sameSite: "lax",
      path: "/",
    })

    return NextResponse.json({
      success: true,
      dbName: company.db_name,
      companyId: company.id,
      user: authResult.user,
      token: authResult.token,
    })
  } catch (error) {
    console.error("[management/select-company] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء اختيار الشركة" }, { status: 500 })
  }
}
