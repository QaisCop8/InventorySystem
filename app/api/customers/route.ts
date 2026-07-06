import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { generateCustomerNumber } from "@/lib/number-generator";
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

const ensureCustomerCompatibilityColumns = async () => {
  await sql`
    ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS type INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS isDeleted BOOLEAN DEFAULT false
  `
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



export async function GET(request: NextRequest) {
  try {
    console.log("[v0] GET /api/customers - Fetching customers with portal info")
    await ensureCustomerCompatibilityColumns()

    const typeParam = request.nextUrl.searchParams.get("type");
    const typeFilter = typeParam === "1" || typeParam === "2" ? Number(typeParam) : null;

    const customers = typeFilter
      ? await sql`
          SELECT 
            c.*,
            acc.father_id AS father_id,
            acc.finanical_list_id AS finanical_list_id,
            acc.finanical_list_assests_id AS finanical_list_assests_id,
            acc.finanical_list_liabilities_id AS finanical_list_liabilities_id,
            acc.finanical_list_income_id AS finanical_list_income_id,
            acc.currency_id AS currency_id,
            acc.allow_trans_with_diff_curr AS allow_trans_with_diff_curr,
            acc.iscalc_curr_diff_rates AS iscalc_curr_diff_rates,
            acc.level_no AS level_no,
            COUNT(cu.id) as user_count,
            CASE WHEN COUNT(cu.id) > 0 THEN true ELSE false END as portal_enabled
          FROM customers c
          LEFT JOIN account_tbl acc ON acc.id = c.account_id
          LEFT JOIN customer_users cu ON c.id = cu.customer_id AND cu.is_active = true
          WHERE c.isDeleted = false AND c.type = ${typeFilter}
          GROUP BY c.id
                   , acc.father_id
                   , acc.finanical_list_id
                   , acc.finanical_list_assests_id
                   , acc.finanical_list_liabilities_id
                   , acc.finanical_list_income_id
                   , acc.currency_id
                   , acc.allow_trans_with_diff_curr
                   , acc.iscalc_curr_diff_rates
                   , acc.level_no
          ORDER BY c.created_at DESC
        `
      : await sql`
          SELECT 
            c.*,
            acc.father_id AS father_id,
            acc.finanical_list_id AS finanical_list_id,
            acc.finanical_list_assests_id AS finanical_list_assests_id,
            acc.finanical_list_liabilities_id AS finanical_list_liabilities_id,
            acc.finanical_list_income_id AS finanical_list_income_id,
            acc.currency_id AS currency_id,
            acc.allow_trans_with_diff_curr AS allow_trans_with_diff_curr,
            acc.iscalc_curr_diff_rates AS iscalc_curr_diff_rates,
            acc.level_no AS level_no,
            COUNT(cu.id) as user_count,
            CASE WHEN COUNT(cu.id) > 0 THEN true ELSE false END as portal_enabled
          FROM customers c
          LEFT JOIN account_tbl acc ON acc.id = c.account_id
          LEFT JOIN customer_users cu ON c.id = cu.customer_id AND cu.is_active = true
          WHERE c.isDeleted = false
          GROUP BY c.id
                   , acc.father_id
                   , acc.finanical_list_id
                   , acc.finanical_list_assests_id
                   , acc.finanical_list_liabilities_id
                   , acc.finanical_list_income_id
                   , acc.currency_id
                   , acc.allow_trans_with_diff_curr
                   , acc.iscalc_curr_diff_rates
                   , acc.level_no
          ORDER BY c.created_at DESC
        `

    console.log("[v0] Customers fetched:", {
      count: customers.length,
      sample: customers[0]
        ? {
          id: customers[0].id,
          name: customers[0].name,
          userCount: customers[0].user_count,
          portalEnabled: customers[0].portal_enabled,
        }
        : null,
    })

    const customerIds = customers.map((c: { id: any; }) => c.id);
    type VoucherItem = {
      book_name: string;
      type_id: number;
    };
    const vouchersMap: Record<number, VoucherItem[]> = {};
    if (customerIds.length > 0) {
      const vouchers = await sql`
        SELECT 
        cv.customer_id,
        cv.voucher_id as type_id ,
        vb.name AS book_name
        FROM customer_vouchers cv
        LEFT JOIN voucher_books vb ON cv.book_id = vb.id
         WHERE cv.customer_id = ANY(${customerIds}::int[])
        ORDER BY cv.customer_id, cv.id ASC
      `;






      // Group vouchers by customer_id
      vouchers.forEach((v: any) => {
        const customerId = Number(v.customer_id); // ensure number
        if (!vouchersMap[customerId]) vouchersMap[customerId] = [];
        vouchersMap[customerId].push({
          book_name: v.book_name,
          type_id: v.type_id
        });
      });
    }

    //

    const costCenterMap: Record<number, any[]> = {}
    const stopTransactionMap: Record<number, any[]> = {}

    if (customerIds.length > 0) {
      const costCenters = await sql`
        SELECT
          c.id AS customer_id,
          accct.cost_center_type_id,
          accct.required_in_transactions,
          accct.default_cost_center_id,
          cc.name AS cost_center_name
        FROM customers c
        LEFT JOIN account_costcenters_tbl accct ON accct.account_id = c.account_id
        LEFT JOIN cost_centers cc ON cc.id = accct.default_cost_center_id
        WHERE c.id = ANY(${customerIds}::int[])
        ORDER BY c.id, accct.id ASC
      `

      costCenters.forEach((row: any) => {
        const customerId = Number(row.customer_id)
        if (!costCenterMap[customerId]) costCenterMap[customerId] = []
        costCenterMap[customerId].push({
          cost_center_type_id: row.cost_center_type_id,
          required_in_transactions: row.required_in_transactions,
          default_cost_center_id: row.default_cost_center_id,
          cost_center_name: row.cost_center_name || "",
        })
      })

      const stopTransactions = await sql`
        SELECT
          c.id AS customer_id,
          ast.voucher_types_id,
          ast.stop_date
        FROM customers c
        LEFT JOIN account_stop_transactions_tbl ast ON ast.account_id = c.account_id
        WHERE c.id = ANY(${customerIds}::int[])
        ORDER BY c.id, ast.id ASC
      `

      stopTransactions.forEach((row: any) => {
        const customerId = Number(row.customer_id)
        if (!stopTransactionMap[customerId]) stopTransactionMap[customerId] = []
        stopTransactionMap[customerId].push({
          voucher_types_id: row.voucher_types_id,
          stop_date: row.stop_date ? String(row.stop_date).slice(0, 10) : "",
          is_stopped: Boolean(row.voucher_types_id),
        })
      })
    }

    const result = customers.map((c: { id: string | number }) => {
      const customerId = Number(c.id); // ensure numeric key
      return {
        ...c,
        voucherType: vouchersMap[customerId] || [],
        cost_centers: costCenterMap[customerId] || [],
        stop_transactions: stopTransactionMap[customerId] || [],
      };
    });


    return NextResponse.json({ customers: result })
  } catch (error) {
    console.error("[v0] Error fetching customers:", error)
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    console.log("[v0] Creating customer with data:", data)

    const accountHierarchy = await resolveAccountHierarchy(data.father_id, data.level_no)
    const accountCurrencyId = toNullableInt(data.currency_id) ?? 1
    const accountAllowTransWithDiffCurr = toInt(data.allow_trans_with_diff_curr, 0)
    const accountIsCalcCurrDiffRates = toBool(data.iscalc_curr_diff_rates, false)

    // Check if customer code already exists
    if (data.id === 0) {

      if (data.customer_code) {
        const existingCustomer = await sql`
        SELECT id FROM customers WHERE customer_code = ${data.customer_code}
      `

        if (existingCustomer.length > 0) {

          const customerNumber = await generateCustomerNumber(data.type === 2 ? true : false);
          data.customer_code = customerNumber;
          const existingCust = await sql`
        SELECT id FROM customers WHERE customer_code = ${data.customer_code}
      `

          if (existingCust.length > 0) {
            return NextResponse.json({ error: "رقم العميل موجود مسبقاً، يرجى اختيار رقم آخر" }, { status: 400 })
          }
        }
      }

      const accountId = await ensureCustomerAccount({
        code: data.customer_code,
        name: data.customer_name || data.name,
        currencyId: accountCurrencyId,
        allowTransWithDiffCurr: accountAllowTransWithDiffCurr,
        isCalcCurrDiffRates: accountIsCalcCurrDiffRates,
        fatherId: accountHierarchy.fatherId,
        levelNo: accountHierarchy.levelNo,
        accountType: Number(data.type) === 2 ? 3 : 2,
      })

      const result = await sql`
  INSERT INTO customers (
    customer_code,
    name,
    mobile1,
    mobile2,
    whatsapp1,
    whatsapp2,
    city,
    address,
    email,
    status,
    business_nature,
    salesman,
    classification,      -- fixed here
    registration_date,   -- matches table definition
    transaction_notes,   -- matches table definition
    general_notes,
    api_key,          -- matches table definition
    type,
    isDeleted,
    priceCategory,
    account_id
  ) VALUES (
    ${data.customer_code},
    ${data.customer_name || data.name},
    ${data.mobile1 || null},
    ${data.mobile2 || null},
    ${data.whatsapp1 || null},
    ${data.whatsapp2 || null},
    ${data.city || null},
    ${data.address || null},
    ${data.email || null},
    ${data.status || 'نشط'},
    ${data.business_nature || null},
    ${data.salesman || null},
    ${data.classification || null},        
    ${data.registration_date || new Date().toISOString().split('T')[0]},
    ${data.transaction_notes || null},     
    ${data.general_notes || null},
    ${data.api_key || null} ,
    ${data.type || 0} ,
    ${data.isDeleted || false}  ,
    ${Number(data.pricecategory) || Number(data.priceCategory) || 1},
    ${accountId}
  )
  RETURNING *;
`;

      const customer = result[0];

      console.log("[v0] Customer created successfully:", customer);

      await persistCustomerClassifications(Number(accountId), data.account_classifications)
      await persistCustomerAccountCostCenters(Number(accountId), data.cost_centers)
      await persistCustomerStopTransactions(Number(accountId), data.stop_transactions)

      // 3️⃣ Save voucherType array (customer_vouchers)
      if (Array.isArray(data.voucher) && data.voucher.length > 0) {
        // Use a transaction if supported
        for (const v of data.voucher) {
          await sql`
          INSERT INTO customer_vouchers (customer_id, voucher_id, book_id)
          VALUES (${customer.id}, ${v.type_id}, ${v.book_id});
        `;
        }
        console.log("[v0] Customer vouchers saved:", data.voucher);
      }

      return NextResponse.json(customer, { status: 201 });

      console.log("[v0] Customer created successfully:", result[0])
      return NextResponse.json(result[0], { status: 201 })
    }
  } catch (error) {
    console.error("Error creating customer:", error)
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 })
  }

}

export async function PUT(request: NextRequest) {
  try {
    await ensureCustomerCompatibilityColumns()
    const data = await request.json()
    const { id, voucher, ...updateData } = data

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 })
    }

    const accountHierarchy = await resolveAccountHierarchy(updateData.father_id, updateData.level_no)
    const accountCurrencyId = toNullableInt(updateData.currency_id) ?? 1
    const accountAllowTransWithDiffCurr = toInt(updateData.allow_trans_with_diff_curr, 0)
    const accountIsCalcCurrDiffRates = toBool(updateData.iscalc_curr_diff_rates, false)

    const existingCustomer = await sql`
      SELECT account_id
      FROM customers
      WHERE id = ${id}
      LIMIT 1
    `

    const accountId = await ensureCustomerAccount({
      accountId: existingCustomer[0]?.account_id ? Number(existingCustomer[0].account_id) : null,
      code: updateData.customer_code || updateData.code || "",
      name: updateData.customer_name || updateData.name || "",
      currencyId: accountCurrencyId,
      allowTransWithDiffCurr: accountAllowTransWithDiffCurr,
      isCalcCurrDiffRates: accountIsCalcCurrDiffRates,
      fatherId: accountHierarchy.fatherId,
      levelNo: accountHierarchy.levelNo,
      accountType: Number(updateData.type) === 2 ? 3 : 2,
    })

    const result = await sql`
      UPDATE customers
      SET
        customer_code = ${updateData.customer_code || updateData.code || ""},
        name = ${updateData.customer_name || updateData.name || ""},
        mobile1 = ${updateData.mobile1 || ""},
        mobile2 = ${updateData.mobile2 || ""},
        whatsapp1 = ${updateData.whatsapp1 || ""},
        whatsapp2 = ${updateData.whatsapp2 || ""},
        city = ${updateData.city || ""},
        address = ${updateData.address || ""},
        email = ${updateData.email || ""},
        status = ${updateData.status || "نشط"},
        business_nature = ${updateData.business_nature || ""},
        salesman = ${updateData.salesman || ""},
        classification = ${updateData.classifications || updateData.classification || ""},
        registration_date = ${updateData.account_opening_date || updateData.registration_date || new Date().toISOString().split("T")[0]},
        transaction_notes = ${updateData.movement_notes || updateData.transaction_notes || ""},
        general_notes = ${updateData.general_notes || ""},
        api_key = ${updateData.api_number || updateData.api_key || ""},
        type = ${Number(updateData.type) || 1},
        priceCategory = ${Number(updateData.pricecategory) || Number(updateData.priceCategory) || 0},
        account_id = ${accountId},
        updated_at = CURRENT_TIMESTAMP
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

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating customer:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `فشل تحديث العميل: ${message}` }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 })
    }

    await sql`DELETE FROM customers WHERE id = ${id}`

    return NextResponse.json({ message: "Customer deleted successfully" })
  } catch (error) {
    console.error("Error deleting customer:", error)
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 })
  }
}
