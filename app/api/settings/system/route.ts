import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"

let sql: any = null

try {
  if (!process.env.DATABASE_URL) {
    console.error("[settings/system] DATABASE_URL is not set")
  } else {
    const dbUrl = process.env.DATABASE_URL

    if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
      const pool = new Pool({ connectionString: dbUrl })
      sql = async (strings: TemplateStringsArray, ...values: any[]) => {
        const client = await pool.connect()
        try {
          const query = strings.reduce(
            (prev, curr, i) => prev + curr + (i < values.length ? `$${i + 1}` : ""),
            ""
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

    console.log("[settings/system] Database client initialized")
  }
} catch (error) {
  console.error("[settings/system] Failed to initialize DB client:", error)
  sql = null
}

const ensureSettingsColumns = async () => {
  if (!sql) return
  await sql`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS allow_duplicate_batch_number BOOLEAN DEFAULT false`
}

const getRequestValue = (data: any, snakeKey: string, camelKey: string, fallback: any) => {
  const value = data[snakeKey] ?? data[camelKey]
  return value === undefined ? fallback : value
}

const normalizeFiscalYearStart = (value: any) => {
  if (!value) return "2024-01-01"
  const raw = String(value).trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw
  }

  if (/^\d{2}[\/\-]\d{2}$/.test(raw)) {
    const [day, month] = raw.split(/[\/\-]/)
    const year = new Date().getFullYear()
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return "2024-01-01"
}

export async function GET() {
  try {
    if (!sql) {
      console.error("[settings/system] DB client not initialized for GET")
      return NextResponse.json({ error: "Database client not initialized" }, { status: 500 })
    }

    await ensureSettingsColumns()

    const settings = await sql`
      SELECT * FROM system_settings 
      ORDER BY id DESC 
      LIMIT 1
    `

    return NextResponse.json(settings[0] || {})
  } catch (error) {
    console.error("Database query error:", error)
    return NextResponse.json({ error: "Failed to fetch system settings", details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 204 })
}

export async function PUT(request: NextRequest) {
  try {
    await ensureSettingsColumns()

    const data = await request.json()

    const companyName = getRequestValue(data, "company_name", "companyName", "")
    const companyNameEn = getRequestValue(data, "company_name_en", "companyNameEn", "")
    const companyAddress = getRequestValue(data, "company_address", "companyAddress", "")
    const companyPhone = getRequestValue(data, "company_phone", "companyPhone", "")
    const companyEmail = getRequestValue(data, "company_email", "companyEmail", "")
    const companyWebsite = getRequestValue(data, "company_website", "companyWebsite", "")
    const taxNumber = getRequestValue(data, "tax_number", "taxNumber", "")
    const commercialRegister = getRequestValue(data, "commercial_register", "commercialRegister", "")
    const numberingSystem = getRequestValue(data, "numbering_system", "numberingSystem", "auto")
    const invoicePrefix = getRequestValue(data, "invoice_prefix", "invoicePrefix", "INV")
    const orderPrefix = getRequestValue(data, "order_prefix", "orderPrefix", "SO")
    const purchasePrefix = getRequestValue(data, "purchase_prefix", "purchasePrefix", "PO")
    const customerPrefix = getRequestValue(data, "customer_prefix", "customerPrefix", "C")
    const supplierPrefix = getRequestValue(data, "supplier_prefix", "supplierPrefix", "S")
    const itemGroupPrefix = getRequestValue(data, "item_group_prefix", "itemGroupPrefix", "G")
    const invoiceStart = getRequestValue(data, "invoice_start", "invoiceStart", 1)
    const orderStart = getRequestValue(data, "order_start", "orderStart", 1)
    const purchaseStart = getRequestValue(data, "purchase_start", "purchaseStart", 1)
    const customerStart = getRequestValue(data, "customer_start", "customerStart", null)
    const supplierStart = getRequestValue(data, "supplier_start", "supplierStart", null)
    const itemGroupStart = getRequestValue(data, "item_group_start", "itemGroupStart", null)
    const itemStart = getRequestValue(data, "item_start", "itemStart", null)
    const fiscalYearStart = normalizeFiscalYearStart(getRequestValue(data, "fiscal_year_start", "fiscalYearStart", "2024-01-01"))
    const defaultCurrency = getRequestValue(data, "default_currency", "defaultCurrency", "SAR")
    const language = getRequestValue(data, "language", "language", "ar")
    const timezone = getRequestValue(data, "timezone", "timezone", "Asia/Jerusalem")
    const dateFormat = getRequestValue(data, "date_format", "dateFormat", "DD/MM/YYYY")
    const timeFormat = getRequestValue(data, "time_format", "timeFormat", "24")
    const workingDays = getRequestValue(data, "working_days", "workingDays", [])
    const workingHours = getRequestValue(data, "working_hours", "workingHours", "08:00-17:00")
    const sessionTimeout = getRequestValue(data, "session_timeout", "sessionTimeout", 30)
    const passwordPolicy = getRequestValue(data, "password_policy", "passwordPolicy", "medium")
    const twoFactorAuth = getRequestValue(data, "two_factor_auth", "twoFactorAuth", false)
    const auditLog = getRequestValue(data, "audit_log", "auditLog", true)
    const defaultPrinter = getRequestValue(data, "default_printer", "defaultPrinter", "")
    const paperSize = getRequestValue(data, "paper_size", "paperSize", "A4")
    const printLogo = getRequestValue(data, "print_logo", "printLogo", true)
    const printFooter = getRequestValue(data, "print_footer", "printFooter", true)
    const autoNumbering = getRequestValue(data, "auto_numbering", "autoNumbering", true)
    const allowDuplicateBatchNumber = getRequestValue(data, "allow_duplicate_batch_number", "allowDuplicateBatchNumber", false)

    if (!sql) {
      console.error("[settings/system] DB client not initialized for PUT")
      return NextResponse.json({ error: "Database client not initialized" }, { status: 500 })
    }

    const result = await sql`
      INSERT INTO system_settings (
        id, company_name, company_name_en, company_address, company_phone, company_email, company_website,
        tax_number, commercial_register, numbering_system, invoice_prefix, order_prefix, purchase_prefix,
        customer_prefix, supplier_prefix, item_group_prefix, invoice_start, order_start, purchase_start,
        customer_start, supplier_start, item_group_start, item_start, fiscal_year_start, default_currency,
        language, timezone, date_format, time_format, working_days, working_hours, session_timeout,
        password_policy, two_factor_auth, audit_log, default_printer, paper_size, print_logo, print_footer,
        auto_numbering, allow_duplicate_batch_number, updated_at
      ) VALUES (
        1,
        ${companyName},
        ${companyNameEn},
        ${companyAddress},
        ${companyPhone},
        ${companyEmail},
        ${companyWebsite},
        ${taxNumber},
        ${commercialRegister},
        ${numberingSystem},
        ${invoicePrefix},
        ${orderPrefix},
        ${purchasePrefix},
        ${customerPrefix},
        ${supplierPrefix},
        ${itemGroupPrefix},
        ${invoiceStart},
        ${orderStart},
        ${purchaseStart},
        ${customerStart},
        ${supplierStart},
        ${itemGroupStart},
        ${itemStart},
        ${fiscalYearStart},
        ${defaultCurrency},
        ${language},
        ${timezone},
        ${dateFormat},
        ${timeFormat},
        ${JSON.stringify(workingDays)},
        ${workingHours},
        ${sessionTimeout},
        ${passwordPolicy},
        ${twoFactorAuth},
        ${auditLog},
        ${defaultPrinter},
        ${paperSize},
        ${printLogo},
        ${printFooter},
        ${autoNumbering},
        ${allowDuplicateBatchNumber},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        company_name_en = EXCLUDED.company_name_en,
        company_address = EXCLUDED.company_address,
        company_phone = EXCLUDED.company_phone,
        company_email = EXCLUDED.company_email,
        company_website = EXCLUDED.company_website,
        tax_number = EXCLUDED.tax_number,
        commercial_register = EXCLUDED.commercial_register,
        numbering_system = EXCLUDED.numbering_system,
        invoice_prefix = EXCLUDED.invoice_prefix,
        order_prefix = EXCLUDED.order_prefix,
        purchase_prefix = EXCLUDED.purchase_prefix,
        customer_prefix = EXCLUDED.customer_prefix,
        supplier_prefix = EXCLUDED.supplier_prefix,
        item_group_prefix = EXCLUDED.item_group_prefix,
        invoice_start = EXCLUDED.invoice_start,
        order_start = EXCLUDED.order_start,
        purchase_start = EXCLUDED.purchase_start,
        customer_start = EXCLUDED.customer_start,
        supplier_start = EXCLUDED.supplier_start,
        item_group_start = EXCLUDED.item_group_start,
        item_start = EXCLUDED.item_start,
        fiscal_year_start = EXCLUDED.fiscal_year_start,
        default_currency = EXCLUDED.default_currency,
        language = EXCLUDED.language,
        timezone = EXCLUDED.timezone,
        date_format = EXCLUDED.date_format,
        time_format = EXCLUDED.time_format,
        working_days = EXCLUDED.working_days,
        working_hours = EXCLUDED.working_hours,
        session_timeout = EXCLUDED.session_timeout,
        password_policy = EXCLUDED.password_policy,
        two_factor_auth = EXCLUDED.two_factor_auth,
        audit_log = EXCLUDED.audit_log,
        default_printer = EXCLUDED.default_printer,
        paper_size = EXCLUDED.paper_size,
        print_logo = EXCLUDED.print_logo,
        print_footer = EXCLUDED.print_footer,
        auto_numbering = EXCLUDED.auto_numbering,
        allow_duplicate_batch_number = EXCLUDED.allow_duplicate_batch_number,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Database update error:", error)
    return NextResponse.json({ error: "Failed to update system settings" }, { status: 500 })
  }
}
