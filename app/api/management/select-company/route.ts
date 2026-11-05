import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { shouldUseSecureCookies } from "@/lib/cookie-security"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"
import { withTenantDb } from "@/lib/database"
import { authenticateByEmail } from "@/lib/auth"
import { createTenantSession, findActiveSessionElsewhere, type ActiveSessionElsewhere } from "@/lib/tenant-auth"
import { recordManagementLogin } from "@/lib/management-login-audit"

export async function POST(request: NextRequest) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

    const data = await request.json()
    const companyId = Number(data.companyId)
    // المستخدم أكّد في «شركاتي» تسجيل الخروج من الجهاز الآخر والدخول هنا
    const replaceOtherDevices = data.force === true
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
    let activeElsewhere: ActiveSessionElsewhere | null = null
    const authResult = await withTenantDb(company.db_name, async () => {
      const result = await authenticateByEmail(session.email, { ip, userAgent })
      // جهاز واحد لكل مستخدم: جلسة سارية من جهاز آخر ⇐ لا دخول قبل تأكيد المستخدم
      if (result.success && result.user?.id && !replaceOtherDevices) {
        activeElsewhere = await findActiveSessionElsewhere(String(result.user.id))
        if (activeElsewhere) return result
      }
      // بلا هذا، الشاشات التي تتطلب tenant_session (مثل حفظ/تعديل المستخدمين) كانت ترفض كل من
      // يدخل عبر لوحة الإدارة برسالة "يجب تسجيل الدخول" لأن هذا المسار لم يكن يصدر كوكي الجلسة
      // إطلاقاً، خلافاً لمسار تسجيل الدخول المباشر في app/api/auth/login.
      if (result.success && result.user?.id) {
        try {
          await createTenantSession(String(result.user.id), { ip, userAgent, replaceOtherDevices })
        } catch (sessionError) {
          console.error("[management/select-company] Failed to create tenant session:", sessionError)
        }
      }
      return result
    })

    if (activeElsewhere) {
      return NextResponse.json({
        error: "حسابك مسجَّل الدخول الآن من جهاز آخر",
        code: "active_elsewhere",
        device: activeElsewhere,
        account: { name: authResult.user?.fullName || null, email: authResult.user?.email || null },
      }, { status: 409 })
    }

    if (!authResult.success || !authResult.user || !authResult.token) {
      return NextResponse.json(
        { error: authResult.error || "لا يوجد مستخدم فعّال بهذا البريد في قاعدة بيانات الشركة" },
        { status: 403 },
      )
    }

    try {
      await recordManagementLogin({
        managementUserId: session.id,
        tenantUserId: authResult.user.id,
        email: authResult.user.email,
        name: authResult.user.fullName,
        companyId: Number(company.id),
        dbName: company.db_name,
        loginType: "company-switch",
        ipAddress: ip.split(",")[0].trim(),
        userAgent,
      })
    } catch (auditError) {
      console.error("[management/select-company] Failed to write central login audit:", auditError)
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
