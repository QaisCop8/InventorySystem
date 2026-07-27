import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { formatPhoneNumber } from "@/lib/whatsapp-service"

// الحصول على استفسارات العملاء
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const phone = searchParams.get("phone")
    const status = searchParams.get("status")
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    const whereConditions = []
    const params: any[] = []

    if (phone) {
      whereConditions.push(`customer_phone = $${params.length + 1}`)
      params.push(formatPhoneNumber(phone))
    }

    if (status) {
      whereConditions.push(`status = $${params.length + 1}`)
      params.push(status)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : ""

    const query = `
      SELECT * FROM whatsapp_customer_inquiries 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `

    params.push(limit, offset)

    const inquiries = await sql.unsafe(query, params)

    const countQuery = `
      SELECT COUNT(*) as total FROM whatsapp_customer_inquiries 
      ${whereClause}
    `

    const countResult = await sql.unsafe(countQuery, params.slice(0, -2))

    return NextResponse.json({
      success: true,
      data: inquiries,
      total: Number.parseInt(countResult[0].total),
      limit,
      offset,
    })
  } catch (error) {
    console.error("[v0] Error fetching inquiries:", error)
    return NextResponse.json({ error: "Failed to fetch inquiries" }, { status: 500 })
  }
}

// إنشاء استفسار جديد
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customer_phone, customer_name, inquiry_type, inquiry_message, related_order_id, related_order_number } =
      body

    if (!customer_phone || !inquiry_type || !inquiry_message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO whatsapp_customer_inquiries (
        customer_phone, customer_name, inquiry_type, inquiry_message,
        related_order_id, related_order_number, status
      ) VALUES (
        ${formatPhoneNumber(customer_phone)}, ${customer_name || null},
        ${inquiry_type}, ${inquiry_message}, ${related_order_id || null},
        ${related_order_number || null}, 'pending'
      )
      RETURNING *
    `

    return NextResponse.json({
      success: true,
      message: "Inquiry created successfully",
      data: result[0],
    })
  } catch (error) {
    console.error("[v0] Error creating inquiry:", error)
    return NextResponse.json({ error: "Failed to create inquiry" }, { status: 500 })
  }
}

// تحديث حالة استفسار
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, status, response_message, responded_by_user_id, assigned_to_user_id, assigned_to_department } = body

    if (!id) {
      return NextResponse.json({ error: "Inquiry ID is required" }, { status: 400 })
    }

    const result = await sql`
      UPDATE whatsapp_customer_inquiries 
      SET 
        status = ${status || "pending"},
        response_message = ${response_message || null},
        responded_at = ${response_message ? sql`CURRENT_TIMESTAMP` : null},
        responded_by_user_id = ${responded_by_user_id || null},
        assigned_to_user_id = ${assigned_to_user_id || null},
        assigned_to_department = ${assigned_to_department || null},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    return NextResponse.json({
      success: true,
      message: "Inquiry updated successfully",
      data: result[0],
    })
  } catch (error) {
    console.error("[v0] Error updating inquiry:", error)
    return NextResponse.json({ error: "Failed to update inquiry" }, { status: 500 })
  }
}
