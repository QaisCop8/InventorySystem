import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function POST(request: NextRequest) {
  try {
    const { data } = await request.json()

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات للاستيراد" }, { status: 400 })
    }

    await sql`CREATE TABLE IF NOT EXISTS product_units (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, unit_id INTEGER NOT NULL, to_main_qnty DOUBLE PRECISION DEFAULT 1)`
    await sql`CREATE TABLE IF NOT EXISTS product_unit_barcodes (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, unit_id INTEGER NOT NULL, barcode TEXT NOT NULL)`
    await sql`CREATE TABLE IF NOT EXISTS product_prices (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, price_category_id INTEGER NOT NULL, unit_id INTEGER NOT NULL, price NUMERIC(18,4) DEFAULT 0, currency_id INTEGER DEFAULT 1)`

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
        if (!/^[A-Z0-9]{10}$/.test(String(item.product_code))) {
          errors.push(`السطر ${data.indexOf(item) + 1}: رقم الصنف يجب أن يتكون من 10 أحرف إنجليزية كبيرة أو أرقام`)
          failed++
          continue
        }
        if (String(item.product_name).trim().length > 100) {
          errors.push(`السطر ${data.indexOf(item) + 1}: اسم الصنف يجب ألا يتجاوز 100 حرف`)
          failed++
          continue
        }
        const sellingPrice = Number(item.selling_price ?? item.last_purchase_price ?? 0)
        if (!Number.isFinite(sellingPrice) || sellingPrice < 0 || sellingPrice > 10000000) {
          errors.push(`السطر ${data.indexOf(item) + 1}: سعر البيع يجب أن يكون بين 0 و 10000000`)
          failed++
          continue
        }
        if (String(item.barcode ?? "").trim().length > 30) {
          errors.push(`السطر ${data.indexOf(item) + 1}: الباركود يجب ألا يتجاوز 30 حرف`)
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
        const duplicateName = await sql`SELECT id FROM products WHERE LOWER(TRIM(product_name)) = LOWER(${String(item.product_name).trim()}) LIMIT 1`
        if (duplicateName.length > 0) {
          errors.push(`السطر ${data.indexOf(item) + 1}: اسم الصنف موجود مسبقاً`)
          duplicates++
          continue
        }
        const barcode = String(item.barcode || "").trim()
        if (barcode) {
          const duplicateBarcode = await sql`
            SELECT id FROM products WHERE TRIM(COALESCE(barcode, '')) = ${barcode}
            UNION ALL
            SELECT product_id AS id FROM product_unit_barcodes WHERE TRIM(barcode) = ${barcode}
            LIMIT 1
          `
          if (duplicateBarcode.length > 0) {
            errors.push(`السطر ${data.indexOf(item) + 1}: الباركود موجود مسبقاً`)
            duplicates++
            continue
          }
        }

        // Insert the product
        const inserted = await sql`
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
            ${sellingPrice},
            ${item.currency || "شيكل"},
            'منتج',
            'نشط',
            false,
            false,
            false
          )
          RETURNING id
        `
        const productId = Number(inserted[0]?.id)
        const unitId = Number(item.unit_id || 0)
        const priceCategoryId = Number(item.price_category_id || 0)
        if (productId > 0 && unitId > 0) {
          await sql`INSERT INTO product_units (product_id, unit_id, to_main_qnty) VALUES (${productId}, ${unitId}, 1) ON CONFLICT DO NOTHING`
          if (String(item.barcode || "").trim()) {
            await sql`INSERT INTO product_unit_barcodes (product_id, unit_id, barcode) VALUES (${productId}, ${unitId}, ${String(item.barcode).trim()}) ON CONFLICT DO NOTHING`
          }
          if (priceCategoryId > 0) {
            await sql`INSERT INTO product_prices (product_id, price_category_id, unit_id, price, currency_id) VALUES (${productId}, ${priceCategoryId}, ${unitId}, ${sellingPrice}, ${Number(item.currency_id || 1)}) ON CONFLICT DO NOTHING`
          }
        }
        success++
      } catch (error) {
        console.error(`Error importing product ${item.product_code}:`, error)
        errors.push(`السطر ${data.indexOf(item) + 1}: ${error instanceof Error ? error.message : String(error)}`)
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
