import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        const order_id = searchParams.get("order_id");

        if (!order_id) {
            return NextResponse.json({
                exists:  0,
                count: 0,
            });
        }

        let queryText = "";
        let params: (string | number)[] = [];

        // For sale orders: check only by reference_number
        queryText = `
        SELECT COUNT(*) as count
        FROM orders
        WHERE printed = 1
        
        AND id = $1
      `;
        params.push(order_id || "0");


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
