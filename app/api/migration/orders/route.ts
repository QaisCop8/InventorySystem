import { NextRequest, NextResponse } from "next/server"

import sql, { getTenantPool } from "@/lib/database"



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

        const { rows } = await (await getTenantPool()).query(query, params)

        return NextResponse.json(rows)
    } catch (error: any) {
        console.error("Failed to fetch orders:", error)
        return NextResponse.json(
            { error: "فشل في جلب البيانات" },
            { status: 500 }
        )
    }
}

