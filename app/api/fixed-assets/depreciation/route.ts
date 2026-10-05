import type { NextRequest } from "next/server"
import { authorizeFixedAssets, handleFixedAssets } from "@/lib/fixed-assets/api"
import { isPeriod, periodEnd } from "@/lib/fixed-assets/depreciation"
import { listRuns } from "@/lib/fixed-assets/queries"
import { depreciationCandidates, FixedAssetError, postDepreciationRun } from "@/lib/fixed-assets/service"

const idList = (value: unknown) =>
  Array.from(new Set((Array.isArray(value) ? value : String(value ?? "").split(",")).map(Number).filter(id => Number.isInteger(id) && id > 0)))

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  return handleFixedAssets(request, "view", async ({ branchIds }) => {
    if (params.get("preview") !== "1") return { runs: await listRuns() }
    const period = String(params.get("period") ?? "")
    if (!isPeriod(period)) throw new FixedAssetError("اختر فترة صحيحة")
    const requested = idList(params.get("branch_ids"))
    const scope = requested.length ? requested.filter(id => branchIds.includes(id)) : branchIds
    return { lines: await depreciationCandidates({ period, branchIds: scope }), postingDate: periodEnd(period) }
  }, { fallback: "تعذر تحميل بيانات الإهلاك" })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const branches = idList(body?.branch_ids)
  return handleFixedAssets(request, "post", async ({ userId }) => {
    if (!branches.length) throw new FixedAssetError("اختر فرعاً واحداً على الأقل")
    if (!isPeriod(body.period)) throw new FixedAssetError("اختر فترة صحيحة")
    for (const branchId of branches.slice(1)) {
      const auth = await authorizeFixedAssets(request, "post", branchId)
      if (!auth.ok) return auth.response
    }
    return postDepreciationRun({
      period: body.period,
      postingDate: body.posting_date || periodEnd(body.period),
      branchIds: branches,
      notes: body.notes,
    }, userId)
  }, { branch: () => branches[0], fallback: "تعذر ترحيل الإهلاك" })
}
