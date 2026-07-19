
import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const barcode = searchParams.get("barcode")
    const query = searchParams.get("q")
    const hasBarcode = searchParams.get("has_barcode")

    let products

    if (barcode) {
      // Search by barcode
      products = await sql`
        SELECT 
          p.id,
          p.product_code,
          p.product_name,
          p.barcode,
          p.main_unit as unit,
          p.last_purchase_price,
          p.unit_price,
          p.currency,
          COALESCE(ps.current_stock, 0) as current_stock,
          COALESCE(ps.available_stock, 0) as available_stock,
          COALESCE(ps.reorder_level, 0) as reorder_level
        FROM products p
        LEFT JOIN product_stock ps ON p.id = ps.product_id
        WHERE p.barcode = ${barcode}
          AND (
            p.status IS NULL
            OR p.status = 1
            OR p.status = 'نشط'
            OR p.status = 'active'
            OR p.status = 'ACTIVE'
          )
        LIMIT 1
      `
    } else if (hasBarcode === "true") {
      // Get products with barcodes
      products = await sql`
        SELECT 
          p.id,
          p.product_code,
          p.product_name,
          p.barcode,
          p.main_unit as unit,
          p.last_purchase_price,
          p.unit_price,
          p.currency,
          COALESCE(ps.current_stock, 0) as current_stock,
          COALESCE(ps.available_stock, 0) as available_stock,
          COALESCE(ps.reorder_level, 0) as reorder_level
        FROM products p
        LEFT JOIN product_stock ps ON p.id = ps.product_id
        WHERE p.barcode IS NOT NULL AND p.barcode != ''
          AND (
            p.status IS NULL
            OR p.status = 1
            OR p.status = 'نشط'
            OR p.status = 'active'
            OR p.status = 'ACTIVE'
          )
        ORDER BY p.product_name
        LIMIT 100
      `
    } else if (query) {
      // General search
      products = await sql`
        SELECT 
          p.id,
          p.product_code,
          p.product_name,
          p.barcode,
          p.main_unit as unit,
          p.last_purchase_price,
          p.unit_price,
          p.currency,
          COALESCE(ps.current_stock, 0) as current_stock,
          COALESCE(ps.available_stock, 0) as available_stock,
          COALESCE(ps.reorder_level, 0) as reorder_level
        FROM products p
        LEFT JOIN product_stock ps ON p.id = ps.product_id
        WHERE (
          p.product_name ILIKE ${`%${query}%`} OR
          p.product_code ILIKE ${`%${query}%`} OR
          p.barcode ILIKE ${`%${query}%`}
        )
          AND (
            p.status IS NULL
            OR p.status = 1
            OR p.status = 'نشط'
            OR p.status = 'active'
            OR p.status = 'ACTIVE'
          )
        ORDER BY p.product_name
        LIMIT 50
      `

      return NextResponse.json({ success: true, products })
    } else {
      return NextResponse.json({ error: "Missing search parameters" }, { status: 400 })
    }

    return NextResponse.json(products)
  } catch (error) {
    console.error("Error searching products:", error)
    return NextResponse.json({ error: "Failed to search products" }, { status: 500 })
  }
}
