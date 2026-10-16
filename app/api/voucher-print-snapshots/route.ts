import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { runSchemaOnce } from "@/lib/schema-once"

// لقطة إعدادات الطباعة وبيانات الشركة عند طباعة "النسخة الأصلية" لسند — طباعة "نسخة" لاحقاً تستخدم اللقطة
// نفسها فتطابق الأصلية شكلاً حتى لو تغيّرت إعدادات الطباعة بعدها (lib/voucher-print/print.ts).
const ensureTable = () => runSchemaOnce("app/api/voucher-print-snapshots#ensureTable", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS voucher_print_snapshots_tbl (
      vch_type INTEGER NOT NULL,
      vch_code VARCHAR(60) NOT NULL,
      settings JSONB NOT NULL,
      company JSONB NOT NULL,
      printed_by VARCHAR(100),
      printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (vch_type, vch_code)
    )
  `
})

const keyOf = (type: unknown, code: unknown) => {
  const vchType = Number(type)
  const vchCode = String(code ?? "").trim().slice(0, 60)
  return Number.isInteger(vchType) && vchType > 0 && vchCode ? { vchType, vchCode } : null
}

export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const key = keyOf(request.nextUrl.searchParams.get("vch_type"), request.nextUrl.searchParams.get("vch_code"))
    if (!key) return NextResponse.json({ snapshot: null })
    await ensureTable()
    const row = (await sql`SELECT settings, company, printed_at FROM voucher_print_snapshots_tbl WHERE vch_type = ${key.vchType} AND vch_code = ${key.vchCode}`)[0] as any
    return NextResponse.json({ snapshot: row ? { settings: row.settings, company: row.company, printed_at: row.printed_at } : null })
  } catch (error) {
    console.error("[voucher-print-snapshots] GET failed", error)
    return NextResponse.json({ snapshot: null })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const key = keyOf(body?.vch_type, body?.vch_code)
    if (!key || typeof body?.settings !== "object" || typeof body?.company !== "object") return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 })
    await ensureTable()
    // طباعة "أصلية" جديدة (بعد إلغاء ترحيل وإعادة ترحيل مثلاً) تُحدّث اللقطة
    await sql`
      INSERT INTO voucher_print_snapshots_tbl (vch_type, vch_code, settings, company, printed_by)
      VALUES (${key.vchType}, ${key.vchCode}, ${JSON.stringify(body.settings)}::jsonb, ${JSON.stringify(body.company)}::jsonb, ${String(user.user_id)})
      ON CONFLICT (vch_type, vch_code) DO UPDATE SET settings = EXCLUDED.settings, company = EXCLUDED.company, printed_by = EXCLUDED.printed_by, printed_at = NOW()
    `
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[voucher-print-snapshots] POST failed", error)
    return NextResponse.json({ error: "تعذر حفظ لقطة الطباعة" }, { status: 500 })
  }
}
