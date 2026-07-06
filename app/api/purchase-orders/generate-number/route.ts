import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] API: Starting purchase order number generation")

    if (!process.env.DATABASE_URL) {
      console.log("[v0] API: DATABASE_URL not found")
      return NextResponse.json({ error: "Database connection not configured" }, { status: 500 })
    }

    console.log("[v0] API: DATABASE_URL found, creating connection")

    const systemSettings = await sql`
      SELECT id, value
      FROM system_settings
      WHERE id IN ('purchase_prefix', 'auto_numbering', 'numbering_system')
    `

    const settings = Object.fromEntries((systemSettings ?? []).map((row: any) => [row.id, row.value]))
    const normalizedSettings = {
      purchase_prefix: settings.purchase_prefix ?? "P",
      auto_numbering: settings.auto_numbering ?? true,
      numbering_system: settings.numbering_system ?? "sequential",
    }

    console.log("[v0] API: System settings:", settings)

    // If auto_numbering is disabled, return empty to let user enter manually
    if (!normalizedSettings.auto_numbering) {
      console.log("[v0] API: Auto numbering is disabled")
      return NextResponse.json({
        orderNumber: "",
        autoNumbering: false,
        message: "الترقيم اليدوي مفعّل",
      })
    }

    const prefix = normalizedSettings.purchase_prefix || "P"

    // Get the latest order number with this prefix
    const result = await sql`
      SELECT order_number 
      FROM purchase_orders 
      WHERE order_number LIKE ${prefix + "%"}
      ORDER BY id DESC 
      LIMIT 1
    `

    console.log("[v0] API: Query result:", result)

    let nextNumber = 1

    if (result.length > 0 && result[0].order_number) {
      const lastOrderNumber = result[0].order_number
      console.log("[v0] API: Found existing code:", lastOrderNumber)

      // Extract the numeric part after prefix
      const numericPart = lastOrderNumber.substring(prefix.length)
      const parsedNumber = Number.parseInt(numericPart, 10)

      if (!isNaN(parsedNumber)) {
        nextNumber = parsedNumber + 1
        console.log("[v0] API: Next number:", nextNumber)
      }
    }

    // Generate new order number with prefix and sequential number
    const paddedNumber = nextNumber.toString().padStart(7, "0")
    const orderNumber = `${prefix}${paddedNumber}`

    console.log("[v0] API: Generated order number:", orderNumber)

    return NextResponse.json({
      orderNumber,
      autoNumbering: true,
      prefix: prefix,
    })
  } catch (error) {
    console.error("[v0] API: Error generating order number:", error)
    return NextResponse.json(
      {
        orderNumber: "P0000001",
        autoNumbering: true,
        warning: "Generated fallback number due to database error",
      },
      { status: 500 },
    )
  }
}
