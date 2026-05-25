import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureAccountClassificationsTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS account_classifications (
      id SERIAL PRIMARY KEY,
      account_code VARCHAR(50),
      name VARCHAR(100) NOT NULL,
      classification_type_id INTEGER NOT NULL,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      parent_account_id INTEGER,
      opening_balance NUMERIC(18,2) DEFAULT 0,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT account_classifications_name_unique UNIQUE (name),
      CONSTRAINT account_classifications_code_unique UNIQUE (account_code),
      CONSTRAINT account_classifications_type_fk
        FOREIGN KEY (classification_type_id) REFERENCES account_classification_types(id)
    )
  `

  await sql`ALTER TABLE account_classifications ADD COLUMN IF NOT EXISTS account_code VARCHAR(50)`
  await sql`ALTER TABLE account_classifications ADD COLUMN IF NOT EXISTS parent_account_id INTEGER`
  await sql`ALTER TABLE account_classifications ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(18,2) DEFAULT 0`
  await sql`ALTER TABLE account_classifications ADD COLUMN IF NOT EXISTS description TEXT`
  await sql`ALTER TABLE account_classifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS account_classifications_code_unique ON account_classifications (account_code)`
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureAccountClassificationsTable()

    const id = Number.parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const data = await request.json()
    const accountCode = String(data.account_code ?? "").trim()
    const name = String(data.name ?? "").trim()
    const classificationTypeId = Number(data.classification_type_id)
    const status = Number(data.status ?? 1)
    const parentAccountId = data.parent_account_id ? Number(data.parent_account_id) : null
    const openingBalance = Number(data.opening_balance ?? 0)
    const description = String(data.description ?? "").trim()

    if (!name) {
      return NextResponse.json({ error: "اسم التصنيف مطلوب" }, { status: 400 })
    }

    if (!Number.isInteger(classificationTypeId)) {
      return NextResponse.json({ error: "نوع التصنيف مطلوب" }, { status: 400 })
    }

    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM account_classifications
      WHERE LOWER(name) = LOWER(${name}) AND id <> ${id}
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم التصنيف موجود مسبقاً" }, { status: 400 })
    }

    if (accountCode) {
      const existingCode = await sql`
        SELECT id FROM account_classifications WHERE LOWER(account_code) = LOWER(${accountCode}) AND id <> ${id}
      `
      if (existingCode.length > 0) {
        return NextResponse.json({ error: "كود الحساب موجود مسبقاً" }, { status: 400 })
      }
    }

    const typeExists = await sql`
      SELECT id FROM account_classification_types WHERE id = ${classificationTypeId}
    `

    if (typeExists.length === 0) {
      return NextResponse.json({ error: "نوع التصنيف غير موجود" }, { status: 400 })
    }

    if (parentAccountId !== null) {
      const parentExists = await sql`
        SELECT id FROM account_classifications WHERE id = ${parentAccountId}
      `
      if (parentExists.length === 0) {
        return NextResponse.json({ error: "الحساب الرئيسي غير موجود" }, { status: 400 })
      }
    }

    const result = await sql`
      UPDATE account_classifications
      SET
        account_code = ${accountCode || null},
        name = ${name},
        classification_type_id = ${classificationTypeId},
        status = ${status},
        parent_account_id = ${parentAccountId},
        opening_balance = ${openingBalance},
        description = ${description || null},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING
        id,
        account_code,
        name,
        classification_type_id,
        status,
        parent_account_id,
        opening_balance,
        description,
        created_at,
        updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "التصنيف غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating account classification:", error)
    return NextResponse.json({ error: "Failed to update account classification" }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureAccountClassificationsTable()

    const id = Number.parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const result = await sql`
      UPDATE account_classifications
      SET status = 3, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "التصنيف غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting account classification:", error)
    return NextResponse.json({ error: "Failed to delete account classification" }, { status: 500 })
  }
}
