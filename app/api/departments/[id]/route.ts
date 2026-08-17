import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const rows = await sql`
      SELECT d.*, b.branch_name
      FROM departments d
      LEFT JOIN branches b ON d.branch_id = b.id
      WHERE d.id = ${id}
      LIMIT 1
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: "القسم غير موجود" }, { status: 404 })
    }
    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("Error fetching department:", error)
    return NextResponse.json({ error: "Failed to fetch department" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()

    if (!data.department_name) {
      return NextResponse.json({ error: "اسم القسم مطلوب" }, { status: 400 })
    }

    const result = await sql`
      UPDATE departments
      SET
        department_name = ${data.department_name},
        branch_id = ${data.branch_id || null},
        manager = ${data.manager || ""},
        employee_count = ${data.employee_count || 0},
        is_active = ${data.is_active !== false},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "القسم غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating department:", error)
    return NextResponse.json({ error: "Failed to update department" }, { status: 500 })
  }
}
