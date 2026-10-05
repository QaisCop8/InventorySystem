import { NextRequest, NextResponse } from "next/server"
import { withTenantTransaction } from "@/lib/database"
import { ensureTables, listFixedAssetTransfers, transferFixedAsset } from "../_lib"

export async function GET() {
  try {
    await ensureTables()
    return NextResponse.json(await listFixedAssetTransfers())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل تحويلات الأصول" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const assetId = Number(body.asset_id)
    if (!Number.isSafeInteger(assetId) || assetId <= 0) return NextResponse.json({ error: "الأصل مطلوب للتحويل" }, { status: 400 })
    const result = await withTenantTransaction(async () => {
      await ensureTables()
      return transferFixedAsset(assetId, { ...body, created_by: request.headers.get("x-user-id") })
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحويل الأصل" }, { status: 400 })
  }
}
