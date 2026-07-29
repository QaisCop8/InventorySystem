
import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

export default sql


export async function GET(request: NextRequest) {
  try {
    console.log("[v0] API: Starting order number generation")

    if (!process.env.DATABASE_URL) {
      console.error("[v0] API: DATABASE_URL not found")
      return NextResponse.json({ error: "DATABASE_URL environment variable is not set" }, { status: 500 })
    }
    const { searchParams } = new URL(request.url);
    const vch_book = searchParams.get("vch_book") ?? "0";
    const vch_type = Number(searchParams.get("vch_type") ?? 1);

    
   

    const prefix =  vch_type === 1 ? "O" + vch_book : "T" + vch_book

    // Get the latest order number with this prefix
    const result = await sql`
      SELECT order_number
      FROM orders 
      WHERE order_number LIKE ${prefix + "%"} 
      order by order_number desc LIMIT 1
    `

    console.log("[v0] API: Query result:", result)
    let orderNumber = "";
    let nextNumber = 1
    if (result.length > 0 && result[0].order_number) {
      const currentCode = result[0].order_number as string
      // Extract numeric part after prefix
      const numericPart = currentCode.substring(prefix.length)
      const parsedNumber = Number.parseInt(numericPart, 10)

      if (!isNaN(parsedNumber)) {
        nextNumber = parsedNumber + 1
        console.log("[v0] API: Found existing code:", currentCode, "next number:", nextNumber)
      }
      const paddedNumber = nextNumber.toString().padStart(8, "0")
      orderNumber = `${prefix}${paddedNumber}`

    } else {
      const paddedNumber = nextNumber.toString().padStart(8, "0")
      orderNumber = `${prefix}${paddedNumber}`
    }

    //const paddedNumber = nextNumber.toString().padStart(6, "0")
    //const orderNumber = `${prefix}${paddedNumber}`


    return NextResponse.json({
      orderNumber,
      autoNumbering: true,
      prefix: prefix,
    })
  } catch (error) {
    console.error("[v0] API: Error generating sales order number:", error)

    const fallbackNumber = "O00000001"

    console.log("[v0] API: Using fallback number:", fallbackNumber)

    return NextResponse.json({
      orderNumber: fallbackNumber,
      autoNumbering: true,
      warning: "Generated fallback number due to database error",
    })
  }
}
