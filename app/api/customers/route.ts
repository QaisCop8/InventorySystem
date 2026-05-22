import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { generateCustomerNumber } from "@/lib/number-generator";
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



export async function GET(request: NextRequest) {
  try {
    console.log("[v0] GET /api/customers - Fetching customers with portal info")

    const typeParam = request.nextUrl.searchParams.get("type");
    const typeFilter = typeParam === "1" || typeParam === "2" ? Number(typeParam) : null;

    const customers = typeFilter
      ? await sql`
          SELECT 
            c.*,
            COUNT(cu.id) as user_count,
            CASE WHEN COUNT(cu.id) > 0 THEN true ELSE false END as portal_enabled
          FROM customers c
          LEFT JOIN customer_users cu ON c.id = cu.customer_id AND cu.is_active = true
          WHERE c.isDeleted = false AND c.type = ${typeFilter}
          GROUP BY c.id
          ORDER BY c.created_at DESC
        `
      : await sql`
          SELECT 
            c.*,
            COUNT(cu.id) as user_count,
            CASE WHEN COUNT(cu.id) > 0 THEN true ELSE false END as portal_enabled
          FROM customers c
          LEFT JOIN customer_users cu ON c.id = cu.customer_id AND cu.is_active = true
          WHERE c.isDeleted = false
          GROUP BY c.id
          ORDER BY c.created_at DESC
        `

    console.log("[v0] Customers fetched:", {
      count: customers.length,
      sample: customers[0]
        ? {
          id: customers[0].id,
          name: customers[0].name,
          userCount: customers[0].user_count,
          portalEnabled: customers[0].portal_enabled,
        }
        : null,
    })

    const customerIds = customers.map((c: { id: any; }) => c.id);
    type VoucherItem = {
      book_name: string;
      type_id: number;
    };
    const vouchersMap: Record<number, VoucherItem[]> = {};
    if (customerIds.length > 0) {
      const vouchers = await sql`
        SELECT 
        cv.customer_id,
        cv.voucher_id as type_id ,
        vb.name AS book_name
        FROM customer_vouchers cv
        LEFT JOIN voucher_books vb ON cv.book_id = vb.id
         WHERE cv.customer_id = ANY(${customerIds}::int[])
        ORDER BY cv.customer_id, cv.id ASC
      `;






      // Group vouchers by customer_id
      vouchers.forEach((v: any) => {
        const customerId = Number(v.customer_id); // ensure number
        if (!vouchersMap[customerId]) vouchersMap[customerId] = [];
        vouchersMap[customerId].push({
          book_name: v.book_name,
          type_id: v.type_id
        });
      });
    }

    //

    const result = customers.map((c: { id: string | number }) => {
      const customerId = Number(c.id); // ensure numeric key
      return {
        ...c,
        voucherType: vouchersMap[customerId] || [],
      };
    });


    return NextResponse.json({ customers: result })
  } catch (error) {
    console.error("[v0] Error fetching customers:", error)
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    console.log("[v0] Creating customer with data:", data)

    // Check if customer code already exists
    if (data.id === 0) {

      if (data.customer_code) {
        const existingCustomer = await sql`
        SELECT id FROM customers WHERE customer_code = ${data.customer_code}
      `

        if (existingCustomer.length > 0) {

          const customerNumber = await generateCustomerNumber(data.type === 2 ? true : false);
          data.customer_code = customerNumber;
          const existingCust = await sql`
        SELECT id FROM customers WHERE customer_code = ${data.customer_code}
      `

          if (existingCust.length > 0) {
            return NextResponse.json({ error: "رقم العميل موجود مسبقاً، يرجى اختيار رقم آخر" }, { status: 400 })
          }
        }
      }

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
    classification,      -- fixed here
    registration_date,   -- matches table definition
    transaction_notes,   -- matches table definition
    general_notes,
    api_key,          -- matches table definition
    type,
    isDeleted,
    priceCategory
  ) VALUES (
    ${data.customer_code},
    ${data.customer_name || data.name},
    ${data.mobile1 || null},
    ${data.mobile2 || null},
    ${data.whatsapp1 || null},
    ${data.whatsapp2 || null},
    ${data.city || null},
    ${data.address || null},
    ${data.email || null},
    ${data.status || 'نشط'},
    ${data.business_nature || null},
    ${data.salesman || null},
    ${data.classification || null},        
    ${data.registration_date || new Date().toISOString().split('T')[0]},
    ${data.transaction_notes || null},     
    ${data.general_notes || null},
    ${data.api_key || null} ,
    ${data.type || 0} ,
    ${data.isDeleted || false}  ,
    ${Number(data.pricecategory) || Number(data.priceCategory) || 1}          
  )
  RETURNING *;
`;

      const customer = result[0];

      console.log("[v0] Customer created successfully:", customer);

      // 3️⃣ Save voucherType array (customer_vouchers)
      if (Array.isArray(data.voucher) && data.voucher.length > 0) {
        // Use a transaction if supported
        for (const v of data.voucher) {
          await sql`
          INSERT INTO customer_vouchers (customer_id, voucher_id, book_id)
          VALUES (${customer.id}, ${v.type_id}, ${v.book_id});
        `;
        }
        console.log("[v0] Customer vouchers saved:", data.voucher);
      }

      return NextResponse.json(customer, { status: 201 });

      console.log("[v0] Customer created successfully:", result[0])
      return NextResponse.json(result[0], { status: 201 })
    }
  } catch (error) {
    console.error("Error creating customer:", error)
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 })
  }

}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    const { id, voucher, ...updateData } = data

    const fieldsToUpdate = {
      name: updateData.customer_name || updateData.name,
      mobile1: updateData.mobile1,
      mobile2: updateData.mobile2,
      whatsapp1: updateData.whatsapp1,
      whatsapp2: updateData.whatsapp2,
      city: updateData.city,
      address: updateData.address,
      email: updateData.email,
      status: updateData.status,
      business_nature: updateData.business_nature,
      salesman: updateData.salesman,
      classification: updateData.classifications,
      transaction_notes: updateData.movement_notes,
      general_notes: updateData.general_notes,
      api_key: updateData.api_number
    };

    // Build dynamic SET clause
    const setClauses = [];
    const values = [];
    let i = 1;
    for (const [key, value] of Object.entries(fieldsToUpdate)) {
      if (value !== undefined) {  // Only update fields with values
        setClauses.push(`${key} = $${i}`);
        values.push(value);
        i++;
      }
    }

    // Add updated_at
    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

    // Add id for WHERE
    values.push(id);

    const query = `
      UPDATE customers
      SET ${setClauses.join(', ')}
      WHERE id = $${i}
      RETURNING *
    `;
    const result = await sql.query(query, values);

    if (Array.isArray(voucher) && voucher.length > 0) {
      // Delete old vouchers for this customer
      await sql`
        DELETE FROM customer_vouchers
        WHERE customer_id = ${id};
      `;

      // Get the current max id from the table
      const result = await sql`
        SELECT COALESCE(MAX(id), 0) AS max_id
        FROM customer_vouchers
      `;
      let nextId = result[0].max_id + 1;

      // Build VALUES string for bulk insert
      const values = voucher.map(v => `(${nextId++}, ${id}, ${v.type_id}, ${v.book_id})`).join(',');

      // Insert all vouchers in one query
      await sql`
        INSERT INTO customer_vouchers (id, customer_id, voucher_id, book_id)
        VALUES ${sql.raw(values)}
      `;

      console.log(`[v0] Updated vouchers for customer ${id}`);
    }
    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating customer:", error)
    return NextResponse.json({ error: "Failed to update customer" + error }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 })
    }

    await sql`DELETE FROM customers WHERE id = ${id}`

    return NextResponse.json({ message: "Customer deleted successfully" })
  } catch (error) {
    console.error("Error deleting customer:", error)
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 })
  }
}
