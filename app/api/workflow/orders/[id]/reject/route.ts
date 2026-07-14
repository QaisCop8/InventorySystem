import { type NextRequest, NextResponse } from "next/server"
import { getWorkflowStatistics } from "@/lib/workflow"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const department = searchParams.get("department") || undefined

    // إحصائيات المراحل
    const stageStats = await getWorkflowStatistics(department)

    // إحصائيات عامة
    const generalStats = await sql`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN ows.order_type = 'sales' THEN 1 END) as sales_orders,
        COUNT(CASE WHEN ows.order_type = 'purchase' THEN 1 END) as purchase_orders,
        COUNT(CASE WHEN ows.is_overdue THEN 1 END) as overdue_orders,
        COUNT(CASE WHEN ws.stage_type = 'end' THEN 1 END) as completed_orders,
        AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ows.stage_start_time))/3600) as avg_stage_duration
      FROM order_workflow_status ows
      JOIN workflow_stages ws ON ows.current_stage_id = ws.id
      ${department ? sql`WHERE ows.assigned_to_department = ${department}` : sql``}
    `

    // الطلبيات الحديثة
    const recentOrders = await sql`
      SELECT 
        ows.*,
        ws.stage_name,
        ws.stage_color,
        ws.icon_name,
        CASE 
          WHEN ows.order_type = 'sales' THEN so.customer_name
          WHEN ows.order_type = 'purchase' THEN po.supplier_name
        END as partner_name,
        CASE 
          WHEN ows.order_type = 'sales' THEN so.total_amount
          WHEN ows.order_type = 'purchase' THEN po.total_amount
        END as total_amount,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ows.stage_start_time))/3600 as hours_in_stage
      FROM order_workflow_status ows
      JOIN workflow_stages ws ON ows.current_stage_id = ws.id
      LEFT JOIN sales_orders so ON ows.order_type = 'sales' AND ows.order_id = so.id
      LEFT JOIN purchase_orders po ON ows.order_type = 'purchase' AND ows.order_id = po.id
      ${department ? sql`WHERE ows.assigned_to_department = ${department}` : sql``}
      ORDER BY ows.created_at DESC
      LIMIT 10
    `

    // الطلبيات المتأخرة
    const overdueOrders = await sql`
      SELECT 
        ows.*,
        ws.stage_name,
        ws.stage_color,
        ws.max_duration_hours,
        CASE 
          WHEN ows.order_type = 'sales' THEN so.customer_name
          WHEN ows.order_type = 'purchase' THEN po.supplier_name
        END as partner_name,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ows.stage_start_time))/3600 as hours_overdue
      FROM order_workflow_status ows
      JOIN workflow_stages ws ON ows.current_stage_id = ws.id
      LEFT JOIN sales_orders so ON ows.order_type = 'sales' AND ows.order_id = so.id
      LEFT JOIN purchase_orders po ON ows.order_type = 'purchase' AND ows.order_id = po.id
      WHERE ows.is_overdue = true
      ${department ? sql`AND ows.assigned_to_department = ${department}` : sql``}
      ORDER BY ows.stage_start_time ASC
      LIMIT 10
    `

    // إحصائيات الأداء اليومية
    const dailyStats = await sql`
      SELECT 
        DATE(wh.created_at) as date,
        COUNT(*) as total_actions,
        COUNT(CASE WHEN wh.action_type = 'advance' THEN 1 END) as advances,
        COUNT(CASE WHEN wh.action_type = 'reject' THEN 1 END) as rejections,
        AVG(EXTRACT(EPOCH FROM wh.duration_in_previous_stage::interval)/3600) as avg_duration
      FROM workflow_history wh
      WHERE wh.created_at >= CURRENT_DATE - INTERVAL '7 days'
      ${department ? sql`AND wh.performed_by_department = ${department}` : sql``}
      GROUP BY DATE(wh.created_at)
      ORDER BY date DESC
    `

    return NextResponse.json({
      stageStats,
      generalStats: generalStats[0],
      recentOrders,
      overdueOrders,
      dailyStats,
    })
  } catch (error) {
    console.error("Error fetching dashboard data:", error)
    return NextResponse.json({ error: "فشل في جلب بيانات لوحة التحكم" }, { status: 500 })
  }
}

