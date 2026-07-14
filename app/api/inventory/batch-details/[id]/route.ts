import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const barcode = searchParams.get("barcode")
    const lotNumber = searchParams.get("lot_number")

    if (!barcode && !lotNumber) {
      return NextResponse.json({ error: "يجب تحديد الباركود أو رقم الباتش" }, { status: 400 })
    }

    let query = `
      SELECT 
        pl.id as lot_id,
        pl.lot_number,
        p.product_code,
        p.product_name,
        p.color_code,
        p.color_name,
        p.model_name,
        pl.manufacturing_date,
        pl.expiry_date,
        po.order_date as purchase_date,
        pl.initial_quantity,
        pl.current_quantity,
        pl.unit_cost,
        pl.status,
        CASE 
          WHEN pl.status = 'new' THEN 'جديد'
          WHEN pl.status = 'in_use' THEN 'قيد الاستخدام'
          WHEN pl.status = 'finished' THEN 'منتهي'
          WHEN pl.status = 'damaged' THEN 'تالف/مغلق'
          ELSE pl.status
        END as status_display,
        w.warehouse_name,
        pws.floor,
        pws.shelf,
        pws.location,
        s.supplier_name,
        p.barcode
      FROM product_lots pl
      JOIN products p ON pl.product_id = p.id
      LEFT JOIN purchase_orders po ON pl.purchase_order_id = po.id
      LEFT JOIN product_warehouse_stock pws ON p.id = pws.product_id AND pl.lot_number = pws.batch_number
      LEFT JOIN warehouses w ON pws.warehouse_name = w.warehouse_name
      LEFT JOIN suppliers s ON pl.supplier_id = s.id
      WHERE 1=1
    `

    const params: any[] = []

    if (barcode) {
      query += ` AND (p.barcode = $${params.length + 1} OR pl.lot_number ILIKE $${params.length + 2})`
      params.push(barcode, `%${barcode}%`)
    }

    if (lotNumber) {
      query += ` AND pl.lot_number ILIKE $${params.length + 1}`
      params.push(`%${lotNumber}%`)
    }

    query += ` ORDER BY pl.created_at DESC LIMIT 10`

    const result = await sql.unsafe(query, params)

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error searching batch details:", error)
    return NextResponse.json({ error: "فشل في البحث عن تفاصيل الباتش" }, { status: 500 })
  }
}

