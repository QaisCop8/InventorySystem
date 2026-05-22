import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reference_number = searchParams.get("reference_number");
    const order_id = searchParams.get("order_id");
    const is_purchase = searchParams.get("is_purchase") === "true";
    const customer_id = searchParams.get("customer_id");

    if (!reference_number) {
      return NextResponse.json(
        { error: "reference_number is required", exists: false },
        { status: 400 }
      );
    }

    let queryText = "";
    let params: (string | number)[] = [reference_number];

    if (is_purchase) {
      // For purchase orders: check by reference_number and customer_id
      queryText = `
        SELECT COUNT(*) as count
        FROM orders
        WHERE reference_number = $1
        AND deleted = false
        AND id != $2
      `;
      params.push(order_id || "0");

      // Add customer filter if provided
      if (customer_id) {
        queryText += " AND customer_id = $3";
        params.push(customer_id);
      }
    } else {
      // For sale orders: check only by reference_number
      queryText = `
        SELECT COUNT(*) as count
        FROM orders
        WHERE reference_number = $1
        AND deleted = false
        AND id != $2
      `;
      params.push(order_id || "0");
    }

    const result = await pool.query(queryText, params);
    const count = parseInt(result.rows[0].count, 10);

    return NextResponse.json({
      exists: count > 0,
      count: count,
    });
  } catch (error) {
    console.error("Error checking reference duplicate:", error);
    return NextResponse.json(
      { error: "Failed to check reference number", exists: false },
      { status: 500 }
    );
  }
}
