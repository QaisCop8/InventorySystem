import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureReportAuditTables, REPORT_AUDIT_ACTION_LABELS, type ReportAuditAction } from "@/lib/report-audit"
import { reportAccessDenied } from "@/lib/report-permissions"
import { getSessionUser } from "@/lib/tenant-auth"

const REPORT_SECTION = "report-audit-report"
const ACTIONS = new Set<ReportAuditAction>(["open", "run", "print", "pdf", "whatsapp"])

export async function GET(request: NextRequest) {
  try {
    const denied = await reportAccessDenied(request, [REPORT_SECTION])
    if (denied) return denied
    await ensureReportAuditTables()
    const params = request.nextUrl.searchParams
    const from = params.get("from") || null
    const to = params.get("to") || null
    const action = params.get("action") || ""
    const reportKey = params.get("report") || ""
    const userId = params.get("user_id") || ""
    const search = (params.get("q") || "").trim()
    const limit = Math.min(Math.max(Number(params.get("limit") || 500), 1), 3000)

    const rows = await sql`
      SELECT l.*, b.branch_name
      FROM report_audit_log_tbl l
      LEFT JOIN branches b ON b.id = l.branch_id
      WHERE (${from}::date IS NULL OR l.created_at >= ${from}::date)
        AND (${to}::date IS NULL OR l.created_at < ${to}::date + 1)
        AND (${action} = '' OR l.action = ${action})
        AND (${reportKey} = '' OR l.report_key = ${reportKey})
        AND (${userId} = '' OR l.user_id = ${userId})
        AND (${search} = '' OR l.report_title ILIKE ${"%" + search + "%"} OR l.filters::text ILIKE ${"%" + search + "%"} OR l.user_name ILIKE ${"%" + search + "%"})
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ${limit}
    `
    const users = await sql`SELECT DISTINCT user_id, user_name FROM report_audit_log_tbl WHERE user_id IS NOT NULL ORDER BY user_name NULLS LAST LIMIT 500`
    const reports = await sql`SELECT report_key, MAX(report_title) AS report_title FROM report_audit_log_tbl WHERE report_key IS NOT NULL GROUP BY report_key ORDER BY 2`
    return NextResponse.json({ rows, users, reports, actions: REPORT_AUDIT_ACTION_LABELS })
  } catch (error) {
    console.error("[report-audit] GET failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل أرشيف التقارير" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const action = String(body.action || "") as ReportAuditAction
    if (!ACTIONS.has(action)) return NextResponse.json({ error: "نوع الحدث غير صالح" }, { status: 400 })
    const filters = Array.isArray(body.filters)
      ? body.filters.slice(0, 60).map((filter: any) => ({ label: String(filter?.label || "").slice(0, 120), value: String(filter?.value ?? "").slice(0, 400) }))
      : []
    const details: Record<string, unknown> = {}
    if (body.phone) details.phone = String(body.phone).slice(0, 30)
    if (body.recipient) details.recipient = String(body.recipient).slice(0, 150)
    if (body.channel) details.channel = String(body.channel).slice(0, 30)
    const branchId = Number(request.headers.get("x-branch-id") || 0) || null
    await ensureReportAuditTables()
    await sql`
      INSERT INTO report_audit_log_tbl (report_key, report_title, action, filters, branch_id, user_id, user_name, details)
      VALUES (
        ${String(body.report_key || "").slice(0, 120) || null}, ${String(body.report_title || "").slice(0, 250) || null}, ${action},
        ${JSON.stringify(filters)}::jsonb, ${branchId}, ${String(user.user_id)}, ${user.full_name || user.username || null},
        ${Object.keys(details).length ? JSON.stringify(details) : null}::jsonb
      )
    `
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[report-audit] POST failed", error)
    return NextResponse.json({ error: "تعذر تسجيل الحدث" }, { status: 500 })
  }
}
