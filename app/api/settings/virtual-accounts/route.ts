import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

export async function GET(request: NextRequest) {
  try {
    const rows = await sql`
      SELECT v.*, c.id as currency_id, c.code as currency_code, c.name as currency_name,
        ca.id as cash_account_id, ca.code as cash_account_code, ca.name as cash_account_name,
        ia.id as incoming_checks_account_id, ia.code as incoming_checks_account_code, ia.name as incoming_checks_account_name,
        ra.id as returned_checks_account_id, ra.code as returned_checks_account_code, ra.name as returned_checks_account_name,
        ca2.id as card_account_id, ca2.code as card_account_code, ca2.name as card_account_name
      FROM virtual_cash_bank_accounts v
      LEFT JOIN currencies c ON c.id = v.currency_id
      LEFT JOIN account_tbl ca ON ca.id = v.cash_account_id
      LEFT JOIN account_tbl ia ON ia.id = v.incoming_checks_account_id
      LEFT JOIN account_tbl ra ON ra.id = v.returned_checks_account_id
      LEFT JOIN account_tbl ca2 ON ca2.id = v.card_account_id
      ORDER BY v.id
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching virtual accounts:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const result = await sql`
      INSERT INTO virtual_cash_bank_accounts (
        currency_id, cash_account_id, incoming_checks_account_id, returned_checks_account_id, card_account_id
      ) VALUES (
        ${data.currency_id || null}, ${data.cash_account_id || null}, ${data.incoming_checks_account_id || null}, ${data.returned_checks_account_id || null}, ${data.card_account_id || null}
      ) RETURNING *
    `
    return NextResponse.json({ success: true, row: result[0] })
  } catch (error) {
    console.error("Error creating virtual account row:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    if (!data.id) return NextResponse.json({ error: "id required" }, { status: 400 })
    const result = await sql`
      UPDATE virtual_cash_bank_accounts SET
        currency_id = ${data.currency_id || null},
        cash_account_id = ${data.cash_account_id || null},
        incoming_checks_account_id = ${data.incoming_checks_account_id || null},
        returned_checks_account_id = ${data.returned_checks_account_id || null},
        card_account_id = ${data.card_account_id || null}
      WHERE id = ${data.id}
      RETURNING *
    `
    return NextResponse.json({ success: true, row: result[0] })
  } catch (error) {
    console.error("Error updating virtual account row:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = Number(searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
    await sql`DELETE FROM virtual_cash_bank_accounts WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting virtual account row:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
