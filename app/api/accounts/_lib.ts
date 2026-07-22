import sql from "@/lib/database"

export const statusLabelToCode = (status: string): number => {
  if (status === "موقوف") return 2
  if (status === "محذوف") return 3
  return 1
}

export const statusCodeToLabel = (status: number | null | undefined): string => {
  if (status === 2) return "موقوف"
  if (status === 3) return "محذوف"
  return "نشط"
}

export const toBool = (value: unknown, defaultValue = false): boolean => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase()
    return ["1", "true", "yes", "y", "نعم"].includes(lowered)
  }
  return defaultValue
}

export const toNullableInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const toNullableFloat = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const ensureAccountsTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS account_tbl (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      code VARCHAR(50) NOT NULL,
      type INTEGER,
      name VARCHAR(150) NOT NULL,
      name_lang2 VARCHAR(150),
      father_id INTEGER REFERENCES account_tbl(id) ON DELETE CASCADE,
      level_no INTEGER NOT NULL,
      finanical_list_id INTEGER NOT NULL,
      finanical_list_assests_id INTEGER,
      finanical_list_liabilities_id INTEGER,
      finanical_list_income_id INTEGER,
      currency_id INTEGER,
      allow_trans_with_diff_curr INTEGER NOT NULL,
      iscalc_curr_diff_rates BOOLEAN NOT NULL,
      transaction_type INTEGER NOT NULL,
      transaction_type_action INTEGER NOT NULL,
      max_transaction_amount DOUBLE PRECISION NOT NULL,
      max_transaction_amount_action INTEGER NOT NULL,
      max_balance_amount DOUBLE PRECISION NOT NULL,
      max_balance_action INTEGER,
      budget_exceeding_perc DOUBLE PRECISION,
      budget_exceeding_action INTEGER,
      unified_report_account_no VARCHAR(50),
      unified_report_group_code VARCHAR(50),
      notes VARCHAR(70),
      show_notes_in_transactions_soa BOOLEAN,
      status INTEGER,
      insert_date DATE,
      last_update_date TIMESTAMPTZ,
      UNIQUE (code)
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_account_tbl_code ON account_tbl(code)`
  await sql`CREATE INDEX IF NOT EXISTS idx_account_tbl_type ON account_tbl(type)`
  await sql`CREATE INDEX IF NOT EXISTS idx_account_tbl_father ON account_tbl(father_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_account_tbl_status ON account_tbl(status)`

  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'account_tbl'
          AND column_name = 'allow_trans_with_diff_curr'
          AND data_type = 'boolean'
      ) THEN
        ALTER TABLE account_tbl
        ALTER COLUMN allow_trans_with_diff_curr TYPE INTEGER
        USING CASE WHEN allow_trans_with_diff_curr THEN 1 ELSE 0 END;
      END IF;
    END$$;
  `
}

export const ensureAccountRelatedTables = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS account_stop_transactions_tbl (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES account_tbl(id) ON DELETE CASCADE,
      voucher_types_id INTEGER,
      stop_date TIMESTAMPTZ
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS account_costcenters_tbl (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES account_tbl(id) ON DELETE CASCADE,
      cost_center_type_id INTEGER,
      required_in_transactions INTEGER,
      default_cost_center_id INTEGER
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS account_classifications_tbl (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES account_tbl(id) ON DELETE CASCADE,
      classification_id INTEGER NOT NULL
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_acc_stop_account_id ON account_stop_transactions_tbl(account_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_acc_cost_account_id ON account_costcenters_tbl(account_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_acc_class_account_id ON account_classifications_tbl(account_id)`
}

export const mapAccountRow = (row: any) => ({
  ...row,
  status: statusCodeToLabel(Number(row.status ?? 1)),
  allow_trans_with_diff_curr: row.allow_trans_with_diff_curr != null ? Number(row.allow_trans_with_diff_curr) : 0,
  iscalc_curr_diff_rates: toBool(row.iscalc_curr_diff_rates),
  show_notes_in_transactions_soa: toBool(row.show_notes_in_transactions_soa),
})
