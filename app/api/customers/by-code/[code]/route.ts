import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

// البحث عن زبون/مورد برقمه (customer_code، يحمل الموردون كذلك رموزهم في نفس هذا العمود بجدول
// customers الموحَّد — بادئة S بدل C) — يستخدمه components/products/customers.tsx عند مغادرة حقل
// الرقم (handleCustomerBlur) للتحقق من وجود سجل بهذا الرقم وتحميله تلقائياً إن وُجد.
export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const code = decodeURIComponent(params.code || "").trim()
    if (!code) {
      return NextResponse.json({ found: false })
    }

    const rows = await sql`
      SELECT id, type
      FROM customers
      WHERE isDeleted = false AND customer_code = ${code}
      LIMIT 1
    `

    if (rows.length === 0) {
      return NextResponse.json({ found: false })
    }

    return NextResponse.json({ found: true, customer: rows[0] })
  } catch (error) {
    console.error("[customers/by-code] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء البحث عن الزبون" }, { status: 500 })
  }
}
