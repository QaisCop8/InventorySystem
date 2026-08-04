import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"
import { provisionCompanyDatabase } from "@/lib/provisioning"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الموافقة على الشركات" }, { status: 403 })
    }

    const companyId = Number(params.id)
    const rows = await managementSql`
      SELECT c.id, c.name, c.status, u.email AS requested_by_email, u.full_name AS requested_by_name, u.password_hash AS requested_by_password_hash
      FROM companies c
      JOIN users u ON u.id = c.created_by
      WHERE c.id = ${companyId}
    `
    if (rows.length === 0) return NextResponse.json({ error: "الشركة غير موجودة" }, { status: 404 })

    const company = rows[0]
    if (company.status !== "pending") {
      return NextResponse.json({ error: "هذه الشركة ليست بانتظار الموافقة" }, { status: 400 })
    }

    const { dbName } = await provisionCompanyDatabase(
      {
        id: company.id,
        name: company.name,
        requestedByEmail: company.requested_by_email,
        requestedByFullName: company.requested_by_name,
        requestedByPasswordHash: company.requested_by_password_hash,
      },
      session.id,
    )

    return NextResponse.json({ success: true, dbName })
  } catch (error) {
    console.error("[management/admin/companies/approve] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء اعتماد الشركة" }, { status: 500 })
  }
}
