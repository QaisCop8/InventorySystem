import { type NextRequest, NextResponse } from "next/server"
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
          const query = strings.reduce(
            (prev, curr, i) => prev + curr + (i < values.length ? `$${i + 1}` : ""),
            "",
          )
          const result = await client.query(query, values)
          return result.rows
        } finally {
          client.release()
        }
      }
    } else {
      sql = neon(dbUrl)
    }
  }
} catch (error) {
  console.error("[v0] Failed to initialize DB client:", error)
  sql = null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function serializeSettingValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

function deserializeSettingValue(value: unknown): unknown {
  if (value === null || value === undefined) return null

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return ""

    if (trimmed === "true") return true
    if (trimmed === "false") return false

    if (/^-?\d+$/.test(trimmed)) {
      return Number.parseInt(trimmed, 10)
    }

    try {
      const parsed = JSON.parse(trimmed)
      return parsed
    } catch {
      return trimmed
    }
  }

  return value
}

function pickValue(data: Record<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    if (alias in data && data[alias] !== undefined) {
      return data[alias]
    }
  }
  return undefined
}

function normalizePayload(data: unknown): Record<string, unknown> {
  if (isObject(data) && isObject(data.settings)) {
    data = data.settings
  }

  if (!isObject(data)) {
    return {}
  }

  const payload = data as Record<string, unknown>
  const entries = Object.entries(payload)
  const normalized: Record<string, unknown> = {}

  const aliasMap: Record<string, string[]> = {
    company_name: ["company_name", "companyName"],
    company_name_en: ["company_name_en", "companyNameEn"],
    company_address: ["company_address", "companyAddress", "address"],
    company_phone: ["company_phone", "companyPhone", "phone"],
    company_email: ["company_email", "companyEmail", "email"],
    company_website: ["company_website", "companyWebsite", "website"],
    tax_number: ["tax_number", "taxNumber"],
    commercial_register: ["commercial_register", "commercialRegister"],
    default_currency: ["default_currency", "defaultCurrency"],
    invoice_prefix: ["invoice_prefix", "invoicePrefix"],
    order_prefix: ["order_prefix", "orderPrefix"],
    purchase_prefix: ["purchase_prefix", "purchasePrefix"],
    customer_prefix: ["customer_prefix", "customerPrefix"],
    supplier_prefix: ["supplier_prefix", "supplierPrefix"],
    item_group_prefix: ["item_group_prefix", "itemGroupPrefix"],
    invoice_start: ["invoice_start", "invoiceStart"],
    order_start: ["order_start", "orderStart"],
    purchase_start: ["purchase_start", "purchaseStart"],
    customer_start: ["customer_start", "customerStart"],
    supplier_start: ["supplier_start", "supplierStart"],
    item_group_start: ["item_group_start", "itemGroupStart"],
    item_start: ["item_start", "itemStart"],
    fiscal_year_start: ["fiscal_year_start", "fiscalYearStart"],
    numbering_system: ["numbering_system", "numberingSystem"],
    language: ["language"],
    timezone: ["timezone"],
    date_format: ["date_format", "dateFormat"],
    time_format: ["time_format", "timeFormat"],
    working_days: ["working_days", "workingDays"],
    working_hours: ["working_hours", "workingHours"],
    session_timeout: ["session_timeout", "sessionTimeout"],
    password_policy: ["password_policy", "passwordPolicy"],
    two_factor_auth: ["two_factor_auth", "twoFactorAuth"],
    audit_log: ["audit_log", "auditLog"],
    default_printer: ["default_printer", "defaultPrinter"],
    paper_size: ["paper_size", "paperSize"],
    print_logo: ["print_logo", "printLogo"],
    print_footer: ["print_footer", "printFooter"],
    auto_numbering: ["auto_numbering", "autoNumbering"],
    default_customer_parent_account: ["default_customer_parent_account", "customerParentAccount"],
    default_customer_credit_account: ["default_customer_credit_account", "customerCreditAccount"],
    default_sales_tax_account: ["default_sales_tax_account", "salesTaxAccount"],
    default_currency_transfer_account: ["default_currency_transfer_account", "currencyTransferAccount"],
    default_earned_discount_account: ["default_earned_discount_account", "earnedDiscountAccount"],
    default_exchange_gain_loss_account: ["default_exchange_gain_loss_account", "exchangeGainLossAccount"],
    default_salesman_parent_account: ["default_salesman_parent_account", "salesmanParentAccount"],
    default_supplier_parent_account: ["default_supplier_parent_account", "supplierParentAccount"],
    default_customer_subscription_account: ["default_customer_subscription_account", "customerSubscriptionAccount"],
    default_purchase_tax_account: ["default_purchase_tax_account", "purchaseTaxAccount"],
    default_new_employee_account: ["default_new_employee_account", "newEmployeeAccount"],
    default_allowed_discount_account: ["default_allowed_discount_account", "allowedDiscountAccount"],
  }

  for (const [key, aliases] of Object.entries(aliasMap)) {
    const value = pickValue(payload, aliases)
    if (value !== undefined) {
      normalized[key] = value
    }
  }

  for (const [key, value] of entries) {
    if (!(key in aliasMap) && value !== undefined) {
      normalized[key] = value
    }
  }

  return normalized
}

async function ensureSettingsTable(): Promise<void> {
  if (!sql) return

  // Create a minimal key/value table if it doesn't exist. Many installations
  // previously used a simple integer id PK with description/value columns.
  // We avoid throwing on ALTER failures so older schemas remain usable.
  const execSafe = async (q: any) => {
    try {
      await q
    } catch (err) {
      console.warn("[v0] Non-fatal schema change failed:", err instanceof Error ? err.message : String(err))
    }
  }

  await execSafe(sql`
    CREATE TABLE IF NOT EXISTS system_settings (
      id VARCHAR(100) PRIMARY KEY,
      description TEXT,
      value TEXT
    )
  `)

  // Many databases contain id as integer; attempts to ALTER may fail with
  // insufficient privileges — ignore those errors and proceed.
  await execSafe(sql`ALTER TABLE system_settings ALTER COLUMN id TYPE VARCHAR(100) USING id::TEXT`)
  await execSafe(sql`ALTER TABLE system_settings ALTER COLUMN id DROP DEFAULT`)
  await execSafe(sql`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS description TEXT`)
  await execSafe(sql`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS value TEXT`)

  const dropColumns = [
    "organization_id",
    "company_name",
    "company_name_en",
    "company_email",
    "company_phone",
    "company_address",
    "company_website",
    "tax_number",
    "commercial_register",
    "default_currency",
    "language",
    "timezone",
    "date_format",
    "time_format",
    "fiscal_year_start",
    "auto_numbering",
    "numbering_system",
    "invoice_prefix",
    "invoice_start",
    "order_prefix",
    "order_start",
    "purchase_prefix",
    "purchase_start",
    "customer_prefix",
    "customer_start",
    "supplier_prefix",
    "supplier_start",
    "item_prefix",
    "item_start",
    "item_group_prefix",
    "item_group_start",
    "default_customer_parent_account",
    "default_customer_credit_account",
    "default_sales_tax_account",
    "default_currency_transfer_account",
    "default_earned_discount_account",
    "default_exchange_gain_loss_account",
    "default_salesman_parent_account",
    "default_supplier_parent_account",
    "default_customer_subscription_account",
    "default_purchase_tax_account",
    "default_new_employee_account",
    "default_allowed_discount_account",
    "paper_size",
    "print_logo",
    "print_footer",
    "default_printer",
    "working_days",
    "working_hours",
    "session_timeout",
    "two_factor_auth",
    "password_policy",
    "audit_log",
    "account_prefix",
    "account_start",
    "created_at",
    "updated_at",
  ]

  for (const col of dropColumns) {
    // ignore failures
    // eslint-disable-next-line no-await-in-loop
    await execSafe(sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS ${col}`)
  }
}

async function loadStoredSettings(): Promise<Record<string, unknown>> {
  if (!sql) return {}

  await ensureSettingsTable()

  const rows = await sql`
    SELECT id, description, value
    FROM system_settings
    ORDER BY id ASC
  `

  const settings: Record<string, unknown> = {}

  // Detect if the existing table uses an integer id PK (legacy). If so,
  // prefer the `description` column as the settings key.
  let idIsInteger = false
  try {
    const info = await sql`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'system_settings' AND column_name = 'id'
      LIMIT 1
    `
    const dt = info?.[0]?.data_type
    if (typeof dt === "string" && /int/i.test(dt)) idIsInteger = true
  } catch (err) {
    // ignore
  }

  for (const row of rows) {
    const key = idIsInteger ? row.description ?? String(row.id) : row.id ?? row.description
    if (!key) continue
    settings[String(key)] = deserializeSettingValue(row.value)
  }

  return settings
}

async function saveSettingsPayload(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!sql) return {}

  await ensureSettingsTable()

  // If the table has an integer `id` PK (legacy), store settings by
  // `description`/`value`. Otherwise use `id` as the key.
  let idIsInteger = false
  try {
    const info = await sql`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'system_settings' AND column_name = 'id'
      LIMIT 1
    `
    const dt = info?.[0]?.data_type
    if (typeof dt === "string" && /int/i.test(dt)) idIsInteger = true
  } catch (err) {
    // ignore and proceed with id as string
  }

  for (const [key, value] of Object.entries(payload)) {
    const serializedValue = serializeSettingValue(value)
    if (idIsInteger) {
      // Upsert by description
      await sql`
        INSERT INTO system_settings (description, value)
        VALUES (${key}, ${serializedValue})
      `
        .catch(async () => {
          // If insert fails (unique constraints or other), try update
          await sql`
            UPDATE system_settings
            SET value = ${serializedValue}, description = ${key}
            WHERE description = ${key}
          `
        })
    } else {
      await sql`
        INSERT INTO system_settings (id, description, value)
        VALUES (${key}, ${key}, ${serializedValue})
        ON CONFLICT (id) DO UPDATE SET
          description = EXCLUDED.description,
          value = EXCLUDED.value
      `
    }
  }

  return loadStoredSettings()
}

export async function GET() {
  try {
    const settings = await loadStoredSettings()
    return NextResponse.json(settings)
  } catch (error) {
    console.error("Database query error:", error)
    return NextResponse.json({ error: "Failed to fetch system settings" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    const payload = normalizePayload(data)
    const saved = await saveSettingsPayload(payload)
    return NextResponse.json(saved)
  } catch (error) {
    console.error("Database update error:", error)
    return NextResponse.json(
      {
        error: "Failed to update system settings",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
