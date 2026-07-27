import { NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET() {
  try {
    const messages = await sql`
      SELECT 
        sm.id,
        mt.template_name,
        sm.recipient_type,
        sm.scheduled_time,
        sm.repeat_type,
        sm.status,
        sm.message_content,
        sm.created_at
      FROM scheduled_messages sm
      LEFT JOIN message_templates mt ON sm.template_id = mt.id
      WHERE sm.status != 'cancelled'
      ORDER BY sm.scheduled_time ASC
    `

    return NextResponse.json(messages)
  } catch (error) {
    console.error("[v0] Error fetching scheduled messages:", error)
    return NextResponse.json({ error: "فشل في جلب الرسائل المجدولة" }, { status: 500 })
  }
}
