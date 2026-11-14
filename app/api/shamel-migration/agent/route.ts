import { type NextRequest, NextResponse } from "next/server"
import sql, { isPortalTenantDb, withTenantDb } from "@/lib/database"
import { parsePortalToken, sha256Hex } from "@/lib/customer-portal"
import { StepContext, addStepProgress, ensureShamelMigrationTables, runFromRow, type MigrationRun } from "@/lib/shamel-migration/core"
import { findStep, stepsForRun } from "@/lib/shamel-migration/steps"
import { enabledModulesForDb } from "@/lib/company-modules"

// واجهة معالج الترحيل (برنامج ويندوز على جهاز العميل) — بلا جلسة: رمز التشغيل في ترويسة Authorization
// (مسار عام في middleware.ts). GET = قائمة الخطوات واستعلاماتها، POST = دفعة أسطر لخطوة أو إنهاء التشغيل.

export const maxDuration = 300

class AgentError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

async function withRun<T>(request: NextRequest, fn: (run: MigrationRun) => Promise<T>): Promise<T> {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim()
  const parsed = parsePortalToken(token)
  if (!parsed || !(await isPortalTenantDb(parsed.dbName))) throw new AgentError("رمز الترحيل غير صالح", 401)
  if (!(await enabledModulesForDb(parsed.dbName)).includes("data_migration")) throw new AgentError("وحدة ترحيل البيانات غير مفعّلة لهذه الشركة — تواصل مع إدارة النظام", 403)
  return withTenantDb(parsed.dbName, async () => {
    await ensureShamelMigrationTables()
    const row = (await sql`
      SELECT id, mode, voucher_types, from_date::text AS from_date, balance_date::text AS balance_date, branch_id, created_by, status
      FROM shamel_migration_runs
      WHERE token_hash = ${await sha256Hex(parsed.secret)} AND status IN ('pending', 'running') AND expires_at > NOW()
    `)[0]
    if (!row) throw new AgentError("رمز الترحيل غير صالح أو انتهى أو أُلغي — أنشئ رمزاً جديداً من شاشة «ترحيل من الشامل»", 401)
    return fn(runFromRow(row))
  })
}

const failure = (error: unknown) => {
  if (error instanceof AgentError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error("shamel migration agent failed:", error)
  return NextResponse.json({ error: error instanceof Error ? error.message : "خطأ غير متوقع" }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    return await withRun(request, async (run) => {
      await sql`UPDATE shamel_migration_runs SET last_seen_at = NOW() WHERE id = ${run.id}`
      const company = (await sql`SELECT value FROM system_settings WHERE id = 'company_name' LIMIT 1`.catch(() => []))[0] as any
      return NextResponse.json({
        run: { id: run.id, mode: run.mode, voucher_types: run.voucher_types, balance_date: run.balance_date, company: String(company?.value || "") },
        steps: stepsForRun(run).map((step) => ({ key: step.key, title: step.title, batchSize: step.batchSize, sql: step.sql(run) })),
      })
    })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") throw new AgentError("طلب غير صالح")
    return await withRun(request, async (run) => {
      if (body.action === "finish") {
        const failed = body.status === "failed"
        await sql`
          UPDATE shamel_migration_runs SET status = ${failed ? "failed" : "done"}, message = ${String(body.message || "").slice(0, 2000) || null},
            finished_at = NOW(), last_seen_at = NOW()
          WHERE id = ${run.id}`
        return NextResponse.json({ ok: true })
      }
      const step = findStep(String(body.step || ""))
      if (!step || !stepsForRun(run).some((item) => item.key === step.key)) throw new AgentError("خطوة غير معروفة")
      const rows = Array.isArray(body.rows) ? body.rows.filter((row: unknown) => row && typeof row === "object") : []
      const last = body.last === true
      const ctx = new StepContext(run, step.key)
      try {
        await step.process(rows, ctx, last)
      } catch (error) {
        ctx.error("", error instanceof Error ? error.message : String(error))
      }
      await ctx.flush()
      await addStepProgress(run.id, step.key, ctx.stats, last)
      return NextResponse.json({ ok: true, stats: ctx.stats })
    })
  } catch (error) {
    return failure(error)
  }
}
