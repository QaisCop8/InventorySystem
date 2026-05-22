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
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)

        const orderNumber = searchParams.get("order_number") || ""
        const fromDate = searchParams.get("from_date") || ""
        const toDate = searchParams.get("to_date") || ""
        const orderType = searchParams.get("order_type") || "all"

        // ===== Build dynamic query =====
        let query = `
      SELECT
        orders.id,
        "order_number",
        orders.exchange_rate,
        to_char(order_date, 'YYYY-MM-DD') as order_date,
        order_decision,
        order_status2,
        customers.customer_code,
        orders.customer_name,
        total_amount,
        vat_amount,
        discount_amount,
        discount_type,
        orders.general_notes,
        reference_number,
        is_exported,
        received_by,
        customer_order_no,
        CASE order_type 
          WHEN 1 THEN 'طلبية مبيعات'
          WHEN 2 THEN 'طلبية مشتريات'
          ELSE 'غير محدد'
        END AS order_type,
        order_type as order_type_id,
        currency.currency_code as currency
      FROM orders
      INNER JOIN customers ON orders.customer_id = customers.id
      INNER JOIN currency ON orders.currency_id = currency.id
      WHERE deleted = false
      AND is_exported = 0
    `
        const params: any[] = []
        let idx = 1

        if (orderNumber) {
            query += ` AND order_number ILIKE $${idx}`  // ILIKE للتجاهل حالة الأحرف
            params.push(`%${orderNumber}%`)             // أي شيء يحتوي orderNumber
            idx++
        }

        if (fromDate) {
            query += ` AND order_date >= $${idx}`
            params.push(fromDate)
            idx++
        }

        if (toDate) {
            query += ` AND order_date <= $${idx}`
            params.push(toDate)
            idx++
        }

        if (orderType !== "all") {
            if (orderType === "sales") {
                query += ` AND order_type = 1`
            } else if (orderType === "purchase") {
                query += ` AND order_type = 2`
            }
        }

        query += ` ORDER BY reference_number,order_date`

        const { rows } = await pool.query(query, params)

        return NextResponse.json(rows)
    } catch (error: any) {
        console.error("Failed to fetch orders:", error)
        return NextResponse.json(
            { error: "فشل في جلب البيانات" },
            { status: 500 }
        )
    }
}

