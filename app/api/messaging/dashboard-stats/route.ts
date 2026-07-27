import { NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET() {
  try {
    // إحصائيات اليوم
    const todayStats = await sql`
      SELECT 
        COALESCE(SUM(total_sent), 0) as total_sent,
        COALESCE(SUM(total_delivered), 0) as total_delivered,
        COALESCE(SUM(total_failed), 0) as total_failed,
        COALESCE(AVG(success_rate), 0) as success_rate
      FROM message_statistics
      WHERE stat_date = CURRENT_DATE
    `

    // إحصائيات الأمس
    const yesterdayStats = await sql`
      SELECT 
        COALESCE(SUM(total_sent), 0) as total_sent,
        COALESCE(AVG(success_rate), 0) as success_rate
      FROM message_statistics
      WHERE stat_date = CURRENT_DATE - INTERVAL '1 day'
    `

    // إحصائيات الأسبوع
    const weekStats = await sql`
      SELECT 
        COALESCE(SUM(total_sent), 0) as total_sent,
        COALESCE(SUM(total_delivered), 0) as total_delivered,
        COALESCE(SUM(total_failed), 0) as total_failed,
        COALESCE(AVG(success_rate), 0) as success_rate
      FROM message_statistics
      WHERE stat_date >= CURRENT_DATE - INTERVAL '7 days'
    `

    // إحصائيات الشهر
    const monthStats = await sql`
      SELECT 
        COALESCE(SUM(total_sent), 0) as total_sent,
        COALESCE(SUM(total_delivered), 0) as total_delivered,
        COALESCE(SUM(total_failed), 0) as total_failed,
        COALESCE(AVG(success_rate), 0) as success_rate
      FROM message_statistics
      WHERE stat_date >= CURRENT_DATE - INTERVAL '30 days'
    `

    return NextResponse.json({
      today: todayStats[0],
      yesterday: yesterdayStats[0],
      week: weekStats[0],
      month: monthStats[0],
    })
  } catch (error) {
    console.error("[v0] Error fetching dashboard stats:", error)
    return NextResponse.json({ error: "فشل في جلب الإحصائيات" }, { status: 500 })
  }
}
