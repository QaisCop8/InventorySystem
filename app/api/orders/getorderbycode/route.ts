
import { NextResponse } from "next/server";
import { getTenantPool } from "@/lib/database";

export async function GET(request: Request) {
  try {
    const pool = await getTenantPool();
    const { searchParams } = new URL(request.url);
    const order_number = searchParams.get("order_number");

    if (!order_number) {
      return NextResponse.json(
        { error: "order_number is required" },
        { status: 400 }
      );
    }

    const queryText = `
      SELECT 
        so.*,
        COALESCE(NULLIF(so.customer_name, ''), c.name, '') AS customer_name,
        COALESCE(c.code, '') AS customer_code
      FROM orders so
      LEFT JOIN account_tbl c ON so.customer_id = c.id
      WHERE so.order_number = $1 AND COALESCE(so.deleted, false) = false
      LIMIT 1
    `;

    const result = await pool.query(queryText, [order_number]);

    return NextResponse.json(
      result.rows[0] ?? null,
      { status: 200 }
    );

  } catch (error) {
    console.error("getorderbycode error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
