import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

export async function GET(request: NextRequest) {
  try {
    if (!sql) {
      console.error("[accounts/next-code] Database client not initialized")
      return NextResponse.json(
        {
          error: "Database connection failed",
          code: "A0000001",
        },
        { status: 500 }
      )
    }

    // Get settings
    const settingsResult = await sql`
      SELECT 
        account_prefix,
        account_start
      FROM system_settings
      LIMIT 1
    `

    let prefix = "A"
    let startNumber = 1

    if (settingsResult && settingsResult.length > 0) {
      prefix = settingsResult[0].account_prefix || "A"
      startNumber = settingsResult[0].account_start || 1
    }

    // Get max account number - extract numeric part correctly for 8-char codes
    const accountsResult = await sql`
      SELECT code FROM account_tbl 
      WHERE code IS NOT NULL AND code != ''
      ORDER BY code DESC 
      LIMIT 1
    `

    let nextNumber = startNumber

    if (accountsResult && accountsResult.length > 0) {
      const lastCode = accountsResult[0].code
      // Extract numeric part from code (e.g., "A0000006" -> 6)
      const match = lastCode.match(/\d+$/)
      if (match) {
        const lastNumber = parseInt(match[0], 10)
        nextNumber = lastNumber + 1
      }
    }

    // Pad to 7 digits (8 chars total with prefix)
    const nextCode = prefix + String(nextNumber).padStart(7, "0")

    return NextResponse.json({
      code: nextCode,
      prefix,
      nextNumber,
    })
  } catch (error) {
    console.error("[accounts/next-code] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to generate next account code",
        code: "A0000001", // Fallback
      },
      { status: 500 }
    )
  }
}
