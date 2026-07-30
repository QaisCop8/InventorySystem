import { NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { ensurePermissionTables } from "@/lib/permissions"

export async function GET() {
  try {
    await ensurePermissionTables(await resolveCurrentDbName())

    const items = await sql`
      SELECT id, name, status, created_at, updated_at
      FROM job_roles
      WHERE status IN (1, 2)
      ORDER BY id DESC
    `

    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching job roles:", error)
    return NextResponse.json({ error: "Failed to fetch job roles" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensurePermissionTables(await resolveCurrentDbName())

    const data = await request.json()

    if (!data.name || !String(data.name).trim()) {
      return NextResponse.json({ error: "اسم الدور الوظيفي مطلوب" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)
    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM job_roles WHERE LOWER(name) = LOWER(${String(data.name).trim()})
    `
    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم الدور الوظيفي موجود مسبقاً" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO job_roles (name, status)
      VALUES (${String(data.name).trim()}, ${status})
      RETURNING id, name, status, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating job role:", error)
    return NextResponse.json({ error: "Failed to create job role" }, { status: 500 })
  }
}
