import { NextRequest, NextResponse } from "next/server"
import { createCategory, ensureTables, listCategories } from "../_lib"

export async function GET() {
  try {
    await ensureTables()
    const rows = await listCategories()
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching fixed asset categories:", error)
    return NextResponse.json({ error: "Failed to fetch fixed asset categories" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables()
    const body = await request.json()

    if (!body || !body.code || !body.name) {
      return NextResponse.json({ error: "كود وتصنيف الأصل المطلوب" }, { status: 400 })
    }

    const category = await createCategory(body)
    return NextResponse.json(category, { status: 201 })
  } catch (error: any) {
    console.error("Error creating fixed asset category:", error)
    return NextResponse.json({ error: error?.message || "Failed to create fixed asset category" }, { status: 400 })
  }
}
