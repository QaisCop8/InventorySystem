import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { generateCustomerNumber } from "@/lib/number-generator"

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

const ensureCustomerCompatibilityColumns = async () => {
  await sql`
    ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS type INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS isDeleted BOOLEAN DEFAULT false
  `
}

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

const ensureCustomerAccount = async ({
  accountId,
  code,
  name,
  currencyId = 1,
  allowTransWithDiffCurr = 0,
  isCalcCurrDiffRates = false,
  fatherId = null,
  levelNo = 1,
  accountType = 2,
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
      2,
      ${normalizedCode},
      ${accountType},
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

const persistCustomerClassifications = async (accountId: number, classifications: any[] | undefined) => {
  if (!Array.isArray(classifications)) return

  await sql`DELETE FROM account_classifications_tbl WHERE account_id = ${accountId}`

  for (const row of classifications) {
    const classificationId = Number(row?.classification_id ?? row?.id ?? 0)
    if (!classificationId) continue
    await sql`
      INSERT INTO account_classifications_tbl (account_id, classification_id)
      VALUES (${accountId}, ${classificationId})
    `
  }
}

const persistCustomerAccountCostCenters = async (accountId: number, rows: any[] | undefined) => {
  await sql`DELETE FROM account_costcenters_tbl WHERE account_id = ${accountId}`

  if (!Array.isArray(rows)) return

  for (const row of rows) {
    const costCenterTypeId = toNullableInt(row?.cost_center_type_id ?? row?.id)
    const requiredInTransactions = toNullableInt(row?.required_in_transactions ?? row?.status_id ?? 1) ?? 1
    const defaultCostCenterId = toNullableInt(row?.default_cost_center_id)

    if (!costCenterTypeId) continue

    await sql`
      INSERT INTO account_costcenters_tbl (account_id, cost_center_type_id, required_in_transactions, default_cost_center_id)
      VALUES (${accountId}, ${costCenterTypeId}, ${requiredInTransactions}, ${defaultCostCenterId})
    `
  }
}

const persistCustomerStopTransactions = async (accountId: number, rows: any[] | undefined) => {
  await sql`DELETE FROM account_stop_transactions_tbl WHERE account_id = ${accountId}`

  if (!Array.isArray(rows)) return

  for (const row of rows) {
    const voucherTypeId = toNullableInt(row?.voucher_types_id)
    if (!voucherTypeId) continue

    const stopDateValue = row?.stop_date ? String(row.stop_date) : null
    await sql`
      INSERT INTO account_stop_transactions_tbl (account_id, voucher_types_id, stop_date)
      VALUES (${accountId}, ${voucherTypeId}, ${stopDateValue})
    `
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    if (!id) {
      console.log("[v0] Missing customer ID")
      return NextResponse.json({ error: "معرف العميل مطلوب" }, { status: 400 })
    }

    if (id === "generate-number") {
      console.log("[v0] Generating new customer number...")
      try {
        const customerNumber = await generateCustomerNumber()
        console.log("[v0] Generated customer number:", customerNumber)
        return NextResponse.json({ customerNumber })
      } catch (error) {
        console.error("[v0] Error generating customer number:", error)
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        return NextResponse.json(
          {
            message: "فشل في توليد رقم الزبون",
            error: errorMessage,
          },
          { status: 500 },
        )
      }
    }

    // إذا كان id ليس رقماً، نرجع 404
    if (isNaN(Number(id))) {
      console.log("[v0] Invalid customer ID format (not a number):", id)
      return NextResponse.json({ error: "معرف العميل غير صالح" }, { status: 404 })
    }

    console.log("[v0] Fetching customer with ID:", id)

    const result = await sql`
      SELECT * FROM customers WHERE id = ${id}
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 })
    }

    console.log("[v0] Customer fetched successfully:", result[0])

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[v0] Error fetching customer:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل بيانات العميل" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureCustomerCompatibilityColumns()
    const { id } = params

    if (!id || isNaN(Number(id))) {
      console.log("[v0] Invalid customer ID format:", id)
      return NextResponse.json({ error: "معرف العميل غير صالح" }, { status: 400 })
    }

    const data = await request.json()
    const { voucher } = data
    const accountHierarchy = await resolveAccountHierarchy(data.father_id, data.level_no)
    const accountCurrencyId = toNullableInt(data.currency_id) ?? 1
    const accountAllowTransWithDiffCurr = toInt(data.allow_trans_with_diff_curr, 0)
    const accountIsCalcCurrDiffRates = toBool(data.iscalc_curr_diff_rates, false)

    const existingCustomer = await sql`
      SELECT account_id
      FROM customers
      WHERE id = ${id}
      LIMIT 1
    `

    const accountId = await ensureCustomerAccount({
      accountId: existingCustomer[0]?.account_id ? Number(existingCustomer[0].account_id) : null,
      code: data.customer_code || data.code || "",
      name: data.customer_name || data.name || "",
      currencyId: accountCurrencyId,
      allowTransWithDiffCurr: accountAllowTransWithDiffCurr,
      isCalcCurrDiffRates: accountIsCalcCurrDiffRates,
      fatherId: accountHierarchy.fatherId,
      levelNo: accountHierarchy.levelNo,
      accountType: Number(data.type) === 2 ? 3 : 2,
    })

    const result = await sql`
      UPDATE customers
      SET
        customer_code = ${data.customer_code || data.code || ""},
        name = ${data.customer_name || data.name || ""},
        mobile1 = ${data.mobile1 || data.phone1 || ""},
        mobile2 = ${data.mobile2 || data.phone2 || ""},
        whatsapp1 = ${data.whatsapp1 || ""},
        whatsapp2 = ${data.whatsapp2 || ""},
        city = ${data.city || ""},
        address = ${data.address || ""},
        email = ${data.email || ""},
        status = ${data.status || "نشط"},
        business_nature = ${data.business_nature || ""},
        salesman = ${data.salesman || ""},
        classification = ${data.classifications || data.classification || ""},
        registration_date = ${data.account_opening_date || data.registration_date || new Date().toISOString().split("T")[0]},
        transaction_notes = ${data.movement_notes || data.transaction_notes || ""},
        general_notes = ${data.general_notes || ""},
        api_key = ${data.api_number || data.api_key || ""},
        type = ${Number(data.type) || 1},
        priceCategory = ${Number(data.pricecategory) || Number(data.priceCategory) || 0},
        account_id = ${accountId}
      WHERE id = ${id}
      RETURNING *
    `

    await persistCustomerClassifications(Number(accountId), data.account_classifications)
    await persistCustomerAccountCostCenters(Number(accountId), data.cost_centers)
    await persistCustomerStopTransactions(Number(accountId), data.stop_transactions)

    await sql`DELETE FROM customer_vouchers WHERE customer_id = ${id}`

    if (Array.isArray(voucher) && voucher.length > 0) {
      const uniqueVoucherRows = Array.from(
        new Map(
          voucher.map((item: any) => [
            `${Number(item?.type_id ?? 0)}:${Number(item?.book_id ?? 0)}`,
            {
              type_id: Number(item?.type_id ?? 0),
              book_id: Number(item?.book_id ?? 0),
            },
          ]),
        ).values(),
      )

      if (uniqueVoucherRows.length > 0) {
        await sql`
          INSERT INTO customer_vouchers (customer_id, voucher_id, book_id)
          SELECT ${id}, v.type_id, v.book_id
          FROM jsonb_to_recordset(${JSON.stringify(uniqueVoucherRows)}::jsonb) AS v(type_id int, book_id int)
        `
      }
      console.log(`[v0] Updated vouchers for customer ${id}`)
    }

    if (result.length === 0) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[v0] Error updating customer:", error)
    return NextResponse.json({ error: "Failed to update customer " + error }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureCustomerCompatibilityColumns()
    const { id } = params

    if (!id || isNaN(Number(id))) {
      console.log("[v0] Invalid customer ID format:", id)
      return NextResponse.json({ error: "معرف العميل غير صالح" }, { status: 400 })
    }

    await sql`update  customers set isDeleted = true WHERE id = ${id}`

    return NextResponse.json({ message: "Customer deleted successfully" })
  } catch (error) {
    console.error("Error deleting customer:", error)
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 })
  }
}
