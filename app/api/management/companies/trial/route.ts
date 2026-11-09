import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"
import { provisionCompanyDatabase } from "@/lib/provisioning"
import { ensureBillingTables } from "@/lib/company-billing"
import { ensureLicenseTables } from "@/lib/company-license"

const TRIAL_EXPIRY_DAYS = 10
const MAX_TRIALS_PER_USER = 2

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
    // رقم الجوال إلزامي: أرقام فقط (تُحذف المسافات والشرطات) مع + اختيارية في البداية، 9-15 رقماً
    const mobile = String(data.mobile || "").replace(/[\s-]/g, "")
    if (!mobile) return NextResponse.json({ error: "رقم الجوال مطلوب" }, { status: 400 })
    if (!/^\+?\d{9,15}$/.test(mobile)) return NextResponse.json({ error: "رقم الجوال غير صحيح" }, { status: 400 })

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

    await ensureBillingTables()
    // حد النسخ التجريبية: شركتان لكل مستخدم (يشمل ما حُوِّل لاحقاً لنسخة حقيقية)
    const [trials] = await managementSql`SELECT COUNT(*)::int AS n FROM companies WHERE created_by = ${session.id} AND created_as_trial = true`
    if (Number(trials?.n) >= MAX_TRIALS_PER_USER) {
      return NextResponse.json({ error: "لا يمكن إنشاء أكثر من شركتين تجريبيتين لنفس المستخدم", code: "TRIAL_LIMIT" }, { status: 409 })
    }
    const inserted = await managementSql`
      INSERT INTO companies (name, status, created_by, contact_mobile)
      VALUES (${name}, 'pending', ${session.id}, ${mobile})
      RETURNING id, name
    `
    const company = inserted[0]

    // حساب قديم بلا رقم جوال ⇐ يُحفظ رقم الشركة التجريبية عليه
    await managementSql`UPDATE users SET mobile = ${mobile} WHERE id = ${session.id} AND COALESCE(mobile, '') = ''`.catch(() => undefined)

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

    // علامة "نسخة تجريبية" — تتيح لاحقاً "التحويل إلى نسخة حقيقية" بالدفع الإلكتروني
    await ensureBillingTables()
    await managementSql`UPDATE companies SET is_trial = true, created_as_trial = true WHERE id = ${company.id}`

    // ترخيص النسخة التجريبية: نقطة بيع واحدة وموقع مطعم واحد (يعرّفهما المستخدم بنفسه)
    await ensureLicenseTables()
    await managementSql`UPDATE companies SET number_of_pos_points = GREATEST(COALESCE(number_of_pos_points, 0), 1), pos_license_initialized = true,
      number_of_restaurant_locations = GREATEST(COALESCE(number_of_restaurant_locations, 0), 1), restaurant_license_initialized = true WHERE id = ${company.id}`

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
