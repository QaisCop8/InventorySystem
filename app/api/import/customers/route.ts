import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { generateCustomerNumber } from "@/lib/number-generator"

import { Pool } from "pg"

let sql: any = null

try {
  if (!process.env.DATABASE_URL) {
    console.error("[v0] DATABASE_URL environment variable is not set")
  } else {
    const dbUrl = process.env.DATABASE_URL

    if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
      const pool = new Pool({ connectionString: dbUrl })
      sql = async (strings: TemplateStringsArray, ...values: any[]) => {
        const client = await pool.connect()
        try {
          const query =
            strings.reduce(
              (prev, curr, i) =>
                prev + curr + (i < values.length ? `$${i + 1}` : ""),
              ""
            )
          const result = await client.query(query, values)
          return result.rows
        } finally {
          client.release()
        }
      }
    } else {
      console.log("[v0] Using Neon serverless client")
      sql = neon(dbUrl)
    }

    console.log("[v0] Database client initialized successfully")
  }
} catch (error) {
  console.error("[v0] Failed to initialize DB client:", error)
  sql = null
}

export default sql

export async function POST(request: NextRequest) {
  try {
    const { data } = await request.json()

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات للاستيراد" }, { status: 400 })
    }

    let success = 0;
    let failed = 0;
    let duplicates = 0;
    const errors: string[] = [];

    for (const item of data) {
      try {
        const rowIndex = item.rowIndex || data.indexOf(item) + 1;

        // Skip invalid records
        if (!item.isValid) {
          errors.push(`السطر ${rowIndex}: بيانات غير صالحة`);
          failed++;
          continue;
        }

        // Required field check
        if (!item.customer_name) {
          errors.push(`السطر ${rowIndex}: اسم العميل مطلوب`);
          failed++;
          continue;
        }

        // Determine type: 1 = customer, 2 = supplier
        const type = item.type || 1;

        // Generate customer code if not provided
        let customerCode = item.customer_code;
        if (!customerCode) {
          customerCode = await generateCustomerNumber();
        }

        // Check for duplicates
        const existing = await sql`
      SELECT id FROM customers WHERE customer_code = ${customerCode}
    `;
        if (existing.length > 0) {
          duplicates++;
          continue;
        }

        // Insert into customers table
        const result = await sql`
      INSERT INTO customers (
        customer_code,
        name,
        mobile1,
        mobile2,
        whatsapp1,
        whatsapp2,
        city,
        address,
        email,
        status,
        business_nature,
        salesman,
        classification,
        registration_date,
        transaction_notes,
        general_notes,
        api_key,
        type,
        isDeleted,
        priceCategory
      ) VALUES (
        ${customerCode},
        ${item.name || item.customer_name},
        ${item.mobile1 || null},
        ${item.mobile2 || null},
        ${item.whatsapp1 || null},
        ${item.whatsapp2 || null},
        ${item.city || null},
        ${item.address || null},
        ${item.email || null},
        ${item.status || 'نشط'},
        ${item.business_nature || null},
        ${item.salesman || null},
        ${item.classification || null},
        ${item.registration_date || new Date().toISOString().split('T')[0]},
        ${item.transaction_notes || null},
        ${item.general_notes || null},
        ${item.api_key || `API_${customerCode}_${Date.now()}`},
        ${type},
        ${item.isDeleted || false},
        ${Number(item.pricecategory) || Number(item.priceCategory) || 0}
      )
      RETURNING *;
    `;

        success++;
      } catch (error: any) {
        const rowIndex = item.rowIndex || data.indexOf(item) + 1;
        errors.push(`السطر ${rowIndex}: ${error.message}`);
        failed++;
        console.error(`Error importing customer ${item.customer_name}:`, error);
      }
    }

    // Now you have { success, failed, duplicates, errors } to return or use


    return NextResponse.json({
      success,
      failed,
      duplicates,
      errors: errors.slice(0, 10),
    })
  } catch (error) {
    console.error("Error importing customers:", error)
    return NextResponse.json({ error: "خطأ في استيراد العملاء" }, { status: 500 })
  }
}



