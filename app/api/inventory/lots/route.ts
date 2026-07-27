import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("product_id")
    const availableOnly = searchParams.get("available_only") === "true"
    const lotNumber = searchParams.get("lot_number")

    if (!productId) {
      return NextResponse.json({ error: "معرف المنتج مطلوب" }, { status: 400 })
    }

    console.log("[v0] Fetching lots for product:", productId)

    if (lotNumber) {
      const lot = await sql`
        SELECT 
          pl.*,
          s.supplier_name,
          w.warehouse_name
        FROM product_lots pl
        LEFT JOIN suppliers s ON pl.supplier_id = s.id
        LEFT JOIN warehouses w ON pl.warehouse_id = w.id
        WHERE pl.product_id = ${productId} AND pl.lot_number = ${lotNumber}
        LIMIT 1
      `
      return NextResponse.json(lot.length > 0 ? lot[0] : null)
    }

    const whereClause = availableOnly ? sql`AND pl.status IN ('new', 'in_use') AND pl.current_quantity > 0` : sql``

    const lots = await sql`
      SELECT 
        pl.*,
        s.supplier_name,
        w.warehouse_name
      FROM product_lots pl
      LEFT JOIN suppliers s ON pl.supplier_id = s.id
      LEFT JOIN warehouses w ON pl.warehouse_id = w.id
      WHERE pl.product_id = ${productId} ${whereClause}
      ORDER BY pl.expiry_date ASC, pl.created_at ASC
    `

    console.log("[v0] Found lots:", lots.length)
    return NextResponse.json(lots)
  } catch (error) {
    console.error("[v0] Error fetching lots:", error)
    return NextResponse.json({ error: "فشل في تحميل الدفعات" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log("[v0] Creating new lot with data:", body)

    const requiredFields = ["product_id", "lot_number", "initial_quantity"]
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json({ error: `الحقل ${field} مطلوب` }, { status: 400 })
      }
    }

    const result = await sql`
      INSERT INTO product_lots (
        product_id, lot_number, manufacturing_date, expiry_date,
        supplier_id, initial_quantity, current_quantity, reserved_quantity,
        unit_cost, notes, status
      ) VALUES (
        ${Number(body.product_id)},
        ${body.lot_number},
        ${body.manufacturing_date || null},
        ${body.expiry_date || null},
        ${body.supplier_id ? Number(body.supplier_id) : null},
        ${Number(body.initial_quantity)},
        ${Number(body.initial_quantity)},
        ${Number(body.reserved_quantity || 0)},
        ${Number(body.unit_cost || 0)},
        ${body.notes || null},
        ${body.status || "new"}
      )
      RETURNING *
    `

    if (result.length === 0) {
      throw new Error("فشل في إنشاء الدفعة")
    }

    const lotWithDetails = await sql`
      SELECT 
        pl.*,
        s.supplier_name,
        w.warehouse_name
      FROM product_lots pl
      LEFT JOIN suppliers s ON pl.supplier_id = s.id
      LEFT JOIN warehouses w ON pl.warehouse_id = w.id
      WHERE pl.id = ${result[0].id}
    `

    console.log("[v0] Lot created successfully:", result[0].id)
    return NextResponse.json(lotWithDetails[0], { status: 201 })
  } catch (error) {
    console.error("[v0] Error creating lot:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "فشل في إنشاء الدفعة",
      },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    console.log("[v0] Updating lot with data:", body)

    if (!body.id) {
      return NextResponse.json({ error: "معرف الدفعة مطلوب" }, { status: 400 })
    }

    const result = await sql`
      UPDATE product_lots SET
        lot_number = ${body.lot_number},
        manufacturing_date = ${body.manufacturing_date || null},
        expiry_date = ${body.expiry_date || null},
        supplier_id = ${body.supplier_id ? Number(body.supplier_id) : null},
        current_quantity = ${Number(body.current_quantity)},
        reserved_quantity = ${Number(body.reserved_quantity || 0)},
        unit_cost = ${Number(body.unit_cost || 0)},
        notes = ${body.notes || null},
        status = ${body.status || "new"},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${body.id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 })
    }

    const lotWithDetails = await sql`
      SELECT 
        pl.*,
        s.supplier_name,
        w.warehouse_name
      FROM product_lots pl
      LEFT JOIN suppliers s ON pl.supplier_id = s.id
      LEFT JOIN warehouses w ON pl.warehouse_id = w.id
      WHERE pl.id = ${result[0].id}
    `

    console.log("[v0] Lot updated successfully:", result[0].id)
    return NextResponse.json(lotWithDetails[0])
  } catch (error) {
    console.error("[v0] Error updating lot:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "فشل في تحديث الدفعة",
      },
      { status: 500 },
    )
  }
}
