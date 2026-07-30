import { type NextRequest, NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import managementSql from "@/lib/management-db"

// نفس تحديد قاعدة الشركة الحالية في lib/database.ts (resolveCurrentDbName: هيدر x-tenant-db أولاً،
// ثم كوكي tenant_db) لكن بلا تصفية isApprovedTenantDb — هذه هي بالضبط الحالة التي نريد اكتشافها هنا
// (شركة أُوقِفت أو انتهى اشتراكها بعد أن اختارها المستخدم فعلاً)، فتصفية resolveCurrentDbName نفسها
// كانت ستُخفي هذه الحالة بإرجاعها القاعدة الافتراضية بصمت بدل الإبلاغ عنها.
function readTenantDbName(headerStore: Headers, cookieDb?: string): string | null {
  const headerDb = headerStore.get("x-tenant-db")
  if (headerDb && /^[a-zA-Z0-9_]+$/.test(headerDb)) return headerDb
  if (cookieDb && /^[a-zA-Z0-9_]+$/.test(cookieDb)) return cookieDb
  return null
}

export async function GET(_request: NextRequest) {
  try {
    const headerStore = await headers()
    const cookieStore = await cookies()
    const dbName = readTenantDbName(headerStore, cookieStore.get("tenant_db")?.value)

    if (!dbName) {
      return NextResponse.json({ hasCompany: false, blocked: false })
    }

    const rows = await managementSql`
      SELECT status, expiry_date FROM companies WHERE db_name = ${dbName} LIMIT 1
    `
    if (rows.length === 0) {
      return NextResponse.json({ hasCompany: false, blocked: false })
    }

    const company = rows[0]
    const stopped = company.status === "stopped"
    const expired = !!company.expiry_date && new Date(company.expiry_date).getTime() < Date.now()

    return NextResponse.json({
      hasCompany: true,
      status: company.status,
      expiryDate: company.expiry_date,
      stopped,
      expired,
      blocked: stopped || expired,
    })
  } catch (error) {
    console.error("[company-status] error:", error)
    // فشل التحقق نفسه (خطأ اتصال بقاعدة الإدارة مثلاً) لا يُعامَل كحظر — لا نُحوِّل مستخدماً نشطاً
    // فعلياً بسبب عطل عابر بفحص لا علاقة له بصلاحية جلسته.
    return NextResponse.json({ hasCompany: false, blocked: false }, { status: 200 })
  }
}
