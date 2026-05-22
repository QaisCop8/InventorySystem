import { NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

function getPrefix(vchType: number, vchBook: string) {
  if (vchType === 1) return `O${vchBook}`
  if (vchType === 2) return `T${vchBook}`
  if (vchType === 3 || vchType === 5) return `I${vchBook}`
  return `V${vchType}${vchBook}`
}

async function getConfiguredPrefix(vchType: number) {
  const result = await pool.query(
    `
      SELECT invoice_prefix, order_prefix, purchase_prefix
      FROM system_settings
      WHERE id = 1
      LIMIT 1
    `,
  )

  const settings = result.rows?.[0] ?? {}
  if (vchType === 5) return settings.invoice_prefix
  if (vchType === 1) return settings.order_prefix
  if (vchType === 2) return settings.purchase_prefix
  return null
}

export async function GET(
  request: Request,
  { params }: { params: { navigationType: string } },
) {
  try {
    const { searchParams } = new URL(request.url)
    const nav = params.navigationType
    const vchType = Number(searchParams.get("order_type") ?? 5)
    const vchBook = (searchParams.get("vch_book") ?? "0").trim().toUpperCase()

    await pool.query(`
      ALTER TABLE vouchers
      ADD COLUMN IF NOT EXISTS vch_book character varying(20) DEFAULT 'R'
    `)

    const configuredPrefix = await getConfiguredPrefix(vchType)
    const basePrefix = String(configuredPrefix || getPrefix(vchType, ""))
    const numberPrefix = `${basePrefix}${vchBook}`

    let query = ""
    let values: any[] = []

    switch (nav) {
      case "first":
        query = `
          SELECT v.*, v.voucher_code AS order_number, v.voucher_date::date::text AS order_date, v.vch_status AS order_status, v.vch_status AS order_status2, 0 AS order_decision, v.voucher_date::date::text AS voucher_date,
                 v.delivery_date::date::text AS delivery_date,
                 c.name AS customer_name, c.pricecategory, c.customer_code
          FROM vouchers v
          INNER JOIN customers c ON c.id = v.customer_id
          WHERE v.vch_type = $1
            AND v.voucher_code LIKE $2
            AND COALESCE(v.vch_book, '') = $3
            AND v.deleted = false
          ORDER BY v.voucher_code ASC
          LIMIT 1
        `
        values = [vchType, `${numberPrefix}%`, vchBook]
        break
      case "last":
        query = `
          SELECT v.*, v.voucher_code AS order_number, v.voucher_date::date::text AS order_date, v.vch_status AS order_status, v.vch_status AS order_status2, 0 AS order_decision, v.voucher_date::date::text AS voucher_date,
                 v.delivery_date::date::text AS delivery_date,
                 c.name AS customer_name, c.pricecategory, c.customer_code
          FROM vouchers v
          INNER JOIN customers c ON c.id = v.customer_id
          WHERE v.vch_type = $1
            AND v.voucher_code LIKE $2
            AND COALESCE(v.vch_book, '') = $3
            AND v.deleted = false
          ORDER BY v.voucher_code DESC
          LIMIT 1
        `
        values = [vchType, `${numberPrefix}%`, vchBook]
        break
      case "previous": {
        const currentId = searchParams.get("currentId")
        if (!currentId) return NextResponse.json({ error: "currentId required" }, { status: 400 })
        query = `
          SELECT v.*, v.voucher_code AS order_number, v.voucher_date::date::text AS order_date, v.vch_status AS order_status, v.vch_status AS order_status2, 0 AS order_decision, v.voucher_date::date::text AS voucher_date,
                 v.delivery_date::date::text AS delivery_date,
                 c.name AS customer_name, c.pricecategory, c.customer_code
          FROM vouchers v
          INNER JOIN customers c ON c.id = v.customer_id
          WHERE v.vch_type = $1
            AND v.voucher_code LIKE $2
            AND COALESCE(v.vch_book, '') = $3
            AND v.voucher_code < $4
            AND v.deleted = false
          ORDER BY v.voucher_code DESC
          LIMIT 1
        `
        values = [vchType, `${numberPrefix}%`, vchBook, currentId]
        break
      }
      case "next": {
        const currentId = searchParams.get("currentId")
        if (!currentId) return NextResponse.json({ error: "currentId required" }, { status: 400 })
        query = `
          SELECT v.*, v.voucher_code AS order_number, v.voucher_date::date::text AS order_date, v.vch_status AS order_status, v.vch_status AS order_status2, 0 AS order_decision, v.voucher_date::date::text AS voucher_date,
                 v.delivery_date::date::text AS delivery_date,
                 c.name AS customer_name, c.pricecategory, c.customer_code
          FROM vouchers v
          INNER JOIN customers c ON c.id = v.customer_id
          WHERE v.vch_type = $1
            AND v.voucher_code LIKE $2
            AND COALESCE(v.vch_book, '') = $3
            AND v.voucher_code > $4
            AND v.deleted = false
          ORDER BY v.voucher_code ASC
          LIMIT 1
        `
        values = [vchType, `${numberPrefix}%`, vchBook, currentId]
        break
      }
      case "Byid": {
        const id = Number(searchParams.get("id"))
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
        query = `
          SELECT v.*, v.voucher_code AS order_number, v.voucher_date::date::text AS order_date, v.vch_status AS order_status, v.vch_status AS order_status2, 0 AS order_decision, v.voucher_date::date::text AS voucher_date,
                 v.delivery_date::date::text AS delivery_date,
                 c.customer_code, c.pricecategory
          FROM vouchers v
          INNER JOIN customers c ON c.id = v.customer_id
          WHERE v.id = $1
          LIMIT 1
        `
        values = [id]
        break
      }
      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 })
    }

    const result = await pool.query(query, values)
    if (result.rows.length === 0) {
      return NextResponse.json({})
    }

    const voucher = result.rows[0]

    const itemsResult = await pool.query(
      `
        SELECT
          vi.*,
          u.unit_name AS unit_name,
          w.warehouse_name AS store_name,
          p.product_code AS code,
          p.has_batch_number
        FROM voucher_items vi
        INNER JOIN products p ON vi.product_id = p.id
        INNER JOIN units u ON vi.unit_id = u.id
        LEFT JOIN warehouses w ON vi.store_id = w.id
        WHERE vi.voucher_id = $1
      `,
      [voucher.id],
    )

    voucher.items = itemsResult.rows

    const priceCategoryId = voucher.pricecategory && voucher.pricecategory >= 1 ? voucher.pricecategory : 1

    for (const item of voucher.items) {
      const unitsResult = await pool.query(
        `
          SELECT u.id AS unit_id, u.unit_name, pu.to_main_qnty,
                 pub.barcode,
                 COALESCE(pp.price, 0) AS unit_price
          FROM product_units pu
          LEFT JOIN units u ON pu.unit_id = u.id
          LEFT JOIN product_unit_barcodes pub
            ON pu.product_id = pub.product_id AND pu.id = pub.unit_id
          LEFT JOIN product_prices pp
            ON pu.product_id = pp.product_id
           AND pu.unit_id = pp.unit_id
           AND pp.price_category_id = $2
          WHERE pu.product_id = $1
          ORDER BY pu.id
        `,
        [item.product_id, priceCategoryId],
      )

      item.units = unitsResult.rows
    }

    return NextResponse.json(voucher)
  } catch (error) {
    console.error("Vouchers navigation error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
