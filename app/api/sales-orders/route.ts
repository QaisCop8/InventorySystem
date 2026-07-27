import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET() {
  try {
    const orders = await sql`
      SELECT 
        so.*,
        c.customer_name
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      ORDER BY so.created_at DESC
    `

    return NextResponse.json(orders)
  } catch (error) {
    console.error("Error fetching sales orders:", error)
    return NextResponse.json({ error: "Failed to fetch sales orders" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    const result = await sql`
      INSERT INTO sales_orders (
        order_number, order_date, customer_id, customer_code, salesman,
        currency_name, currency_symbol, exchange_rate, manual_document,
        financial_status, order_status, delivery_date, subtotal, tax_amount,
        discount_amount, total_amount, notes
      ) VALUES (
        ${data.order_number}, 
        ${data.order_date || new Date().toISOString().split("T")[0]}, 
        ${data.customer_id}, 
        ${data.customer_code}, 
        ${data.salesman},
        ${data.currency_name || "ريال سعودي"}, 
        ${data.currency_symbol || "ر.س"}, 
        ${data.exchange_rate || 1}, 
        ${data.manual_document},
        ${data.financial_status || "pending"}, 
        ${data.order_status || "pending"}, 
        ${data.delivery_date}, 
        ${data.subtotal || 0},
        ${data.tax_amount || 0}, 
        ${data.discount_amount || 0}, 
        ${data.total_amount || 0}, 
        ${data.notes}
      ) RETURNING *
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating sales order:", error)
    return NextResponse.json({ error: "Failed to create sales order" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    const { id, ...updateData } = data

    const result = await sql`
      UPDATE sales_orders SET
        order_date = ${updateData.order_date},
        customer_id = ${updateData.customer_id},
        customer_code = ${updateData.customer_code},
        salesman = ${updateData.salesman},
        currency_name = ${updateData.currency_name},
        currency_symbol = ${updateData.currency_symbol},
        exchange_rate = ${updateData.exchange_rate},
        manual_document = ${updateData.manual_document},
        financial_status = ${updateData.financial_status},
        order_status = ${updateData.order_status},
        delivery_date = ${updateData.delivery_date},
        subtotal = ${updateData.subtotal},
        tax_amount = ${updateData.tax_amount},
        discount_amount = ${updateData.discount_amount},
        total_amount = ${updateData.total_amount},
        notes = ${updateData.notes},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating sales order:", error)
    return NextResponse.json({ error: "Failed to update sales order" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Sales order ID is required" }, { status: 400 })
    }

    // Delete order items first
    await sql`DELETE FROM order_items WHERE order_type = 'sales' AND order_id = ${id}`

    // Delete the order
    await sql`DELETE FROM sales_orders WHERE id = ${id}`

    return NextResponse.json({ message: "Sales order deleted successfully" })
  } catch (error) {
    console.error("Error deleting sales order:", error)
    return NextResponse.json({ error: "Failed to delete sales order" }, { status: 500 })
  }
}
