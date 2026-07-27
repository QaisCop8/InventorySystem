import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export default sql

export async function GET() {
  try {
    // Create table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        department_code VARCHAR(20) UNIQUE NOT NULL,
        department_name VARCHAR(100) NOT NULL,
        branch_id INTEGER,
        manager VARCHAR(100),
        employee_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    const departments = await sql`
      SELECT d.*, b.branch_name
      FROM departments d
      LEFT JOIN branches b ON d.branch_id = b.id
      ORDER BY d.department_name
    `
    return NextResponse.json(departments)
  } catch (error) {
    console.error("Error fetching departments:", error)
    return NextResponse.json({ error: "Failed to fetch departments" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.department_name || !data.department_code) {
      return NextResponse.json({ error: "اسم القسم ورمزه مطلوبان" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO departments (department_code, department_name, branch_id, manager, employee_count, is_active)
      VALUES (
        ${data.department_code},
        ${data.department_name},
        ${data.branch_id || null},
        ${data.manager || ""},
        ${data.employee_count || 0},
        ${data.is_active !== false}
      )
      RETURNING *
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating department:", error)
    return NextResponse.json({ error: "Failed to create department" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: "معرف القسم مطلوب" }, { status: 400 })
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
      WHERE id = ${data.id}
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
