import { NextResponse } from "next/server"
import { generateItemGroupNumber } from "@/lib/number-generator"

export async function GET() {
  try {
    const number = await generateItemGroupNumber()
    return NextResponse.json({ number })
  } catch (error) {
    console.error("Error generating item group number:", error)
    return NextResponse.json({ error: "فشل في توليد رقم المجموعة" }, { status: 500 })
  }
}

