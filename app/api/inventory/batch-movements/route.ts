import { NextRequest, NextResponse } from "next/server"

import { neon } from "@neondatabase/serverless"
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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const productId = searchParams.get("product_id")
    const batchNumber = searchParams.get("lot_number")
    const statusId = searchParams.get("transaction_type")
    const dateFrom = searchParams.get("date_from")
    const dateTo = searchParams.get("date_to")
    const limit = Number(searchParams.get("limit") || 1000)

    const conditions: string[] = ["o.deleted = false"]
    const values: any[] = []

    // product
    if (productId && Number(productId) > 0) {
      values.push(Number(productId))
      conditions.push(`sb.product_id = $${values.length}`)
    }

    // status
    if (statusId && Number(statusId) > 0) {
      values.push(Number(statusId))
      conditions.push(`sb.status_id = $${values.length}`)
    }

    // batch number (string!)
    if (batchNumber && batchNumber.trim() !== "") {
      values.push(`%${batchNumber}%`);
      conditions.push(`sb.batch_number LIKE $${values.length}`);
    }
    // date range
    if (dateFrom && dateTo) {
      values.push(dateFrom)
      values.push(dateTo)
      conditions.push(`o.order_date BETWEEN $${values.length - 1} AND $${values.length}`)
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`

    const query =
      `
      SELECT 
        sb.id,
        sb.batch_number,
        sb.quantity,
        sb.created_at,
        CASE 
          WHEN sb.status_id = 1 THEN 'new'
          WHEN sb.status_id = 2 THEN 'inUse'
          WHEN sb.status_id = 3 THEN 'closed'
          ELSE 'damaged'
        END AS status,
        p.product_name,
        o.order_number,
        o.order_date,
        o.customer_name,
        o.reference_number,
        (select log_date from stock_batch_log where stock_batch_log.stock_batch_id = sb.id order by stock_batch_log.id limit 1 ) as last_batch_date
      FROM stock_batch sb
      JOIN products p ON p.id = sb.product_id
      JOIN orders o ON o.id = sb.order_id
      ${whereClause}
      ORDER BY sb.id
      `;

    const result = await pool.query(query, values);
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error("[v0] Error fetching batch movements:", error)
    return NextResponse.json(
      { error: "فشل في تحميل حركات الدفعات" },
      { status: 500 }
    )
  }
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const requiredFields = ["lot_id", "transaction_type"]
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json({ error: `الحقل ${field} مطلوب` }, { status: 400 })
      }
    }

    // Validate quantity for non-status-change transactions
    if (body.transaction_type !== "status_change" && (!body.quantity || body.quantity <= 0)) {
      return NextResponse.json({ error: "الكمية مطلوبة ويجب أن تكون أكبر من صفر" }, { status: 400 })
    }

    // Validate new status for status change transactions
    if (body.transaction_type === "status_change" && !body.new_status) {
      return NextResponse.json({ error: "الحالة الجديدة مطلوبة لتغيير الحالة" }, { status: 400 })
    }

    const lotId = Number.parseInt(body.lot_id)

    // Get current lot information
    const lotInfo = await sql`
      SELECT pl.*, p.product_name, p.product_code
      FROM product_lots pl
      JOIN products p ON pl.product_id = p.id
      WHERE pl.id = ${lotId}
    `

    if (lotInfo.length === 0) {
      return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 })
    }

    const lot = lotInfo[0]

    // Handle different transaction types
    let transaction
    let notes = body.notes || ""

    if (body.transaction_type === "status_change") {
      // Change lot status
      const oldStatus = lot.status
      const newStatus = body.new_status

      if (oldStatus === newStatus) {
        return NextResponse.json({ error: "الحالة الجديدة مطابقة للحالة الحالية" }, { status: 400 })
      }

      await changeLotStatus(lotId, newStatus, body.notes, body.created_by)

      // Create status change transaction
      notes = `تغيير حالة من ${getStatusDisplay(oldStatus)} إلى ${getStatusDisplay(newStatus)}`
      if (body.notes) {
        notes += ` - ${body.notes}`
      }

      transaction = await createLotTransaction({
        lot_id: lotId,
        transaction_type: "status_change",
        quantity: 0,
        reference_type: body.reference_type,
        reference_id: body.reference_id ? Number.parseInt(body.reference_id) : undefined,
        unit_cost: body.unit_cost,
        notes,
        created_by: body.created_by,
      })
    } else {
      // Handle quantity-based transactions
      const quantity = Number.parseFloat(body.quantity)

      // Validate available quantity for outbound transactions
      if (["sale", "transfer", "damage"].includes(body.transaction_type)) {
        if (quantity > lot.available_quantity) {
          return NextResponse.json(
            {
              error: `الكمية المطلوبة (${quantity}) أكبر من الكمية المتاحة (${lot.available_quantity})`,
            },
            { status: 400 },
          )
        }
      }

      // Create the transaction
      transaction = await createLotTransaction({
        lot_id: lotId,
        transaction_type: body.transaction_type,
        quantity,
        reference_type: body.reference_type,
        reference_id: body.reference_id ? Number.parseInt(body.reference_id) : undefined,
        unit_cost: body.unit_cost,
        notes,
        created_by: body.created_by,
      })

      // Auto-close lot if quantity reaches zero
      if (body.transaction_type === "sale" || body.transaction_type === "damage") {
        const updatedLot = await sql`
          SELECT current_quantity FROM product_lots WHERE id = ${lotId}
        `

        if (updatedLot[0]?.current_quantity <= 0) {
          await changeLotStatus(lotId, "finished", "تم إغلاق الدفعة تلقائياً - نفدت الكمية", body.created_by)

          await createLotTransaction({
            lot_id: lotId,
            transaction_type: "close",
            quantity: 0,
            notes: "إغلاق تلقائي - نفدت الكمية",
            created_by: body.created_by,
          })
        }
      }
    }

    // Return the created transaction with lot details
    const result = await sql`
      SELECT 
        lt.*,
        pl.lot_number,
        p.product_name,
        p.product_code
      FROM lot_transactions lt
      JOIN product_lots pl ON lt.lot_id = pl.id
      JOIN products p ON pl.product_id = p.id
      WHERE lt.id = ${transaction.id}
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("[v0] Error creating batch movement:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "فشل في إنشاء حركة الدفعة" },
      { status: 500 },
    )
  }
}

function getStatusDisplay(status: string): string {
  const statusMap = {
    new: "جديد",
    in_use: "قيد الاستخدام",
    finished: "منتهي",
    damaged: "تالف",
  }
  return statusMap[status as keyof typeof statusMap] || status
}
