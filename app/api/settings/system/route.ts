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

function toInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true
    if (value.toLowerCase() === "false") return false
  }
  return fallback
}

function normalizeWorkingDays(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v))
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map((v) => String(v))
    } catch {
      return []
    }
  }
  return []
}

function normalizeFiscalYearStart(value: unknown): string {
  // Accept ISO date directly.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  // Accept month/day values (e.g. 01/01) and map to current year.
  if (typeof value === "string") {
    const md = value.match(/^(\d{1,2})\/(\d{1,2})$/)
    if (md) {
      const month = Math.min(12, Math.max(1, Number.parseInt(md[1], 10)))
      const day = Math.min(31, Math.max(1, Number.parseInt(md[2], 10)))
      const year = new Date().getFullYear()
      const mm = String(month).padStart(2, "0")
      const dd = String(day).padStart(2, "0")
      return `${year}-${mm}-${dd}`
    }
  }

  return `${new Date().getFullYear()}-01-01`
}

function normalizePrefix(value: unknown, fallback: string): string {
  const raw = (value ?? fallback).toString().trim().toUpperCase()
  return raw
}

function isValidPrefix(value: string): boolean {
  // Uppercase English letters only, 1..3 chars.
  return /^[A-Z]{1,3}$/.test(value)
}

function isValidStart(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value < 1000
}

async function resolveAccountId(value: unknown): Promise<number | null> {
  if (value === null || value === undefined || value === "") return null

  const numericValue = Number(value)
  if (Number.isInteger(numericValue) && numericValue > 0) return numericValue

  const code = String(value).trim()
  if (!code) return null

  const rows = await sql`
    SELECT id
    FROM account_tbl
    WHERE LOWER(code) = LOWER(${code})
    LIMIT 1
  `

  return rows.length > 0 ? Number(rows[0].id) : null
}

async function ensureDefaultAccountColumns(): Promise<void> {
  await sql`
    ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS default_customer_parent_account INTEGER,
    ADD COLUMN IF NOT EXISTS default_customer_credit_account INTEGER,
    ADD COLUMN IF NOT EXISTS default_sales_tax_account INTEGER,
    ADD COLUMN IF NOT EXISTS default_currency_transfer_account INTEGER,
    ADD COLUMN IF NOT EXISTS default_earned_discount_account INTEGER,
    ADD COLUMN IF NOT EXISTS default_exchange_gain_loss_account INTEGER,
    ADD COLUMN IF NOT EXISTS default_salesman_parent_account INTEGER,
    ADD COLUMN IF NOT EXISTS default_supplier_parent_account INTEGER,
    ADD COLUMN IF NOT EXISTS default_customer_subscription_account INTEGER,
    ADD COLUMN IF NOT EXISTS default_purchase_tax_account INTEGER,
    ADD COLUMN IF NOT EXISTS default_new_employee_account INTEGER,
    ADD COLUMN IF NOT EXISTS default_allowed_discount_account INTEGER
  `

  await sql`
    UPDATE system_settings
    SET default_customer_parent_account = NULLIF(default_customer_parent_account, '')::INTEGER,
        default_customer_credit_account = NULLIF(default_customer_credit_account, '')::INTEGER,
        default_sales_tax_account = NULLIF(default_sales_tax_account, '')::INTEGER,
        default_currency_transfer_account = NULLIF(default_currency_transfer_account, '')::INTEGER,
        default_earned_discount_account = NULLIF(default_earned_discount_account, '')::INTEGER,
        default_exchange_gain_loss_account = NULLIF(default_exchange_gain_loss_account, '')::INTEGER,
        default_salesman_parent_account = NULLIF(default_salesman_parent_account, '')::INTEGER,
        default_supplier_parent_account = NULLIF(default_supplier_parent_account, '')::INTEGER,
        default_customer_subscription_account = NULLIF(default_customer_subscription_account, '')::INTEGER,
        default_purchase_tax_account = NULLIF(default_purchase_tax_account, '')::INTEGER,
        default_new_employee_account = NULLIF(default_new_employee_account, '')::INTEGER,
        default_allowed_discount_account = NULLIF(default_allowed_discount_account, '')::INTEGER
    WHERE id = 1
  `
}

export async function GET() {
  try {
    await ensureDefaultAccountColumns()
    const settings = await sql`
      SELECT * FROM system_settings 
      ORDER BY id DESC 
      LIMIT 1
    `

    return NextResponse.json(settings[0] || {})
  } catch (error) {
    console.error("Database query error:", error)
    return NextResponse.json({ error: "Failed to fetch system settings" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()

    // Migration-safe schema sync for older databases.
    await sql`
      ALTER TABLE system_settings
      ADD COLUMN IF NOT EXISTS company_name_en VARCHAR(255) DEFAULT '',
      ADD COLUMN IF NOT EXISTS purchase_prefix VARCHAR(10) DEFAULT 'PO',
      ADD COLUMN IF NOT EXISTS customer_prefix VARCHAR(10) DEFAULT 'C',
      ADD COLUMN IF NOT EXISTS supplier_prefix VARCHAR(10) DEFAULT 'S',
      ADD COLUMN IF NOT EXISTS item_group_prefix VARCHAR(10) DEFAULT 'G',
      ADD COLUMN IF NOT EXISTS invoice_start INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS order_start INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS purchase_start INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS customer_start INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS supplier_start INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS item_group_start INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS item_start INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'ar',
      ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Jerusalem',
      ADD COLUMN IF NOT EXISTS date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
      ADD COLUMN IF NOT EXISTS time_format VARCHAR(20) DEFAULT '24h',
      ADD COLUMN IF NOT EXISTS working_days JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS working_hours VARCHAR(50) DEFAULT '08:00-17:00',
      ADD COLUMN IF NOT EXISTS session_timeout INTEGER DEFAULT 30,
      ADD COLUMN IF NOT EXISTS password_policy VARCHAR(100) DEFAULT 'medium',
      ADD COLUMN IF NOT EXISTS two_factor_auth BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS audit_log BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS default_printer VARCHAR(100) DEFAULT '',
      ADD COLUMN IF NOT EXISTS paper_size VARCHAR(20) DEFAULT 'A4',
      ADD COLUMN IF NOT EXISTS print_logo BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS print_footer BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS auto_numbering BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS default_customer_parent_account INTEGER,
      ADD COLUMN IF NOT EXISTS default_customer_credit_account INTEGER,
      ADD COLUMN IF NOT EXISTS default_sales_tax_account INTEGER,
      ADD COLUMN IF NOT EXISTS default_currency_transfer_account INTEGER,
      ADD COLUMN IF NOT EXISTS default_earned_discount_account INTEGER,
      ADD COLUMN IF NOT EXISTS default_exchange_gain_loss_account INTEGER,
      ADD COLUMN IF NOT EXISTS default_salesman_parent_account INTEGER,
      ADD COLUMN IF NOT EXISTS default_supplier_parent_account INTEGER,
      ADD COLUMN IF NOT EXISTS default_customer_subscription_account INTEGER,
      ADD COLUMN IF NOT EXISTS default_purchase_tax_account INTEGER,
      ADD COLUMN IF NOT EXISTS default_new_employee_account INTEGER,
      ADD COLUMN IF NOT EXISTS default_allowed_discount_account INTEGER
    `

    await ensureDefaultAccountColumns()

    await sql`
      INSERT INTO system_settings (id)
      VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `

    const payload = {
      company_name: data.company_name ?? data.companyName ?? 'شركة النظام المتكامل',
      company_name_en: data.company_name_en ?? data.companyNameEn ?? '',
      company_address: data.company_address ?? data.companyAddress ?? '',
      company_phone: data.company_phone ?? data.companyPhone ?? '',
      company_email: data.company_email ?? data.companyEmail ?? '',
      company_website: data.company_website ?? data.companyWebsite ?? '',
      tax_number: data.tax_number ?? data.taxNumber ?? '',
      commercial_register: data.commercial_register ?? data.commercialRegister ?? '',
      numbering_system: data.numbering_system ?? data.numberingSystem ?? 'auto',
      invoice_prefix: normalizePrefix(data.invoice_prefix ?? data.invoicePrefix, 'INV'),
      order_prefix: normalizePrefix(data.order_prefix ?? data.orderPrefix, 'SO'),
      purchase_prefix: normalizePrefix(data.purchase_prefix ?? data.purchasePrefix, 'PO'),
      customer_prefix: normalizePrefix(data.customer_prefix ?? data.customerPrefix, 'C'),
      supplier_prefix: normalizePrefix(data.supplier_prefix ?? data.supplierPrefix, 'S'),
      item_group_prefix: normalizePrefix(data.item_group_prefix ?? data.itemGroupPrefix, 'G'),
      invoice_start: Math.max(1, toInt(data.invoice_start ?? data.invoiceStart, 1)),
      order_start: Math.max(1, toInt(data.order_start ?? data.orderStart, 1)),
      purchase_start: Math.max(1, toInt(data.purchase_start ?? data.purchaseStart, 1)),
      customer_start: Math.max(1, toInt(data.customer_start ?? data.customerStart, 1)),
      supplier_start: Math.max(1, toInt(data.supplier_start ?? data.supplierStart, 1)),
      item_group_start: Math.max(1, toInt(data.item_group_start ?? data.itemGroupStart, 1)),
      item_start: Math.max(1, toInt(data.item_start ?? data.itemStart, 1)),
      fiscal_year_start: normalizeFiscalYearStart(data.fiscal_year_start ?? data.fiscalYearStart),
      default_currency: data.default_currency ?? data.defaultCurrency ?? 'SAR',
      language: data.language ?? 'ar',
      timezone: data.timezone ?? 'Asia/Jerusalem',
      date_format: data.date_format ?? data.dateFormat ?? 'DD/MM/YYYY',
      time_format: data.time_format ?? data.timeFormat ?? '24h',
      working_days: normalizeWorkingDays(data.working_days ?? data.workingDays),
      working_hours: data.working_hours ?? data.workingHours ?? '08:00-17:00',
      session_timeout: Math.max(1, toInt(data.session_timeout ?? data.sessionTimeout, 30)),
      password_policy: data.password_policy ?? data.passwordPolicy ?? 'medium',
      two_factor_auth: toBool(data.two_factor_auth ?? data.twoFactorAuth, false),
      audit_log: toBool(data.audit_log ?? data.auditLog, true),
      default_printer: data.default_printer ?? data.defaultPrinter ?? '',
      paper_size: data.paper_size ?? data.paperSize ?? 'A4',
      print_logo: toBool(data.print_logo ?? data.printLogo, true),
      print_footer: toBool(data.print_footer ?? data.printFooter, true),
      auto_numbering: toBool(data.auto_numbering ?? data.autoNumbering, true),
      default_customer_parent_account: await resolveAccountId(data.default_customer_parent_account ?? data.customerParentAccount),
      default_customer_credit_account: await resolveAccountId(data.default_customer_credit_account ?? data.customerCreditAccount),
      default_sales_tax_account: await resolveAccountId(data.default_sales_tax_account ?? data.salesTaxAccount),
      default_currency_transfer_account: await resolveAccountId(data.default_currency_transfer_account ?? data.currencyTransferAccount),
      default_earned_discount_account: await resolveAccountId(data.default_earned_discount_account ?? data.earnedDiscountAccount),
      default_exchange_gain_loss_account: await resolveAccountId(data.default_exchange_gain_loss_account ?? data.exchangeGainLossAccount),
      default_salesman_parent_account: await resolveAccountId(data.default_salesman_parent_account ?? data.salesmanParentAccount),
      default_supplier_parent_account: await resolveAccountId(data.default_supplier_parent_account ?? data.supplierParentAccount),
      default_customer_subscription_account: await resolveAccountId(data.default_customer_subscription_account ?? data.customerSubscriptionAccount),
      default_purchase_tax_account: await resolveAccountId(data.default_purchase_tax_account ?? data.purchaseTaxAccount),
      default_new_employee_account: await resolveAccountId(data.default_new_employee_account ?? data.newEmployeeAccount),
      default_allowed_discount_account: await resolveAccountId(data.default_allowed_discount_account ?? data.allowedDiscountAccount),
    }

    const prefixEntries: Array<[string, string]> = [
      ["invoice_prefix", payload.invoice_prefix],
      ["order_prefix", payload.order_prefix],
      ["purchase_prefix", payload.purchase_prefix],
      ["customer_prefix", payload.customer_prefix],
      ["supplier_prefix", payload.supplier_prefix],
      ["item_group_prefix", payload.item_group_prefix],
    ]

    for (const [field, value] of prefixEntries) {
      if (!isValidPrefix(value)) {
        return NextResponse.json(
          {
            error: "Invalid prefix format",
            details: `${field} must contain only uppercase English letters and be at most 3 characters`,
          },
          { status: 400 },
        )
      }
    }

    const startEntries: Array<[string, number]> = [
      ["invoice_start", payload.invoice_start],
      ["order_start", payload.order_start],
      ["purchase_start", payload.purchase_start],
      ["customer_start", payload.customer_start],
      ["supplier_start", payload.supplier_start],
      ["item_group_start", payload.item_group_start],
      ["item_start", payload.item_start],
    ]

    for (const [field, value] of startEntries) {
      if (!isValidStart(value)) {
        return NextResponse.json(
          {
            error: "Invalid start value",
            details: `${field} must be an integer between 1 and 999`,
          },
          { status: 400 },
        )
      }
    }

    const result = await sql`
      UPDATE system_settings 
      SET 
        company_name = ${payload.company_name},
        company_name_en = ${payload.company_name_en},
        company_address = ${payload.company_address},
        company_phone = ${payload.company_phone},
        company_email = ${payload.company_email},
        company_website = ${payload.company_website},
        tax_number = ${payload.tax_number},
        commercial_register = ${payload.commercial_register},
        numbering_system = ${payload.numbering_system},
        invoice_prefix = ${payload.invoice_prefix},
        order_prefix = ${payload.order_prefix},
        purchase_prefix = ${payload.purchase_prefix},
        customer_prefix = ${payload.customer_prefix},
        supplier_prefix = ${payload.supplier_prefix},
        item_group_prefix = ${payload.item_group_prefix},
        invoice_start = ${payload.invoice_start},
        order_start = ${payload.order_start},
        purchase_start = ${payload.purchase_start},
        customer_start = ${payload.customer_start},
        supplier_start = ${payload.supplier_start},
        item_group_start = ${payload.item_group_start},
        item_start = ${payload.item_start},
        fiscal_year_start = ${payload.fiscal_year_start},
        default_currency = ${payload.default_currency},
        language = ${payload.language},
        timezone = ${payload.timezone},
        date_format = ${payload.date_format},
        time_format = ${payload.time_format},
        working_days = ${JSON.stringify(payload.working_days)}::jsonb,
        working_hours = ${payload.working_hours},
        session_timeout = ${payload.session_timeout},
        password_policy = ${payload.password_policy},
        two_factor_auth = ${payload.two_factor_auth},
        audit_log = ${payload.audit_log},
        default_printer = ${payload.default_printer},
        paper_size = ${payload.paper_size},
        print_logo = ${payload.print_logo},
        print_footer = ${payload.print_footer},
        auto_numbering = ${payload.auto_numbering},
        default_customer_parent_account = ${payload.default_customer_parent_account},
        default_customer_credit_account = ${payload.default_customer_credit_account},
        default_sales_tax_account = ${payload.default_sales_tax_account},
        default_currency_transfer_account = ${payload.default_currency_transfer_account},
        default_earned_discount_account = ${payload.default_earned_discount_account},
        default_exchange_gain_loss_account = ${payload.default_exchange_gain_loss_account},
        default_salesman_parent_account = ${payload.default_salesman_parent_account},
        default_supplier_parent_account = ${payload.default_supplier_parent_account},
        default_customer_subscription_account = ${payload.default_customer_subscription_account},
        default_purchase_tax_account = ${payload.default_purchase_tax_account},
        default_new_employee_account = ${payload.default_new_employee_account},
        default_allowed_discount_account = ${payload.default_allowed_discount_account},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      RETURNING *
    `

    return NextResponse.json(result[0])
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
