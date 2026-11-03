import { type NextRequest, NextResponse } from "next/server"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { ensureTables, generateNextCode } from "../_lib"

export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "cheque_book", "create")
    if (!authorization.ok) return authorization.response
    await ensureTables()
    const code = await generateNextCode()
    return NextResponse.json({ code })
  } catch (error) {
    console.error("Error generating cheque book number:", error)
    return NextResponse.json({ error: "Failed to generate cheque book number" }, { status: 500 })
  }
}
