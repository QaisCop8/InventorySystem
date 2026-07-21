import sql from "@/lib/database"

// Shared schema + persistence helpers for بطاقات الائتمان (credit_cards_types_tbl).
// credit_cards_types_tbl already existed as a minimal stub (id, name, status) created by the
// سند قبض/سند صرف card tab (see app/api/credit-card-types/route.ts, app/api/receipts/_lib.ts) —
// this module is now the single authoritative owner of its schema; those two call
// ensureTables() from here instead of creating their own copy, so the table can't drift again.
export const ensureTables = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS credit_card_main_types_tbl (
      id INTEGER PRIMARY KEY,
      name VARCHAR(70)
    )
  `
  await sql`
    INSERT INTO credit_card_main_types_tbl (id, name) VALUES (1, 'بطاقة ائتمان'), (2, 'بطاقة صراف')
    ON CONFLICT (id) DO NOTHING
  `

  await sql`
    CREATE TABLE IF NOT EXISTS credit_card_commission_types_tbl (
      id INTEGER PRIMARY KEY,
      name VARCHAR(70)
    )
  `
  await sql`
    INSERT INTO credit_card_commission_types_tbl (id, name) VALUES (1, 'نسبة'), (2, 'مبلغ مقطوع')
    ON CONFLICT (id) DO NOTHING
  `

  await sql`
    CREATE TABLE IF NOT EXISTS credit_cards_types_tbl (
      id SERIAL PRIMARY KEY,
      name VARCHAR(70),
      status INTEGER DEFAULT 1
    )
  `

  // Migrate the pre-existing stub (name was NOT NULL UNIQUE VARCHAR(50)) up to the real schema.
  await sql`ALTER TABLE credit_cards_types_tbl DROP CONSTRAINT IF EXISTS credit_cards_types_tbl_name_key`
  await sql`ALTER TABLE credit_cards_types_tbl ALTER COLUMN name TYPE VARCHAR(70)`
  await sql`ALTER TABLE credit_cards_types_tbl ALTER COLUMN name DROP NOT NULL`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS company_id INTEGER`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS main_type INTEGER REFERENCES credit_card_main_types_tbl(id)`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS name_lang2 VARCHAR(70)`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS currency_id INTEGER REFERENCES currency(id)`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS bank_id INTEGER REFERENCES banks(id)`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS commission_type_id INTEGER REFERENCES credit_card_commission_types_tbl(id)`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS commission_value DOUBLE PRECISION`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS commission_max_amount DOUBLE PRECISION`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS financial_account_id INTEGER REFERENCES account_tbl(id)`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS waseet_account_id INTEGER REFERENCES account_tbl(id)`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS commission_account_id INTEGER REFERENCES account_tbl(id)`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS insert_date DATE`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS notes VARCHAR(70)`
  // Not part of the source schema — added for "الربط مع ماكينات البنوك" (no table was provided
  // for this; machine_type_id is a soft reference: a real banks.id, or 0 as the "neo_cash" sentinel).
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS link_bank_machine BOOLEAN DEFAULT false`
  await sql`ALTER TABLE credit_cards_types_tbl ADD COLUMN IF NOT EXISTS machine_type_id INTEGER`

  await sql`
    CREATE TABLE IF NOT EXISTS credit_card_type_holidays_tbl (
      id SERIAL PRIMARY KEY,
      credit_card_type_id INTEGER REFERENCES credit_cards_types_tbl(id) ON DELETE CASCADE,
      day_no INTEGER
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_credit_card_type_holidays_tbl_type_id ON credit_card_type_holidays_tbl(credit_card_type_id)`
}

export const fetchHolidays = async (creditCardTypeId: number) => {
  const rows = await sql`
    SELECT day_no FROM credit_card_type_holidays_tbl WHERE credit_card_type_id = ${creditCardTypeId} ORDER BY day_no
  `
  return rows.map((row: any) => Number(row.day_no))
}

export const saveHolidays = async (creditCardTypeId: number, days: number[]) => {
  await sql`DELETE FROM credit_card_type_holidays_tbl WHERE credit_card_type_id = ${creditCardTypeId}`
  const uniqueDays = Array.from(new Set((days || []).map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)))
  for (const dayNo of uniqueDays) {
    await sql`INSERT INTO credit_card_type_holidays_tbl (credit_card_type_id, day_no) VALUES (${creditCardTypeId}, ${dayNo})`
  }
}
