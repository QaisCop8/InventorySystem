import { NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

const statuses = ["جديد", "في انتظار الموافقة", "قيد التطوير", "تمت", "مرفوض", "تمت باصدار سابق"]

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getManagementSession()
  if (!session?.is_platform_admin) return NextResponse.json({ error: "لا تملك صلاحية الوصول" }, { status: 403 })
  const id = Number((await context.params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "الرسالة غير صالحة" }, { status: 400 })
  const { status } = await request.json()
  if (!statuses.includes(String(status))) return NextResponse.json({ error: "حالة الرسالة غير صالحة" }, { status: 400 })
  try {
    await ensureManagementTables()
    const rows = await managementSql`UPDATE feature_requests SET status=${String(status)}, updated_at=CURRENT_TIMESTAMP WHERE id=${id}
      RETURNING id, status, updated_at`
    if (!rows.length) return NextResponse.json({ error: "الرسالة غير موجودة" }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("[management feature-requests PATCH]", error)
    return NextResponse.json({ error: "تعذر تحديث حالة الرسالة" }, { status: 500 })
  }
}
