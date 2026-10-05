import type { NextRequest } from "next/server"
import { handleFixedAssets } from "@/lib/fixed-assets/api"
import { isPeriod, periodOf } from "@/lib/fixed-assets/depreciation"
import {
  assetMovement, assetRegister, dashboard, depreciationReport, groupedRegister, reconciliation, transactionReport, type ReportFilters,
} from "@/lib/fixed-assets/queries"
import { dateOnly, FixedAssetError } from "@/lib/fixed-assets/service"
import { TRANSACTION_TYPES } from "@/lib/fixed-assets/constants"

const today = () => new Date().toISOString().slice(0, 10)
const optionalId = (value: string | null) => (Number(value) > 0 ? Number(value) : null)

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  return handleFixedAssets(request, "view", async ({ branchIds }) => {
    const requestedBranch = optionalId(params.get("branch_id"))
    const scope = requestedBranch ? branchIds.filter(id => id === requestedBranch) : branchIds
    if (!scope.length) throw new FixedAssetError("لا توجد صلاحية على الفرع المحدد")
    const filters: ReportFilters = {
      branchIds: scope,
      categoryId: optionalId(params.get("category_id")),
      locationId: optionalId(params.get("location_id")),
      costCenterId: optionalId(params.get("cost_center_id")),
      status: params.get("status") || null,
    }
    const asOf = dateOnly(params.get("as_of")) ?? today()
    const from = dateOnly(params.get("from")) ?? `${today().slice(0, 4)}-01-01`
    const to = dateOnly(params.get("to")) ?? today()
    if (from > to) throw new FixedAssetError("تاريخ البداية بعد تاريخ النهاية")

    switch (params.get("type")) {
      case "dashboard": {
        const period = isPeriod(params.get("period")) ? String(params.get("period")) : periodOf(today())
        return dashboard(scope, period)
      }
      case "register": return { rows: await assetRegister(asOf, filters) }
      case "movement": return { rows: await assetMovement(from, to, filters) }
      case "depreciation": return { rows: await depreciationReport(periodOf(from), periodOf(to), filters) }
      case "additions": return { rows: await transactionReport(["ADDITION"], from, to, filters) }
      case "disposals": return { rows: await transactionReport(["DISPOSAL"], from, to, filters) }
      case "revaluations": return { rows: await transactionReport(["REVALUATION", "IMPAIRMENT"], from, to, filters) }
      case "transfers": return { rows: await transactionReport(["TRANSFER"], from, to, filters) }
      case "acquisitions": return { rows: await transactionReport(["ACQUISITION", "OPENING_BALANCE"], from, to, filters) }
      case "transactions": {
        const requested = String(params.get("types") ?? "").split(",").filter(type => type in TRANSACTION_TYPES)
        return { rows: await transactionReport(requested.length ? requested : Object.keys(TRANSACTION_TYPES), from, to, filters) }
      }
      case "by-location": return groupedRegister(asOf, "location", filters)
      case "by-cost-center": return groupedRegister(asOf, "cost_center", filters)
      case "reconciliation": return { rows: await reconciliation(asOf, scope) }
      default: throw new FixedAssetError("نوع التقرير غير معروف")
    }
  }, { fallback: "تعذر إعداد التقرير" })
}
