import { type NextRequest, NextResponse } from "next/server"
import { findUsages, usageMessage } from "@/lib/delete-guard"
import sql from "@/lib/database"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Ensure table and columns exist (safe for older DBs)
    await sql`
      CREATE TABLE IF NOT EXISTS tax_classifications (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        tax_percent DECIMAL(5,2) DEFAULT 0,
        status INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    await sql`ALTER TABLE tax_classifications ADD COLUMN IF NOT EXISTS tax_percent DECIMAL(5,2) DEFAULT 0`
    await sql`ALTER TABLE tax_classifications ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`
    const id = Number(params.id)
    const body = await request.json()
    const { name, tax_percent = 0, status = 1 } = body

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const percent = Number(tax_percent || 0)
    if (isNaN(percent) || percent < 0 || percent > 100) {
      return NextResponse.json({ error: "tax_percent must be a number between 0 and 100" }, { status: 400 })
    }

    const updated = await sql`
      UPDATE tax_classifications
      SET name = ${name}, tax_percent = ${tax_percent}, status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    return NextResponse.json({ category: updated[0] }, { status: 200 })
  } catch (error) {
    console.error("Error updating tax classification:", error)
    return NextResponse.json({ error: "Failed to update tax classification" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    // mark as deleted (status = 3)
    // فحص الارتباط قبل الحذف: لا يُحذف تعريف مستخدم في تعريفات أخرى أو حركات (lib/delete-guard.ts)
    const usageRow = (await sql`SELECT * FROM tax_classifications WHERE id = ${id}`)[0] as any
    const usages = await findUsages(id, { idColumns: /^(tax_classification_id|tax_classification|vat_classification_id)$/, excludeTables: ["tax_classifications"] })
    if (usages.length) return NextResponse.json({ error: usageMessage("التصنيف الضريبي", String(usageRow?.name || ""), usages) }, { status: 400 })

    const deleted = await sql`
      UPDATE tax_classifications
      SET status = 3, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id
    `

    return NextResponse.json({ success: true, id: deleted[0]?.id }, { status: 200 })
  } catch (error) {
    console.error("Error deleting tax classification:", error)
    return NextResponse.json({ error: "Failed to delete tax classification" }, { status: 500 })
  }
}
