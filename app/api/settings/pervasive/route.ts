import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { encrypt } from "@/lib/encryption"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (id) {
      // Get specific connection
      const result = await sql`
        SELECT 
          id, connection_name, connection_type, api_url, database_name,
          username, password_encrypted, odbc_driver, odbc_dsn, connection_string,
          is_active, is_default, timeout_seconds, max_retries,
          last_test_at, last_test_status, last_test_message,
          created_at, updated_at
        FROM pervasive_settings
        WHERE id = ${id}
      `

      if (result.length === 0) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 })
      }

      // Decrypt password for display (masked)
      const connection = result[0]
      return NextResponse.json({
        ...connection,
        password: connection.password_encrypted ? "********" : "",
      })
    } else {
      // Get all connections
      const connections = await sql`
        SELECT 
          id, connection_name, connection_type, api_url, database_name,
          username, odbc_driver, is_active, is_default,
          last_test_at, last_test_status, created_at, updated_at
        FROM pervasive_settings
        ORDER BY is_default DESC, connection_name ASC
      `

      return NextResponse.json(connections)
    }
  } catch (error) {
    console.error("[v0] Error fetching Pervasive settings:", error)
    return NextResponse.json({ error: "Failed to fetch Pervasive settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    // Validate required fields
    if (!data.connection_name || !data.database_name || !data.username) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Encrypt password
    const encryptedPassword = data.password ? encrypt(data.password) : ""

    // If this is set as default, unset other defaults
    if (data.is_default) {
      await sql`UPDATE pervasive_settings SET is_default = false`
    }

    const result = await sql`
      INSERT INTO pervasive_settings (
        connection_name, connection_type, api_url, database_name,
        username, password_encrypted, odbc_driver, odbc_dsn,
        connection_string, is_active, is_default, timeout_seconds, max_retries
      ) VALUES (
        ${data.connection_name},
        ${data.connection_type || "odbc"},
        ${data.api_url || null},
        ${data.database_name},
        ${data.username},
        ${encryptedPassword},
        ${data.odbc_driver || "Pervasive ODBC Engine Interface"},
        ${data.odbc_dsn || null},
        ${data.connection_string || null},
        ${data.is_active !== false},
        ${data.is_default || false},
        ${data.timeout_seconds || 30},
        ${data.max_retries || 3}
      )
      RETURNING id, connection_name, connection_type, database_name, is_active, is_default
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[v0] Error creating Pervasive connection:", error)
    return NextResponse.json({ error: "Failed to create Pervasive connection" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: "Connection ID is required" }, { status: 400 })
    }

    // If this is set as default, unset other defaults
    if (data.is_default) {
      await sql`UPDATE pervasive_settings SET is_default = false WHERE id != ${data.id}`
    }

    // Build update query - only encrypt password if provided
    let passwordUpdate = sql``
    if (data.password && data.password !== "********") {
      const encryptedPassword = encrypt(data.password)
      passwordUpdate = sql`, password_encrypted = ${encryptedPassword}`
    }

    const result = await sql`
      UPDATE pervasive_settings
      SET
        connection_name = ${data.connection_name},
        connection_type = ${data.connection_type || "odbc"},
        api_url = ${data.api_url || null},
        database_name = ${data.database_name},
        username = ${data.username}
        ${passwordUpdate},
        odbc_driver = ${data.odbc_driver || "Pervasive ODBC Engine Interface"},
        odbc_dsn = ${data.odbc_dsn || null},
        connection_string = ${data.connection_string || null},
        is_active = ${data.is_active !== false},
        is_default = ${data.is_default || false},
        timeout_seconds = ${data.timeout_seconds || 30},
        max_retries = ${data.max_retries || 3},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING id, connection_name, connection_type, database_name, is_active, is_default
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[v0] Error updating Pervasive connection:", error)
    return NextResponse.json({ error: "Failed to update Pervasive connection" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Connection ID is required" }, { status: 400 })
    }

    await sql`DELETE FROM pervasive_settings WHERE id = ${id}`

    return NextResponse.json({ message: "Connection deleted successfully" })
  } catch (error) {
    console.error("[v0] Error deleting Pervasive connection:", error)
    return NextResponse.json({ error: "Failed to delete Pervasive connection" }, { status: 500 })
  }
}
