import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
// --- Database setup ---

async function ensureSalesmenSchema() {
  await sql`CREATE TABLE IF NOT EXISTS salesmen (id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE NOT NULL, name VARCHAR(200) NOT NULL, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
  await sql`ALTER TABLE salesmen ALTER COLUMN code TYPE VARCHAR(10)`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS other_name VARCHAR(200)`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS job_title VARCHAR(150)`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS classification VARCHAR(100)`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS region VARCHAR(150)`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS address TEXT`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS mobile VARCHAR(50)`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS email VARCHAR(150)`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS is_supervisor BOOLEAN DEFAULT false`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS supervisor_id INTEGER`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS sales_commission_percent NUMERIC(9,4) DEFAULT 0`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS collection_commission_percent NUMERIC(9,4) DEFAULT 0`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS portal_active BOOLEAN DEFAULT false`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS login_code VARCHAR(100)`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS portal_password VARCHAR(255)`
  await sql`ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS notes TEXT`
}


// =========================
// GET - List all salesmen
// =========================
export async function GET(request: NextRequest) {
  try {
    await ensureSalesmenSchema()
    const { searchParams } = new URL(request.url)
    const requestedCode = searchParams.get("code")?.trim().toUpperCase()
    if (requestedCode) {
      const found = await sql`SELECT s.*, supervisor.name AS supervisor_name FROM salesmen s LEFT JOIN salesmen supervisor ON supervisor.id=s.supervisor_id WHERE UPPER(s.code)=${requestedCode} LIMIT 1`
      return NextResponse.json({ success: true, data: found[0] || null })
    }
    if (searchParams.get("generate") === "1") {
      const settings = await sql`SELECT id,value FROM system_settings WHERE id IN ('salesman_prefix','salesman_start')`
      const values = Object.fromEntries(settings.map((row: any) => [row.id, row.value]))
      const prefix = String(values.salesman_prefix || "M").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 9)
      const start = Math.max(1, Number(values.salesman_start) || 1)
      const existing = await sql`SELECT code FROM salesmen WHERE code LIKE ${prefix + "%"}`
      const highest = existing.reduce((max: number, row: any) => { const suffix = String(row.code || "").slice(prefix.length); return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max }, start - 1)
      const code = `${prefix}${String(Math.max(start, highest + 1)).padStart(Math.max(1, 10 - prefix.length), "0")}`.slice(0, 10)
      return NextResponse.json({ success: true, code })
    }
    const rows = await sql`
      SELECT s.*, supervisor.name AS supervisor_name
      FROM salesmen s LEFT JOIN salesmen supervisor ON supervisor.id = s.supervisor_id
      ORDER BY s.id ASC
    `;

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("GET /salesmen error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch salesmen", data: [] }, { status: 500 });
  }
}

// =========================
// POST - Create new salesman
// =========================
export async function POST(request: NextRequest) {
  try {
    await ensureSalesmenSchema()
    const data = await request.json();
    const { code, name, is_active } = data;

    if (!code || !name) {
      return NextResponse.json(
        { success: false, error: "يجب ادخال رقم واسم المندوب" },
        { status: 400 }
      );
    }

    // 🔍 1) تحقق من وجود كود أو اسم مكرر
    const exists = await sql`
      SELECT id FROM salesmen 
      WHERE code = ${code} OR name = ${name}
      LIMIT 1
    `;

    if (exists.length > 0) {
      return NextResponse.json(
        { success: false, error: "رقم أو اسم المندوب موجود مسبقاً" },
        { status: 409 }
      );
    }

    const inserted = await sql`
      INSERT INTO salesmen (code, name, other_name, job_title, classification, region, address, mobile, email, is_supervisor, supervisor_id, sales_commission_percent, collection_commission_percent, portal_active, login_code, portal_password, notes, is_active)
      VALUES (${code}, ${name}, ${data.other_name || null}, ${data.job_title || null}, ${data.classification || null}, ${data.region || null}, ${data.address || null}, ${data.mobile || null}, ${data.email || null}, ${!!data.is_supervisor}, ${data.supervisor_id || null}, ${Number(data.sales_commission_percent) || 0}, ${Number(data.collection_commission_percent) || 0}, ${!!data.portal_active}, ${data.login_code || null}, ${data.portal_password || null}, ${data.notes || null}, ${is_active ?? true})
      RETURNING *
    `;

    return NextResponse.json({ success: true, data: inserted[0] });
  } catch (error: any) {
    console.error("POST /salesmen error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// =========================
// PUT - Update salesman
// =========================
export async function PUT(request: NextRequest) {
  try {
    await ensureSalesmenSchema()
    const data = await request.json();
    const { id, code, name, is_active } = data;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 });
    }

    const updated = await sql`
      UPDATE salesmen
      SET 
        code = COALESCE(${code}, code),
        name = COALESCE(${name}, name),
        other_name = ${data.other_name || null}, job_title = ${data.job_title || null}, classification = ${data.classification || null},
        region = ${data.region || null}, address = ${data.address || null}, mobile = ${data.mobile || null}, email = ${data.email || null},
        is_supervisor = ${!!data.is_supervisor}, supervisor_id = ${data.supervisor_id || null},
        sales_commission_percent = ${Number(data.sales_commission_percent) || 0}, collection_commission_percent = ${Number(data.collection_commission_percent) || 0},
        portal_active = ${!!data.portal_active}, login_code = ${data.login_code || null}, portal_password = ${data.portal_password || null}, notes = ${data.notes || null},
        is_active = COALESCE(${is_active}, is_active),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    return NextResponse.json({ success: true, data: updated[0] });
  } catch (error) {
    console.error("PUT /salesmen error:", error);
    return NextResponse.json({ success: false, error: "Failed to update salesman" }, { status: 500 });
  }
}

// =========================
// DELETE - Soft delete
// =========================
export async function DELETE(request: NextRequest) {
  try {
    await ensureSalesmenSchema()
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 });
    }

    const deleted = await sql`
      UPDATE salesmen
      SET is_active = false, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    return NextResponse.json({ success: true, data: deleted[0] });
  } catch (error) {
    console.error("DELETE /salesmen error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete salesman" }, { status: 500 });
  }
}
