import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
// --- Database setup ---


// =========================
// GET - List all salesmen
// =========================
export async function GET() {
  try {
    const rows = await sql`
      SELECT * FROM salesmen ORDER BY id ASC
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
    const { code, name, is_active } = await request.json();

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
      INSERT INTO salesmen (code, name, is_active)
      VALUES (${code}, ${name}, ${is_active ?? true})
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
    const { id, code, name, is_active } = await request.json();

    if (!id) {
      return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 });
    }

    const updated = await sql`
      UPDATE salesmen
      SET 
        code = COALESCE(${code}, code),
        name = COALESCE(${name}, name),
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
