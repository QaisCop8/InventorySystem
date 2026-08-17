import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

export async function GET(request: NextRequest) {
  try {
    // Create table if not exists and migrate existing schema if necessary
    await sql`
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        branch_code VARCHAR(20) UNIQUE NOT NULL,
        branch_name VARCHAR(100) NOT NULL,
        bank_id INTEGER,
        address TEXT,
        manager VARCHAR(100),
        phone VARCHAR(20),
        status INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS bank_id INTEGER`
    await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`

    const { searchParams } = new URL(request.url)
    const bankIdParam = searchParams.get("bank_id")
    const bankId = bankIdParam ? Number(bankIdParam) : undefined

    const branches = bankId !== undefined && !Number.isNaN(bankId)
      ? await sql`
          SELECT id, branch_code, branch_name, bank_id, address, manager, phone, status
          FROM branches
          WHERE status != 3 AND bank_id = ${bankId}
          ORDER BY branch_code ASC
        `
      : await sql`
          SELECT id, branch_code, branch_name, bank_id, address, manager, phone, status
          FROM branches
          WHERE status != 3
          ORDER BY branch_code ASC
        `

    return NextResponse.json(branches)
  } catch (error) {
    console.error("Error fetching branches:", error)
    return NextResponse.json({ error: "Failed to fetch branches" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.branch_name) {
      return NextResponse.json({ error: "اسم الفرع مطلوب" }, { status: 400 })
    }

    const result = await sql`
      WITH next_branch AS (
        SELECT nextval(pg_get_serial_sequence('branches', 'id')) AS id
      )
      INSERT INTO branches (id, branch_code, branch_name, bank_id, address, manager, phone, status)
      SELECT
        id,
        LPAD(id::text, 4, '0'),
        ${data.branch_name},
        ${data.bank_id || null},
        ${data.address || ""},
        ${data.manager || ""},
        ${data.phone || ""},
        ${Number(data.status || 1)}
      FROM next_branch
      RETURNING id, branch_code, branch_name, bank_id, address, manager, phone, status
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating branch:", error)
    return NextResponse.json({ error: "Failed to create branch" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: "معرف الفرع مطلوب" }, { status: 400 })
    }

    const result = await sql`
      UPDATE branches
      SET 
        branch_name = ${data.branch_name},
        bank_id = ${data.bank_id || null},
        address = ${data.address || ""},
        manager = ${data.manager || ""},
        phone = ${data.phone || ""},
        status = ${Number(data.status || 1)},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING id, branch_code, branch_name, bank_id, address, manager, phone, status
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "الفرع غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating branch:", error)
    return NextResponse.json({ error: "Failed to update branch" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: "معرف الفرع مطلوب" }, { status: 400 })
    }

    const result = await sql`
      DELETE FROM branches
      WHERE id = ${data.id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "الفرع غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting branch:", error)
    return NextResponse.json({ error: "Failed to delete branch" }, { status: 500 })
  }
}
