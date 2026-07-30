import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"
import { provisionCompanyDatabase } from "@/lib/provisioning"

const TRIAL_EXPIRY_DAYS = 10

// شركة تجريبية: خلافاً لـ/api/management/companies (POST) العادية — التي تُنشئ الشركة بحالة
// 'pending' بانتظار موافقة مسؤول المنصة يدوياً عبر لوحة الإدارة — هذا المسار يُزوِّد قاعدة الشركة
// فوراً ضمن نفس الطلب (self-service) بلا انتظار موافقة، باشتراك محدود بـTRIAL_EXPIRY_DAYS يوماً فقط
// من لحظة الإنشاء بدل السنة الافتراضية.
export async function POST(request: NextRequest) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

    const data = await request.json()
    const name = String(data.name || "").trim()
    if (!name) return NextResponse.json({ error: "اسم الشركة مطلوب" }, { status: 400 })

    // نفس فحص التكرار في /api/management/companies (POST) العادية — بلا حساسية لحالة الأحرف/
    // المسافات الطرفية، عبر كل الشركات.
    const duplicate = await managementSql`
      SELECT id FROM companies WHERE LOWER(TRIM(name)) = LOWER(${name}) LIMIT 1
    `
    if (duplicate.length > 0) {
      return NextResponse.json({ error: "اسم الشركة مكرر يرجى اختيار اسم اخر" }, { status: 400 })
    }

    // password_hash غير موجود بكائن الجلسة (يُستبعَد صراحة عند بنائها — انظر management-auth.ts)
    // إذ لا حاجة له عادة؛ يُقرأ هنا مباشرة لأن provisionCompanyDatabase يحتاجه لبذر حساب "admin"
    // بقاعدة الشركة الجديدة بنفس كلمة مرور حساب الإدارة، تماماً كمسار الاعتماد اليدوي العادي.
    const userRows = await managementSql`
      SELECT password_hash FROM users WHERE id = ${session.id}
    `
    if (userRows.length === 0) return NextResponse.json({ error: "تعذّر العثور على المستخدم" }, { status: 404 })

    const inserted = await managementSql`
      INSERT INTO companies (name, status, created_by)
      VALUES (${name}, 'pending', ${session.id})
      RETURNING id, name
    `
    const company = inserted[0]

    await managementSql`
      INSERT INTO user_company (user_id, company_id, role)
      VALUES (${session.id}, ${company.id}, 'owner')
    `

    const { dbName, expiryDate } = await provisionCompanyDatabase(
      {
        id: company.id,
        name: company.name,
        requestedByEmail: session.email,
        requestedByFullName: session.full_name,
        requestedByPasswordHash: userRows[0].password_hash,
      },
      session.id,
      { expiryDays: TRIAL_EXPIRY_DAYS },
    )

    return NextResponse.json({ success: true, dbName, expiryDate })
  } catch (error) {
    console.error("[management/companies/trial] error:", error)
    // تفصيل الخطأ الفعلي مُرفَق مؤقتاً (detail) — هذا المسار يُنشئ قاعدة بيانات كاملة فعلياً
    // (provisionCompanyDatabase) وله عدة نقاط فشل محتملة (CREATE DATABASE، نسخ المخطط المرجعي،
    // بذر البيانات...)؛ رسالة "حدث خطأ" وحدها بلا التفصيل لا تكفي لتشخيص أيها فشل فعلياً.
    return NextResponse.json(
      { error: "حدث خطأ أثناء إنشاء الشركة التجريبية", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
