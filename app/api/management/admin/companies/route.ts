import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql from "@/lib/management-db"
import { countTenantUsage, ensureLicenseTables } from "@/lib/company-license"
import { ensureBillingTables, getPricing } from "@/lib/company-billing"
import { priceFor } from "@/lib/company-pricing"

export async function GET(request: NextRequest) {
  try {
    await ensureLicenseTables()
    await ensureBillingTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    }

    const status = request.nextUrl.searchParams.get("status")
    const withUsage = request.nextUrl.searchParams.get("usage") === "1"

    const rows = await managementSql`
      SELECT c.id, c.name, c.status, c.db_name, c.created_at, c.expiry_date,
             COALESCE(c.number_of_users, 1) AS number_of_users, COALESCE(c.number_of_branches, 1) AS number_of_branches,
             COALESCE(c.number_of_pos_points, 0) AS number_of_pos_points, COALESCE(c.number_of_restaurant_locations, 0) AS number_of_restaurant_locations,
             u.full_name AS requested_by_name, u.email AS requested_by_email,
             (SELECT COUNT(*)::int FROM company_license_requests r WHERE r.company_id = c.id AND r.status = 'pending') AS pending_license_requests,
             lead.phone AS lead_phone, lead.whatsapp AS lead_whatsapp, lead.notes AS lead_notes, lead.name AS lead_name, lead.created_at AS lead_created_at
      FROM companies c
      LEFT JOIN users u ON u.id = c.created_by
      -- آخر "بطاقة للمبيعات" لشركة بانتظار الدفع: تظهر في "بانتظار الموافقة" واعتمادها = اتمام الدفع
      LEFT JOIN LATERAL (
        SELECT l.phone, l.whatsapp, l.notes, l.name, l.created_at FROM sales_leads l
        WHERE l.company_id = c.id AND l.status = 'new' AND c.status IN ('awaiting_payment', 'provisioning_failed')
        ORDER BY l.created_at DESC LIMIT 1
      ) lead ON true
      WHERE (${status}::text IS NULL OR c.status = ${status}
             OR (${status}::text = 'pending' AND lead.phone IS NOT NULL))
      ORDER BY c.created_at DESC
    `

    // مبلغ الاشتراك الذي سيُسجَّل كدفعة عند اعتماد شركة "بطاقة المبيعات"
    if (rows.some((row: any) => row.lead_phone)) {
      const pricing = await getPricing()
      for (const row of rows as any[]) {
        if (!row.lead_phone) continue
        const quote = priceFor(pricing, { users: Number(row.number_of_users) || 1, branches: Number(row.number_of_branches) || 1, posPoints: Number(row.number_of_pos_points) || 0, restaurantLocations: Number(row.number_of_restaurant_locations) || 0 })
        row.quote_total = quote.total
        row.quote_currency = quote.currency
      }
    }

    // الاستخدام الفعلي من قاعدة كل شركة (مستخدمون نشطون/فروع غير محذوفة) — اختياري لأنه يفتح اتصالاً لكل شركة.
    if (withUsage) {
      await Promise.all(rows.map(async (row: any) => {
        if (!row.db_name || row.status === "pending" || row.status === "rejected") return
        try {
          row.usage = await countTenantUsage(row.db_name, true)
          row.storage_bytes = row.usage.storage_bytes ?? null
        } catch {
          row.usage = null
          row.storage_bytes = null
        }
      }))
    }

    return NextResponse.json(rows)
  } catch (error) {
    console.error("[management/admin/companies GET] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء جلب الشركات" }, { status: 500 })
  }
}
