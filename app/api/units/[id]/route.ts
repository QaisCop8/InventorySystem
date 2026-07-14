import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

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
    if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
    try {
      return JSON.parse(trimmed)
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
  await sql`
    CREATE TABLE IF NOT EXISTS system_settings (
      id VARCHAR(100) PRIMARY KEY,
      description TEXT,
      value TEXT
    )
  `

  await sql`ALTER TABLE system_settings ALTER COLUMN id TYPE VARCHAR(100) USING id::TEXT`
  await sql`ALTER TABLE system_settings ALTER COLUMN id DROP DEFAULT`
  await sql`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS description TEXT`
  await sql`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS value TEXT`

  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS organization_id`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS company_name`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS company_name_en`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS company_email`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS company_phone`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS company_address`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS company_website`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS tax_number`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS commercial_register`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_currency`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS language`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS timezone`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS date_format`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS time_format`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS fiscal_year_start`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS auto_numbering`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS numbering_system`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS invoice_prefix`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS invoice_start`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS order_prefix`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS order_start`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS purchase_prefix`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS purchase_start`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS customer_prefix`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS customer_start`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS supplier_prefix`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS supplier_start`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS item_prefix`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS item_start`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS item_group_prefix`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS item_group_start`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_customer_parent_account`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_customer_credit_account`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_sales_tax_account`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_currency_transfer_account`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_earned_discount_account`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_exchange_gain_loss_account`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_salesman_parent_account`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_supplier_parent_account`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_customer_subscription_account`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_purchase_tax_account`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_new_employee_account`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_allowed_discount_account`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS paper_size`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS print_logo`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS print_footer`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS default_printer`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS working_days`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS working_hours`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS session_timeout`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS two_factor_auth`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS password_policy`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS audit_log`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS account_prefix`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS account_start`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS created_at`
  await sql`ALTER TABLE system_settings DROP COLUMN IF EXISTS updated_at`
}

async function loadStoredSettings(): Promise<Record<string, unknown>> {
  await ensureSettingsTable()

  const rows = await sql`
    SELECT id, description, value
    FROM system_settings
    ORDER BY id ASC
  `

  const settings: Record<string, unknown> = {}

  for (const row of rows) {
    const key = row.id ?? row.description
    if (!key) continue
    settings[String(key)] = deserializeSettingValue(row.value)
  }

  return settings
}

async function saveSettingsPayload(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  await ensureSettingsTable()

  for (const [key, value] of Object.entries(payload)) {
    const serializedValue = serializeSettingValue(value)
    await sql`
      INSERT INTO system_settings (id, description, value)
      VALUES (${key}, ${key}, ${serializedValue})
      ON CONFLICT (id) DO UPDATE SET
        description = EXCLUDED.description,
        value = EXCLUDED.value
    `
  }

  return loadStoredSettings()
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const payload = normalizePayload(data)
    const saved = await saveSettingsPayload(payload)

    return NextResponse.json({
      message: "تم حفظ الإعدادات بنجاح",
      settings: saved,
    })
  } catch (error) {
    console.error("Error saving system settings:", error)
    return NextResponse.json({ error: "فشل في حفظ الإعدادات" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const settings = await loadStoredSettings()

    return NextResponse.json({
      settings,
    })
  } catch (error) {
    console.error("Error fetching system settings:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء جلب الإعدادات" }, { status: 500 })
  }
}

