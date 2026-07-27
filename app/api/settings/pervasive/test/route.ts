import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { decrypt } from "@/lib/encryption"

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const connectionId = data.id

    if (!connectionId) {
      return NextResponse.json({ error: "Connection ID is required" }, { status: 400 })
    }

    // Get connection settings
    const result = await sql`
      SELECT 
        connection_type, api_url, database_name, username,
        password_encrypted, odbc_driver, odbc_dsn, connection_string,
        timeout_seconds
      FROM pervasive_settings
      WHERE id = ${connectionId}
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const settings = result[0]
    const password = settings.password_encrypted ? decrypt(settings.password_encrypted) : ""

    let testResult: { success: boolean; message: string; details?: any }

    if (settings.connection_type === "api") {
      // Test API connection
      testResult = await testApiConnection(settings.api_url, settings.username, password, settings.timeout_seconds)
    } else {
      // Test ODBC connection
      testResult = await testOdbcConnection(
        settings.database_name,
        settings.username,
        password,
        settings.odbc_driver,
        settings.odbc_dsn,
        settings.connection_string,
        settings.timeout_seconds,
      )
    }

    // Update last test status
    await sql`
      UPDATE pervasive_settings
      SET
        last_test_at = CURRENT_TIMESTAMP,
        last_test_status = ${testResult.success ? "success" : "failed"},
        last_test_message = ${testResult.message}
      WHERE id = ${connectionId}
    `

    return NextResponse.json(testResult)
  } catch (error) {
    console.error("[v0] Error testing Pervasive connection:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to test connection",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

async function testApiConnection(
  apiUrl: string,
  username: string,
  password: string,
  timeout: number,
): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000)

    const response = await fetch(`${apiUrl}/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      return {
        success: true,
        message: "API connection successful",
        details: await response.json(),
      }
    } else {
      return {
        success: false,
        message: `API connection failed: ${response.statusText}`,
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        message: "Connection timeout",
      }
    }
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

async function testOdbcConnection(
  databaseName: string,
  username: string,
  password: string,
  driver: string,
  dsn: string | null,
  connectionString: string | null,
  timeout: number,
): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    // Note: ODBC connection requires the 'odbc' npm package
    // This is a placeholder implementation
    // In production, you would use: const odbc = require('odbc')

    // Build connection string
    let connStr = connectionString
    if (!connStr) {
      if (dsn) {
        connStr = `DSN=${dsn};UID=${username};PWD=${password};`
      } else {
        connStr = `DRIVER={${driver}};ServerName=localhost;DBQ=${databaseName};UID=${username};PWD=${password};`
      }
    }

    console.log("[v0] Testing ODBC connection:", {
      driver,
      database: databaseName,
      username,
      dsn,
    })

    // Placeholder: In production, implement actual ODBC connection test
    // const connection = await odbc.connect(connStr)
    // const result = await connection.query('SELECT 1')
    // await connection.close()

    return {
      success: true,
      message: "ODBC connection test successful (simulated)",
      details: {
        driver,
        database: databaseName,
        note: "Install odbc package for actual ODBC connectivity",
      },
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "ODBC connection failed",
    }
  }
}
