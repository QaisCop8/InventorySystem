import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("product_id")
    const status = searchParams.get("status")
    const expiryStatus = searchParams.get("expiry_status")
    const activeOnly = searchParams.get("active_only") === "true"

    const whereConditions = ["1=1"]
    const params: any[] = []

    if (productId && productId !== "all") {
      whereConditions.push(`pl.product_id = $${params.length + 1}`)
      params.push(Number.parseInt(productId))
    }

    if (status && status !== "all") {
      whereConditions.push(`pl.status = $${params.length + 1}`)
      params.push(status)
    }

    if (activeOnly) {
      whereConditions.push(`pl.status IN ('new', 'in_use') AND pl.current_quantity > 0`)
    }

    if (expiryStatus) {
      if (expiryStatus === "expired") {
        whereConditions.push(`pl.expiry_date < CURRENT_DATE`)
      } else if (expiryStatus === "expiring_soon") {
        whereConditions.push(`pl.expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND pl.expiry_date >= CURRENT_DATE`)
      } else if (expiryStatus === "valid") {
        whereConditions.push(`(pl.expiry_date IS NULL OR pl.expiry_date > CURRENT_DATE + INTERVAL '30 days')`)
      }
    }

    const whereClause = whereConditions.join(" AND ")

    const query = `
      SELECT 
        pl.id,
        pl.product_id,
        p.product_name,
        p.product_code,
        pl.lot_number,
        pl.manufacturing_date,
        pl.expiry_date,
        CASE 
          WHEN pl.expiry_date IS NULL THEN 'صالح'
          WHEN pl.expiry_date < CURRENT_DATE THEN 'منتهي الصلاحية'
          WHEN pl.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'قريب الانتهاء'
          ELSE 'صالح'
        END as expiry_status,
        pl.supplier_id,
        s.supplier_name,
        pl.initial_quantity,
        pl.current_quantity,
        pl.reserved_quantity,
        pl.available_quantity,
        pl.unit_cost,
        pl.status,
        CASE 
          WHEN pl.status = 'new' THEN 'جديد'
          WHEN pl.status = 'in_use' THEN 'قيد الاستخدام'
          WHEN pl.status = 'finished' THEN 'منتهي'
          WHEN pl.status = 'damaged' THEN 'تالف'
          ELSE pl.status
        END as status_display,
        pl.status_changed_at,
        pl.status_changed_by,
        pl.status_notes,
        pl.created_at,
        pl.updated_at
      FROM product_lots pl
      JOIN products p ON pl.product_id = p.id
      LEFT JOIN suppliers s ON pl.supplier_id = s.id
      WHERE ${whereClause}
      ORDER BY 
        CASE WHEN pl.expiry_date IS NULL THEN 1 ELSE 0 END,
        pl.expiry_date ASC,
        p.product_name,
        pl.created_at DESC
    `

    const result = await sql.unsafe(query, params)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Error fetching batch lots:", error)
    return NextResponse.json({ error: "فشل في تحميل الدفعات" }, { status: 500 })
  }
}

