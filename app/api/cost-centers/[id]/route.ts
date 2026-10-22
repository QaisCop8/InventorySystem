import { NextRequest, NextResponse } from "next/server"
import { findUsages, usageMessage } from "@/lib/delete-guard"
import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

const ensureCostCenterTypesTable = async () => { return runSchemaOnce("app/api/cost-centers/[id]/route.ts#ensureCostCenterTypesTable", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS cost_center_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
}) }

export async function GET() {
  try {
    await ensureCostCenterTypesTable()

    const items = await sql`
      SELECT id, name, status, created_at, updated_at
      FROM cost_center_types
      WHERE status IN (1, 2)
      ORDER BY id DESC
    `

    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching cost center types:", error)
    return NextResponse.json({ error: "Failed to fetch cost center types" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureCostCenterTypesTable()

    const data = await request.json()

    if (!data.name || !String(data.name).trim()) {
      return NextResponse.json({ error: "اسم النوع مطلوب" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)
    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM cost_center_types WHERE LOWER(name) = LOWER(${String(data.name).trim()})
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم النوع موجود مسبقاً" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO cost_center_types (name, status)
      VALUES (${String(data.name).trim()}, ${status})
      RETURNING id, name, status, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating cost center type:", error)
    return NextResponse.json({ error: "Failed to create cost center type" }, { status: 500 })
  }
}

// حذف مركز التكلفة: يُرفض إن كان مستخدماً في تعريفات أخرى أو حركات (lib/delete-guard.ts)، وإلا يُعلَّم محذوفاً (status = 3)
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
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
