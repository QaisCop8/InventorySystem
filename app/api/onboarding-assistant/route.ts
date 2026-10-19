import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

const ensureState = async () => { return runSchemaOnce("app/api/onboarding-assistant/route.ts#ensureState", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS onboarding_assistant_state (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      current_step INTEGER NOT NULL DEFAULT 0,
      wizard_version INTEGER NOT NULL DEFAULT 1,
      dismissed BOOLEAN NOT NULL DEFAULT FALSE,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE onboarding_assistant_state ADD COLUMN IF NOT EXISTS wizard_version INTEGER NOT NULL DEFAULT 1`
}) }

// شركة "جديدة": لا أصناف ولا سندات بعد — تُوجَّه للبداية السريعة مباشرة عند الدخول (انظر app/page.tsx).
const isNewCompany = async () => {
  const rows = await sql`
    SELECT
      (SELECT COUNT(*) FROM products)::int AS products,
      (CASE WHEN to_regclass('voucher_header_tbl') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM voucher_header_tbl)::int END) AS vouchers
  `.catch(() => [{ products: 0, vouchers: 0 }])
  return Number(rows[0]?.products || 0) === 0 && Number(rows[0]?.vouchers || 0) === 0
}

export async function GET() {
  try {
    await ensureState()
    const state = await sql`SELECT current_step, wizard_version, dismissed, completed FROM onboarding_assistant_state WHERE id = 1`
    if (state.length) {
      const shouldShow = !state[0].dismissed && !state[0].completed
      return NextResponse.json({ ...state[0], shouldShow, isNewCompany: shouldShow ? await isNewCompany() : false })
    }

    const counts = await sql`
      SELECT
        (SELECT COUNT(*) FROM account_tbl) AS accounts,
        (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM customers) AS customers
    `
    const fresh = Number(counts[0]?.accounts || 0) === 0 && Number(counts[0]?.products || 0) === 0 && Number(counts[0]?.customers || 0) === 0
    if (fresh) {
      await sql`INSERT INTO onboarding_assistant_state (id, current_step) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`
    }
    return NextResponse.json({ current_step: 0, wizard_version: 1, dismissed: false, completed: false, shouldShow: fresh, isNewCompany: fresh ? await isNewCompany() : false })
  } catch (error) {
    console.error("onboarding assistant GET", error)
    return NextResponse.json({ error: "تعذر تحميل حالة البداية السريعة" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureState()
    const body = await request.json()
    const step = Math.max(0, Math.min(9, Number(body.current_step) || 0))
    const wizardVersion = Math.max(1, Math.min(2, Number(body.wizard_version) || 1))
    await sql`
      INSERT INTO onboarding_assistant_state (id, current_step, wizard_version, dismissed, completed, updated_at)
      VALUES (1, ${step}, ${wizardVersion}, ${Boolean(body.dismissed)}, ${Boolean(body.completed)}, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        current_step = EXCLUDED.current_step,
        wizard_version = EXCLUDED.wizard_version,
        dismissed = EXCLUDED.dismissed,
        completed = EXCLUDED.completed,
        updated_at = CURRENT_TIMESTAMP
    `
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("onboarding assistant POST", error)
    return NextResponse.json({ error: "تعذر حفظ تقدم البداية السريعة" }, { status: 500 })
  }
}
