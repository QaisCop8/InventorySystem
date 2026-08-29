import { NextRequest, NextResponse } from "next/server"
import { ensureOrderDraftTables } from "@/lib/order-drafts"
import { checkDraftProductionAvailability } from "@/lib/inventory-availability"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureOrderDraftTables()
    const id = Number((await params).id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "رقم المسودة غير صالح" }, { status: 400 })
    return NextResponse.json(await checkDraftProductionAvailability(id))
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر فحص توفر مواد الانتاج" }, { status: 500 })
  }
}
