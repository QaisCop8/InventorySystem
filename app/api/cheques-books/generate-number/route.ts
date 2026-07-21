import { NextResponse } from "next/server"
import { ensureTables, generateNextCode } from "../_lib"

export async function GET() {
  try {
    await ensureTables()
    const code = await generateNextCode()
    return NextResponse.json({ code })
  } catch (error) {
    console.error("Error generating cheque book number:", error)
    return NextResponse.json({ error: "Failed to generate cheque book number" }, { status: 500 })
  }
}
