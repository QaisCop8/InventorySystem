import { type NextRequest, NextResponse } from "next/server"
import { findUsages, usageMessage } from "@/lib/delete-guard"
import sql from "@/lib/database"
import { costCenterNameTaken, ensureCostCenterTables } from "@/lib/cost-centers-schema"

// تعديل نوع مركز التكلفة (الاسم/الحالة) — كان هذا المسار نسخة من مسار المدن فيعدّل جدول cities بدل الأنواع
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureCostCenterTables()
    const id = Number((await params).id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "المعرّف غير صالح" }, { status: 400 })
    const data = await request.json()
    const name = String(data.name ?? "").trim()
    if (!name) return NextResponse.json({ error: "اسم النوع مطلوب" }, { status: 400 })
    const status = Number(data.status ?? 1)
    if (![1, 2].includes(status)) return NextResponse.json({ error: "الحالة يجب أن تكون فعال أو مجمد" }, { status: 400 })
    const row = (await sql`SELECT id FROM cost_center_types WHERE id = ${id} AND COALESCE(status, 1) <> 3`)[0]
    if (!row) return NextResponse.json({ error: "نوع مركز التكلفة غير موجود" }, { status: 404 })
    // الأنواع المحذوفة لا تمنع الاسم
    if (await costCenterNameTaken("cost_center_types", name, id)) return NextResponse.json({ error: "اسم النوع موجود مسبقاً" }, { status: 400 })
    const result = await sql`
      UPDATE cost_center_types SET name = ${name}, status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, status, created_at, updated_at
    `
    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[update cost_center_types]", error)
    return NextResponse.json({ error: "تعذر تعديل نوع مركز التكلفة" }, { status: 500 })
  }
}

// حذف نوع مركز التكلفة: يُرفض إن كان له مراكز تكلفة أو مستخدماً في إعدادات الحسابات/الأصناف/المستودعات (lib/delete-guard.ts)، وإلا يُعلَّم محذوفاً (status = 3)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureCostCenterTables()
    const id = Number((await params).id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "المعرّف غير صالح" }, { status: 400 })
    const row = (await sql`SELECT * FROM cost_center_types WHERE id = ${id}`)[0] as any
    if (!row) return NextResponse.json({ error: "السجل غير موجود" }, { status: 404 })
    const usages = await findUsages(id, { idColumns: /^(cost_type_id|cost_center_type_id)$/, excludeTables: ["cost_center_types"] })
    if (usages.length) return NextResponse.json({ error: usageMessage("نوع مركز التكلفة", String(row.name || ""), usages) }, { status: 400 })
    await sql`UPDATE cost_center_types SET status = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error("[delete cost_center_types]", error)
    return NextResponse.json({ error: "تعذر حذف نوع مركز التكلفة" }, { status: 500 })
  }
}
