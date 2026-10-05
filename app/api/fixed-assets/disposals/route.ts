import { NextRequest, NextResponse } from "next/server"
import { withTenantTransaction } from "@/lib/database"
import { disposeFixedAsset, ensureTables, listFixedAssetDisposals } from "../_lib"

export async function GET() {
  try {
    await ensureTables()
    return NextResponse.json(await listFixedAssetDisposals())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل استبعادات الأصول" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const assetId = Number(body.asset_id)
    if (!Number.isSafeInteger(assetId) || assetId <= 0) return NextResponse.json({ error: "الأصل مطلوب للاستبعاد" }, { status: 400 })
    const result = await withTenantTransaction(async () => {
      await ensureTables()
      return disposeFixedAsset(assetId, { ...body, created_by: request.headers.get("x-user-id") })
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر استبعاد الأصل" }, { status: 400 })
  }
}
