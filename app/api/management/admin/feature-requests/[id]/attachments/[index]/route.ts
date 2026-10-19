import { NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; index: string }> }) {
  const session = await getManagementSession()
  if (!session?.is_platform_admin) return NextResponse.json({ error: "لا تملك صلاحية الوصول" }, { status: 403 })
  const { id: rawId, index: rawIndex } = await context.params
  const id = Number(rawId), index = Number(rawIndex)
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(index) || index < 0) return NextResponse.json({ error: "المرفق غير موجود" }, { status: 404 })
  try {
    await ensureManagementTables()
    const rows = await managementSql`SELECT attachments FROM feature_requests WHERE id=${id} LIMIT 1`
    const file = rows[0]?.attachments?.[index]
    if (!file?.data) return NextResponse.json({ error: "المرفق غير موجود" }, { status: 404 })
    const match = String(file.data).match(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/)
    if (!match) return NextResponse.json({ error: "بيانات المرفق غير صالحة" }, { status: 400 })
    const filename = String(file.name || "attachment").replace(/[\r\n"\\]/g, "_")
    return new NextResponse(Buffer.from(match[2], "base64"), { headers: { "Content-Type": match[1], "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("[management feature-request attachment GET]", error)
    return NextResponse.json({ error: "تعذر تحميل المرفق" }, { status: 500 })
  }
}
