import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function POST(request: NextRequest) {
  try {
    const { data } = await request.json()

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات للاستيراد" }, { status: 400 })
    }

    let success = 0
    let failed = 0
    let duplicates = 0
    const errors: string[] = []

    for (const item of data) {
      try {
        // Check for required fields
        if (!item.product_name || !item.product_code) {
          errors.push(`السطر ${data.indexOf(item) + 1}: اسم الصنف ورقم الصنف مطلوبان`)
          failed++
          continue
        }

        // Check for duplicates
        const existing = await sql`
          SELECT id FROM products WHERE product_code = ${item.product_code}
        `

        if (existing.length > 0) {
          duplicates++
          continue
        }

        // Insert the product
        await sql`
          INSERT INTO products (
            product_code, product_name, description, category,
            main_unit, secondary_unit, conversion_factor, barcode,
            last_purchase_price, currency, product_type, status,
            has_expiry, has_batch, has_colors
          ) VALUES (
            ${item.product_code},
            ${item.product_name},
            ${item.description || ""},
            ${item.category || "عام"},
            ${item.main_unit || "قطعة"},
            ${item.secondary_unit || ""},
            ${item.conversion_factor || 1},
            ${item.barcode || ""},
            ${item.last_purchase_price || 0},
            ${item.currency || "شيكل"},
            'منتج',
            'نشط',
            false,
            false,
            false
          )
        `
        success++
      } catch (error) {
        console.error(`Error importing product ${item.product_code}:`, error)
        errors.push(`السطر ${data.indexOf(item) + 1}: ${error.message}`)
        failed++
      }
    }

    return NextResponse.json({
      success,
      failed,
      duplicates,
      errors: errors.slice(0, 10), // Limit errors to first 10
    })
  } catch (error) {
    console.error("Error importing products:", error)
    return NextResponse.json({ error: "خطأ في استيراد الأصناف" }, { status: 500 })
  }
}
