import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"

let sql: any = null

try {
  if (!process.env.DATABASE_URL) {
    console.error("[v0] DATABASE_URL environment variable is not set")
  } else {
    const dbUrl = process.env.DATABASE_URL

    if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
      const pool = new Pool({ connectionString: dbUrl })
      sql = async (strings: TemplateStringsArray, ...values: any[]) => {
        const client = await pool.connect()
        try {
          const query = strings.reduce(
            (prev, curr, i) => prev + curr + (i < values.length ? `$${i + 1}` : ""),
            ""
          )
          const result = await client.query(query, values)
          return result.rows
        } finally {
          client.release()
        }
      }
    } else {
      sql = neon(dbUrl)
    }
  }
} catch (error) {
  console.error("[v0] Failed to initialize DB client:", error)
  sql = null
}

export default sql

const ensureTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id SERIAL PRIMARY KEY,
      branch_id INTEGER,
      order_no INTEGER,
      code VARCHAR(20) UNIQUE NOT NULL,
      actual_bank_code VARCHAR(20),
      currency_id INTEGER,
      name VARCHAR(100) NOT NULL,
      name_lang2 VARCHAR(100),
      jary_account_id INTEGER,
      tahsil_account_id INTEGER,
      tahsil_commission_account_id INTEGER,
      payed_checks_account_id INTEGER,
      returned_checks_account_id INTEGER,
      returned_checks_commission DOUBLE PRECISION,
      add_returned_check_commision_on_customer BOOLEAN DEFAULT false,
      tahsil_checks_commission DOUBLE PRECISION,
      returned_checks_commission_currency_id INTEGER,
      tahsil_checks_commission_currency_id INTEGER,
      check_value_period INTEGER,
      checks_deposit_period INTEGER,
      notes VARCHAR(70),
      status INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
}

export async function GET(request: NextRequest) {
  try {
    await ensureTable()

    const { searchParams } = new URL(request.url)
    const branchIdParam = searchParams.get("branch_id")
    const branchId = branchIdParam ? Number(branchIdParam) : undefined

    const bankAccounts = branchId !== undefined && !Number.isNaN(branchId)
      ? await sql`SELECT * FROM bank_accounts WHERE status != 3 AND branch_id = ${branchId} ORDER BY id`
      : await sql`SELECT * FROM bank_accounts WHERE status != 3 ORDER BY id`

    return NextResponse.json(bankAccounts)
  } catch (error) {
    console.error("Error fetching bank accounts:", error)
    return NextResponse.json({ error: "Failed to fetch bank accounts" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTable()
    const data = await request.json()

    if (!data.code || !data.name) {
      return NextResponse.json({ error: "رقم الحساب واسم الحساب مطلوبان" }, { status: 400 })
    }

    const existing = await sql`SELECT id FROM bank_accounts WHERE code = ${data.code}`
    if (existing.length > 0) {
      return NextResponse.json({ error: "رقم الحساب موجود مسبقاً" }, { status: 400 })
    }

    const lastOrder = await sql`SELECT COALESCE(MAX(order_no), 0) AS max_order FROM bank_accounts`
    const nextOrder = Number(lastOrder[0]?.max_order || 0) + 1

    const result = await sql`
      INSERT INTO bank_accounts (
        branch_id, order_no, code, actual_bank_code, currency_id, name, name_lang2,
        jary_account_id, tahsil_account_id, tahsil_commission_account_id, payed_checks_account_id,
        returned_checks_account_id, returned_checks_commission, add_returned_check_commision_on_customer,
        tahsil_checks_commission, returned_checks_commission_currency_id, tahsil_checks_commission_currency_id,
        check_value_period, checks_deposit_period, notes, status
      )
      VALUES (
        ${data.branch_id || null}, ${nextOrder}, ${data.code}, ${data.actual_bank_code || ""},
        ${data.currency_id || null}, ${data.name}, ${data.name_lang2 || ""},
        ${data.jary_account_id || null}, ${data.tahsil_account_id || null}, ${data.tahsil_commission_account_id || null},
        ${data.payed_checks_account_id || null}, ${data.returned_checks_account_id || null},
        ${data.returned_checks_commission ?? null}, ${Boolean(data.add_returned_check_commision_on_customer)},
        ${data.tahsil_checks_commission ?? null}, ${data.returned_checks_commission_currency_id || null},
        ${data.tahsil_checks_commission_currency_id || null}, ${data.check_value_period ?? null},
        ${data.checks_deposit_period ?? null}, ${data.notes || ""}, ${Number(data.status || 1)}
      )
      RETURNING *
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating bank account:", error)
    return NextResponse.json({ error: "Failed to create bank account" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureTable()
    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: "معرف حساب البنك مطلوب" }, { status: 400 })
    }

    if (!data.code || !data.name) {
      return NextResponse.json({ error: "رقم الحساب واسم الحساب مطلوبان" }, { status: 400 })
    }

    const duplicate = await sql`SELECT id FROM bank_accounts WHERE code = ${data.code} AND id != ${data.id}`
    if (duplicate.length > 0) {
      return NextResponse.json({ error: "رقم الحساب مستخدم مسبقاً" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)

    const result = await sql`
      UPDATE bank_accounts
      SET
        branch_id = ${data.branch_id || null},
        code = ${data.code},
        actual_bank_code = ${data.actual_bank_code || ""},
        currency_id = ${data.currency_id || null},
        name = ${data.name},
        name_lang2 = ${data.name_lang2 || ""},
        jary_account_id = ${data.jary_account_id || null},
        tahsil_account_id = ${data.tahsil_account_id || null},
        tahsil_commission_account_id = ${data.tahsil_commission_account_id || null},
        payed_checks_account_id = ${data.payed_checks_account_id || null},
        returned_checks_account_id = ${data.returned_checks_account_id || null},
        returned_checks_commission = ${data.returned_checks_commission ?? null},
        add_returned_check_commision_on_customer = ${Boolean(data.add_returned_check_commision_on_customer)},
        tahsil_checks_commission = ${data.tahsil_checks_commission ?? null},
        returned_checks_commission_currency_id = ${data.returned_checks_commission_currency_id || null},
        tahsil_checks_commission_currency_id = ${data.tahsil_checks_commission_currency_id || null},
        check_value_period = ${data.check_value_period ?? null},
        checks_deposit_period = ${data.checks_deposit_period ?? null},
        notes = ${data.notes || ""},
        status = ${status},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "حساب البنك غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating bank account:", error)
    return NextResponse.json({ error: "Failed to update bank account" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: "معرف حساب البنك مطلوب" }, { status: 400 })
    }

    const result = await sql`
      DELETE FROM bank_accounts
      WHERE id = ${data.id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "حساب البنك غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting bank account:", error)
    return NextResponse.json({ error: "Failed to delete bank account" }, { status: 500 })
  }
}
