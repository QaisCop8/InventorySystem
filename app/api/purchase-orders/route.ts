import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { generatePurchaseOrderNumber } from "@/lib/number-generator"

export async function GET() {
  try {
    const orders = await sql`
      SELECT 
        po.*,
        po.supplier_name,
        po.salesman as salesman_name,
        po.currency_name,
        po.currency_code
      FROM purchase_orders po
      ORDER BY po.created_at DESC
    `

    return NextResponse.json(orders)
  } catch (error) {
    console.error("Error fetching purchase orders:", error)
    return NextResponse.json({ error: "Failed to fetch purchase orders" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    console.log("[v0] Starting purchase order creation...")

    let orderNumber = data.order_number
    let attempts = 0
    const maxAttempts = 3

    while (attempts < maxAttempts) {
      try {
        // Generate a new order number if not provided or if this is a retry
        if (!orderNumber || attempts > 0) {
          orderNumber = await generatePurchaseOrderNumber()
          console.log(`[v0] Generated order number (attempt ${attempts + 1}): ${orderNumber}`)
        }

        const orderDate = data.order_date || new Date().toISOString().split("T")[0]
        console.log("[v0] Order date:", orderDate)

        const result = await sql`
          INSERT INTO purchase_orders (
            order_number, order_date, supplier_id, supplier_name, manual_document,
            currency_code, currency_name, exchange_rate, salesman, expected_delivery_date,
            notes, total_amount, attachments
          ) VALUES (
            ${orderNumber}, ${orderDate}, ${data.supplier_id}, ${data.supplier_name},
            ${data.manual_document}, ${data.currency_code}, ${data.currency_name}, ${data.exchange_rate},
            ${data.salesman}, ${data.expected_delivery_date}, ${data.notes},
            ${data.total_amount}, ${data.attachments}
          ) RETURNING *
        `

        console.log("[v0] Purchase order created successfully:", result[0])
        return NextResponse.json(result[0], { status: 201 })
      } catch (insertError: any) {
        console.error(`[v0] Insert attempt ${attempts + 1} failed:`, insertError)

        if (insertError.message && insertError.message.includes("duplicate key") && attempts < maxAttempts - 1) {
          console.log(`[v0] Duplicate key detected, retrying with new order number...`)
          orderNumber = null // Force generation of new number
          attempts++
          continue
        }

        // If it's not a duplicate key error or we've exhausted retries, throw the error
        throw insertError
      }
    }

    throw new Error("Failed to create purchase order after maximum attempts")
  } catch (error) {
    console.error("Error creating purchase order:", error)
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    const { id, ...updateData } = data

    const result = await sql`
      UPDATE purchase_orders SET
        order_date = ${updateData.order_date},
        supplier_id = ${updateData.supplier_id},
        supplier_name = ${updateData.supplier_name},
        manual_document = ${updateData.manual_document},
        currency_code = ${updateData.currency_code},
        currency_name = ${updateData.currency_name},
        exchange_rate = ${updateData.exchange_rate},
        salesman = ${updateData.salesman},
        expected_delivery_date = ${updateData.expected_delivery_date},
        notes = ${updateData.notes},
        total_amount = ${updateData.total_amount},
        attachments = ${updateData.attachments},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating purchase order:", error)
    return NextResponse.json({ error: "Failed to update purchase order" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Purchase order ID is required" }, { status: 400 })
    }

    await sql`DELETE FROM purchase_orders WHERE id = ${id}`

    return NextResponse.json({ message: "Purchase order deleted successfully" })
  } catch (error) {
    console.error("Error deleting purchase order:", error)
    return NextResponse.json({ error: "Failed to delete purchase order" }, { status: 500 })
  }
}
