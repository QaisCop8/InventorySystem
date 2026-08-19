import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureState = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS onboarding_assistant_state (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      current_step INTEGER NOT NULL DEFAULT 0,
      dismissed BOOLEAN NOT NULL DEFAULT FALSE,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `
}

export async function GET() {
  try {
    await ensureState()
    const state = await sql`SELECT current_step, dismissed, completed FROM onboarding_assistant_state WHERE id = 1`
    if (state.length) return NextResponse.json({ ...state[0], shouldShow: !state[0].dismissed && !state[0].completed })

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
    return NextResponse.json({ current_step: 0, dismissed: false, completed: false, shouldShow: fresh })
  } catch (error) {
    console.error("onboarding assistant GET", error)
    return NextResponse.json({ error: "تعذر تحميل حالة البداية السريعة" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureState()
    const body = await request.json()
    const step = Math.max(0, Math.min(7, Number(body.current_step) || 0))
    await sql`
      INSERT INTO onboarding_assistant_state (id, current_step, dismissed, completed, updated_at)
      VALUES (1, ${step}, ${Boolean(body.dismissed)}, ${Boolean(body.completed)}, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        current_step = EXCLUDED.current_step,
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
