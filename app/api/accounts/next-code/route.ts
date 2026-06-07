import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
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

    // Get max account number
    const accountsResult = await sql`
      SELECT code FROM accounts ORDER BY code DESC LIMIT 1
    `

    let nextNumber = startNumber

    if (accountsResult && accountsResult.length > 0) {
      const lastCode = accountsResult[0].code
      // Extract number from code (e.g., "A0001" -> 1)
      const match = lastCode.match(/\d+$/)
      if (match) {
        const lastNumber = parseInt(match[0])
        nextNumber = lastNumber + 1
      }
    }

    const nextCode = prefix + String(nextNumber).padStart(4, "0")

    return NextResponse.json({
      nextCode,
      prefix,
      nextNumber,
    })
  } catch (error) {
    console.error("[accounts/next-code] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to generate next account code",
        nextCode: "A0001", // Fallback
      },
      { status: 500 }
    )
  }
}
