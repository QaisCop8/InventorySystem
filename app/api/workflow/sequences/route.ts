import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET() {
  try {
    const sequences = await sql`
      SELECT 
        ws.*,
        COUNT(wss.id) as steps_count
      FROM workflow_sequences ws
      LEFT JOIN workflow_sequence_steps wss ON ws.id = wss.sequence_id
      WHERE ws.is_active = true
      GROUP BY ws.id
      ORDER BY ws.sequence_name
    `

    return NextResponse.json(sequences)
  } catch (error) {
    console.error("Error fetching workflow sequences:", error)
    return NextResponse.json({ error: "فشل في جلب التسلسلات" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.sequence_name || !data.sequence_type) {
      return NextResponse.json({ error: "اسم التسلسل ونوعه مطلوبان" }, { status: 400 })
    }

    // Check if default sequence already exists for this type
    if (data.is_default) {
      await sql`
        UPDATE workflow_sequences 
        SET is_default = false 
        WHERE sequence_type = ${data.sequence_type} AND is_default = true
      `
    }

    const result = await sql`
      INSERT INTO workflow_sequences (
        sequence_name, sequence_type, description, is_default, is_active
      ) VALUES (
        ${data.sequence_name}, ${data.sequence_type}, ${data.description || null},
        ${data.is_default || false}, true
      )
      RETURNING *
    `

    return NextResponse.json({
      success: true,
      sequence: result[0],
      message: "تم إنشاء التسلسل بنجاح",
    })
  } catch (error) {
    console.error("Error creating workflow sequence:", error)
    return NextResponse.json({ error: "فشل في إنشاء التسلسل" }, { status: 500 })
  }
}
