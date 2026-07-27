import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { formatPhoneNumber } from "@/lib/whatsapp-service"

// الحصول على معلومات العميل وطلبياته
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const phone = searchParams.get("phone")

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 })
    }

    const formattedPhone = formatPhoneNumber(phone)

    console.log("[v0] Customer portal request for phone:", formattedPhone)

    // البحث عن العميل
    const customers = await sql`
      SELECT id, customer_code, customer_name, email, mobile1, whatsapp1, status
      FROM customers 
      WHERE whatsapp1 = ${formattedPhone} OR mobile1 = ${formattedPhone}
      LIMIT 1
    `

    if (!customers.length) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    const customer = customers[0]

    // الحصول على طلبيات العميل
    const orders = await sql`
      SELECT 
        so.id,
        so.order_number,
        so.order_date,
        so.total_amount,
        so.status,
        ows.current_stage_id,
        ws.stage_name,
        ws.stage_color,
        ws.icon_name
      FROM sales_orders so
      LEFT JOIN order_workflow_status ows ON so.id = ows.order_id AND ows.order_type = 'sales'
      LEFT JOIN workflow_stages ws ON ows.current_stage_id = ws.id
      WHERE so.customer_id = ${customer.id}
      ORDER BY so.order_date DESC
      LIMIT 20
    `

    return NextResponse.json({
      success: true,
      data: {
        customer: {
          id: customer.id,
          code: customer.customer_code,
          name: customer.customer_name,
          email: customer.email,
          phone: customer.mobile1,
          whatsapp: customer.whatsapp1,
          status: customer.status,
        },
        orders: orders.map((order) => ({
          id: order.id,
          orderNumber: order.order_number,
          orderDate: order.order_date,
          totalAmount: order.total_amount,
          status: order.status,
          currentStage: {
            id: order.current_stage_id,
            name: order.stage_name,
            color: order.stage_color,
            icon: order.icon_name,
          },
        })),
      },
    })
  } catch (error) {
    console.error("[v0] Customer portal error:", error)
    return NextResponse.json({ error: "Failed to fetch customer data" }, { status: 500 })
  }
}
