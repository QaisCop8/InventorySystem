import sql, { resolveCurrentDbName } from "@/lib/database"

const readyDatabases = new Set<string>()
export async function ensureCustomerProductTemplateTables() {
  const databaseName = await resolveCurrentDbName()
  if (readyDatabases.has(databaseName)) return
  await sql`CREATE TABLE IF NOT EXISTS customer_product_templates_tbl (id SERIAL PRIMARY KEY, template_code VARCHAR(30) NOT NULL UNIQUE, name_ar VARCHAR(200) NOT NULL, name_en VARCHAR(200), start_date DATE NOT NULL, end_date DATE, status INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`
  await sql`CREATE TABLE IF NOT EXISTS customer_product_template_customers_tbl (id SERIAL PRIMARY KEY, template_id INTEGER NOT NULL REFERENCES customer_product_templates_tbl(id) ON DELETE CASCADE, account_id INTEGER NOT NULL, UNIQUE(template_id,account_id))`
  await sql`CREATE TABLE IF NOT EXISTS customer_product_template_products_tbl (id SERIAL PRIMARY KEY, template_id INTEGER NOT NULL REFERENCES customer_product_templates_tbl(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id), UNIQUE(template_id,product_id))`
  await sql`CREATE INDEX IF NOT EXISTS idx_customer_product_template_customers_account ON customer_product_template_customers_tbl(account_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_customer_product_template_products_product ON customer_product_template_products_tbl(product_id)`
  readyDatabases.add(databaseName)
}
