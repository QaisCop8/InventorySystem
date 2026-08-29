import sql, { resolveCurrentDbName } from "@/lib/database"

const readyDatabases = new Set<string>()
export async function ensureOrderDraftTables() {
  const databaseName = await resolveCurrentDbName()
  if (readyDatabases.has(databaseName)) return
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_order_quantity NUMERIC(15,4) NOT NULL DEFAULT 0`
  await sql`CREATE TABLE IF NOT EXISTS users_currencies_default_account_tbl (id SERIAL PRIMARY KEY, user_id INTEGER, currency_id INTEGER, account_id INTEGER, received_cheqs_account_id INTEGER, returned_cheqs_account_id INTEGER, cards_account_id INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
  await sql`CREATE TABLE IF NOT EXISTS order_checklist_templates (id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, description TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`
  await sql`CREATE TABLE IF NOT EXISTS order_checklist_fields (id SERIAL PRIMARY KEY, template_id INTEGER NOT NULL REFERENCES order_checklist_templates(id) ON DELETE CASCADE, label VARCHAR(200) NOT NULL, field_type VARCHAR(20) NOT NULL, max_length INTEGER, is_required BOOLEAN NOT NULL DEFAULT FALSE, position INTEGER NOT NULL DEFAULT 0)`
  await sql`CREATE TABLE IF NOT EXISTS sales_order_drafts (id SERIAL PRIMARY KEY, draft_number VARCHAR(40) UNIQUE NOT NULL, account_id INTEGER NOT NULL, customer_id INTEGER, customer_name VARCHAR(255) NOT NULL, order_date DATE NOT NULL DEFAULT CURRENT_DATE, requested_delivery_date DATE NOT NULL, deposit_amount NUMERIC(15,2) NOT NULL DEFAULT 0, notes TEXT, delivery_address TEXT, contact_phone VARCHAR(50), priority VARCHAR(20) NOT NULL DEFAULT 'normal', checklist_template_id INTEGER REFERENCES order_checklist_templates(id), attachments JSONB NOT NULL DEFAULT '[]'::jsonb, status VARCHAR(20) NOT NULL DEFAULT 'draft', created_by VARCHAR(100), branch_id INTEGER, confirmed_order_id INTEGER, checklist_values JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`
  await sql`ALTER TABLE sales_order_drafts ADD COLUMN IF NOT EXISTS account_id INTEGER`
  await sql`ALTER TABLE sales_order_drafts ADD COLUMN IF NOT EXISTS receipt_voucher_id INTEGER`
  await sql`DO $$ BEGIN IF to_regclass('public.customers') IS NOT NULL THEN UPDATE sales_order_drafts d SET account_id = COALESCE(c.account_id, d.customer_id) FROM customers c WHERE d.account_id IS NULL AND c.id = d.customer_id; END IF; END $$`
  await sql`UPDATE sales_order_drafts SET account_id = customer_id WHERE account_id IS NULL AND customer_id IS NOT NULL`
  await sql`ALTER TABLE sales_order_drafts ALTER COLUMN customer_id DROP NOT NULL`
  // Legacy drafts can legitimately predate both account_id and customer_id. Do not let one
  // such row break every sales-order list/search request. New draft writes validate account_id.
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM sales_order_drafts WHERE account_id IS NULL) THEN
        ALTER TABLE sales_order_drafts ALTER COLUMN account_id SET NOT NULL;
      END IF;
    END $$
  `
  await sql`CREATE TABLE IF NOT EXISTS sales_order_draft_items (id SERIAL PRIMARY KEY, draft_id INTEGER NOT NULL REFERENCES sales_order_drafts(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id), product_name VARCHAR(255) NOT NULL, quantity NUMERIC(15,4) NOT NULL, price NUMERIC(15,4) NOT NULL DEFAULT 0, discount NUMERIC(15,2) NOT NULL DEFAULT 0, unit_id INTEGER, barcode VARCHAR(100))`
  await sql`ALTER TABLE sales_order_draft_items ADD COLUMN IF NOT EXISTS store_id INTEGER`
  await sql`ALTER TABLE sales_order_draft_items ADD COLUMN IF NOT EXISTS specifications JSONB NOT NULL DEFAULT '{}'::jsonb`
  await sql`CREATE TABLE IF NOT EXISTS product_manufacturing_components (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, component_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT, quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0), UNIQUE(product_id, component_id), CHECK (product_id <> component_id))`
  await sql`ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS length NUMERIC(18,6)`
  await sql`ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS width NUMERIC(18,6)`
  await sql`ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS height NUMERIC(18,6)`
  await sql`ALTER TABLE product_manufacturing_components ADD COLUMN IF NOT EXISTS count NUMERIC(18,6)`
  readyDatabases.add(databaseName)
}
