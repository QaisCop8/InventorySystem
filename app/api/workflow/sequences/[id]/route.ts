import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const stageId = searchParams.get("stage_id")
    const department = searchParams.get("department")
    const orderType = searchParams.get("order_type")
    const status = searchParams.get("status") // 'overdue', 'normal', 'all'
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    const whereConditions = []
    const params: any[] = []

    if (stageId) {
      whereConditions.push(`ows.current_stage_id = $${params.length + 1}`)
      params.push(Number.parseInt(stageId))
    }

    if (department) {
      whereConditions.push(`ows.assigned_to_department = $${params.length + 1}`)
      params.push(department)
    }

    if (orderType) {
      whereConditions.push(`ows.order_type = $${params.length + 1}`)
      params.push(orderType)
    }

    if (status === "overdue") {
      whereConditions.push("ows.is_overdue = true")
    } else if (status === "normal") {
      whereConditions.push("ows.is_overdue = false")
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : ""

    const query = `
      SELECT 
        ows.*,
        ws.stage_name,
        ws.stage_color,
        ws.icon_name,
        ws.stage_type,
        ws.requires_approval,
        wseq.sequence_name,
        CASE 
          WHEN ows.order_type = 'sales' THEN so.customer_name
          WHEN ows.order_type = 'purchase' THEN po.supplier_name
        END as partner_name,
        CASE 
          WHEN ows.order_type = 'sales' THEN so.total_amount
          WHEN ows.order_type = 'purchase' THEN po.total_amount
        END as total_amount,
        CASE 
          WHEN ows.order_type = 'sales' THEN so.order_date
          WHEN ows.order_type = 'purchase' THEN po.order_date
        END as order_date,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ows.stage_start_time))/3600 as hours_in_stage
      FROM order_workflow_status ows
      JOIN workflow_stages ws ON ows.current_stage_id = ws.id
      JOIN workflow_sequences wseq ON ows.sequence_id = wseq.id
      LEFT JOIN sales_orders so ON ows.order_type = 'sales' AND ows.order_id = so.id
      LEFT JOIN purchase_orders po ON ows.order_type = 'purchase' AND ows.order_id = po.id
      ${whereClause}
      ORDER BY 
        CASE ows.priority_level 
          WHEN 'urgent' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'normal' THEN 3 
          WHEN 'low' THEN 4 
        END,
        ows.stage_start_time ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `

    params.push(limit, offset)

    const orders = await sql.unsafe(query, params)

    // عدد الطلبيات الإجمالي
    const countQuery = `
      SELECT COUNT(*) as total
      FROM order_workflow_status ows
      JOIN workflow_stages ws ON ows.current_stage_id = ws.id
      LEFT JOIN sales_orders so ON ows.order_type = 'sales' AND ows.order_id = so.id
      LEFT JOIN purchase_orders po ON ows.order_type = 'purchase' AND ows.order_id = po.id
      ${whereClause}
    `

    const countResult = await sql.unsafe(countQuery, params.slice(0, -2))
    const total = countResult && countResult[0] ? Number.parseInt(countResult[0].total) : 0

    return NextResponse.json({
      orders,
      total,
      hasMore: offset + limit < total,
    })
  } catch (error) {
    console.error("Error fetching orders:", error)
    return NextResponse.json({ error: "فشل في جلب الطلبيات" }, { status: 500 })
  }
}

