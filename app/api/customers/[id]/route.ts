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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    if (!id) {
      console.log("[v0] Missing customer ID")
      return NextResponse.json({ error: "معرف العميل مطلوب" }, { status: 400 })
    }

    if (id === "generate-number") {
      console.log("[v0] Generating new customer number...")
      try {
        const customerNumber = await generateCustomerNumber()
        console.log("[v0] Generated customer number:", customerNumber)
        return NextResponse.json({ customerNumber })
      } catch (error) {
        console.error("[v0] Error generating customer number:", error)
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        return NextResponse.json(
          {
            message: "فشل في توليد رقم الزبون",
            error: errorMessage,
          },
          { status: 500 },
        )
      }
    }

    // إذا كان id ليس رقماً، نرجع 404
    if (isNaN(Number(id))) {
      console.log("[v0] Invalid customer ID format (not a number):", id)
      return NextResponse.json({ error: "معرف العميل غير صالح" }, { status: 404 })
    }

    console.log("[v0] Fetching customer with ID:", id)

    const result = await sql`
      SELECT * FROM customers WHERE id = ${id}
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 })
    }

    console.log("[v0] Customer fetched successfully:", result[0])

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[v0] Error fetching customer:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل بيانات العميل" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    if (!id || isNaN(Number(id))) {
      console.log("[v0] Invalid customer ID format:", id)
      return NextResponse.json({ error: "معرف العميل غير صالح" }, { status: 400 })
    }

    const data = await request.json()
    const { voucher } = data
    console.log("[v0] Updating customer with ID:", id)
    console.log("[v0] Update data received:", data)

    const result = await sql`
  UPDATE customers
  SET
    name = ${data.customer_name || data.name || ""},
    mobile1 = ${data.mobile1 || data.phone1 || ""},
    mobile2 = ${data.mobile2 || data.phone2 || ""},
    whatsapp1 = ${data.whatsapp1 || ""},
    whatsapp2 = ${data.whatsapp2 || ""},
    city = ${data.city || ""},
    address = ${data.address || ""},
    email = ${data.email || ""},
    status = ${data.status || "نشط"},
    business_nature = ${data.business_nature || ""},
    salesman = ${data.salesman || ""},
    classification = ${data.classifications || data.classification || ""},
    registration_date = ${data.account_opening_date || new Date().toISOString().split("T")[0]},
    transaction_notes = ${data.movement_notes || data.transaction_notes || ""},
    general_notes = ${data.general_notes || ""},
    api_key = ${data.api_number || ""},
    pricecategory=${Number(data.pricecategory) || Number(data.priceCategory) || 0}
  WHERE id = ${id}
  RETURNING *
`;

    console.log("[v0] Customer updated successfully:", result[0])

    if (result.length === 0) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    if (Array.isArray(voucher)) {
      // Delete old vouchers for this customer
      await sql`DELETE FROM customer_vouchers WHERE customer_id = ${id}`;

      // Insert new ones
      for (const v of voucher) {
        await sql`
          INSERT INTO customer_vouchers (customer_id, voucher_id, book_id)
          VALUES (${id}, ${v.type_id}, ${v.book_id});
        `;
      }
      console.log(`[v0] Updated vouchers for customer ${id}`);
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[v0] Error updating customer:", error)
    return NextResponse.json({ error: "Failed to update customer " + error }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    if (!id || isNaN(Number(id))) {
      console.log("[v0] Invalid customer ID format:", id)
      return NextResponse.json({ error: "معرف العميل غير صالح" }, { status: 400 })
    }

    await sql`update  customers set isDeleted = true WHERE id = ${id}`

    return NextResponse.json({ message: "Customer deleted successfully" })
  } catch (error) {
    console.error("Error deleting customer:", error)
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 })
  }
}
