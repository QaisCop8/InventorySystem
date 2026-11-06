import { type NextRequest, NextResponse } from "next/server"
import { findUsages, usageMessage } from "@/lib/delete-guard"
import sql from "@/lib/database"
import { ensurePaymentClassificationsTable } from "@/lib/payment-classifications"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensurePaymentClassificationsTable()
    const id = Number(params.id)
    if (!Number.isFinite(id)) return NextResponse.json({ error: "معرف تصنيف الدفعة غير صالح" }, { status: 400 })

    const body = await request.json()
    const name = String(body.name || "").trim().slice(0, 100)
    if (!name) return NextResponse.json({ error: "اسم تصنيف الدفعة مطلوب" }, { status: 400 })

    const duplicate = await sql`
      SELECT id FROM payment_classifications_tbl
      WHERE LOWER(TRIM(name)) = LOWER(${name}) AND id <> ${id}
      LIMIT 1
    `
    if (duplicate.length > 0) return NextResponse.json({ error: "اسم تصنيف الدفعة مكرر لا يمكن الاستمرار" }, { status: 409 })

    const updated = await sql`
      UPDATE payment_classifications_tbl SET name = ${name}
      WHERE id = ${id} AND COALESCE(status, 1) <> 3
      RETURNING id, name, status
    `
    if (updated.length === 0) return NextResponse.json({ error: "تصنيف الدفعة غير موجود" }, { status: 404 })
    return NextResponse.json(updated[0])
  } catch (error) {
    console.error("Error updating payment classification:", error)
    return NextResponse.json({ error: "Failed to update payment classification" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensurePaymentClassificationsTable()
    const id = Number(params.id)
    if (!Number.isFinite(id)) return NextResponse.json({ error: "معرف تصنيف الدفعة غير صالح" }, { status: 400 })

    // فحص الارتباط قبل الحذف: لا يُحذف تصنيف مستخدم في سندات (lib/delete-guard.ts)
    const row = (await sql`SELECT name FROM payment_classifications_tbl WHERE id = ${id}`)[0] as any
    const usages = await findUsages(id, { idColumns: /^payment_classification_id$/, excludeTables: ["payment_classifications_tbl"] })
    if (usages.length) return NextResponse.json({ error: usageMessage("تصنيف الدفعة", String(row?.name || ""), usages) }, { status: 400 })

    const deleted = await sql`UPDATE payment_classifications_tbl SET status = 3 WHERE id = ${id} RETURNING id`
    if (deleted.length === 0) return NextResponse.json({ error: "تصنيف الدفعة غير موجود" }, { status: 404 })
    return NextResponse.json({ success: true, id: deleted[0].id })
  } catch (error) {
    console.error("Error deleting payment classification:", error)
    return NextResponse.json({ error: "Failed to delete payment classification" }, { status: 500 })
  }
}
