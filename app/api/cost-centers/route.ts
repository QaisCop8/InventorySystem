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

export async function GET() {
  try {
    await ensureCostCentersTable()

    const items = await sql`
      SELECT
        c.id,
        c.name,
        c.cost_type_id,
        t.name AS cost_type_name,
        c.parent_id,
        p.name AS parent_name,
        c.level,
        c.status,
        c.created_at,
        c.updated_at
      FROM cost_centers c
      JOIN cost_center_types t ON t.id = c.cost_type_id
      LEFT JOIN cost_centers p ON p.id = c.parent_id
      WHERE c.status IN (1, 2)
      ORDER BY c.id DESC
    `

    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching cost centers:", error)
    return NextResponse.json({ error: "Failed to fetch cost centers" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureCostCentersTable()

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

    const existing = await sql`
      SELECT id FROM cost_centers WHERE LOWER(name) = LOWER(${name})
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
      INSERT INTO cost_centers (name, cost_type_id, parent_id, level, status)
      VALUES (${name}, ${costTypeId}, ${parentId}, ${level}, ${status})
      RETURNING id, name, cost_type_id, parent_id, level, status, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating cost center:", error)
    return NextResponse.json({ error: "Failed to create cost center" }, { status: 500 })
  }
}
