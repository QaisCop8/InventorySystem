import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureAccountsTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      account_code VARCHAR(50) UNIQUE NOT NULL,
      account_name VARCHAR(255) NOT NULL,
      classification_type_id INTEGER NOT NULL,
      parent_account_id INTEGER,
      opening_balance NUMERIC(18,2) DEFAULT 0,
      debit_amount NUMERIC(18,2) DEFAULT 0,
      credit_amount NUMERIC(18,2) DEFAULT 0,
      balance NUMERIC(18,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'نشط',
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT accounts_code_unique UNIQUE (account_code),
      CONSTRAINT accounts_type_fk FOREIGN KEY (classification_type_id) REFERENCES account_classification_types(id)
    )
  `
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureAccountsTable()

    const id = Number.parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const data = await request.json()
    const accountCode = String(data.account_code ?? "").trim()
    const accountName = String(data.account_name ?? "").trim()
    const classificationTypeId = Number(data.classification_type_id)
    const parentAccountId = data.parent_account_id ? Number(data.parent_account_id) : null
    const openingBalance = Number(data.opening_balance ?? 0)
    const status = String(data.status ?? "نشط").trim()
    const description = String(data.description ?? "").trim()

    if (!accountCode) {
      return NextResponse.json({ error: "رقم الحساب مطلوب" }, { status: 400 })
    }

    if (!accountName) {
      return NextResponse.json({ error: "اسم الحساب مطلوب" }, { status: 400 })
    }

    if (!Number.isInteger(classificationTypeId)) {
      return NextResponse.json({ error: "نوع الحساب مطلوب" }, { status: 400 })
    }

    const existingCode = await sql`
      SELECT id FROM accounts WHERE LOWER(account_code) = LOWER(${accountCode}) AND id <> ${id}
    `

    if (existingCode.length > 0) {
      return NextResponse.json({ error: "رقم الحساب موجود مسبقاً" }, { status: 400 })
    }

    const typeExists = await sql`
      SELECT id FROM account_classification_types WHERE id = ${classificationTypeId}
    `

    if (typeExists.length === 0) {
      return NextResponse.json({ error: "نوع الحساب غير موجود" }, { status: 400 })
    }

    if (parentAccountId !== null) {
      const parentExists = await sql`
        SELECT id FROM accounts WHERE id = ${parentAccountId} AND id <> ${id}
      `
      if (parentExists.length === 0) {
        return NextResponse.json({ error: "الحساب الرئيسي غير موجود" }, { status: 400 })
      }
    }

    const result = await sql`
      UPDATE accounts
      SET
        account_code = ${accountCode},
        account_name = ${accountName},
        classification_type_id = ${classificationTypeId},
        parent_account_id = ${parentAccountId},
        opening_balance = ${openingBalance},
        status = ${status},
        description = ${description || null},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING
        id,
        account_code,
        account_name,
        classification_type_id,
        parent_account_id,
        opening_balance,
        debit_amount,
        credit_amount,
        balance,
        status,
        description,
        created_at,
        updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating account:", error)
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureAccountsTable()

    const id = Number.parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const result = await sql`
      UPDATE accounts
      SET status = 'محذوف', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting account:", error)
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 })
  }
}
