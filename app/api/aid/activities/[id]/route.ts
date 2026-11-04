import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { AidInputError, aidLedgerSummary, ensureAidTables } from "@/lib/aid-program"
import { parseActivity, saveActivityChildren } from "../../_payload"

type Context = { params: Promise<{ id: string }> }

// نشاط مساعدة واحد: GET التفاصيل + ملخص الدفاتر الثلاثة، PUT تعديل، DELETE حذف (فقط إن لم تُسجَّل عليه أي حركة)
export async function GET(request: NextRequest, context: Context) {
  try {
    const authorization = await authorizeTransaction(request, "aid_program", "view")
    if (!authorization.ok) return authorization.response
    await ensureAidTables()
    const id = Number((await context.params).id)
    const summary = await aidLedgerSummary(id)
    if (!summary) return NextResponse.json({ error: "النشاط غير موجود" }, { status: 404 })
    const [items, points, account] = await Promise.all([
      sql`
        SELECT i.product_id, i.category_id, p.product_code, p.product_name, g.group_name category_name
        FROM aid_activity_items_tbl i
        LEFT JOIN products p ON p.id = i.product_id
        LEFT JOIN item_groups g ON g.id = i.category_id
        WHERE i.activity_id = ${id} ORDER BY i.id`,
      sql`SELECT pos_point_id FROM aid_activity_points_tbl WHERE activity_id = ${id}`,
      sql`SELECT id, code, name FROM account_tbl WHERE id = ${Number(summary.activity.donor_account_id)}`,
    ])
    return NextResponse.json({
      ...summary,
      activity: {
        ...summary.activity,
        start_date: String(summary.activity.start_date).slice(0, 10), end_date: String(summary.activity.end_date).slice(0, 10),
        donor_account_code: account[0]?.code || "", donor_account_name: account[0]?.name || "",
        items, points: points.map((row: any) => Number(row.pos_point_id)),
      },
    })
  } catch (error) {
    console.error("[aid activity] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل النشاط" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    const authorization = await authorizeTransaction(request, "aid_program", "update")
    if (!authorization.ok) return authorization.response
    await ensureAidTables()
    const id = Number((await context.params).id)
    const payload = await parseActivity(await request.json().catch(() => ({})))
    await withTenantTransaction(async () => {
      const current = (await sql`SELECT * FROM aid_activities_tbl WHERE id = ${id} FOR UPDATE`)[0] as any
      if (!current) throw new AidInputError("النشاط غير موجود", 404)
      const used = (await sql`
        SELECT COUNT(*)::int entries, COALESCE(-SUM(program_delta), 0) allocated FROM aid_ledger_tbl WHERE activity_id = ${id}`)[0] as any
      if (Number(used.entries) > 0 && Number(current.currency_id) !== payload.currency_id) throw new AidInputError("لا يمكن تغيير عملة نشاط عليه حركات")
      if (payload.budget + 0.004 < Number(used.allocated)) throw new AidInputError(`الميزانية لا يمكن أن تقل عن الموزّع فعلاً (${Number(used.allocated).toFixed(2)})`)
      await sql`
        UPDATE aid_activities_tbl SET name = ${payload.name}, donor_name = ${payload.donor_name}, donor_account_id = ${payload.donor_account_id},
          currency_id = ${payload.currency_id}, amount_per_participant = ${payload.amount_per_participant}, budget = ${payload.budget},
          start_date = ${payload.start_date}, end_date = ${payload.end_date}, all_items = ${payload.all_items}, all_points = ${payload.all_points},
          max_redemptions = ${payload.max_redemptions}, status = ${payload.status}, notes = ${payload.notes}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}`
      await saveActivityChildren(id, payload)
    })
    return NextResponse.json({ id })
  } catch (error) {
    if (error instanceof AidInputError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[aid activity] PUT failed", error)
    return NextResponse.json({ error: "تعذر حفظ النشاط" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const authorization = await authorizeTransaction(request, "aid_program", "delete")
    if (!authorization.ok) return authorization.response
    await ensureAidTables()
    const id = Number((await context.params).id)
    await withTenantTransaction(async () => {
      if ((await sql`SELECT 1 FROM aid_ledger_tbl WHERE activity_id = ${id} LIMIT 1`).length) {
        throw new AidInputError("لا يمكن حذف نشاط عليه حركات — أغلقه بتغيير حالته إلى «مغلق»")
      }
      await sql`DELETE FROM aid_participants_tbl WHERE activity_id = ${id}`
      await sql`DELETE FROM aid_activities_tbl WHERE id = ${id}`
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AidInputError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[aid activity] DELETE failed", error)
    return NextResponse.json({ error: "تعذر حذف النشاط" }, { status: 500 })
  }
}
