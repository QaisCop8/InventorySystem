import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest) {
  try {
    const errorLog = await request.json()

    // حفظ الخطأ في قاعدة البيانات
    await sql`
      INSERT INTO error_logs (
        error_id, timestamp, level, message, stack, context,
        user_id, user_agent, url
      ) VALUES (
        ${errorLog.id}, ${errorLog.timestamp}, ${errorLog.level},
        ${errorLog.message}, ${errorLog.stack || null}, 
        ${JSON.stringify(errorLog.context || {})},
        ${errorLog.userId || null}, ${errorLog.userAgent || null},
        ${errorLog.url || null}
      )
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error saving error log:", error)
    return NextResponse.json({ error: "Failed to save error log" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const level = searchParams.get("level")
    const limit = Number.parseInt(searchParams.get("limit") || "100")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    const query = `
      SELECT * FROM error_logs
      ${level ? `WHERE level = '${level}'` : ""}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const logs = await sql.unsafe(query)

    return NextResponse.json({ logs })
  } catch (error) {
    console.error("Error fetching error logs:", error)
    return NextResponse.json({ error: "Failed to fetch error logs" }, { status: 500 })
  }
}

