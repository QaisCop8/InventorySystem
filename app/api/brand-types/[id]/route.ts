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
    const status = Number(data?.status ?? 1)

    if (!name) {
      return NextResponse.json({ error: "اسم النوع مطلوب" }, { status: 400 })
    }
    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const duplicate = await sql`
      SELECT id FROM brand_types WHERE LOWER(name) = LOWER(${name}) AND id != ${id}
    `
    if (duplicate.length > 0) {
      return NextResponse.json({ error: "اسم النوع موجود مسبقاً" }, { status: 400 })
    }

    const result = await sql`
      UPDATE brand_types
      SET name = ${name}, status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, status, created_at, updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "النوع غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating brand type:", error)
    return NextResponse.json({ error: "Failed to update brand type" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    try {
      const inUse = await sql`SELECT id FROM brands WHERE brand_type_id = ${id} LIMIT 1`
      if (inUse.length > 0) {
        return NextResponse.json({ error: "لا يمكن حذف النوع لوجود علامات تجارية مرتبطة به" }, { status: 400 })
      }
    } catch {
      // جدول brands لم يُنشأ بعد (لم تُضَف أي علامة تجارية) — لا شيء يمنع الحذف
    }

    const result = await sql`DELETE FROM brand_types WHERE id = ${id} RETURNING id`
    if (result.length === 0) {
      return NextResponse.json({ error: "النوع غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting brand type:", error)
    return NextResponse.json({ error: "Failed to delete brand type" }, { status: 500 })
  }
}
