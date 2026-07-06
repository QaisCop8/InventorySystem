import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

const ensureSettingsColumns = async () => {
  await sql`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS allow_duplicate_batch_number BOOLEAN DEFAULT false`
}

export async function POST(request: NextRequest) {
  try {
    await ensureSettingsColumns()

    const settings = await request.json()

    console.log("[v0] Received settings data:", settings)

    // Validate required fields
    if (!settings.companyName?.trim() && !settings.company_name?.trim()) {
      return NextResponse.json({ error: "اسم الشركة مطلوب" }, { status: 400 })
    }

    // Create or update system settings
    const result = await sql`
      INSERT INTO system_settings (
        id, company_name, company_name_en, tax_number, commercial_register,
        company_address, company_phone, company_email, company_website, 
        default_currency, date_format, time_format, language, timezone, 
        fiscal_year_start, working_days, working_hours, session_timeout, 
        password_policy, two_factor_auth, audit_log, invoice_prefix, 
        order_prefix, purchase_prefix, auto_numbering, allow_duplicate_batch_number, default_printer, 
        paper_size, print_logo, print_footer, updated_at
      ) VALUES (
        1, ${settings.companyName || settings.company_name}, 
        ${settings.companyNameEn || settings.company_name_en}, 
        ${settings.taxNumber || settings.tax_number},
        ${settings.commercialRegister || settings.commercial_register}, 
        ${settings.address || settings.company_address}, 
        ${settings.phone || settings.company_phone},
        ${settings.email || settings.company_email}, 
        ${settings.website || settings.company_website}, 
        ${settings.defaultCurrency || settings.default_currency || "SAR"},
        ${settings.dateFormat || settings.date_format || "DD/MM/YYYY"}, 
        ${settings.timeFormat || settings.time_format || "24h"}, 
        ${settings.language || "ar"},
        ${settings.timezone || "Asia/Riyadh"}, 
        ${settings.fiscalYearStart || settings.fiscal_year_start || "2024-01-01"}, 
        ${JSON.stringify(settings.workingDays || settings.working_days || ["sunday", "monday", "tuesday", "wednesday", "thursday"])},
        ${settings.workingHours || settings.working_hours || "08:00-17:00"}, 
        ${settings.sessionTimeout || settings.session_timeout || 60},
        ${settings.passwordPolicy || settings.password_policy || "medium"}, 
        ${settings.twoFactorAuth || settings.two_factor_auth || false}, 
        ${settings.auditLog || settings.audit_log || true}, 
        ${settings.invoicePrefix || settings.invoice_prefix || "O"},
        ${settings.orderPrefix || settings.order_prefix || "O"}, 
        ${settings.purchasePrefix || settings.purchase_prefix || "T"}, 
        ${settings.autoNumbering || settings.auto_numbering || true},
        ${settings.allowDuplicateBatchNumber ?? settings.allow_duplicate_batch_number ?? false},
        ${settings.defaultPrinter || settings.default_printer}, 
        ${settings.paperSize || settings.paper_size || "A4"}, 
        ${settings.printLogo || settings.print_logo || true},
        ${settings.printFooter || settings.print_footer || true}, 
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        company_name_en = EXCLUDED.company_name_en,
        tax_number = EXCLUDED.tax_number,
        commercial_register = EXCLUDED.commercial_register,
        company_address = EXCLUDED.company_address,
        company_phone = EXCLUDED.company_phone,
        company_email = EXCLUDED.company_email,
        company_website = EXCLUDED.company_website,
        default_currency = EXCLUDED.default_currency,
        date_format = EXCLUDED.date_format,
        time_format = EXCLUDED.time_format,
        language = EXCLUDED.language,
        timezone = EXCLUDED.timezone,
        fiscal_year_start = EXCLUDED.fiscal_year_start,
        working_days = EXCLUDED.working_days,
        working_hours = EXCLUDED.working_hours,
        session_timeout = EXCLUDED.session_timeout,
        password_policy = EXCLUDED.password_policy,
        two_factor_auth = EXCLUDED.two_factor_auth,
        audit_log = EXCLUDED.audit_log,
        invoice_prefix = EXCLUDED.invoice_prefix,
        order_prefix = EXCLUDED.order_prefix,
        purchase_prefix = EXCLUDED.purchase_prefix,
        auto_numbering = EXCLUDED.auto_numbering,
        allow_duplicate_batch_number = EXCLUDED.allow_duplicate_batch_number,
        default_printer = EXCLUDED.default_printer,
        paper_size = EXCLUDED.paper_size,
        print_logo = EXCLUDED.print_logo,
        print_footer = EXCLUDED.print_footer,
        updated_at = NOW()
      RETURNING *
    `

    console.log("[v0] Settings saved successfully:", result[0])

    return NextResponse.json({
      message: "تم حفظ الإعدادات بنجاح",
      settings: result[0],
    })
  } catch (error) {
    console.error("Error saving system settings:", error)
    return NextResponse.json({ error: "فشل في حفظ الإعدادات" }, { status: 500 })
  }
}

export async function GET() {
  try {
    await ensureSettingsColumns()

    const settings = await sql`
      SELECT * FROM system_settings ORDER BY id DESC LIMIT 1
    `

    return NextResponse.json({
      settings: settings[0] || null,
    })
  } catch (error) {
    console.error("Error fetching system settings:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء جلب الإعدادات" }, { status: 500 })
  }
}
