import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("product_id")

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 })
    }

    const warehouses = await sql`
      SELECT 
        pw.id,
        pw.warehouse_id,
        w.name as warehouse_name,
        pw.floor,
        pw.area,
        pw.shelf,
        pw.quantity,
        pw.reserved_quantity,
        (pw.quantity - pw.reserved_quantity) as available_quantity,
        COALESCE(pw.min_stock_level, 0) as min_stock_level,
        COALESCE(pw.max_stock_level, 0) as max_stock_level,
        CASE 
          WHEN pw.quantity = 0 THEN 'نفد المخزون'
          WHEN pw.quantity <= COALESCE(pw.min_stock_level, 0) THEN 'تحت الحد الأدنى'
          ELSE 'متوفر'
        END as status
      FROM product_warehouses pw
      JOIN warehouses w ON pw.warehouse_id = w.id
      WHERE pw.product_id = ${productId}
      ORDER BY w.name
    `

    return NextResponse.json(warehouses)
  } catch (error) {
    console.error("Error fetching product warehouses:", error)
    return NextResponse.json({ error: "Failed to fetch product warehouses" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const {
      product_id,
      warehouse_id,
      floor,
      area,
      shelf,
      quantity,
      reserved_quantity,
      min_stock_level,
      max_stock_level,
    } = data

    const result = await sql`
      INSERT INTO product_warehouses (
        product_id, warehouse_id, floor, area, shelf, 
        quantity, reserved_quantity, min_stock_level, max_stock_level
      )
      VALUES (
        ${product_id}, ${warehouse_id}, ${floor || ""}, ${area || ""}, ${shelf || ""}, 
        ${quantity || 0}, ${reserved_quantity || 0}, ${min_stock_level || 0}, ${max_stock_level || 0}
      )
      RETURNING *
    `

    // Get warehouse name
    const warehouse = await sql`
      SELECT name FROM warehouses WHERE id = ${warehouse_id}
    `

    const responseData = {
      ...result[0],
      warehouse_name: warehouse[0]?.name || "",
      available_quantity: (result[0].quantity || 0) - (result[0].reserved_quantity || 0),
      status:
        result[0].quantity === 0
          ? "نفد المخزون"
          : result[0].quantity <= (result[0].min_stock_level || 0)
            ? "تحت الحد الأدنى"
            : "متوفر",
    }

    return NextResponse.json(responseData)
  } catch (error) {
    console.error("Error creating product warehouse:", error)
    return NextResponse.json({ error: "Failed to create product warehouse" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    const { id, warehouse_id, floor, area, shelf, quantity, reserved_quantity, min_stock_level, max_stock_level } = data

    const result = await sql`
      UPDATE product_warehouses 
      SET 
        warehouse_id = ${warehouse_id},
        floor = ${floor || ""},
        area = ${area || ""},
        shelf = ${shelf || ""},
        quantity = ${quantity || 0},
        reserved_quantity = ${reserved_quantity || 0},
        min_stock_level = ${min_stock_level || 0},
        max_stock_level = ${max_stock_level || 0}
      WHERE id = ${id}
      RETURNING *
    `

    // Get warehouse name
    const warehouse = await sql`
      SELECT name FROM warehouses WHERE id = ${warehouse_id}
    `

    const responseData = {
      ...result[0],
      warehouse_name: warehouse[0]?.name || "",
      available_quantity: (result[0].quantity || 0) - (result[0].reserved_quantity || 0),
      status:
        result[0].quantity === 0
          ? "نفد المخزون"
          : result[0].quantity <= (result[0].min_stock_level || 0)
            ? "تحت الحد الأدنى"
            : "متوفر",
    }

    return NextResponse.json(responseData)
  } catch (error) {
    console.error("Error updating product warehouse:", error)
    return NextResponse.json({ error: "Failed to update product warehouse" }, { status: 500 })
  }
}
