import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    const result = await sql`
      INSERT INTO product_warehouse_stock (
        product_id, warehouse_id, warehouse_name, available_quantity,
        reserved_quantity, actual_balance, inventory_value, stock_status,
        batch_number, expiry_date, manufacturing_date, serial_number, location
      ) VALUES (
        ${data.product_id}, ${data.warehouse_id}, ${data.warehouse_name},
        ${data.available_quantity || 0}, ${data.reserved_quantity || 0},
        ${data.actual_balance || 0}, ${data.inventory_value || 0},
        ${data.stock_status || "متوفر"}, ${data.batch_number || null},
        ${data.expiry_date || null}, ${data.manufacturing_date || null},
        ${data.serial_number || null}, ${data.location || null}
      )
      ON CONFLICT (product_id, warehouse_name)
      DO UPDATE SET
        available_quantity = ${data.available_quantity || 0},
        reserved_quantity = ${data.reserved_quantity || 0},
        actual_balance = ${data.actual_balance || 0},
        inventory_value = ${data.inventory_value || 0},
        stock_status = ${data.stock_status || "متوفر"},
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Warehouse stock API error:", error)
    return NextResponse.json({ error: "حدث خطأ في حفظ بيانات المستودع" }, { status: 500 })
  }
}
