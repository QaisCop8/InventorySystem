import { NextRequest, NextResponse } from "next/server"

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const batchId = Number(params.id);

    // Get JSON body
    const body = await request.json();
    const statusId = Number(body.status_id);

    const userId = body.user_id ? Number(body.user_id) : null;

    const batchRows = await sql`
      SELECT product_id, batch_number
      FROM stock_batch
      WHERE id = ${batchId}
    `;

    if (batchRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "الرقم التشغيلي غير موجود" },
        { status: 404 }
      );
    }

    const { product_id, batch_number } = batchRows[0];

    if (!batchId || !statusId) {
      return NextResponse.json(
        { success: false, error: "الرقم التشغيلي والحالة خطأ" },
        { status: 400 }
      );
    }

    await sql`
      UPDATE stock_batch
      SET status_id = ${statusId}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${batchId}
    `;

     await sql`
      INSERT INTO stock_batch_log
        (product_id, stock_batch_id, user_id, status, log_date)
      VALUES
        (${product_id}, ${batchId}, ${userId}, ${statusId}, CURRENT_TIMESTAMP)
    `;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[v0] Failed to update batch status:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
