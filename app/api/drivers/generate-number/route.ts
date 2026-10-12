import type { NextRequest } from "next/server"
import { authorizeFile, authorizeFileRead, projectFileLookup } from "@/lib/file-permissions"
import { NextResponse } from "next/server"
import { generateDriverNumber } from "../_lib"

export async function GET(request: NextRequest) {
  try {
    const permission = await authorizeFile(request, "drivers", "create")
    if (!permission.ok) return permission.response
    const number = await generateDriverNumber()
    return NextResponse.json({ number })
  } catch (error) {
    console.error("Error generating driver number:", error)
    return NextResponse.json({ error: "فشل في توليد رقم السائق" }, { status: 500 })
  }
}
