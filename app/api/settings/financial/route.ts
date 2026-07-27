import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET() {
  try {
    const settings = await sql`
      SELECT setting_key, setting_value, setting_type, description
      FROM financial_settings
      ORDER BY setting_key
    `

    return NextResponse.json(settings)
  } catch (error) {
    console.error("Error fetching financial settings:", error)
    return NextResponse.json({ error: "Failed to fetch financial settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const settings = await request.json()

    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      await sql`
        UPDATE financial_settings
        SET setting_value = ${value as string},
            updated_at = CURRENT_TIMESTAMP
        WHERE setting_key = ${key}
      `
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating financial settings:", error)
    return NextResponse.json({ error: "Failed to update financial settings" }, { status: 500 })
  }
}
