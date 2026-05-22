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
          SELECT * FROM customers
          WHERE type=$1 AND (isDeleted IS NULL OR isDeleted = false)
          ORDER BY id ASC
          LIMIT 1
        `;
        break;

      case "last":
        query = `
          SELECT * FROM customers
          WHERE type=$1 AND (isDeleted IS NULL OR isDeleted = false)
          ORDER BY id DESC
          LIMIT 1
        `;
        break;

      case "previous":
        query = `
          SELECT * FROM customers
          WHERE type=$1 AND id < $2 AND (isDeleted IS NULL OR isDeleted = false)
          ORDER BY id DESC
          LIMIT 1
        `;
        values.push(currentId);
        break;

      case "next":
        query = `
          SELECT * FROM customers
          WHERE type=$1 AND id > $2 AND (isDeleted IS NULL OR isDeleted = false)
          ORDER BY id ASC
          LIMIT 1
        `;
        values.push(currentId);
        break;

      case "ById":
        if (!byId) {
          return NextResponse.json({ error: "ID is required" }, { status: 400 });
        }
        query = `
          SELECT * FROM customers
          WHERE type=$1 AND id=$2 AND (isDeleted IS NULL OR isDeleted = false)
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
    // Optional: add serial number or other computed fields
    customer.ser = 1;

    return NextResponse.json(customer);
  } catch (error) {
    console.error("Navigation API error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
