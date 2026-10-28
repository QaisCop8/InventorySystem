import { type NextRequest, NextResponse } from "next/server"
import { findUsages, usageMessage } from "@/lib/delete-guard"
import sql from "@/lib/database"
import { costCenterNameTaken, ensureCostCenterTables } from "@/lib/cost-centers-schema"

// تعديل مركز التكلفة (الاسم، النوع، المركز الأب، الحالة) — لم يكن لهذا المسار PUT فكان التعديل والتجميد يفشلان
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureCostCenterTables()
    const id = Number((await params).id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "المعرّف غير صالح" }, { status: 400 })
    const data = await request.json()
    const name = String(data.name ?? "").trim()
    if (!name) return NextResponse.json({ error: "اسم مركز التكلفة مطلوب" }, { status: 400 })
    const status = Number(data.status ?? 1)
    if (![1, 2].includes(status)) return NextResponse.json({ error: "الحالة يجب أن تكون فعال أو مجمد" }, { status: 400 })
    const costTypeId = Number(data.cost_type_id)
    const parentId = data.parent_id == null || data.parent_id === "" ? null : Number(data.parent_id)

    const row = (await sql`SELECT id FROM cost_centers WHERE id = ${id} AND COALESCE(status, 1) <> 3`)[0]
    if (!row) return NextResponse.json({ error: "مركز التكلفة غير موجود" }, { status: 404 })
    if (!(await sql`SELECT id FROM cost_center_types WHERE id = ${costTypeId} AND COALESCE(status, 1) <> 3`).length) {
      return NextResponse.json({ error: "نوع مركز التكلفة غير موجود" }, { status: 400 })
    }
    // المراكز المحذوفة لا تمنع الاسم
    if (await costCenterNameTaken("cost_centers", name, id)) return NextResponse.json({ error: "اسم مركز التكلفة موجود مسبقاً" }, { status: 400 })

    let level = 1
    if (parentId != null) {
      if (parentId === id) return NextResponse.json({ error: "لا يمكن أن يكون المركز أباً لنفسه" }, { status: 400 })
      const parent = (await sql`SELECT id, level FROM cost_centers WHERE id = ${parentId} AND COALESCE(status, 1) <> 3`)[0] as any
      if (!parent) return NextResponse.json({ error: "المركز الأب غير موجود" }, { status: 400 })
      // المركز الأب لا يكون من فروع هذا المركز (يمنع الحلقات)
      const loop = await sql`
        WITH RECURSIVE descendants AS (
          SELECT id FROM cost_centers WHERE parent_id = ${id}
          UNION SELECT c.id FROM cost_centers c JOIN descendants d ON c.parent_id = d.id
        ) SELECT 1 FROM descendants WHERE id = ${parentId} LIMIT 1
      `
      if ((loop as any[]).length) return NextResponse.json({ error: "لا يمكن اختيار أحد فروع المركز كمركز أب له" }, { status: 400 })
      level = Number(parent.level || 1) + 1
    }

    const result = await sql`
      UPDATE cost_centers
      SET name = ${name}, cost_type_id = ${costTypeId}, parent_id = ${parentId}, level = ${level}, status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, cost_type_id, parent_id, level, status, created_at, updated_at
    `
    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[update cost_centers]", error)
    return NextResponse.json({ error: "تعذر تعديل مركز التكلفة" }, { status: 500 })
  }
}

// حذف مركز التكلفة: يُرفض إن كان له فروع أو مستخدماً في حركات/تعريفات (lib/delete-guard.ts)، وإلا يُعلَّم محذوفاً (status = 3)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureCostCenterTables()
    const id = Number((await params).id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "المعرّف غير صالح" }, { status: 400 })
    const row = (await sql`SELECT * FROM cost_centers WHERE id = ${id}`)[0] as any
    if (!row) return NextResponse.json({ error: "السجل غير موجود" }, { status: 404 })
    const child = (await sql`SELECT name FROM cost_centers WHERE parent_id = ${id} AND COALESCE(status, 1) <> 3 LIMIT 1`)[0] as any
    if (child) return NextResponse.json({ error: `لا يمكن حذف مركز التكلفة "${row.name || ""}" لأن له فروعاً (مثل "${child.name}") — احذف الفروع أولاً` }, { status: 400 })
    const usages = await findUsages(id, { idColumns: /^(cost_center_id|costcenter_id|default_cost_center_id|.+_cost_center_id)$/, excludeTables: ["cost_centers"] })
    if (usages.length) return NextResponse.json({ error: usageMessage("مركز التكلفة", String(row.name || ""), usages) }, { status: 400 })
    await sql`UPDATE cost_centers SET status = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error("[delete cost_centers]", error)
    return NextResponse.json({ error: "تعذر حذف مركز التكلفة" }, { status: 500 })
  }
}
