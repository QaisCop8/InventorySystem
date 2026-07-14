import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period") || "week"

    let days = 7
    if (period === "month") days = 30
    else if (period === "quarter") days = 90
    else if (period === "year") days = 365

    // البيانات اليومية
    const dailyStats = await sql`
      SELECT 
        stat_date::text as date,
        SUM(total_sent) as total_sent,
        SUM(total_delivered) as total_delivered,
        SUM(total_failed) as total_failed,
        AVG(success_rate) as success_rate
      FROM message_statistics
      WHERE stat_date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY stat_date
      ORDER BY stat_date DESC
    `

    // الإحصائيات الإجمالية للأسبوع
    const weeklyStats = await sql`
      SELECT 
        COALESCE(SUM(total_sent), 0) as total_sent,
        COALESCE(SUM(total_delivered), 0) as total_delivered,
        COALESCE(SUM(total_failed), 0) as total_failed,
        COALESCE(AVG(success_rate), 0) as success_rate
      FROM message_statistics
      WHERE stat_date >= CURRENT_DATE - INTERVAL '7 days'
    `

    // الإحصائيات الإجمالية للشهر
    const monthlyStats = await sql`
      SELECT 
        COALESCE(SUM(total_sent), 0) as total_sent,
        COALESCE(SUM(total_delivered), 0) as total_delivered,
        COALESCE(SUM(total_failed), 0) as total_failed,
        COALESCE(AVG(success_rate), 0) as success_rate
      FROM message_statistics
      WHERE stat_date >= CURRENT_DATE - INTERVAL '30 days'
    `

    return NextResponse.json({
      daily: dailyStats,
      weekly: weeklyStats[0],
      monthly: monthlyStats[0],
    })
  } catch (error) {
    console.error("[v0] Error fetching statistics:", error)
    return NextResponse.json({ error: "فشل في جلب الإحصائيات" }, { status: 500 })
  }
}

