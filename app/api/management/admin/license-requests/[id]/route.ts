import { NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import { getManagementPool } from "@/lib/management-db"
import { ensureLicenseTables } from "@/lib/company-license"

// اعتماد طلب زيادة الترخيص (يرفع الحد بالعدد المعتمد) أو رفضه مع سبب.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await getManagementPool().connect()
  try {
    await ensureLicenseTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    const id = Number((await params).id)
    const data = await request.json().catch(() => ({}))
    const action = String(data.action || "")
    if (action !== "approve" && action !== "reject") return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 })
    const note = String(data.note || "").trim() || null
    await client.query("BEGIN")
    const found = await client.query("SELECT * FROM company_license_requests WHERE id = $1 FOR UPDATE", [id])
    const row = found.rows[0]
    if (!row) { await client.query("ROLLBACK"); return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 }) }
    if (row.status !== "pending") { await client.query("ROLLBACK"); return NextResponse.json({ error: "تمت معالجة هذا الطلب مسبقاً" }, { status: 409 }) }
    if (action === "reject") {
      if (!note) { await client.query("ROLLBACK"); return NextResponse.json({ error: "يجب كتابة سبب الرفض" }, { status: 400 }) }
      await client.query("UPDATE company_license_requests SET status = 'rejected', decided_by = $2, decided_at = CURRENT_TIMESTAMP, decision_note = $3 WHERE id = $1", [id, session.id, note])
    } else {
      const quantity = Math.floor(Number(data.approved_quantity ?? row.quantity))
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1000) { await client.query("ROLLBACK"); return NextResponse.json({ error: "العدد المعتمد غير صالح" }, { status: 400 }) }
      const column = row.resource === "branches" ? "number_of_branches" : "number_of_users"
      await client.query(`UPDATE companies SET ${column} = COALESCE(${column}, 1) + $2, license_initialized = true WHERE id = $1`, [row.company_id, quantity])
      await client.query("UPDATE company_license_requests SET status = 'approved', approved_quantity = $2, decided_by = $3, decided_at = CURRENT_TIMESTAMP, decision_note = $4 WHERE id = $1", [id, quantity, session.id, note])
    }
    await client.query("COMMIT")
    return NextResponse.json({ success: true })
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    console.error("[management/admin/license-requests POST] error:", error)
    return NextResponse.json({ error: "تعذر معالجة الطلب" }, { status: 500 })
  } finally {
    client.release()
  }
}
