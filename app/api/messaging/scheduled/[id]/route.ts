import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const status = searchParams.get("status")
    const type = searchParams.get("type")
    const search = searchParams.get("search")
    const offset = (page - 1) * limit

    const whereConditions = []
    const params: any[] = []

    if (status && status !== "all") {
      whereConditions.push(`status = $${params.length + 1}`)
      params.push(status)
    }

    if (search) {
      whereConditions.push(
        `(phone_number LIKE $${params.length + 1} OR product_name LIKE $${params.length + 1} OR product_code LIKE $${params.length + 1})`,
      )
      params.push(`%${search}%`)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : ""

    // دمج البيانات من جداول WhatsApp و SMS
    const logs = await sql`
      SELECT 
        id,
        phone_number,
        message_content,
        status,
        'whatsapp' as message_type,
        sent_at,
        error_message,
        created_at,
        product_name,
        product_code,
        NULL as order_number
      FROM whatsapp_notification_log
      ${whereClause ? sql.unsafe(whereClause) : sql``}
      
      UNION ALL
      
      SELECT 
        id,
        phone_number,
        message_content,
        status,
        notification_method as message_type,
        sent_at,
        error_message,
        created_at,
        NULL as product_name,
        NULL as product_code,
        order_number
      FROM customer_notification_log
      ${whereClause ? sql.unsafe(whereClause) : sql``}
      
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    // حساب إجمالي الصفحات
    const countResult = await sql`
      SELECT 
        (SELECT COUNT(*) FROM whatsapp_notification_log ${whereClause ? sql.unsafe(whereClause) : sql``}) +
        (SELECT COUNT(*) FROM customer_notification_log ${whereClause ? sql.unsafe(whereClause) : sql``}) as total
    `

    const total = Number.parseInt(countResult[0].total)
    const totalPages = Math.ceil(total / limit)

    return NextResponse.json({
      logs,
      page,
      totalPages,
      total,
    })
  } catch (error) {
    console.error("[v0] Error fetching logs:", error)
    return NextResponse.json({ error: "فشل في جلب السجلات" }, { status: 500 })
  }
}

