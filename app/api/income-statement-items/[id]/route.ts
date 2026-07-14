import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { generateSupplierNumber } from "@/lib/number-generator"

const sql = neon(process.env.DATABASE_URL!)

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
        if (!item.supplier_name) {
          errors.push(`السطر ${data.indexOf(item) + 1}: اسم المورد مطلوب`)
          failed++
          continue
        }

        // Generate supplier code if not provided
        let supplierCode = item.supplier_code
        if (!supplierCode) {
          supplierCode = await generateSupplierNumber()
        }

        // Check for duplicates
        const existing = await sql`
          SELECT id FROM suppliers WHERE supplier_code = ${supplierCode}
        `

        if (existing.length > 0) {
          duplicates++
          continue
        }

        // Insert the supplier
        await sql`
          INSERT INTO suppliers (
            supplier_code, supplier_name, phone1, phone2, whatsapp1,
            city, address, email, status, business_nature,
            classification, account_opening_date
          ) VALUES (
            ${supplierCode},
            ${item.supplier_name},
            ${item.phone1 || ""},
            ${item.phone2 || ""},
            ${item.whatsapp1 || ""},
            ${item.city || ""},
            ${item.address || ""},
            ${item.email || ""},
            ${item.status || "نشط"},
            ${item.business_nature || ""},
            ${item.classification || "عادي"},
            ${new Date().toISOString()}
          )
        `
        success++
      } catch (error) {
        console.error(`Error importing supplier ${item.supplier_name}:`, error)
        errors.push(`السطر ${data.indexOf(item) + 1}: ${error.message}`)
        failed++
      }
    }

    return NextResponse.json({
      success,
      failed,
      duplicates,
      errors: errors.slice(0, 10),
    })
  } catch (error) {
    console.error("Error importing suppliers:", error)
    return NextResponse.json({ error: "خطأ في استيراد الموردين" }, { status: 500 })
  }
}

