import { NextRequest, NextResponse } from "next/server"
import { generateSalesOrderNumber, generatePurchaseOrderNumber } from "@/lib/number-generator"

// يستدعي نفس دالة الترقيم المستخدَمة فعلياً عند الحفظ (lib/orders.ts createOrder، عبر
// lib/number-generator.ts) — مصدر وحيد للصيغة (بادئة الطلبية من الإعدادات + رمز الدفتر + تسلسل)
// بدل تكرارها هنا بمنطق مختلف قد ينحرف عن صيغة الحفظ الفعلية.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const vchBook = searchParams.get("vch_book") ?? ""
    const vchType = Number(searchParams.get("vch_type") ?? 1)

    const orderNumber =
      vchType === 2 ? await generatePurchaseOrderNumber(vchBook) : await generateSalesOrderNumber(vchBook)

    return NextResponse.json({ orderNumber, autoNumbering: true })
  } catch (error) {
    console.error("Error generating order number:", error)
    return NextResponse.json({
      orderNumber: "SO00000001",
      autoNumbering: true,
      warning: "Generated fallback number due to error",
    })
  }
}
