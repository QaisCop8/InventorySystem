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

const toNullableInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const toInt = (value: unknown, fallback = 0): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const toBool = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return ["1", "true", "yes", "y", "نعم"].includes(normalized)
  }
  return fallback
}

const resolveAccountHierarchy = async (fatherIdInput: unknown, levelNoInput: unknown) => {
  const fatherId = toNullableInt(fatherIdInput)

  if (!fatherId) {
    return { fatherId: null, levelNo: toInt(levelNoInput, 1) || 1 }
  }

  const parentRows = await sql`
    SELECT level_no
    FROM account_tbl
    WHERE id = ${fatherId}
    LIMIT 1
  `

  if (parentRows.length === 0) {
    throw new Error("الحساب الرئيسي غير موجود")
  }

  const parentLevel = Number(parentRows[0]?.level_no ?? 0)
  return { fatherId, levelNo: parentLevel + 1 }
}

const ensureSupplierAccount = async ({
  accountId,
  code,
  name,
  currencyId = 1,
  allowTransWithDiffCurr = 0,
  isCalcCurrDiffRates = false,
  fatherId = null,
  levelNo = 1,
  accountType = 3,
}: {
  accountId?: number | null
  code: string
  name: string
  currencyId?: number | null
  allowTransWithDiffCurr?: unknown
  isCalcCurrDiffRates?: unknown
  fatherId?: number | null
  levelNo?: number
  accountType?: number
}) => {
  const normalizedCode = String(code || "").trim()
  const normalizedName = String(name || "").trim()

  if (!normalizedCode || !normalizedName) {
    throw new Error("رقم واسم الحساب مطلوبان")
  }

  const finalCurrencyId = Number(currencyId || 1) || 1
  const finalAllowTransWithDiffCurr = toInt(allowTransWithDiffCurr, 0)
  const finalIsCalcCurrDiffRates = toBool(isCalcCurrDiffRates, false)
  const finalFatherId = fatherId ? Number(fatherId) : null
  const finalLevelNo = Number(levelNo || 1) || 1

  if (accountId) {
    await sql`
      UPDATE account_tbl
      SET
        code = ${normalizedCode},
        name = ${normalizedName},
        type = ${accountType},
        finanical_list_id = 1,
        finanical_list_assests_id = 2,
        finanical_list_liabilities_id = NULL,
        finanical_list_income_id = NULL,
        father_id = ${finalFatherId},
        level_no = ${finalLevelNo},
        currency_id = ${finalCurrencyId},
        allow_trans_with_diff_curr = ${finalAllowTransWithDiffCurr},
        iscalc_curr_diff_rates = ${finalIsCalcCurrDiffRates},
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
        type = ${accountType},
        finanical_list_id = 1,
        finanical_list_assests_id = 2,
        finanical_list_liabilities_id = NULL,
        finanical_list_income_id = NULL,
        father_id = ${finalFatherId},
        level_no = ${finalLevelNo},
        currency_id = ${finalCurrencyId},
        allow_trans_with_diff_curr = ${finalAllowTransWithDiffCurr},
        iscalc_curr_diff_rates = ${finalIsCalcCurrDiffRates},
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
      ${finalFatherId},
      ${finalLevelNo},
      1,
      2,
      NULL,
      NULL,
      ${finalCurrencyId},
      ${finalAllowTransWithDiffCurr},
      ${finalIsCalcCurrDiffRates},
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

export async function GET() {
  try {
    const suppliers = await sql`
      SELECT *
      FROM suppliers
      ORDER BY created_at DESC
    `

    return NextResponse.json(suppliers)
  } catch (error) {
    console.error("Error fetching suppliers:", error)
    return NextResponse.json({ error: "Failed to fetch suppliers" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    console.log("[v0] Received supplier data:", data)

    // Check if supplier code already exists
    if (data.supplier_code) {
      const existingSupplier = await sql`
        SELECT id FROM suppliers WHERE supplier_code = ${data.supplier_code}
      `
      if (existingSupplier.length > 0) {
        return NextResponse.json({ error: "رقم المورد موجود مسبقاً" }, { status: 400 })
      }
    }

    console.log("[v0] About to insert supplier with columns:", {
      supplier_code: data.supplier_code,
      name: data.supplier_name,
      mobile1: data.mobile1,
      mobile2: data.mobile2,
      whatsapp1: data.whatsapp1,
      whatsapp2: data.whatsapp2,
      city: data.city,
      address: data.address,
      email: data.email,
      status: data.status || "نشط",
      business_nature: data.business_nature,
      salesman: data.salesman,
      movement_notes: data.movement_notes,
      general_notes: data.general_notes,
      classifications: data.classifications,
      account_opening_date: data.account_opening_date || new Date().toISOString().split("T")[0],
      web_username: data.web_username,
      api_number: data.api_number,
    })

    const accountId = await ensureSupplierAccount({
      code: data.supplier_code,
      name: data.supplier_name || data.name,
      currencyId: 1,
    })

    const result = await sql`
  INSERT INTO suppliers (
    supplier_code, 
    name, 
    mobile1, 
    mobile2, 
    whatsapp1, 
    whatsapp2, 
    city, 
    address, 
    email, 
    activity, 
    representative, 
    classification, 
    account_open_date, 
    status, 
    web_username, 
    web_password,
    api_key, 
    transaction_notes, 
    general_notes,
    account_id
  ) VALUES (
    ${data.supplier_code}, 
    ${data.name}, 
    ${data.mobile1}, 
    ${data.mobile2}, 
    ${data.whatsapp1}, 
    ${data.whatsapp2}, 
    ${data.city}, 
    ${data.address}, 
    ${data.email}, 
    ${data.activity}, 
    ${data.representative}, 
    ${data.classification}, 
    ${data.account_open_date || new Date().toISOString().split("T")[0]}, 
    ${data.status || "نشط"}, 
    ${data.web_username}, 
    ${data.web_password}, 
    ${data.api_key}, 
    ${data.transaction_notes}, 
    ${data.general_notes},
    ${accountId}
  ) 
  RETURNING *;
`


    console.log("[v0] Supplier created successfully:", result[0])
    return NextResponse.json(result[0], { status: 201 })
  }catch (error: unknown) {
  const err = error as Error;
  console.error("[v0] Error creating supplier:", err);
  console.error("[v0] Error details:", {
    message: err.message,
    stack: err.stack,
    name: err.name,
  });
  return NextResponse.json(
    { error: "فشل في إنشاء المورد" },
    { status: 500 }
  );
}
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    const { id, ...updateData } = data

    const existingSupplier = await sql`
      SELECT account_id
      FROM suppliers
      WHERE id = ${id}
      LIMIT 1
    `
    const accountId = await ensureSupplierAccount({
      accountId: existingSupplier[0]?.account_id ? Number(existingSupplier[0].account_id) : null,
      code: updateData.supplier_code || updateData.code || "",
      name: updateData.supplier_name || updateData.name || "",
      currencyId: 1,
    })

    const result = await sql`
      UPDATE suppliers SET
        name = ${updateData.supplier_name},
        mobile1 = ${updateData.mobile1},
        mobile2 = ${updateData.mobile2},
        whatsapp1 = ${updateData.whatsapp1},
        whatsapp2 = ${updateData.whatsapp2},
        city = ${updateData.city},
        address = ${updateData.address},
        email = ${updateData.email},
        status = ${updateData.status},
        business_nature = ${updateData.business_nature},
        salesman = ${updateData.salesman},
        movement_notes = ${updateData.movement_notes},
        general_notes = ${updateData.general_notes},
        classifications = ${updateData.classifications},
        web_username = ${updateData.web_username},
        api_number = ${updateData.api_number},
        account_id = ${accountId}
      WHERE id = ${id}
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating supplier:", error)
    return NextResponse.json({ error: "فشل في تحديث المورد" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Supplier ID is required" }, { status: 400 })
    }

    await sql`DELETE FROM suppliers WHERE id = ${id}`

    return NextResponse.json({ message: "Supplier deleted successfully" })
  } catch (error) {
    console.error("Error deleting supplier:", error)
    return NextResponse.json({ error: "Failed to delete supplier" }, { status: 500 })
  }
}
