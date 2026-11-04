import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { AidInputError, ensureAidTables } from "@/lib/aid-program"
import { parseActivity, saveActivityChildren } from "../_payload"

// أنشطة المساعدة: GET القائمة مع أرصدتها (و?lookup=1 للعملات ونقاط البيع ومجموعات الأصناف)، POST إنشاء نشاط
export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "aid_program", "view")
    if (!authorization.ok) return authorization.response
    await ensureAidTables()
    if (request.nextUrl.searchParams.get("lookup") === "1") {
      const [currencies, points, groups] = await Promise.all([
        sql`SELECT id, currency_code code, currency_name name FROM currency ORDER BY id`,
        sql`SELECT id, code, name, currency_id FROM pos_points_tbl WHERE COALESCE(status, 1) <> 3 ORDER BY name`.catch(() => []),
        sql`SELECT id, group_name name FROM item_groups ORDER BY group_name`.catch(() => []),
      ])
      return NextResponse.json({ currencies, points, groups })
    }
    const rows = await sql`
      SELECT a.id, a.name, a.donor_name, a.donor_account_id, acc.name donor_account_name, a.currency_id, c.currency_code,
        a.amount_per_participant, a.budget, a.start_date::text start_date, a.end_date::text end_date, a.status, a.all_items, a.all_points,
        a.budget + COALESCE(l.program, 0) unallocated, COALESCE(l.redeemed, 0) redeemed, COALESCE(l.vendor_due, 0) vendor_due,
        COALESCE(p.count, 0)::int participant_count, COALESCE(p.balance, 0) participant_balance
      FROM aid_activities_tbl a
      LEFT JOIN account_tbl acc ON acc.id = a.donor_account_id
      LEFT JOIN currency c ON c.id = a.currency_id
      LEFT JOIN LATERAL (
        SELECT SUM(program_delta) program, SUM(vendor_delta) vendor_due,
          SUM(CASE entry_type WHEN 'redeem' THEN amount WHEN 'reverse' THEN -amount ELSE 0 END) redeemed
        FROM aid_ledger_tbl WHERE activity_id = a.id
      ) l ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) count, SUM(balance) balance FROM aid_participants_tbl WHERE activity_id = a.id) p ON TRUE
      ORDER BY a.status, a.start_date DESC, a.id DESC`
    return NextResponse.json({ rows })
  } catch (error) {
    console.error("[aid activities] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل أنشطة المساعدة" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "aid_program", "create")
    if (!authorization.ok) return authorization.response
    await ensureAidTables()
    const payload = await parseActivity(await request.json().catch(() => ({})))
    const saved = await withTenantTransaction(async () => {
      const row = (await sql`
        INSERT INTO aid_activities_tbl (name, donor_name, donor_account_id, currency_id, amount_per_participant, budget, start_date, end_date,
          all_items, all_points, max_redemptions, status, notes, created_by)
        VALUES (${payload.name}, ${payload.donor_name}, ${payload.donor_account_id}, ${payload.currency_id}, ${payload.amount_per_participant},
          ${payload.budget}, ${payload.start_date}, ${payload.end_date}, ${payload.all_items}, ${payload.all_points}, ${payload.max_redemptions},
          ${payload.status}, ${payload.notes}, ${Number(authorization.userId)})
        RETURNING id`)[0] as any
      await saveActivityChildren(Number(row.id), payload)
      return { id: Number(row.id) }
    })
    return NextResponse.json(saved, { status: 201 })
  } catch (error) {
    if (error instanceof AidInputError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[aid activities] POST failed", error)
    return NextResponse.json({ error: "تعذر حفظ النشاط" }, { status: 500 })
  }
}
