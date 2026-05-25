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

export async function GET() {
  try {
    await ensureAccountsTable()

    const items = await sql`
      SELECT
        a.id,
        a.account_code,
        a.account_name,
        a.classification_type_id,
        t.name AS classification_type_name,
        a.parent_account_id,
        pa.account_name AS parent_account_name,
        a.opening_balance,
        a.debit_amount,
        a.credit_amount,
        a.balance,
        a.status,
        a.description,
        a.created_at,
        a.updated_at
      FROM accounts a
      JOIN account_classification_types t ON t.id = a.classification_type_id
      LEFT JOIN accounts pa ON pa.id = a.parent_account_id
      WHERE a.status IN ('نشط', 'موقوف')
      ORDER BY a.account_code ASC
    `

    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching accounts:", error)
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAccountsTable()

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
      SELECT id FROM accounts WHERE LOWER(account_code) = LOWER(${accountCode})
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
        SELECT id FROM accounts WHERE id = ${parentAccountId}
      `
      if (parentExists.length === 0) {
        return NextResponse.json({ error: "الحساب الرئيسي غير موجود" }, { status: 400 })
      }
    }

    const result = await sql`
      INSERT INTO accounts (
        account_code,
        account_name,
        classification_type_id,
        parent_account_id,
        opening_balance,
        balance,
        status,
        description
      )
      VALUES (
        ${accountCode},
        ${accountName},
        ${classificationTypeId},
        ${parentAccountId},
        ${openingBalance},
        ${openingBalance},
        ${status},
        ${description || null}
      )
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

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating account:", error)
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
  }
}
