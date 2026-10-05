import { NextRequest, NextResponse } from "next/server"
import { withTenantTransaction } from "@/lib/database"
import { createDepreciationRun, ensureTables, listDepreciationRuns } from "../_lib"

export async function GET() {
  try {
    await ensureTables()
    const runs = await listDepreciationRuns()
    return NextResponse.json(runs)
  } catch (error) {
    console.error("Error fetching fixed asset depreciation runs:", error)
    return NextResponse.json({ error: "Failed to fetch depreciation runs" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables()
    const body = await request.json()
    const period = String(body.period || new Date().toISOString().slice(0, 7))
    const postingDate = String(body.posting_date || body.postingDate || new Date().toISOString().slice(0, 10))

    const result = await withTenantTransaction(() => createDepreciationRun({
        ...body,
        period,
        posting_date: postingDate,
        create_voucher: body.create_voucher !== false,
        post_immediately: body.post_immediately !== false,
        branch_id: body.branch_id ?? body.branchId ?? null,
        currency_id: body.currency_id ?? body.currencyId ?? null,
        rate: body.rate ?? 1,
        created_by: body.created_by ?? body.createdBy ?? request.headers.get("x-user-id") ?? null,
      }))

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error("Error posting fixed asset depreciation:", error)
    return NextResponse.json({ error: error?.message || "Failed to create depreciation run" }, { status: 400 })
  }
}
