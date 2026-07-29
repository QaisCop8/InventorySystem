import { NextResponse } from "next/server"
import { generateCarNumber } from "../_lib"

export async function GET() {
  try {
    const number = await generateCarNumber()
    return NextResponse.json({ number })
  } catch (error) {
    console.error("Error generating car number:", error)
    return NextResponse.json({ error: "فشل في توليد رقم السيارة" }, { status: 500 })
  }
}
