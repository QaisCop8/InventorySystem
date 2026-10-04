import { NextRequest, NextResponse } from "next/server"
import { ensureTables, getDepreciationRunById } from "../../_lib"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTables()
    const { id } = await params
    const run = await getDepreciationRunById(Number(id))
    if (!run) {
      return NextResponse.json({ error: "التجميع غير موجود" }, { status: 404 })
    }
    return NextResponse.json(run)
  } catch (error) {
    console.error("Error fetching fixed asset depreciation run:", error)
    return NextResponse.json({ error: "Failed to fetch depreciation run" }, { status: 500 })
  }
}
