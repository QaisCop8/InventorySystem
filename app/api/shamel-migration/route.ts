import { type NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { authorizeUserAdmin } from "@/lib/user-admin-access"
import { moduleDeniedResponse } from "@/lib/company-modules"
import { newPortalSecret, portalToken, sha256Hex } from "@/lib/customer-portal"
import { ensureShamelMigrationTables } from "@/lib/shamel-migration/core"
import { SHAMEL_VOUCHER_TYPES, cleanVoucherTypes } from "@/lib/shamel-migration/vouchers"

// شاشة «ترحيل من الشامل» (مسؤول النظام فقط): إنشاء رمز تشغيل لمعالج الترحيل، متابعة التقدم، وسجل الأخطاء.

export async function GET(request: NextRequest) {
  const admin = await authorizeUserAdmin(request)
  if (!admin.ok) return admin.response
  const denied = await moduleDeniedResponse("data_migration")
  if (denied) return denied
  try {
    await ensureShamelMigrationTables()
    const runId = Number(request.nextUrl.searchParams.get("run_id") || 0)
    if (runId > 0) {
      const level = request.nextUrl.searchParams.get("level") || ""
      const step = request.nextUrl.searchParams.get("step") || ""
      const log = await sql`
        SELECT id, step, level, ref, message, created_at FROM shamel_migration_log
        WHERE run_id = ${runId} AND (${level}::text = '' OR level = ${level}::text) AND (${step}::text = '' OR step = ${step}::text)
        ORDER BY id DESC LIMIT 2000`
      // ملخص الأسباب: نفس الرسالة (بعد إزالة الأرقام/الرموز منها) مجمّعة بعددها لكل خطوة — سبب واحد شائع لا يغطّي البقية
      const summary = await sql`
        SELECT step, level, MIN(message) AS message, COUNT(*)::int AS count, MIN(ref) AS sample_ref
        FROM shamel_migration_log
        WHERE run_id = ${runId} AND level <> 'info' AND (${level}::text = '' OR level = ${level}::text) AND (${step}::text = '' OR step = ${step}::text)
        GROUP BY step, level, regexp_replace(message, '[A-Za-z0-9._-]{3,}', '#', 'g')
        ORDER BY COUNT(*) DESC LIMIT 100`
      const [total] = await sql`
        SELECT COUNT(*)::int AS n FROM shamel_migration_log
        WHERE run_id = ${runId} AND (${level}::text = '' OR level = ${level}::text) AND (${step}::text = '' OR step = ${step}::text)`
      return NextResponse.json({ log, summary, total: Number((total as any)?.n || 0) })
    }
    const runs = await sql`SELECT id, mode, voucher_types, from_date::text AS from_date, balance_date::text AS balance_date, status, current_step, progress, message, created_at, last_seen_at, finished_at, expires_at FROM shamel_migration_runs ORDER BY id DESC LIMIT 20`
    const counts = await sql`
      SELECT run_id, COUNT(*) FILTER (WHERE level = 'error')::int AS errors, COUNT(*) FILTER (WHERE level = 'warn')::int AS warnings
      FROM shamel_migration_log WHERE run_id = ANY(${runs.map((run: any) => Number(run.id))}::int[]) GROUP BY run_id`
    const countByRun = new Map(counts.map((row: any) => [Number(row.run_id), row]))
    return NextResponse.json({
      runs: runs.map((run: any) => ({ ...run, errors: Number((countByRun.get(Number(run.id)) as any)?.errors || 0), warnings: Number((countByRun.get(Number(run.id)) as any)?.warnings || 0) })),
      voucherTypes: SHAMEL_VOUCHER_TYPES.map(({ prefix, title, kind }) => ({ prefix, title, kind })),
    })
  } catch (error) {
    console.error("shamel migration GET failed:", error)
    return NextResponse.json({ error: "تعذر تحميل بيانات الترحيل" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const admin = await authorizeUserAdmin(request)
  if (!admin.ok) return admin.response
  const denied = await moduleDeniedResponse("data_migration")
  if (denied) return denied
  try {
    await ensureShamelMigrationTables()
    const body = await request.json().catch(() => ({}))
    const mode = body?.mode === "full" ? "full" : "definitions"
    const voucherTypes = mode === "full" ? cleanVoucherTypes(body?.voucher_types) : []
    if (mode === "full" && !voucherTypes.length) return NextResponse.json({ error: "اختر نوع سند واحداً على الأقل" }, { status: 400 })
    const balanceDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.balance_date || "")) ? String(body.balance_date) : new Date().toISOString().slice(0, 10)
    const branch = (await sql`SELECT id FROM branches WHERE COALESCE(is_bank_branch, false) = false ORDER BY id LIMIT 1`)[0] as any
    if (!branch) return NextResponse.json({ error: "لا يوجد فرع للشركة — عرّف الفرع الرئيسي أولاً" }, { status: 400 })

    // تشغيل واحد فعّال: الرموز السابقة غير المكتملة تُلغى
    await sql`UPDATE shamel_migration_runs SET status = 'cancelled', finished_at = NOW() WHERE status IN ('pending', 'running')`
    const secret = newPortalSecret()
    const [run] = await sql`
      INSERT INTO shamel_migration_runs (token_hash, mode, voucher_types, balance_date, branch_id, created_by, expires_at)
      VALUES (${await sha256Hex(secret)}, ${mode}, ${voucherTypes}::text[], ${balanceDate}, ${Number(branch.id)}, ${admin.userId}, NOW() + INTERVAL '3 days')
      RETURNING id, mode, voucher_types, from_date::text AS from_date, balance_date::text AS balance_date, status, current_step, progress, message, created_at, last_seen_at, finished_at, expires_at`
    return NextResponse.json({ run, token: portalToken(await resolveCurrentDbName(), secret) }, { status: 201 })
  } catch (error) {
    console.error("shamel migration POST failed:", error)
    return NextResponse.json({ error: "تعذر إنشاء رمز الترحيل" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await authorizeUserAdmin(request)
  if (!admin.ok) return admin.response
  const denied = await moduleDeniedResponse("data_migration")
  if (denied) return denied
  await ensureShamelMigrationTables()
  const id = Number(request.nextUrl.searchParams.get("id") || 0)
  await sql`UPDATE shamel_migration_runs SET status = 'cancelled', finished_at = NOW() WHERE id = ${id} AND status IN ('pending', 'running')`
  return NextResponse.json({ ok: true })
}
