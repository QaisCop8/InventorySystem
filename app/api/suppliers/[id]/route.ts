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
      console.log("[v0] Using local PostgreSQL with pg Pool")
      const pool = new Pool({ connectionString: dbUrl })
      sql = async (strings: TemplateStringsArray, ...values: any[]) => {
        const client = await pool.connect()
        try {
          const query =
            strings.reduce(
              (prev, curr, i) =>
                prev + curr + (i < values.length ? `$${i + 1}` : ""),
              ""
            )
          const result = await client.query(query, values)
          return result.rows
        } finally {
          client.release()
        }
      }
    } else {
      console.log("[v0] Using Neon serverless client")
      sql = neon(dbUrl)
    }

    console.log("[v0] Database client initialized successfully")
  }
} catch (error) {
  console.error("[v0] Failed to initialize DB client:", error)
  sql = null
}

export default sql

const ensureSupplierAccount = async ({
  accountId,
  code,
  name,
  currencyId = 1,
}: {
  accountId?: number | null
  code: string
  name: string
  currencyId?: number | null
}) => {
  const normalizedCode = String(code || "").trim()
  const normalizedName = String(name || "").trim()

  if (!normalizedCode || !normalizedName) {
    throw new Error("رقم واسم الحساب مطلوبان")
  }

  const finalCurrencyId = Number(currencyId || 1) || 1

  if (accountId) {
    await sql`
      UPDATE account_tbl
      SET
        code = ${normalizedCode},
        name = ${normalizedName},
        type = 3,
        finanical_list_id = 1,
        finanical_list_assests_id = 2,
        finanical_list_liabilities_id = 0,
        finanical_list_income_id = 0,
        currency_id = ${finalCurrencyId},
        allow_trans_with_diff_curr = 0,
        iscalc_curr_diff_rates = false,
        transaction_type = 0,
        transaction_type_action = 0,
        max_transaction_amount = 0,
        max_transaction_amount_action = 0,
        max_balance_amount = 0,
        max_balance_action = NULL,
        budget_exceeding_perc = NULL,
        budget_exceeding_action = NULL,
        unified_report_account_no = NULL,
        unified_report_group_code = NULL,
        notes = NULL,
        show_notes_in_transactions_soa = false,
        status = 1,
        last_update_date = CURRENT_TIMESTAMP
      WHERE id = ${accountId}
    `

    return accountId
  }

  const existingAccount = await sql`
    SELECT id
    FROM account_tbl
    WHERE LOWER(code) = LOWER(${normalizedCode})
    LIMIT 1
  `

  if (existingAccount.length > 0) {
    const existingId = Number(existingAccount[0].id)
    await sql`
      UPDATE account_tbl
      SET
        name = ${normalizedName},
        type = 3,
        finanical_list_id = 1,
        finanical_list_assests_id = 2,
        finanical_list_liabilities_id = 0,
        finanical_list_income_id = 0,
        currency_id = ${finalCurrencyId},
        allow_trans_with_diff_curr = 0,
        iscalc_curr_diff_rates = false,
        status = 1,
        last_update_date = CURRENT_TIMESTAMP
      WHERE id = ${existingId}
    `
    return existingId
  }

  const created = await sql`
    INSERT INTO account_tbl (
      company_id,
      code,
      type,
      name,
      name_lang2,
      father_id,
      level_no,
      finanical_list_id,
      finanical_list_assests_id,
      finanical_list_liabilities_id,
      finanical_list_income_id,
      currency_id,
      allow_trans_with_diff_curr,
      iscalc_curr_diff_rates,
      transaction_type,
      transaction_type_action,
      max_transaction_amount,
      max_transaction_amount_action,
      max_balance_amount,
      max_balance_action,
      budget_exceeding_perc,
      budget_exceeding_action,
      unified_report_account_no,
      unified_report_group_code,
      notes,
      show_notes_in_transactions_soa,
      status,
      insert_date,
      last_update_date
    ) VALUES (
      3,
      ${normalizedCode},
      1,
      ${normalizedName},
      NULL,
      NULL,
      1,
      1,
      2,
      0,
      0,
      ${finalCurrencyId},
      0,
      false,
      0,
      0,
      0,
      0,
      0,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      false,
      1,
      CURRENT_DATE,
      CURRENT_TIMESTAMP
    )
    RETURNING id
  `

  return Number(created[0].id)
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const data = await request.json()

    const existingSupplier = await sql`
      SELECT account_id
      FROM suppliers
      WHERE id = ${id}
      LIMIT 1
    `
    const accountId = await ensureSupplierAccount({
      accountId: existingSupplier[0]?.account_id ? Number(existingSupplier[0].account_id) : null,
      code: data.supplier_code || data.code || "",
      name: data.supplier_name || data.name || "",
      currencyId: 1,
    })

    const result = await sql`
      UPDATE suppliers 
      SET 
        name = ${data.supplier_name || data.name},
        mobile1 = ${data.mobile1 || data.phone1},
        mobile2 = ${data.mobile2 || data.phone2},
        whatsapp1 = ${data.whatsapp1},
        whatsapp2 = ${data.whatsapp2},
        city = ${data.city},
        address = ${data.address},
        email = ${data.email},
        status = ${data.status},
        business_nature = ${data.business_nature},
        representative = ${data.salesman || data.representative},
        classification = ${data.classifications || data.classification},
        account_open_date = ${data.account_opening_date},
        transaction_notes = ${data.movement_notes || data.transaction_notes},
        general_notes = ${data.general_notes},
        web_username = ${data.web_username},
        web_password = ${data.web_password},
        api_key = ${data.api_number || ""},
        account_id = ${accountId}
      WHERE id = ${id}
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating supplier:", error)
    return NextResponse.json({ error: "Failed to update supplier" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    await sql`DELETE FROM suppliers WHERE id = ${id}`

    return NextResponse.json({ message: "Supplier deleted successfully" })
  } catch (error) {
    console.error("Error deleting supplier:", error)
    return NextResponse.json({ error: "Failed to delete supplier" }, { status: 500 })
  }
}
