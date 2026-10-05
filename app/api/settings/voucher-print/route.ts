import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSystemSettings } from "@/lib/system-settings"
import { normalizePrintSettings, voucherFamily } from "@/lib/voucher-print/settings"
import { normalizeReportSettings, REPORT_SETTINGS_ID } from "@/lib/voucher-print/report-settings"

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS voucher_print_settings_tbl (
      voucher_type_id INTEGER PRIMARY KEY,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
}

async function companyInfo() {
  const settings = await getSystemSettings()
  const text = (key: string) => String(settings[key] ?? "")
  return {
    name: text("company_name"),
    address: text("company_address"),
    phone: text("company_phone"),
    email: text("company_email"),
    taxNumber: text("tax_number"),
    logo: text("company_logo"),
  }
}

const parseId = (value: string | null) => {
  if (value === null || value.trim() === "") return null
  const id = Number(value)
  return Number.isInteger(id) && id >= 0 ? id : null
}

export async function GET(request: NextRequest) {
  try {
    await ensureTable()
    if (request.nextUrl.searchParams.get("scope") === "report") {
      const row = (await sql`SELECT settings FROM voucher_print_settings_tbl WHERE voucher_type_id = ${REPORT_SETTINGS_ID}`)[0]
      return NextResponse.json({ settings: normalizeReportSettings(row?.settings), company: await companyInfo() })
    }
    const voucherTypeId = parseId(request.nextUrl.searchParams.get("voucher_type_id"))
    const rows = await sql`SELECT voucher_type_id, settings FROM voucher_print_settings_tbl WHERE voucher_type_id >= 0`
    const stored = new Map<number, any>(rows.map((row: any) => [Number(row.voucher_type_id), row.settings]))
    const defaults = normalizePrintSettings(stored.get(0))

    if (voucherTypeId !== null) {
      const own = stored.get(voucherTypeId)
      return NextResponse.json({
        settings: own ? normalizePrintSettings({ ...defaults, ...own }) : defaults,
        inherited: !own,
        company: await companyInfo(),
      })
    }

    const types = await sql`SELECT id, name FROM voucher_types_tbl WHERE COALESCE(status, 1) != 3 ORDER BY id`
    return NextResponse.json({
      defaults,
      voucherTypes: types.map((row: any) => ({
        id: Number(row.id),
        name: String(row.name),
        family: voucherFamily(row.name),
        configured: stored.has(Number(row.id)),
      })),
      overrides: Object.fromEntries(
        [...stored.entries()].filter(([id]) => id !== 0).map(([id, value]) => [id, normalizePrintSettings({ ...defaults, ...value })]),
      ),
      company: await companyInfo(),
    })
  } catch (error) {
    console.error("voucher print settings GET", error)
    return NextResponse.json({ error: "تعذر تحميل إعدادات الطباعة" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureTable()
    const body = await request.json()
    if (body?.scope === "report") {
      const settings = normalizeReportSettings(body.settings)
      await sql`
        INSERT INTO voucher_print_settings_tbl (voucher_type_id, settings, updated_at)
        VALUES (${REPORT_SETTINGS_ID}, ${JSON.stringify(settings)}::jsonb, NOW())
        ON CONFLICT (voucher_type_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()
      `
      return NextResponse.json({ success: true, settings })
    }
    const voucherTypeId = parseId(String(body?.voucher_type_id ?? ""))
    if (voucherTypeId === null) return NextResponse.json({ error: "نوع السند غير صالح" }, { status: 400 })
    if (voucherTypeId > 0) {
      const exists = await sql`SELECT 1 FROM voucher_types_tbl WHERE id = ${voucherTypeId}`
      if (!exists.length) return NextResponse.json({ error: "نوع السند غير موجود" }, { status: 404 })
    }
    const settings = normalizePrintSettings(body?.settings)
    await sql`
      INSERT INTO voucher_print_settings_tbl (voucher_type_id, settings, updated_at)
      VALUES (${voucherTypeId}, ${JSON.stringify(settings)}::jsonb, NOW())
      ON CONFLICT (voucher_type_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()
    `
    return NextResponse.json({ success: true, settings })
  } catch (error) {
    console.error("voucher print settings PUT", error)
    return NextResponse.json({ error: "تعذر حفظ إعدادات الطباعة" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureTable()
    const voucherTypeId = parseId(request.nextUrl.searchParams.get("voucher_type_id"))
    if (!voucherTypeId) return NextResponse.json({ error: "نوع السند غير صالح" }, { status: 400 })
    await sql`DELETE FROM voucher_print_settings_tbl WHERE voucher_type_id = ${voucherTypeId}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("voucher print settings DELETE", error)
    return NextResponse.json({ error: "تعذر إعادة ضبط الإعدادات" }, { status: 500 })
  }
}
