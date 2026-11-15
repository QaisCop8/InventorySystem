import { type NextRequest, NextResponse } from "next/server"
import { getLotInventoryReport } from "@/lib/lot-management"
import { ensureVoucherIndexes } from "@/lib/voucher-indexes"

export async function GET(request: NextRequest) {
  // الفهارس تُبنى بالخلفية مرة لكل قاعدة — لا ينتظرها التقرير
  void ensureVoucherIndexes().catch(() => undefined)
  try {
    const { searchParams } = new URL(request.url)

    const filters = {
      product_id: searchParams.get("product_id") ? Number(searchParams.get("product_id")) : undefined,
      supplier_id: searchParams.get("supplier_id") ? Number(searchParams.get("supplier_id")) : undefined,
      expiry_status: searchParams.get("expiry_status") || undefined,
      lot_status: searchParams.get("lot_status") || undefined,
      lot_number: searchParams.get("lot_number") || undefined,
    }

    // إزالة القيم الفارغة
    Object.keys(filters).forEach((key) => {
      if (filters[key as keyof typeof filters] === undefined) {
        delete filters[key as keyof typeof filters]
      }
    })

    const report = await getLotInventoryReport(filters)
    return NextResponse.json(report)
  } catch (error) {
    console.error("[v0] Error generating lot inventory report:", error)
    return NextResponse.json({ error: "فشل في إنشاء تقرير المخزون حسب الدفعات" }, { status: 500 })
  }
}
