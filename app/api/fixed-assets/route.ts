import { NextRequest, NextResponse } from "next/server"
import { createFixedAsset, ensureTables, listFixedAssets } from "./_lib"

export async function GET() {
  try {
    await ensureTables()
    const rows = await listFixedAssets()
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching fixed assets:", error)
    return NextResponse.json({ error: "Failed to fetch fixed assets" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables()
    const body = await request.json()

    if (!body || !body.name || !body.category_id || !body.asset_code) {
      return NextResponse.json({ error: "اسم الأصل، كود الأصل، وتصنيفه مطلوبة" }, { status: 400 })
    }

    const asset = await createFixedAsset(body)
    return NextResponse.json(asset, { status: 201 })
  } catch (error: any) {
    console.error("Error creating fixed asset:", error)
    return NextResponse.json({ error: error?.message || "Failed to create fixed asset" }, { status: 400 })
  }
}
