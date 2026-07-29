import { NextResponse } from "next/server"
import { generateDriverNumber } from "../_lib"

export async function GET() {
  try {
    const number = await generateDriverNumber()
    return NextResponse.json({ number })
  } catch (error) {
    console.error("Error generating driver number:", error)
    return NextResponse.json({ error: "فشل في توليد رقم السائق" }, { status: 500 })
  }
}
