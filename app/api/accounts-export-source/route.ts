import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const SOURCE_FILE_PATH = path.join(process.cwd(), "data", "accounts.json")

const typeMap: Record<string, string | null> = {
  none: null,
  commercial: "1",
  commercial_continuous_inventory: "2",
  services: "3",
}

export async function GET(request: NextRequest) {
  try {
    const typeId = request.nextUrl.searchParams.get("type") || "none"
    const selectedType = typeMap[typeId] ?? null

    if (!fs.existsSync(SOURCE_FILE_PATH)) {
      return NextResponse.json({ error: "accounts.json not found" }, { status: 404 })
    }

    const rawContent = fs.readFileSync(SOURCE_FILE_PATH, "utf8")
    const parsed = JSON.parse(rawContent)
    const rows = Array.isArray(parsed?.Sheet1) ? parsed.Sheet1 : []

    const filteredRows = selectedType ? rows.filter((row: any) => String(row?.type ?? "") === selectedType) : rows

    return NextResponse.json({ rows: filteredRows })
  } catch (error) {
    console.error("Failed to load accounts export source:", error)
    return NextResponse.json({ error: "Failed to load accounts export source" }, { status: 500 })
  }
}