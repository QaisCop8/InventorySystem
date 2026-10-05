import { NextResponse, type NextRequest } from "next/server"
import { assetBranch, authorizeFixedAssets, handleFixedAssets, routeId } from "@/lib/fixed-assets/api"
import {
  activateAsset, addCapitalCost, adjustDepreciation, disposeAsset, resumeAsset, revalueAsset, suspendAsset, transferAsset,
} from "@/lib/fixed-assets/service"
import type { TransactionAction } from "@/lib/transaction-permissions"

type Context = { params: Promise<{ id: string }> }

// Posting actions create journal vouchers; the rest only change subledger data.
const ACTIONS: Record<string, { permission: TransactionAction; run: (id: number, body: any, userId: string) => Promise<unknown> }> = {
  activate: { permission: "post", run: (id, _body, userId) => activateAsset(id, userId) },
  addition: { permission: "post", run: addCapitalCost },
  revaluation: { permission: "post", run: (id, body, userId) => revalueAsset(id, { ...body, type: "REVALUATION" }, userId) },
  impairment: { permission: "post", run: (id, body, userId) => revalueAsset(id, { ...body, type: "IMPAIRMENT" }, userId) },
  dispose: { permission: "post", run: disposeAsset },
  adjust: { permission: "update", run: adjustDepreciation },
  transfer: { permission: "update", run: transferAsset },
  suspend: { permission: "update", run: suspendAsset },
  resume: { permission: "update", run: resumeAsset },
}

export async function POST(request: NextRequest, { params }: Context) {
  const id = routeId((await params).id)
  const body = await request.json().catch(() => ({}))
  const action = ACTIONS[String(body?.action)]
  if (!action) return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
  return handleFixedAssets(request, action.permission, async ({ userId }) => {
    if (body.action === "transfer" && Number(body.to_branch_id) > 0) {
      const destination = await authorizeFixedAssets(request, "create", Number(body.to_branch_id))
      if (!destination.ok) return destination.response
    }
    const result = await action.run(id, body, userId)
    return { success: true, result }
  }, { branch: () => assetBranch(id), fallback: "تعذر تنفيذ العملية على الأصل" })
}
