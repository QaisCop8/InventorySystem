import type { NextRequest } from "next/server"
import { handleFixedAssets } from "@/lib/fixed-assets/api"
import { listAssets, loadLookups } from "@/lib/fixed-assets/queries"
import { activateAsset, createAsset } from "@/lib/fixed-assets/service"

export async function GET(request: NextRequest) {
  return handleFixedAssets(request, "view", async ({ branchIds }) => {
    const withLookups = request.nextUrl.searchParams.get("lookups") === "1"
    const [assets, lookups] = await Promise.all([listAssets(branchIds), withLookups ? loadLookups(branchIds) : Promise.resolve(null)])
    return lookups ? { assets, lookups } : { assets }
  }, { fallback: "تعذر تحميل الأصول الثابتة" })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const action = body?.activate ? "post" : "create"
  return handleFixedAssets(request, action, async ({ userId, branchId }) => {
    const asset = await createAsset(body ?? {}, branchId, userId)
    if (body?.activate) await activateAsset(Number(asset.id), userId)
    return { id: Number(asset.id), asset_no: asset.asset_no }
  }, { branch: () => body?.branch_id, fallback: "تعذر حفظ الأصل" })
}
