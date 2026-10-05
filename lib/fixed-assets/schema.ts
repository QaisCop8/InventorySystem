import sql, { resolveCurrentDbName } from "@/lib/database"

export * from "./constants"

// Journal vouchers created by this module carry this internal_voucher_id (see lib/auto-journals.ts
// INTERNAL_VOUCHER for the other reserved ids) so the journal screen can refuse to cancel them.
export const FIXED_ASSET_INTERNAL_VOUCHER = 30

const ready = new Set<string>()

export async function ensureFixedAssetSchema() {
  const dbName = await resolveCurrentDbName()
  if (ready.has(dbName)) return

  await sql`
    CREATE TABLE IF NOT EXISTS fa_locations_tbl (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER REFERENCES fa_locations_tbl(id),
      code VARCHAR(30) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'SITE',
      branch_id INTEGER,
      status SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS fa_categories_tbl (
      id SERIAL PRIMARY KEY,
      code VARCHAR(30) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      parent_id INTEGER REFERENCES fa_categories_tbl(id),
      asset_account_id INTEGER,
      accumulated_depreciation_account_id INTEGER,
      depreciation_expense_account_id INTEGER,
      gain_on_disposal_account_id INTEGER,
      loss_on_disposal_account_id INTEGER,
      revaluation_reserve_account_id INTEGER,
      impairment_loss_account_id INTEGER,
      default_useful_life_months INTEGER NOT NULL DEFAULT 60,
      default_depreciation_method VARCHAR(30) NOT NULL DEFAULT 'STRAIGHT_LINE',
      default_residual_percentage NUMERIC(7,4) NOT NULL DEFAULT 0,
      default_declining_rate NUMERIC(7,4),
      is_depreciable BOOLEAN NOT NULL DEFAULT TRUE,
      status SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS fa_assets_tbl (
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL,
      asset_no VARCHAR(40) NOT NULL UNIQUE,
      barcode VARCHAR(80),
      name VARCHAR(200) NOT NULL,
      description TEXT,
      category_id INTEGER NOT NULL REFERENCES fa_categories_tbl(id),
      parent_asset_id INTEGER REFERENCES fa_assets_tbl(id),
      acquisition_source VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
      acquisition_date DATE NOT NULL,
      available_for_use_date DATE,
      depreciation_start_date DATE,
      original_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
      residual_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      opening_accumulated_depreciation NUMERIC(18,2) NOT NULL DEFAULT 0,
      currency_id INTEGER,
      exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1,
      foreign_cost NUMERIC(18,2),
      useful_life_months INTEGER NOT NULL DEFAULT 60,
      depreciation_method VARCHAR(30) NOT NULL DEFAULT 'STRAIGHT_LINE',
      declining_rate NUMERIC(7,4),
      location_id INTEGER REFERENCES fa_locations_tbl(id),
      department_id INTEGER,
      cost_center_id INTEGER,
      custodian_employee_id INTEGER,
      supplier_account_id INTEGER,
      credit_account_id INTEGER,
      post_acquisition_journal BOOLEAN NOT NULL DEFAULT TRUE,
      purchase_invoice_id INTEGER,
      purchase_invoice_line_id INTEGER,
      serial_number VARCHAR(100),
      model VARCHAR(100),
      manufacturer VARCHAR(100),
      warranty_end_date DATE,
      status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
      notes TEXT,
      created_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_by VARCHAR(100),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS fa_books_tbl (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fa_assets_tbl(id) ON DELETE CASCADE,
      book_type VARCHAR(20) NOT NULL DEFAULT 'ACCOUNTING',
      depreciation_method VARCHAR(30) NOT NULL,
      cost NUMERIC(18,2) NOT NULL DEFAULT 0,
      residual_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      useful_life_months INTEGER NOT NULL,
      remaining_life_months INTEGER NOT NULL,
      declining_rate NUMERIC(7,4),
      depreciation_start_date DATE,
      depreciation_end_date DATE,
      accumulated_depreciation NUMERIC(18,2) NOT NULL DEFAULT 0,
      net_book_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      last_depreciation_date DATE,
      status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (asset_id, book_type)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS fa_depreciation_runs_tbl (
      id SERIAL PRIMARY KEY,
      run_no VARCHAR(30) NOT NULL UNIQUE,
      period VARCHAR(7) NOT NULL,
      book_type VARCHAR(20) NOT NULL DEFAULT 'ACCOUNTING',
      posting_date DATE NOT NULL,
      branch_id INTEGER,
      total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      asset_count INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
      journal_voucher_ids INTEGER[] NOT NULL DEFAULT '{}',
      reversal_voucher_ids INTEGER[] NOT NULL DEFAULT '{}',
      notes TEXT,
      created_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      reversed_by VARCHAR(100),
      reversed_at TIMESTAMP
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS fa_depreciation_schedule_tbl (
      id BIGSERIAL PRIMARY KEY,
      book_id INTEGER NOT NULL REFERENCES fa_books_tbl(id) ON DELETE CASCADE,
      asset_id INTEGER NOT NULL REFERENCES fa_assets_tbl(id) ON DELETE CASCADE,
      period VARCHAR(7) NOT NULL,
      depreciation_date DATE NOT NULL,
      opening_book_value NUMERIC(18,2) NOT NULL,
      depreciable_base NUMERIC(18,2) NOT NULL,
      depreciation_amount NUMERIC(18,2) NOT NULL,
      accumulated_depreciation NUMERIC(18,2) NOT NULL,
      closing_book_value NUMERIC(18,2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
      run_id INTEGER REFERENCES fa_depreciation_runs_tbl(id),
      journal_voucher_id INTEGER,
      posted_at TIMESTAMP,
      posted_by VARCHAR(100)
    )
  `
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS ux_fa_schedule_book_period ON fa_depreciation_schedule_tbl(book_id, period) WHERE status <> 'REVERSED'`
  await sql`CREATE INDEX IF NOT EXISTS ix_fa_schedule_period ON fa_depreciation_schedule_tbl(period, status)`
  await sql`
    CREATE TABLE IF NOT EXISTS fa_transactions_tbl (
      id BIGSERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fa_assets_tbl(id) ON DELETE CASCADE,
      book_id INTEGER REFERENCES fa_books_tbl(id),
      transaction_no VARCHAR(30) NOT NULL UNIQUE,
      transaction_date DATE NOT NULL,
      transaction_type VARCHAR(40) NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      cost_delta NUMERIC(18,2) NOT NULL DEFAULT 0,
      accumulated_delta NUMERIC(18,2) NOT NULL DEFAULT 0,
      reference_type VARCHAR(40),
      reference_id INTEGER,
      old_value JSONB NOT NULL DEFAULT '{}'::jsonb,
      new_value JSONB NOT NULL DEFAULT '{}'::jsonb,
      journal_voucher_id INTEGER,
      notes TEXT,
      created_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS ix_fa_transactions_asset ON fa_transactions_tbl(asset_id, transaction_date, id)`
  await sql`
    CREATE TABLE IF NOT EXISTS fa_additions_tbl (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fa_assets_tbl(id) ON DELETE CASCADE,
      addition_date DATE NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      description TEXT,
      credit_account_id INTEGER,
      supplier_account_id INTEGER,
      invoice_id INTEGER,
      extend_life_months INTEGER NOT NULL DEFAULT 0,
      transaction_id BIGINT REFERENCES fa_transactions_tbl(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS fa_transfers_tbl (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fa_assets_tbl(id) ON DELETE CASCADE,
      transfer_date DATE NOT NULL,
      from_branch_id INTEGER, to_branch_id INTEGER,
      from_location_id INTEGER, to_location_id INTEGER,
      from_department_id INTEGER, to_department_id INTEGER,
      from_cost_center_id INTEGER, to_cost_center_id INTEGER,
      from_custodian_id INTEGER, to_custodian_id INTEGER,
      reason TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
      created_by VARCHAR(100),
      approved_by VARCHAR(100),
      transaction_id BIGINT REFERENCES fa_transactions_tbl(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS fa_revaluations_tbl (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fa_assets_tbl(id) ON DELETE CASCADE,
      revaluation_type VARCHAR(20) NOT NULL,
      revaluation_date DATE NOT NULL,
      old_net_book_value NUMERIC(18,2) NOT NULL,
      new_net_book_value NUMERIC(18,2) NOT NULL,
      difference NUMERIC(18,2) NOT NULL,
      account_id INTEGER,
      reason TEXT,
      transaction_id BIGINT REFERENCES fa_transactions_tbl(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS fa_disposals_tbl (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fa_assets_tbl(id) ON DELETE CASCADE,
      disposal_date DATE NOT NULL,
      disposal_type VARCHAR(20) NOT NULL,
      sale_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      proceeds_account_id INTEGER,
      customer_account_id INTEGER,
      invoice_id INTEGER,
      cost_at_disposal NUMERIC(18,2) NOT NULL,
      accumulated_depreciation NUMERIC(18,2) NOT NULL,
      net_book_value NUMERIC(18,2) NOT NULL,
      gain_loss NUMERIC(18,2) NOT NULL,
      journal_voucher_id INTEGER,
      reason TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
      transaction_id BIGINT REFERENCES fa_transactions_tbl(id),
      created_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS fa_documents_tbl (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fa_assets_tbl(id) ON DELETE CASCADE,
      document_type VARCHAR(30) NOT NULL DEFAULT 'OTHER',
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      file_size INTEGER NOT NULL,
      file_data BYTEA NOT NULL,
      description TEXT,
      document_date DATE,
      expiry_date DATE,
      created_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS ix_fa_documents_asset ON fa_documents_tbl(asset_id)`
  await sql`CREATE INDEX IF NOT EXISTS ix_fa_assets_category ON fa_assets_tbl(category_id)`
  await sql`CREATE INDEX IF NOT EXISTS ix_fa_assets_status ON fa_assets_tbl(status)`
  await sql`CREATE INDEX IF NOT EXISTS ix_fa_assets_parent ON fa_assets_tbl(parent_asset_id)`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS internal_voucher_id INTEGER`
  ready.add(dbName)
}
