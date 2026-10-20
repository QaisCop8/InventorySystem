import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { AutoJournalError } from "@/lib/auto-journals"
import { YearClosingError, ensureYearClosingSchema, executeYearClosing, listYearClosings, previewYearClosing, reverseYearClosing } from "@/lib/year-end-closing"
import { workingPeriodErrorMessage } from "@/lib/working-period"

// معالج إقفال السنة المالية — GET: السجل (+ year=…&retained_account_id=… معاينة وفحوصات)، POST: تنفيذ الإقفال،
// PATCH {id, action:"reverse"}: التراجع عن إقفال.
const validYear = (value: unknown) => { const year = Number(value); return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null }

const failure = (error: unknown, fallback: string, tag: string) => {
  if (error instanceof YearClosingError || error instanceof AutoJournalError) return NextResponse.json({ error: error.message }, { status: 400 })
  const periodError = workingPeriodErrorMessage(error)
  if (periodError) return NextResponse.json({ error: periodError }, { status: 400 })
  console.error(`[year-end-closing] ${tag} failed`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "year_end_closing", "view")
    if (!authorization.ok) return authorization.response
    await ensureYearClosingSchema()
    const params = request.nextUrl.searchParams
    const year = validYear(params.get("year"))
    if (year) {
      const preview = await previewYearClosing(year, Number(params.get("retained_account_id")) || null)
      return NextResponse.json(preview)
    }
    const [closings, years, lastRetained] = await Promise.all([
      listYearClosings(),
      sql`SELECT DISTINCT EXTRACT(YEAR FROM vch_date)::int AS year FROM voucher_header_tbl WHERE status <> 3 AND vch_date IS NOT NULL ORDER BY 1 DESC`,
      sql`SELECT retained_account_id FROM fiscal_year_closings_tbl ORDER BY id DESC LIMIT 1`,
    ])
    const closed = new Set((closings as any[]).filter((row) => Number(row.status) !== 3).map((row) => Number(row.fiscal_year)))
    const activeYears = (years as any[]).map((row) => Number(row.year)).filter(Boolean)
    // السنة المقترحة: أقدم سنة سابقة للسنة الحالية لم تُقفل بعد، وإلا السنة السابقة.
    const currentYear = new Date().getFullYear()
    const suggested = [...activeYears].sort((a, b) => a - b).find((value) => value < currentYear && !closed.has(value)) ?? currentYear - 1
    return NextResponse.json({
      closings, years: activeYears, suggested_year: suggested,
      default_retained_account_id: (lastRetained as any[])[0]?.retained_account_id ?? null,
    })
  } catch (error) {
    return failure(error, "تعذر تحميل بيانات إقفال السنة", "GET")
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "year_end_closing", "create")
    if (!authorization.ok) return authorization.response
    await ensureYearClosingSchema()
    const data = await request.json().catch(() => ({}))
    const year = validYear(data.year)
    const retainedAccountId = Number(data.retained_account_id)
    if (!year) return NextResponse.json({ error: "حدّد السنة المالية" }, { status: 400 })
    if (!(retainedAccountId > 0)) return NextResponse.json({ error: "اختر حساب الأرباح المدورة" }, { status: 400 })
    const result = await withTenantTransaction(() => executeYearClosing({
      year, retainedAccountId, userId: String(authorization.userId), fallbackBranchId: authorization.branchId,
      lockYear: data.lock_year !== false, advanceWorkingYear: data.advance_working_year === true,
      note: String(data.note || "").slice(0, 300),
    }))
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return failure(error, "تعذر إقفال السنة المالية", "POST")
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "year_end_closing", "delete")
    if (!authorization.ok) return authorization.response
    await ensureYearClosingSchema()
    const data = await request.json().catch(() => ({}))
    const id = Number(data.id)
    if (!id || data.action !== "reverse") return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 })
    await withTenantTransaction(() => reverseYearClosing(id, String(authorization.userId)))
    return NextResponse.json({ success: true })
  } catch (error) {
    return failure(error, "تعذر التراجع عن الإقفال", "PATCH")
  }
}
