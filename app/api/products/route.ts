import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    const products = await sql`
      SELECT 
        p.*,
        pc.name as category_name,
        s.name as supplier_name
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE (
        p.status IS NULL
        OR p.status = 1
        OR p.status = 'نشط'
        OR p.status = 'active'
        OR p.status = 'ACTIVE'
      )
      ORDER BY p.created_at DESC
    `

    return NextResponse.json(products)
  } catch (error) {
    console.error("Error fetching products:", error)
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    const result = await sql`
      INSERT INTO products (
        product_code, name, name_en, description, category_id,
        primary_unit, secondary_unit, conversion_factor, barcode, original_number,
        manufacturer_number, last_purchase_price, currency, cost_price, sale_price,
        stock, min_stock, max_stock, order_quantity, product_type,
        has_expiry_date, has_batch_number, has_colors, status, supplier_id,
        entry_date, image_url
      ) VALUES (
        ${data.product_code}, ${data.name}, ${data.name_en}, ${data.description}, ${data.category_id},
        ${data.primary_unit}, ${data.secondary_unit}, ${data.conversion_factor || 1},
        ${data.barcode}, ${data.original_number}, ${data.manufacturer_number},
        ${data.last_purchase_price || 0}, ${data.currency}, ${data.cost_price || 0}, ${data.sale_price || 0},
        ${data.stock || 0}, ${data.min_stock || 0}, ${data.max_stock || 0}, ${data.order_quantity || 0},
        ${data.product_type || "عادي"}, ${data.has_expiry_date || false}, ${data.has_batch_number || false}, 
        ${data.has_colors || false}, ${data.status || "نشط"}, ${data.supplier_id},
        ${data.entry_date || new Date().toISOString().split("T")[0]}, ${data.image_url}
      ) RETURNING *
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating product:", error)
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    const { id, ...updateData } = data

    const result = await sql`
      UPDATE products SET
        name = ${updateData.name},
        name_en = ${updateData.name_en},
        description = ${updateData.description},
        category_id = ${updateData.category_id},
        primary_unit = ${updateData.primary_unit},
        secondary_unit = ${updateData.secondary_unit},
        conversion_factor = ${updateData.conversion_factor},
        barcode = ${updateData.barcode},
        original_number = ${updateData.original_number},
        manufacturer_number = ${updateData.manufacturer_number},
        last_purchase_price = ${updateData.last_purchase_price},
        currency = ${updateData.currency},
        cost_price = ${updateData.cost_price},
        sale_price = ${updateData.sale_price},
        stock = ${updateData.stock},
        min_stock = ${updateData.min_stock},
        max_stock = ${updateData.max_stock},
        order_quantity = ${updateData.order_quantity},
        product_type = ${updateData.product_type},
        has_expiry_date = ${updateData.has_expiry_date},
        has_batch_number = ${updateData.has_batch_number},
        has_colors = ${updateData.has_colors},
        status = ${updateData.status},
        supplier_id = ${updateData.supplier_id},
        image_url = ${updateData.image_url},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating product:", error)
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 })
    }

    await sql`DELETE FROM products WHERE id = ${id}`

    return NextResponse.json({ message: "Product deleted successfully" })
  } catch (error) {
    console.error("Error deleting product:", error)
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 })
  }
}
