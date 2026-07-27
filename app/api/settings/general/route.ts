import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category") // 'system', 'ui', 'business', 'integration'

    let query
    if (category) {
      query = sql`
        SELECT * FROM general_settings 
        WHERE category = ${category}
        ORDER BY setting_key
      `
    } else {
      query = sql`
        SELECT * FROM general_settings 
        ORDER BY category, setting_key
      `
    }

    const settings = await query
    return NextResponse.json(settings)
  } catch (error) {
    console.error("Database query error:", error)
    return NextResponse.json({ error: "Failed to fetch general settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    const result = await sql`
      INSERT INTO general_settings (
        setting_key, setting_value, setting_type, category, 
        description, is_public
      ) VALUES (
        ${data.setting_key}, ${data.setting_value}, ${data.setting_type || "string"}, 
        ${data.category}, ${data.description}, ${data.is_public || false}
      )
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Database insert error:", error)
    return NextResponse.json({ error: "Failed to create general setting" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()

    const result = await sql`
      UPDATE general_settings 
      SET 
        setting_value = ${data.setting_value},
        setting_type = ${data.setting_type},
        category = ${data.category},
        description = ${data.description},
        is_public = ${data.is_public},
        updated_at = CURRENT_TIMESTAMP
      WHERE setting_key = ${data.setting_key}
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Database update error:", error)
    return NextResponse.json({ error: "Failed to update general setting" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const settingKey = searchParams.get("key")

    if (!settingKey) {
      return NextResponse.json({ error: "Setting key is required" }, { status: 400 })
    }

    await sql`DELETE FROM general_settings WHERE setting_key = ${settingKey}`

    return NextResponse.json({ message: "General setting deleted successfully" })
  } catch (error) {
    console.error("Error deleting general setting:", error)
    return NextResponse.json({ error: "Failed to delete general setting" }, { status: 500 })
  }
}
