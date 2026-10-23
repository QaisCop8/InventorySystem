import { NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql from "@/lib/management-db"
import { ensureBillingTables, getPricing, getSalesContacts, priceFor } from "@/lib/company-billing"
import { isLahzaConfigured, isLahzaTestMode, lahzaPublicKey } from "@/lib/lahza"

// بيانات صفحة "خيارات الدفع" لشركة بانتظار الدفع: الشركة، تفصيل السعر، أرقام المبيعات، وتوفر الدفع الإلكتروني.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureBillingTables()
    const companyId = Number((await params).id)
    const [company] = await managementSql`
      SELECT c.id, c.name, c.status, c.number_of_users, c.number_of_branches, c.number_of_pos_points, c.number_of_restaurant_locations
      FROM companies c JOIN user_company uc ON uc.company_id = c.id
      WHERE c.id = ${companyId} AND uc.user_id = ${session.id} AND COALESCE(uc.is_active, true) = true`
    if (!company) return NextResponse.json({ error: "الشركة غير موجودة" }, { status: 404 })
    const counts = { users: Number(company.number_of_users) || 1, branches: Number(company.number_of_branches) || 1, posPoints: Number(company.number_of_pos_points) || 0, restaurantLocations: Number(company.number_of_restaurant_locations) || 0 }
    const [pricing, contacts] = await Promise.all([getPricing(), getSalesContacts()])
    return NextResponse.json({
      company: { id: Number(company.id), name: String(company.name), status: String(company.status) },
      counts,
      quote: priceFor(pricing, counts),
      contacts,
      user: { name: session.full_name, email: session.email },
      online: isLahzaConfigured() && pricing.base_price > 0,
      popup: Boolean(lahzaPublicKey()),
      testMode: isLahzaTestMode(),
    })
  } catch (error) {
    console.error("[management/companies/checkout] error:", error)
    return NextResponse.json({ error: "تعذّر تحميل خيارات الدفع" }, { status: 500 })
  }
}
