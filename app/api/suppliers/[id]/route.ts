import { NextResponse } from "next/server"
import { generateSupplierNumber } from "@/lib/number-generator"

export async function GET() {
  try {
    console.log("[v0] API: Starting supplier number generation")

    if (!process.env.DATABASE_URL) {
      console.error("[v0] API: DATABASE_URL not found")
      return NextResponse.json({ error: "Database configuration error" }, { status: 500 })
    }

    console.log("[v0] API: DATABASE_URL found, creating connection")
    const number = await generateSupplierNumber()
    console.log("[v0] API: Generated supplier number:", number)

    return NextResponse.json({
      supplierNumber: number,
      number: number, // Keep both for backward compatibility
    })
  } catch (error) {
    console.error("[v0] API: Error generating supplier number:", error)

    let errorMessage = "فشل في توليد رقم المورد"
    if (error instanceof Error) {
      if (error.message.includes("DATABASE_URL")) {
        errorMessage = "خطأ في إعدادات قاعدة البيانات"
      } else if (error.message.includes("connect")) {
        errorMessage = "فشل في الاتصال بقاعدة البيانات"
      } else if (error.message.includes("query")) {
        errorMessage = "خطأ في استعلام قاعدة البيانات"
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

