import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureCostCentersTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS cost_centers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      cost_type_id INTEGER NOT NULL,
      parent_id INTEGER NULL,
      level INTEGER NOT NULL DEFAULT 1,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT cost_centers_cost_type_fk
        FOREIGN KEY (cost_type_id) REFERENCES cost_center_types(id),
      CONSTRAINT cost_centers_parent_fk
        FOREIGN KEY (parent_id) REFERENCES cost_centers(id),
      CONSTRAINT cost_centers_name_unique UNIQUE (name)
    )
  `
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureCostCentersTable()

    const id = Number.parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const data = await request.json()
    const name = String(data.name ?? "").trim()
    const costTypeId = Number(data.cost_type_id)
    const parentId = data.parent_id ? Number(data.parent_id) : null
    const status = Number(data.status ?? 1)

    if (!name) {
      return NextResponse.json({ error: "اسم مركز التكلفة مطلوب" }, { status: 400 })
    }

    if (!Number.isInteger(costTypeId)) {
      return NextResponse.json({ error: "نوع مركز التكلفة مطلوب" }, { status: 400 })
    }

    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    if (parentId && parentId === id) {
      return NextResponse.json({ error: "لا يمكن أن يكون المركز أباً لنفسه" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM cost_centers
      WHERE LOWER(name) = LOWER(${name}) AND id <> ${id}
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم مركز التكلفة موجود مسبقاً" }, { status: 400 })
    }

    const typeExists = await sql`
      SELECT id FROM cost_center_types WHERE id = ${costTypeId}
    `

    if (typeExists.length === 0) {
      return NextResponse.json({ error: "نوع مركز التكلفة غير موجود" }, { status: 400 })
    }

    let level = 1
    if (parentId) {
      const parent = await sql`
        SELECT id, level FROM cost_centers WHERE id = ${parentId}
      `

      if (parent.length === 0) {
        return NextResponse.json({ error: "المركز الأب غير موجود" }, { status: 400 })
      }

      level = Number(parent[0].level) + 1
    }

    const result = await sql`
      UPDATE cost_centers
      SET
        name = ${name},
        cost_type_id = ${costTypeId},
        parent_id = ${parentId},
        level = ${level},
        status = ${status},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, cost_type_id, parent_id, level, status, created_at, updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "مركز التكلفة غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating cost center:", error)
    return NextResponse.json({ error: "Failed to update cost center" }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureCostCentersTable()

    const id = Number.parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const result = await sql`
      UPDATE cost_centers
      SET status = 3, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "مركز التكلفة غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting cost center:", error)
    return NextResponse.json({ error: "Failed to delete cost center" }, { status: 500 })
  }
}
