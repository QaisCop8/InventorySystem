import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensurePaymentClassificationsTable } from "@/lib/payment-classifications"

export async function GET() {
  try {
    await ensurePaymentClassificationsTable()
    const rows = await sql`SELECT id, name, COALESCE(status, 1) AS status FROM payment_classifications_tbl WHERE COALESCE(status, 1) != 3 ORDER BY id`
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching payment classifications:", error)
    return NextResponse.json({ error: "Failed to fetch payment classifications" }, { status: 500 })
  }
}

// إضافة تصنيف دفعة من شاشة التعريفات (التعريفات الأساسية)
export async function POST(request: NextRequest) {
  try {
    await ensurePaymentClassificationsTable()
    const body = await request.json()
    const name = String(body.name || "").trim().slice(0, 100)
    if (!name) return NextResponse.json({ error: "اسم تصنيف الدفعة مطلوب" }, { status: 400 })

    const existing = (await sql`
      SELECT id, COALESCE(status, 1) AS status FROM payment_classifications_tbl
      WHERE LOWER(TRIM(name)) = LOWER(${name})
      LIMIT 1
    `)[0] as any
    if (existing && Number(existing.status) !== 3) {
      return NextResponse.json({ error: "اسم تصنيف الدفعة مكرر لا يمكن الاستمرار" }, { status: 409 })
    }
    // الاسم فريد في الجدول: تصنيف محذوف بنفس الاسم يُعاد تفعيله بدل إدراج صف جديد.
    if (existing) {
      const revived = await sql`
        UPDATE payment_classifications_tbl SET name = ${name}, status = 1 WHERE id = ${existing.id}
        RETURNING id, name, status
      `
      return NextResponse.json(revived[0], { status: 201 })
    }

    const inserted = await sql`
      INSERT INTO payment_classifications_tbl (name, status) VALUES (${name}, 1)
      RETURNING id, name, status
    `
    return NextResponse.json(inserted[0], { status: 201 })
  } catch (error) {
    console.error("Error adding payment classification:", error)
    return NextResponse.json({ error: "Failed to add payment classification" }, { status: 500 })
  }
}
