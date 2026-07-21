import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureTables = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS users_currencies_default_account_tbl (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      currency_id INTEGER,
      account_id INTEGER,
      received_cheqs_account_id INTEGER,
      returned_cheqs_account_id INTEGER,
      cards_account_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`ALTER TABLE users_currencies_default_account_tbl DROP COLUMN IF EXISTS account_type`
  await sql`ALTER TABLE users_currencies_default_account_tbl ADD COLUMN IF NOT EXISTS received_cheqs_account_id INTEGER`
  await sql`ALTER TABLE users_currencies_default_account_tbl ADD COLUMN IF NOT EXISTS returned_cheqs_account_id INTEGER`
  await sql`ALTER TABLE users_currencies_default_account_tbl ADD COLUMN IF NOT EXISTS cards_account_id INTEGER`
}

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const userId = Number(searchParams.get("user_id") || 0)
    if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 })

    const rows = await sql`
      SELECT u.currency_id,
             u.account_id AS cash_account_id,
             a_cash.code AS cash_account_code,
             a_cash.name AS cash_account_name,
             u.received_cheqs_account_id AS incoming_checks_account_id,
             a_incoming.code AS incoming_checks_account_code,
             a_incoming.name AS incoming_checks_account_name,
             u.returned_cheqs_account_id AS returned_checks_account_id,
             a_returned.code AS returned_checks_account_code,
             a_returned.name AS returned_checks_account_name,
             u.cards_account_id AS card_account_id,
             a_cards.code AS card_account_code,
             a_cards.name AS card_account_name
      FROM users_currencies_default_account_tbl u
      LEFT JOIN account_tbl a_cash ON a_cash.id = u.account_id
      LEFT JOIN account_tbl a_incoming ON a_incoming.id = u.received_cheqs_account_id
      LEFT JOIN account_tbl a_returned ON a_returned.id = u.returned_cheqs_account_id
      LEFT JOIN account_tbl a_cards ON a_cards.id = u.cards_account_id
      WHERE u.user_id = ${userId}
    `

    return NextResponse.json({ rows })
  } catch (error) {
    console.error("Error fetching user currency defaults:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const { user_id, rows } = data
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 })
    if (!Array.isArray(rows)) return NextResponse.json({ error: "rows required" }, { status: 400 })

    const numericUserId = Number(user_id)
    await ensureTables()
    await sql`DELETE FROM users_currencies_default_account_tbl WHERE user_id = ${numericUserId}`

    for (const r of rows) {
      await sql`
        INSERT INTO users_currencies_default_account_tbl (
          user_id,
          currency_id,
          account_id,
          received_cheqs_account_id,
          returned_cheqs_account_id,
          cards_account_id
        )
        VALUES (
          ${numericUserId},
          ${r.currency_id || null},
          ${r.cash_account_id || null},
          ${r.incoming_checks_account_id || null},
          ${r.returned_checks_account_id || null},
          ${r.card_account_id || null}
        )
      `
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error saving user currency defaults:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
