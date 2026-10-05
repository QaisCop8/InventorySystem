import type { NextRequest } from "next/server"
import sql from "@/lib/database"
import { authorizeFixedAssets, handleFixedAssets, routeId } from "@/lib/fixed-assets/api"
import { runLines } from "@/lib/fixed-assets/queries"
import { FixedAssetError, reverseDepreciationRun } from "@/lib/fixed-assets/service"

type Context = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Context) {
  const id = routeId((await params).id)
  return handleFixedAssets(request, "view", async () => ({ lines: await runLines(id) }), { fallback: "تعذر تحميل تفاصيل الإهلاك" })
}

async function runBranches(id: number) {
  const rows = await sql`
    SELECT DISTINCT a.branch_id FROM fa_depreciation_schedule_tbl s JOIN fa_assets_tbl a ON a.id = s.asset_id WHERE s.run_id = ${id}
  `
  if (!rows.length) throw new FixedAssetError("تشغيل الإهلاك غير موجود")
  return rows.map((row: any) => Number(row.branch_id))
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const id = routeId((await params).id)
  const date = request.nextUrl.searchParams.get("date") ?? undefined
  let branches: number[] = []
  return handleFixedAssets(request, "post", async ({ userId }) => {
    for (const branchId of branches.slice(1)) {
      const auth = await authorizeFixedAssets(request, "post", branchId)
      if (!auth.ok) return auth.response
    }
    return reverseDepreciationRun(id, userId, date)
  }, {
    branch: async () => { branches = await runBranches(id); return branches[0] },
    fallback: "تعذر عكس الإهلاك",
  })
}
