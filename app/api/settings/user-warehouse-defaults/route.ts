import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

// المستودعات الافتراضية للمستخدم (تُحفَظ في user_settings) — تُستعمَل عند اختيار صنف في
// سندات الحركات: إن لم يكن للصنف نفسه مستودع افتراضي (products.default_store)، يُرجَع لهذه
// الإعدادات، ثم لأول مستودع في النظام إن لم تكن معرَّفة أيضاً.
async function ensureColumns() {
  await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS default_item_warehouse_id INTEGER`
  await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS finished_goods_warehouse_id INTEGER`
  await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS raw_materials_warehouse_id INTEGER`
}

export async function GET(request: NextRequest) {
  try {
    await ensureColumns()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("user_id")
    if (!userId) {
      return NextResponse.json({ error: "user_id مطلوب" }, { status: 400 })
    }

    const rows = await sql`
      SELECT
        us.default_item_warehouse_id,
        w1.warehouse_name AS default_item_warehouse_name,
        us.finished_goods_warehouse_id,
        w2.warehouse_name AS finished_goods_warehouse_name,
        us.raw_materials_warehouse_id,
        w3.warehouse_name AS raw_materials_warehouse_name
      FROM user_settings us
      LEFT JOIN warehouses w1 ON w1.id = us.default_item_warehouse_id
      LEFT JOIN warehouses w2 ON w2.id = us.finished_goods_warehouse_id
      LEFT JOIN warehouses w3 ON w3.id = us.raw_materials_warehouse_id
      WHERE us.user_id = ${userId}
    `

    if (rows.length === 0) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("Error fetching user warehouse defaults:", error)
    return NextResponse.json({ error: "Failed to fetch user warehouse defaults" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureColumns()
    const data = await request.json()
    if (!data.user_id) {
      return NextResponse.json({ error: "user_id مطلوب" }, { status: 400 })
    }

    const result = await sql`
      UPDATE user_settings
      SET
        default_item_warehouse_id = ${data.default_item_warehouse_id ?? null},
        finished_goods_warehouse_id = ${data.finished_goods_warehouse_id ?? null},
        raw_materials_warehouse_id = ${data.raw_materials_warehouse_id ?? null},
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ${data.user_id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error saving user warehouse defaults:", error)
    return NextResponse.json({ error: "Failed to save user warehouse defaults" }, { status: 500 })
  }
}
