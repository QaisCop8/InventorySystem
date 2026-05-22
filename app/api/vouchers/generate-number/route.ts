import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"
export const revalidate = 0

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

function getPrefix(vchType: number, vchBook: string) {
  if (vchType === 1) return `O${vchBook}`
  if (vchType === 2) return `T${vchBook}`
  if (vchType === 3 || vchType === 5) return `I${vchBook}`
  return `V${vchType}${vchBook}`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const vchBook = (searchParams.get("vch_book") ?? "").trim().toUpperCase()
    const vchType = Number(searchParams.get("vch_type") ?? 5)

    if (!vchBook || vchBook === "0") {
      return NextResponse.json(
        { error: "vch_book is required for voucher number generation" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    await pool.query(`
      ALTER TABLE vouchers
      ADD COLUMN IF NOT EXISTS vch_book character varying(20) DEFAULT 'R'
    `)

    const settingsResult = await pool.query(
      `
        SELECT invoice_prefix, invoice_start, order_prefix, order_start, purchase_prefix, purchase_start
        FROM system_settings
        WHERE id = 1
        LIMIT 1
      `,
    )

    const settings = settingsResult.rows?.[0] ?? {}
    const configuredPrefix =
      vchType === 5
        ? settings.invoice_prefix
        : vchType === 1
          ? settings.order_prefix
          : vchType === 2
            ? settings.purchase_prefix
            : null

    const configuredStart = Number(
      vchType === 5
        ? settings.invoice_start
        : vchType === 1
          ? settings.order_start
          : vchType === 2
            ? settings.purchase_start
            : 1,
    )

    const basePrefix = String(configuredPrefix || getPrefix(vchType, ""))
    const prefix = `${basePrefix}${vchBook}`

    const result = await pool.query(
      `
        SELECT COALESCE(
          MAX(
            CASE
              WHEN RIGHT(voucher_code, 5) ~ '^[0-9]{5}$'
                THEN CAST(RIGHT(voucher_code, 5) AS BIGINT)
              ELSE 0
            END
          ),
          0
        ) AS max_seq
        FROM vouchers
        WHERE voucher_code LIKE $1
          AND COALESCE(vch_type, 0) = $2
          AND COALESCE(vch_book, '') = $3
          AND deleted = false
      `,
      [`${prefix}%`, vchType, vchBook],
    )

    const maxSeq = Number(result.rows?.[0]?.max_seq ?? 0)
    const startSeq = Number.isFinite(configuredStart) && configuredStart > 0 ? configuredStart : 1
    const nextNumber = Math.max(maxSeq + 1, startSeq)
    const voucherCode = `${prefix}${nextNumber.toString().padStart(5, "0")}`

    return NextResponse.json(
      {
        voucherCode,
        orderNumber: voucherCode,
        autoNumbering: true,
        prefix,
        vch_book: vchBook,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  } catch (error) {
    console.error("Error generating voucher number:", error)
    const { searchParams } = new URL(request.url)
    const vchBook = (searchParams.get("vch_book") ?? "R").trim().toUpperCase()
    const vchType = Number(searchParams.get("vch_type") ?? 5)
    const settingsResult = await pool.query(
      `
        SELECT invoice_prefix, order_prefix, purchase_prefix
        FROM system_settings
        WHERE id = 1
        LIMIT 1
      `,
    )
    const settings = settingsResult.rows?.[0] ?? {}
    const configuredPrefix =
      vchType === 5
        ? settings.invoice_prefix
        : vchType === 1
          ? settings.order_prefix
          : vchType === 2
            ? settings.purchase_prefix
            : null
    const baseFallbackPrefix = String(configuredPrefix || getPrefix(vchType, ""))
    const fallbackPrefix = `${baseFallbackPrefix}${vchBook}`
    const fallbackCode = `${fallbackPrefix}00001`
    return NextResponse.json(
      {
        voucherCode: fallbackCode,
        orderNumber: fallbackCode,
        autoNumbering: true,
        warning: "Generated fallback number due to database error",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  }
}
