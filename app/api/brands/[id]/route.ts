import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const data = await request.json()
    const name = String(data?.name ?? "").trim()
    const brandTypeId = Number(data?.brand_type_id)
    const status = Number(data?.status ?? 1)

    if (!name) {
      return NextResponse.json({ error: "اسم العلامة التجارية مطلوب" }, { status: 400 })
    }
    if (!Number.isInteger(brandTypeId)) {
      return NextResponse.json({ error: "نوع العلامة التجارية مطلوب" }, { status: 400 })
    }
    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const duplicate = await sql`
      SELECT id FROM brands WHERE LOWER(name) = LOWER(${name}) AND id != ${id}
    `
    if (duplicate.length > 0) {
      return NextResponse.json({ error: "اسم العلامة التجارية موجود مسبقاً" }, { status: 400 })
    }

    const typeExists = await sql`SELECT id FROM brand_types WHERE id = ${brandTypeId}`
    if (typeExists.length === 0) {
      return NextResponse.json({ error: "نوع العلامة التجارية غير موجود" }, { status: 400 })
    }

    const result = await sql`
      UPDATE brands
      SET name = ${name}, brand_type_id = ${brandTypeId}, status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, brand_type_id, status, created_at, updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "العلامة التجارية غير موجودة" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating brand:", error)
    return NextResponse.json({ error: "Failed to update brand" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    try {
      const inUse = await sql`SELECT product_id FROM product_brands_tbl WHERE brand_id = ${id} LIMIT 1`
      if (inUse.length > 0) {
        return NextResponse.json({ error: "لا يمكن حذف العلامة التجارية لارتباطها بأصناف" }, { status: 400 })
      }
    } catch {
      // الجدول لم يُنشأ بعد (لم يُحفَظ أي صنف بعلامة تجارية) — لا شيء يمنع الحذف
    }

    const result = await sql`DELETE FROM brands WHERE id = ${id} RETURNING id`
    if (result.length === 0) {
      return NextResponse.json({ error: "العلامة التجارية غير موجودة" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting brand:", error)
    return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 })
  }
}
