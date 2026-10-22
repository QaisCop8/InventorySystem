import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { findUsages, usageMessage } from "@/lib/delete-guard"

// حذف نوع تصنيف الحساب: يُرفض إن كان مستخدماً في تعريفات أخرى أو حركات (lib/delete-guard.ts)، وإلا يُعلَّم محذوفاً (status = 3)
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "المعرّف غير صالح" }, { status: 400 })
    const row = (await sql`SELECT * FROM account_classification_types WHERE id = ${id}`)[0] as any
    if (!row) return NextResponse.json({ error: "السجل غير موجود" }, { status: 404 })
    const usages = await findUsages(id, { idColumns: /^classification_type_id$/, excludeTables: ["account_classification_types"] })
    if (usages.length) return NextResponse.json({ error: usageMessage("نوع تصنيف الحساب", String(row.name || ""), usages) }, { status: 400 })
    await sql`UPDATE account_classification_types SET status = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error("[delete account_classification_types]", error)
    return NextResponse.json({ error: "تعذر حذف نوع تصنيف الحساب" }, { status: 500 })
  }
}
