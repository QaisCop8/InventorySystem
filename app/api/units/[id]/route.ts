import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

function toText(value: unknown, fallback = "") {
  if (value === null || value === undefined || value === "") return fallback
  return String(value).trim()
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const unitId = Number(params.id)
    if (!unitId) {
      return NextResponse.json({ error: "معرف الوحدة غير صالح" }, { status: 400 })
    }

    const units = await sql`
      SELECT id, unit_name, unit_name_en, description, is_active, status, created_at, updated_at
      FROM units
      WHERE id = ${unitId}
      LIMIT 1
    `

    if (!units.length) {
      return NextResponse.json({ error: "الوحدة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json(units[0])
  } catch (error) {
    console.error("Error fetching unit:", error)
    return NextResponse.json({ error: "فشل في جلب الوحدة" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const unitId = Number(params.id)
    if (!unitId) {
      return NextResponse.json({ error: "معرف الوحدة غير صالح" }, { status: 400 })
    }

    const body = await request.json()
    const unitName = toText(body?.unit_name ?? body?.name, "")
    if (!unitName) {
      return NextResponse.json({ error: "اسم الوحدة مطلوب" }, { status: 400 })
    }

    const unitNameEn = toText(body?.unit_name_en ?? body?.unit_name_e ?? unitName, unitName)
    const description = toText(body?.description, "")
    const status = Number(body?.status ?? 1)
    const isActive = status === 1

    const existing = await sql`
      SELECT id
      FROM units
      WHERE LOWER(TRIM(unit_name)) = LOWER(TRIM(${unitName}))
        AND id != ${unitId}
      LIMIT 1
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم الوحدة موجود مسبقاً" }, { status: 409 })
    }

    const updated = await sql`
      UPDATE units
      SET
        unit_name = ${unitName},
        unit_name_en = ${unitNameEn},
        description = ${description},
        is_active = ${isActive},
        status = ${status},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${unitId}
      RETURNING id, unit_name, unit_name_en, description, is_active, status, created_at, updated_at
    `

    if (!updated.length) {
      return NextResponse.json({ error: "الوحدة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json(updated[0])
  } catch (error) {
    console.error("Error updating unit:", error)
    return NextResponse.json({ error: "فشل حفظ الوحدة" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const unitId = Number(params.id)
    if (!unitId) {
      return NextResponse.json({ error: "معرف الوحدة غير صالح" }, { status: 400 })
    }

    const deleted = await sql`
      DELETE FROM units
      WHERE id = ${unitId}
      RETURNING id
    `

    if (!deleted.length) {
      return NextResponse.json({ error: "الوحدة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json({ success: true, id: unitId })
  } catch (error) {
    console.error("Error deleting unit:", error)
    return NextResponse.json({ error: "فشل حذف الوحدة" }, { status: 500 })
  }
}

