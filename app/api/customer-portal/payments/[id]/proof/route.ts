import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensurePortalTables } from "@/lib/customer-portal"

// ملف إشعار التحويل المرفوع من العميل (للموظفين فقط)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensurePortalTables()
    const id = Number((await params).id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "دفعة غير صالحة" }, { status: 400 })
    const [row] = await sql`SELECT proof_data, proof_mime, proof_name FROM customer_portal_payments_tbl WHERE id=${id}`
    if (!row?.proof_data) return NextResponse.json({ error: "لا يوجد ملف" }, { status: 404 })
    const data = row.proof_data instanceof Uint8Array ? row.proof_data : Buffer.from(row.proof_data)
    return new NextResponse(data, {
      headers: {
        "Content-Type": String(row.proof_mime || "application/octet-stream"),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(row.proof_name || "proof"))}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("Customer portal proof error:", error)
    return NextResponse.json({ error: "تعذر تحميل الملف" }, { status: 500 })
  }
}
