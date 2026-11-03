import { NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية رفض الشركات" }, { status: 403 })
    }

    const companyId = Number(params.id)
    const result = await managementSql`
      UPDATE companies SET status = 'rejected', approved_by = ${session.id}, approved_at = CURRENT_TIMESTAMP
      WHERE id = ${companyId} AND (status = 'pending' OR (status = 'awaiting_payment' AND EXISTS (SELECT 1 FROM sales_leads l WHERE l.company_id = companies.id AND l.status = 'new')))
      RETURNING id
    `
    if (result.length === 0) return NextResponse.json({ error: "الشركة غير موجودة أو ليست بانتظار الموافقة" }, { status: 404 })

    await managementSql`UPDATE sales_leads SET status = 'rejected' WHERE company_id = ${companyId} AND status = 'new'`.catch(() => undefined)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[management/admin/companies/reject] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء رفض الشركة" }, { status: 500 })
  }
}
