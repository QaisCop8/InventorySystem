import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeFile, authorizeFileRead, projectFileLookup } from "@/lib/file-permissions"
import { runSchemaOnce } from "@/lib/schema-once"

// الأرقام تُكمَّل لأربع خانات (1 ⇐ 0001)
const padCode = (value: unknown) => { const code = String(value ?? "").trim(); return /^\d{1,4}$/.test(code) ? code.padStart(4, "0") : code }

// رمز السويفت (SWIFT/BIC) للحوالات البنكية: 8 أو 11 حرفاً/رقماً إنجليزياً
// لكل قاعدة شركة (runSchemaOnce) — علَم واحد على مستوى العملية كان يضيف العمود لأول شركة فقط فتفشل بقية الشركات
const ensureSwiftColumn = () => runSchemaOnce("app/api/banks/route.ts#ensureSwiftColumn", async () => {
  await sql`ALTER TABLE banks ADD COLUMN IF NOT EXISTS swift_code VARCHAR(11)`
})
const normalizeSwift = (value: unknown): { swift: string | null; error?: string } => {
  const swift = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "")
  if (!swift) return { swift: null }
  return /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(swift) ? { swift } : { swift: null, error: "رمز السويفت (Swift Code) يجب أن يكون 8 أو 11 حرفاً/رقماً إنجليزياً" }
}

export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeFileRead(request, ["banks", "branches", "bank-accounts", "credit-cards"])
    if (!authorization.ok) return authorization.response
    await sql`
      CREATE TABLE IF NOT EXISTS banks (
        id SERIAL PRIMARY KEY,
        bank_code VARCHAR(10) UNIQUE NOT NULL,
        bank_name VARCHAR(100) NOT NULL,
        bank_name_en VARCHAR(100),
        status INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // رقم البنك 4 خانات: الأرقام الأقصر تُكمَّل بأصفار (ما لم يتعارض مع رقم قائم)
    await sql`UPDATE banks b SET bank_code = LPAD(b.bank_code, 4, '0') WHERE b.bank_code ~ '^[0-9]{1,3}$' AND NOT EXISTS (SELECT 1 FROM banks o WHERE o.bank_code = LPAD(b.bank_code, 4, '0'))`
    await ensureSwiftColumn()
    const banks = await sql`
      SELECT id, bank_code, bank_name, bank_name_en, swift_code, status, created_at, updated_at
      FROM banks
      WHERE status != 3
      ORDER BY bank_code ASC NULLS LAST, id
    `

    return NextResponse.json(authorization.lookupOnly ? projectFileLookup("banks", banks) : banks)
  } catch (error) {
    console.error("Error fetching banks:", error)
    return NextResponse.json({ error: "تعذر تحميل البنوك" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeFile(request, "banks", "create")
    if (!authorization.ok) return authorization.response
    const data = await request.json()

    if (!data.bank_code || !data.bank_name) {
      return NextResponse.json({ error: "رقم البنك واسم البنك مطلوبان" }, { status: 400 })
    }
    data.bank_code = padCode(data.bank_code)

    const existingBank = await sql`
      SELECT id FROM banks WHERE bank_code = ${data.bank_code}
    `

    if (existingBank.length > 0) {
      return NextResponse.json({ error: "رقم البنك موجود مسبقاً" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)
    const swift = normalizeSwift(data.swift_code)
    if (swift.error) return NextResponse.json({ error: swift.error }, { status: 400 })
    await ensureSwiftColumn()
    const result = await sql`
      INSERT INTO banks (bank_code, bank_name, bank_name_en, swift_code, status)
      VALUES (${data.bank_code}, ${data.bank_name}, ${data.bank_name_en || ""}, ${swift.swift}, ${status})
      RETURNING *
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating bank:", error)
    return NextResponse.json({ error: "تعذر حفظ البنك" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    const authorization = await authorizeFile(request, "banks", Number(data.status) === 3 ? "delete" : "update")
    if (!authorization.ok) return authorization.response

    if (!data.id) {
      return NextResponse.json({ error: "معرف البنك مطلوب" }, { status: 400 })
    }

    if (data.bank_code) data.bank_code = padCode(data.bank_code)
    if (!data.bank_code || String(data.bank_code).trim().length > 4) {
      return NextResponse.json({ error: "رقم البنك يجب أن يتكون من 1 إلى 4 أحرف" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)
    const swift = normalizeSwift(data.swift_code)
    if (swift.error) return NextResponse.json({ error: swift.error }, { status: 400 })
    await ensureSwiftColumn()

    if (status === 3) {
      await sql`
        CREATE TABLE IF NOT EXISTS branches (
          id SERIAL PRIMARY KEY,
          branch_code VARCHAR(20),
          branch_name VARCHAR(100),
          bank_id INTEGER,
          status INTEGER DEFAULT 1
        )
      `

      await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS bank_id INTEGER`
      await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`

      const linkedBranches = await sql`
        SELECT id
        FROM branches
        WHERE bank_id = ${data.id}
          AND status != 3
        LIMIT 1
      `

      if (linkedBranches.length > 0) {
        return NextResponse.json(
          { error: "يوجد فروع مرتبطة مع البنك لا يمكن حذفه" },
          { status: 409 },
        )
      }
    }

    const result = await sql`
      UPDATE banks
      SET
        bank_code = ${String(data.bank_code).trim()},
        bank_name = ${data.bank_name},
        bank_name_en = ${data.bank_name_en || ""},
        swift_code = CASE WHEN ${"swift_code" in data}::boolean THEN ${swift.swift} ELSE swift_code END,
        status = ${status},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "البنك غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating bank:", error)
    return NextResponse.json({ error: "تعذر تعديل البنك" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authorization = await authorizeFile(request, "banks", "delete")
    if (!authorization.ok) return authorization.response
    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: "معرف البنك مطلوب" }, { status: 400 })
    }

    const result = await sql`
      DELETE FROM banks
      WHERE id = ${data.id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "البنك غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting bank:", error)
    return NextResponse.json({ error: "Failed to delete bank" }, { status: 500 })
  }
}
