import { NextResponse, type NextRequest } from "next/server"
import { assetBranch, handleFixedAssets, routeId } from "@/lib/fixed-assets/api"
import { assetCard } from "@/lib/fixed-assets/queries"
import { deleteDraftAsset, updateAsset } from "@/lib/fixed-assets/service"

type Context = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Context) {
  const id = routeId((await params).id)
  return handleFixedAssets(request, "view", async ({ branchIds }) => {
    const card = await assetCard(id, branchIds)
    return card ?? NextResponse.json({ error: "الأصل غير موجود" }, { status: 404 })
  }, { fallback: "تعذر تحميل بطاقة الأصل" })
}

export async function PUT(request: NextRequest, { params }: Context) {
  const id = routeId((await params).id)
  const body = await request.json().catch(() => ({}))
  return handleFixedAssets(request, "update", async ({ userId }) => {
    const asset = await updateAsset(id, body, userId)
    return { id: Number(asset.id), asset_no: asset.asset_no }
  }, { branch: () => assetBranch(id), fallback: "تعذر تعديل الأصل" })
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const id = routeId((await params).id)
  return handleFixedAssets(request, "delete", async () => {
    await deleteDraftAsset(id)
    return { success: true }
  }, { branch: () => assetBranch(id), fallback: "تعذر حذف الأصل" })
}
