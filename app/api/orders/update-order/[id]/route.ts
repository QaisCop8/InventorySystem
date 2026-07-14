import { type NextRequest, NextResponse } from "next/server"
import { getSuppliers } from "@/lib/orders"

export async function GET(request: NextRequest) {
  try {
    const suppliers = await getSuppliers()
    return NextResponse.json(suppliers)
  } catch (error) {
    console.error("Suppliers API error:", error)
    return NextResponse.json({ error: "حدث خطأ في جلب بيانات الموردين" }, { status: 500 })
  }
}

