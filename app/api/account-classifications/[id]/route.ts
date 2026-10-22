import { NextRequest, NextResponse } from "next/server"
import { findUsages, usageMessage } from "@/lib/delete-guard"
import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

const ensureAccountClassificationTypesTable = async () => { return runSchemaOnce("app/api/account-classifications/[id]/route.ts#ensureAccountClassificationTypesTable", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS account_classification_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT account_classification_types_name_unique UNIQUE (name)
    )
  `
}) }

export async function GET() {
  try {
    await ensureAccountClassificationTypesTable()

    const items = await sql`
      SELECT id, name, status, created_at, updated_at
      FROM account_classification_types
      WHERE status IN (1, 2)
      ORDER BY id ASC
    `

    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching account classification types:", error)
    return NextResponse.json({ error: "Failed to fetch account classification types" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAccountClassificationTypesTable()

    const data = await request.json()
    const name = String(data.name ?? "").trim()
    const status = Number(data.status ?? 1)

    if (!name) {
      return NextResponse.json({ error: "اسم النوع مطلوب" }, { status: 400 })
    }

    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM account_classification_types WHERE LOWER(name) = LOWER(${name})
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم النوع موجود مسبقاً" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO account_classification_types (name, status)
      VALUES (${name}, ${status})
      RETURNING id, name, status, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating account classification type:", error)
    return NextResponse.json({ error: "Failed to create account classification type" }, { status: 500 })
  }
}

// حذف تصنيف الحساب: يُرفض إن كان مستخدماً في تعريفات أخرى أو حركات (lib/delete-guard.ts)، وإلا يُعلَّم محذوفاً (status = 3)
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "المعرّف غير صالح" }, { status: 400 })
    const row = (await sql`SELECT * FROM account_classifications WHERE id = ${id}`)[0] as any
    if (!row) return NextResponse.json({ error: "السجل غير موجود" }, { status: 404 })
    const usages = await findUsages(id, { idColumns: /^classification_id$/, excludeTables: ["account_classifications"] })
    if (usages.length) return NextResponse.json({ error: usageMessage("تصنيف الحساب", String(row.name || ""), usages) }, { status: 400 })
    await sql`UPDATE account_classifications SET status = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error("[delete account_classifications]", error)
    return NextResponse.json({ error: "تعذر حذف تصنيف الحساب" }, { status: 500 })
  }
}
