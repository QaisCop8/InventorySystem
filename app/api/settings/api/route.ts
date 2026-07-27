import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET() {
  try {
    const settings = await sql`
      SELECT 
        id, api_name, api_url, is_enabled, timeout_seconds, 
        retry_attempts, rate_limit, webhook_url, last_sync, 
        sync_frequency, error_count, last_error, created_at, updated_at
      FROM api_settings 
      ORDER BY api_name
    `

    return NextResponse.json(settings)
  } catch (error) {
    console.error("Database query error:", error)
    return NextResponse.json({ error: "Failed to fetch API settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    const result = await sql`
      INSERT INTO api_settings (
        api_name, api_url, api_key, api_secret, is_enabled,
        timeout_seconds, retry_attempts, rate_limit, webhook_url,
        webhook_secret, sync_frequency
      ) VALUES (
        ${data.api_name}, ${data.api_url}, ${data.api_key}, ${data.api_secret},
        ${data.is_enabled || false}, ${data.timeout_seconds || 30},
        ${data.retry_attempts || 3}, ${data.rate_limit || 100},
        ${data.webhook_url}, ${data.webhook_secret}, ${data.sync_frequency || "manual"}
      )
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Database insert error:", error)
    return NextResponse.json({ error: "Failed to create API setting" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()

    const result = await sql`
      UPDATE api_settings 
      SET 
        api_url = ${data.api_url},
        api_key = ${data.api_key},
        api_secret = ${data.api_secret},
        is_enabled = ${data.is_enabled},
        timeout_seconds = ${data.timeout_seconds},
        retry_attempts = ${data.retry_attempts},
        rate_limit = ${data.rate_limit},
        webhook_url = ${data.webhook_url},
        webhook_secret = ${data.webhook_secret},
        sync_frequency = ${data.sync_frequency},
        error_count = ${data.error_count || 0},
        last_error = ${data.last_error},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Database update error:", error)
    return NextResponse.json({ error: "Failed to update API setting" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "API setting ID is required" }, { status: 400 })
    }

    await sql`DELETE FROM api_settings WHERE id = ${id}`

    return NextResponse.json({ message: "API setting deleted successfully" })
  } catch (error) {
    console.error("Error deleting API setting:", error)
    return NextResponse.json({ error: "Failed to delete API setting" }, { status: 500 })
  }
}
