import type { NextRequest } from "next/server"
import { authorizeFile, authorizeFileRead, projectFileLookup } from "@/lib/file-permissions"
import { NextResponse } from "next/server"
import { generateCarNumber } from "../_lib"

export async function GET(request: NextRequest) {
  try {
    const permission = await authorizeFile(request, "cars", "create")
    if (!permission.ok) return permission.response
    const number = await generateCarNumber()
    return NextResponse.json({ number })
  } catch (error) {
    console.error("Error generating car number:", error)
    return NextResponse.json({ error: "فشل في توليد رقم السيارة" }, { status: 500 })
  }
}
