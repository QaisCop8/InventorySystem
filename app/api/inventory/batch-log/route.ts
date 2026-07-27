import { NextRequest, NextResponse } from "next/server"

import sql, { getTenantPool } from "@/lib/database"



export default sql
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const product_id = searchParams.get("product_id") || ""
    const from_date = searchParams.get("from_date") || ""
    let to_date = searchParams.get("to_date") || ""
    if (to_date) {
      const dateObj = new Date(to_date); // creates date at 00:00:00
      dateObj.setHours(23, 59, 59, 999); // set time to 23:59:59.999
      to_date = dateObj.toISOString(); // "2026-01-15T23:59:59.999Z"
    }
    const batchNumber = searchParams.get("batch_number")

    // بناء query ديناميكي
    let conditions: string[] = []
    let values: any[] = []

    if (product_id) {
      values.push(`%${product_id}%`)
      conditions.push(`p.product_id ILIKE $${values.length}`)
    }

    if (from_date) {
      values.push(from_date)
      conditions.push(`bl.log_date >= $${values.length}`)
    }

    if (to_date) {
      values.push(to_date)
      conditions.push(`bl.log_date <= $${values.length}`)
    }
    if (batchNumber && batchNumber.trim() !== "") {
      values.push(`%${batchNumber}%`);
      conditions.push(`sb.batch_number LIKE $${values.length}`);
    }
    const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : ""

    const query = `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY bl.log_date DESC) AS ser,
        p.product_code,
        p.product_name,
        sb.batch_number,
        u.username AS user_name,
        TO_CHAR(bl.log_date, 'YYYY-MM-DD HH24:MI:SS') AS log_date,
        CASE bl.status
          WHEN 1 THEN 'جديد'
          WHEN 2 THEN 'قيد الاستخدام'
          WHEN 3 THEN 'مغلق'
          ELSE 'تالف'
        END AS batch_status
      FROM stock_batch_log bl
      JOIN stock_batch sb ON sb.id = bl.stock_batch_id
      JOIN products p ON bl.product_id = p.id
      JOIN user_settings u ON bl.user_id = u.user_id
      ${whereClause}
      ORDER BY bl.log_date DESC
      LIMIT 10000
    `

    const result = await (await getTenantPool()).query(query, values);
    return NextResponse.json(result.rows)
  } catch (err: any) {
    console.error("Failed to fetch batch log:", err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
