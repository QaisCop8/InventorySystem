// File: /app/api/customers/navigations/[navigationType]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(
  req: NextRequest,
  { params }: { params: { navigationType: string } }
) {
  let { navigationType } = params;
  const type = Number(req.nextUrl.searchParams.get("type") || 1); // 1=customer,2=supplier
  const currentId = Number(req.nextUrl.searchParams.get("currentId") || 0);
  const byId = Number(req.nextUrl.searchParams.get("id") || 0);
  if(navigationType === "previous" && currentId === 0) navigationType = "last";
  let query = "";
  let values: any[] = [type];

  try {
    switch (navigationType) {
      case "first":
        query = `
          SELECT
            c.*,
            acc.father_id,
            acc.finanical_list_id,
            acc.finanical_list_assests_id,
            acc.finanical_list_liabilities_id,
            acc.finanical_list_income_id,
            acc.currency_id,
            acc.allow_trans_with_diff_curr,
            acc.iscalc_curr_diff_rates,
            acc.level_no,
            COALESCE(accct.cost_centers, '[]'::json) AS cost_centers,
            COALESCE(ast.stop_transactions, '[]'::json) AS stop_transactions
          FROM customers c
          INNER JOIN account_tbl acc ON acc.id = c.account_id
          INNER JOIN (
            SELECT
              account_id,
              json_agg(
                json_build_object(
                  'cost_center_type_id', cost_center_type_id,
                  'required_in_transactions', required_in_transactions,
                  'default_cost_center_id', default_cost_center_id,
                  'cost_center_name', cc.name
                )
                ORDER BY id ASC
              ) AS cost_centers
            FROM account_costcenters_tbl accct
            LEFT JOIN cost_centers cc ON cc.id = accct.default_cost_center_id
            GROUP BY account_id
          ) accct ON accct.account_id = c.account_id
          INNER JOIN (
            SELECT
              account_id,
              json_agg(
                json_build_object(
                  'voucher_types_id', voucher_types_id,
                  'stop_date', stop_date
                )
                ORDER BY id ASC
              ) AS stop_transactions
            FROM account_stop_transactions_tbl
            GROUP BY account_id
          ) ast ON ast.account_id = c.account_id
          WHERE c.type=$1 AND (c.isDeleted IS NULL OR c.isDeleted = false)
          ORDER BY c.id ASC
          LIMIT 1
        `;
        break;

      case "last":
        query = `
          SELECT
            c.*,
            acc.father_id,
            acc.finanical_list_id,
            acc.finanical_list_assests_id,
            acc.finanical_list_liabilities_id,
            acc.finanical_list_income_id,
            acc.currency_id,
            acc.allow_trans_with_diff_curr,
            acc.iscalc_curr_diff_rates,
            acc.level_no,
            COALESCE(accct.cost_centers, '[]'::json) AS cost_centers,
            COALESCE(ast.stop_transactions, '[]'::json) AS stop_transactions
          FROM customers c
          INNER JOIN account_tbl acc ON acc.id = c.account_id
          INNER JOIN (
            SELECT
              account_id,
              json_agg(
                json_build_object(
                  'cost_center_type_id', cost_center_type_id,
                  'required_in_transactions', required_in_transactions,
                  'default_cost_center_id', default_cost_center_id,
                  'cost_center_name', cc.name
                )
                ORDER BY id ASC
              ) AS cost_centers
            FROM account_costcenters_tbl accct
            LEFT JOIN cost_centers cc ON cc.id = accct.default_cost_center_id
            GROUP BY account_id
          ) accct ON accct.account_id = c.account_id
          INNER JOIN (
            SELECT
              account_id,
              json_agg(
                json_build_object(
                  'voucher_types_id', voucher_types_id,
                  'stop_date', stop_date
                )
                ORDER BY id ASC
              ) AS stop_transactions
            FROM account_stop_transactions_tbl
            GROUP BY account_id
          ) ast ON ast.account_id = c.account_id
          WHERE c.type=$1 AND (c.isDeleted IS NULL OR c.isDeleted = false)
          ORDER BY c.id DESC
          LIMIT 1
        `;
        break;

      case "previous":
        query = `
          SELECT
            c.*,
            acc.father_id,
            acc.finanical_list_id,
            acc.finanical_list_assests_id,
            acc.finanical_list_liabilities_id,
            acc.finanical_list_income_id,
            acc.currency_id,
            acc.allow_trans_with_diff_curr,
            acc.iscalc_curr_diff_rates,
            acc.level_no,
            COALESCE(accct.cost_centers, '[]'::json) AS cost_centers,
            COALESCE(ast.stop_transactions, '[]'::json) AS stop_transactions
          FROM customers c
          INNER JOIN account_tbl acc ON acc.id = c.account_id
          INNER JOIN (
            SELECT
              account_id,
              json_agg(
                json_build_object(
                  'cost_center_type_id', cost_center_type_id,
                  'required_in_transactions', required_in_transactions,
                  'default_cost_center_id', default_cost_center_id,
                  'cost_center_name', cc.name
                )
                ORDER BY id ASC
              ) AS cost_centers
            FROM account_costcenters_tbl accct
            LEFT JOIN cost_centers cc ON cc.id = accct.default_cost_center_id
            GROUP BY account_id
          ) accct ON accct.account_id = c.account_id
          INNER JOIN (
            SELECT
              account_id,
              json_agg(
                json_build_object(
                  'voucher_types_id', voucher_types_id,
                  'stop_date', stop_date
                )
                ORDER BY id ASC
              ) AS stop_transactions
            FROM account_stop_transactions_tbl
            GROUP BY account_id
          ) ast ON ast.account_id = c.account_id
          WHERE c.type=$1 AND c.id < $2 AND (c.isDeleted IS NULL OR c.isDeleted = false)
          ORDER BY c.id DESC
          LIMIT 1
        `;
        values.push(currentId);
        break;

      case "next":
        query = `
          SELECT
            c.*,
            acc.father_id,
            acc.finanical_list_id,
            acc.finanical_list_assests_id,
            acc.finanical_list_liabilities_id,
            acc.finanical_list_income_id,
            acc.currency_id,
            acc.allow_trans_with_diff_curr,
            acc.iscalc_curr_diff_rates,
            acc.level_no,
            COALESCE(accct.cost_centers, '[]'::json) AS cost_centers,
            COALESCE(ast.stop_transactions, '[]'::json) AS stop_transactions
          FROM customers c
          INNER JOIN account_tbl acc ON acc.id = c.account_id
          INNER JOIN (
            SELECT
              account_id,
              json_agg(
                json_build_object(
                  'cost_center_type_id', cost_center_type_id,
                  'required_in_transactions', required_in_transactions,
                  'default_cost_center_id', default_cost_center_id,
                  'cost_center_name', cc.name
                )
                ORDER BY id ASC
              ) AS cost_centers
            FROM account_costcenters_tbl accct
            LEFT JOIN cost_centers cc ON cc.id = accct.default_cost_center_id
            GROUP BY account_id
          ) accct ON accct.account_id = c.account_id
          INNER JOIN (
            SELECT
              account_id,
              json_agg(
                json_build_object(
                  'voucher_types_id', voucher_types_id,
                  'stop_date', stop_date
                )
                ORDER BY id ASC
              ) AS stop_transactions
            FROM account_stop_transactions_tbl
            GROUP BY account_id
          ) ast ON ast.account_id = c.account_id
          WHERE c.type=$1 AND c.id > $2 AND (c.isDeleted IS NULL OR c.isDeleted = false)
          ORDER BY c.id ASC
          LIMIT 1
        `;
        values.push(currentId);
        break;

      case "ById":
        if (!byId) {
          return NextResponse.json({ error: "ID is required" }, { status: 400 });
        }
        query = `
          SELECT
            c.*,
            acc.father_id,
            acc.finanical_list_id,
            acc.finanical_list_assests_id,
            acc.finanical_list_liabilities_id,
            acc.finanical_list_income_id,
            acc.currency_id,
            acc.allow_trans_with_diff_curr,
            acc.iscalc_curr_diff_rates,
            acc.level_no,
            COALESCE(accct.cost_centers, '[]'::json) AS cost_centers,
            COALESCE(ast.stop_transactions, '[]'::json) AS stop_transactions
          FROM customers c
          INNER JOIN account_tbl acc ON acc.id = c.account_id
          INNER JOIN (
            SELECT
              account_id,
              json_agg(
                json_build_object(
                  'cost_center_type_id', cost_center_type_id,
                  'required_in_transactions', required_in_transactions,
                  'default_cost_center_id', default_cost_center_id,
                  'cost_center_name', cc.name
                )
                ORDER BY id ASC
              ) AS cost_centers
            FROM account_costcenters_tbl accct
            LEFT JOIN cost_centers cc ON cc.id = accct.default_cost_center_id
            GROUP BY account_id
          ) accct ON accct.account_id = c.account_id
          INNER JOIN (
            SELECT
              account_id,
              json_agg(
                json_build_object(
                  'voucher_types_id', voucher_types_id,
                  'stop_date', stop_date
                )
                ORDER BY id ASC
              ) AS stop_transactions
            FROM account_stop_transactions_tbl
            GROUP BY account_id
          ) ast ON ast.account_id = c.account_id
          WHERE c.type=$1 AND c.id=$2 AND (c.isDeleted IS NULL OR c.isDeleted = false)
        `;
        values.push(byId);
        break;

      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 });
    }

    const client = await pool.connect();
    const result = await client.query(query, values);
    

    if (!result.rows.length) {
      return NextResponse.json({ error: "No record found" }, { status: 404 });
    }

    const customer = result.rows[0];

    const vouchersResult = await client.query(
      `
      SELECT cv.id AS customer_voucher_id,
             cv.voucher_id AS type_id,
             vt.name AS type_name,
             cv.book_id,
             vb.name AS book_name,
             ROW_NUMBER() OVER (ORDER BY cv.id ASC) AS ser
      FROM customer_vouchers cv
      LEFT JOIN voucher_types vt ON cv.voucher_id = vt.id
      LEFT JOIN voucher_books vb ON cv.book_id = vb.id
      WHERE cv.customer_id = $1
      ORDER BY cv.id ASC
      `,
      [customer.id]
    );

    client.release();

    // Add voucherType array to customer object
    customer.voucherType = vouchersResult.rows.map((v: any) => ({
      type_id: v.type_id,
      type_name: v.type_name,
      book_id: v.book_id,
      book_name: v.book_name,
      ser: v.ser,
    }));
    customer.cost_centers = Array.isArray(customer.cost_centers) ? customer.cost_centers : [];
    customer.stop_transactions = Array.isArray(customer.stop_transactions) ? customer.stop_transactions : [];
    // Optional: add serial number or other computed fields
    customer.ser = 1;

    return NextResponse.json(customer);
  } catch (error) {
    console.error("Navigation API error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
