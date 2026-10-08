import { NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql from "@/lib/management-db"
import { countTenantUsage, ensureLicenseTables } from "@/lib/company-license"

// تعديل الترخيص مباشرة من مسؤول المنصة: عدد المستخدمين والفروع المسموح بها للشركة.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureLicenseTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    const companyId = Number((await params).id)
    const data = await request.json().catch(() => ({}))
    const users = Math.floor(Number(data.number_of_users)), branches = Math.floor(Number(data.number_of_branches))
    if (!Number.isFinite(users) || users < 1 || users > 100000) return NextResponse.json({ error: "عدد المستخدمين يجب أن يكون 1 أو أكثر" }, { status: 400 })
    if (!Number.isFinite(branches) || branches < 1 || branches > 100000) return NextResponse.json({ error: "عدد الفروع يجب أن يكون 1 أو أكثر" }, { status: 400 })
    const company = (await managementSql`SELECT id, db_name, status FROM companies WHERE id = ${companyId}`)[0]
    if (!company) return NextResponse.json({ error: "الشركة غير موجودة" }, { status: 404 })
    // لا يُسمح بحد أقل من الاستخدام الحالي (وإلا تصبح الشركة مخالفة للترخيص فوراً).
    if (company.db_name && company.status !== "pending") {
      const usage = await countTenantUsage(company.db_name).catch(() => null)
      if (usage && users < usage.users) return NextResponse.json({ error: `لدى الشركة ${usage.users} مستخدم نشط حالياً — لا يمكن تحديد عدد أقل` }, { status: 400 })
      if (usage && branches < usage.branches) return NextResponse.json({ error: `لدى الشركة ${usage.branches} فرع حالياً — لا يمكن تحديد عدد أقل` }, { status: 400 })
    }
    await managementSql`UPDATE companies SET number_of_users = ${users}, number_of_branches = ${branches}, license_initialized = true WHERE id = ${companyId}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[management/admin/companies/license] error:", error)
    return NextResponse.json({ error: "تعذر تحديث الترخيص" }, { status: 500 })
  }
}
