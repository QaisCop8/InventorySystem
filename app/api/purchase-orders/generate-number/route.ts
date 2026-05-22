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
      SELECT purchase_prefix, auto_numbering, numbering_system
      FROM system_settings 
      ORDER BY id DESC 
      LIMIT 1
    `

    const settings = systemSettings[0] || {
      purchase_prefix: "P",
      auto_numbering: true,
      numbering_system: "sequential",
    }

    console.log("[v0] API: System settings:", settings)

    // If auto_numbering is disabled, return empty to let user enter manually
    if (!settings.auto_numbering) {
      console.log("[v0] API: Auto numbering is disabled")
      return NextResponse.json({
        orderNumber: "",
        autoNumbering: false,
        message: "الترقيم اليدوي مفعّل",
      })
    }

    const prefix = settings.purchase_prefix || "P"

    // Compute from the true max numeric suffix for this prefix.
    const result = await sql`
      SELECT COALESCE(MAX(
        CAST(NULLIF(regexp_replace(SUBSTRING(order_number FROM ${prefix.length + 1}), '[^0-9]', '', 'g'), '') AS INTEGER)
      ), 0) AS max_number
      FROM purchase_orders
      WHERE order_number LIKE ${prefix + "%"}
    `

    console.log("[v0] API: Query result:", result)

    const maxNumber = Number(result?.[0]?.max_number ?? 0)
    const nextNumber = Number.isFinite(maxNumber) ? maxNumber + 1 : 1

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
