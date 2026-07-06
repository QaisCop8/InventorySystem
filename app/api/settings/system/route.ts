import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

const ensureSettingsColumns = async () => {
  await sql`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS allow_duplicate_batch_number BOOLEAN DEFAULT false`
}

export async function GET() {
  try {
    await ensureSettingsColumns()

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
    await ensureSettingsColumns()

    const data = await request.json()

    const result = await sql`
      UPDATE system_settings 
      SET 
        company_name = ${data.company_name},
        company_name_en = ${data.company_name_en || ""},
        company_address = ${data.company_address},
        company_phone = ${data.company_phone},
        company_email = ${data.company_email},
        company_website = ${data.company_website},
        tax_number = ${data.tax_number},
        commercial_register = ${data.commercial_register},
        numbering_system = ${data.numbering_system},
        invoice_prefix = ${data.invoice_prefix},
        order_prefix = ${data.order_prefix},
        purchase_prefix = ${data.purchase_prefix},
        customer_prefix = ${data.customer_prefix || "C"},
        supplier_prefix = ${data.supplier_prefix || "S"},
        item_group_prefix = ${data.item_group_prefix || "G"},
        invoice_start = ${data.invoice_start || 1},
        order_start = ${data.order_start || 1},
        purchase_start = ${data.purchase_start || 1},
        customer_start = ${data.customer_start},
        supplier_start = ${data.supplier_start},
        item_group_start = ${data.item_group_start},
        item_start = ${data.item_start},
        fiscal_year_start = ${data.fiscal_year_start},
        default_currency = ${data.default_currency},
        language = ${data.language || "ar"},
        timezone = ${data.timezone || "Asia/Jerusalem"},
        date_format = ${data.date_format || "DD/MM/YYYY"},
        time_format = ${data.time_format || "24"},
        working_days = ${JSON.stringify(data.working_days || [])},
        working_hours = ${data.working_hours || "08:00-17:00"},
        session_timeout = ${data.session_timeout || 30},
        password_policy = ${data.password_policy || "medium"},
        two_factor_auth = ${data.two_factor_auth || false},
        audit_log = ${data.audit_log || true},
        default_printer = ${data.default_printer || ""},
        paper_size = ${data.paper_size || "A4"},
        print_logo = ${data.print_logo || true},
        print_footer = ${data.print_footer || true},
        auto_numbering = ${data.auto_numbering || true},
        allow_duplicate_batch_number = ${data.allow_duplicate_batch_number ?? data.allowDuplicateBatchNumber ?? false},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Database update error:", error)
    return NextResponse.json({ error: "Failed to update system settings" }, { status: 500 })
  }
}
