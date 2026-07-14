import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { decrypt } from "@/lib/encryption"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest) {
  try {
    const { connectionId, query, params } = await request.json()

    if (!connectionId) {
      return NextResponse.json({ error: "Connection ID is required" }, { status: 400 })
    }

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 })
    }

    // Get connection settings
    const result = await sql`
      SELECT 
        connection_type, api_url, database_name, username,
        password_encrypted, odbc_driver, odbc_dsn, connection_string,
        timeout_seconds, is_active
      FROM pervasive_settings
      WHERE id = ${connectionId}
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const settings = result[0]

    if (!settings.is_active) {
      return NextResponse.json({ error: "Connection is not active" }, { status: 400 })
    }

    const password = settings.password_encrypted ? decrypt(settings.password_encrypted) : ""

    let queryResult

    if (settings.connection_type === "api") {
      // Execute query via API
      queryResult = await executeApiQuery(
        settings.api_url,
        settings.username,
        password,
        query,
        params,
        settings.timeout_seconds,
      )
    } else {
      // Execute query via ODBC
      queryResult = await executeOdbcQuery(
        settings.database_name,
        settings.username,
        password,
        settings.odbc_driver,
        settings.odbc_dsn,
        settings.connection_string,
        query,
        params,
        settings.timeout_seconds,
      )
    }

    return NextResponse.json(queryResult)
  } catch (error) {
    console.error("[v0] Error executing Pervasive query:", error)
    return NextResponse.json(
      {
        error: "Failed to execute query",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

async function executeApiQuery(
  apiUrl: string,
  username: string,
  password: string,
  query: string,
  params: any,
  timeout: number,
): Promise<any> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000)

  try {
    const response = await fetch(`${apiUrl}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      },
      body: JSON.stringify({ query, params }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Query timeout")
    }
    throw error
  }
}

async function executeOdbcQuery(
  databaseName: string,
  username: string,
  password: string,
  driver: string,
  dsn: string | null,
  connectionString: string | null,
  query: string,
  params: any,
  timeout: number,
): Promise<any> {
  // Note: This requires the 'odbc' npm package
  // Placeholder implementation

  console.log("[v0] Executing ODBC query:", {
    database: databaseName,
    query: query.substring(0, 100),
  })

  // In production, implement actual ODBC query execution:
  // const odbc = require('odbc')
  // const connection = await odbc.connect(connectionString)
  // const result = await connection.query(query, params)
  // await connection.close()
  // return result

  return {
    success: true,
    message: "ODBC query execution (simulated)",
    note: "Install odbc package for actual ODBC connectivity",
    rows: [],
  }
}

