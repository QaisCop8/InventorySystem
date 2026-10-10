import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { reportAccessDenied } from "@/lib/report-permissions"
import { reportAmountSql } from "@/lib/report-currency"
import { ensureAccountsTable } from "@/app/api/accounts/_lib"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"
import { COST_CENTER_REPORTS, type CostCenterReportKind } from "@/lib/cost-center-reports"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// تقارير مراكز التكلفة (منقولة من ShamelWeb/ShamelAPI — AccountsTransactionCostCenterReport،
// TrialBalanceCostCenterReport، IncomeStatementCostCenterReport، BalanceSheetCostCenterReport وكشف
// الحساب/الحركات مع مركز التكلفة). مصدر واحد: أسطر القيود (voucher_journal_detail_tbl) ومراكزها
// (voucher_costcenter_tbl). سطر عليه مركز تكلفة يُنسب بكامل مبلغه لمركزه (كما في شامل)؛ مركز فرعي يُجمع
// تحت المركز المختار الذي يتبعه. المبالغ بعملة التقرير (reportAmountSql) والصافي = مدين − دائن.
//
//  نوع التقرير (kind)            الشكل
//  statement-with-cc            كشف حساب مع إظهار مراكز تكلفة كل حركة
//  statement-by-cc              كشف حساب للحركات المحمّلة على المراكز المختارة (مع خيار التجميع حسب المركز)
//  accounts-movement-cc         حركة الحسابات للفترة: الحسابات × مراكز التكلفة
//  transactions-with-cc         تقرير الحركات مع إظهار مراكز التكلفة
//  trial-balance-cc             ميزان مراجعة: مراكز التكلفة (مع تفاصيل الحسابات)
//  trial-balance-accounts       ميزان مراجعة: الحسابات (مع تفاصيل مراكز التكلفة)
//  income-statement-cc          قائمة الدخل: الحسابات × مراكز التكلفة
//  balance-sheet-cc             الميزانية العمومية: الحسابات × مراكز التكلفة
//  income-statement-by-cc       قائمة الدخل للمراكز المختارة
//  balance-sheet-by-cc          الميزانية العمومية للمراكز المختارة
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Kind = CostCenterReportKind

const ids = (value: string | null) => String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
const isoDate = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)
const round = (value: number) => Math.round((Number(value) || 0) * 100) / 100
const voucherNames: Record<number, string> = { 3: "سند قيد", 4: "سند قبض", 5: "سند صرف", 6: "إشعار دائن", 7: "إشعار مدين", 8: "سند إدخال", 9: "سند إخراج", 10: "إرسالية داخلية", 11: "سند استعمال", 12: "فاتورة مبيعات", 13: "إرسالية مبيعات", 14: "إرسالية برسم البيع", 15: "مرتجع إرسالية برسم البيع", 16: "مرتجع مبيعات", 17: "فاتورة مشتريات", 18: "إرسالية مشتريات", 19: "مرتجع مشتريات", 21: "سند صرف شيكات" }

type Line = { line_id: number; account_id: number; credit_debit: number; amount: number; vch_date: string; voucher_id: number; vch_code: string; vch_type: number; note: string; centers: number[] }

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const p = request.nextUrl.searchParams
    const kind = (p.get("kind") && p.get("kind")! in COST_CENTER_REPORTS ? p.get("kind") : "accounts-movement-cc") as Kind
    const definition = COST_CENTER_REPORTS[kind]
    const denied = await reportAccessDenied(request, [definition.section])
    if (denied) return denied
    await ensureAccountsTable()
    await ensureVoucherTables()

    const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${user.user_id}`
    const permitted = memberships.map((row: any) => Number(row.branch_id)).filter(Number.isFinite)
    const branchIds = ids(p.get("branch_ids"))
    const effectiveBranches = branchIds.length ? branchIds.filter((id) => !permitted.length || permitted.includes(id)) : permitted
    if (branchIds.length && !effectiveBranches.length) return NextResponse.json({ error: "لا تملك صلاحية على الفروع المحددة" }, { status: 403 })

    const [accounts, currencies, branches, costTypes, costCenters] = await Promise.all([
      sql`SELECT a.id, a.code, a.name, a.level_no, a.father_id, a.finanical_list_id, a.finanical_list_assests_id, a.finanical_list_liabilities_id
          FROM account_tbl a WHERE COALESCE(a.status, 1) <> 3 ORDER BY a.code`,
      sql`SELECT id, currency_code, currency_name FROM currency WHERE COALESCE(is_active, true) ORDER BY id`,
      effectiveBranches.length
        ? sql`SELECT id, branch_code, branch_name FROM branches WHERE id = ANY(${effectiveBranches}::int[]) AND COALESCE(status, 1) <> 3 ORDER BY branch_name`
        : sql`SELECT id, branch_code, branch_name FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY branch_name`,
      sql`SELECT id, name FROM cost_center_types WHERE COALESCE(status, 1) <> 3 ORDER BY id`.catch(() => []),
      sql`SELECT id, name, cost_type_id, parent_id, level FROM cost_centers WHERE COALESCE(status, 1) <> 3 ORDER BY cost_type_id, level, name`.catch(() => []),
    ])
    const meta = { accounts, currencies, branches, cost_types: costTypes, cost_centers: costCenters }
    if (p.get("meta") === "1") return NextResponse.json({ meta })

    const today = new Date().toISOString().slice(0, 10)
    const fromDate = isoDate(p.get("from_date"), `${today.slice(0, 4)}-01-01`)
    const toDate = isoDate(p.get("to_date"), today)
    const costTypeId = Number(p.get("cost_type_id")) || 0
    const selectedCenters = ids(p.get("cost_center_ids"))
    const accountIds = ids(p.get("account_ids"))
    const level = Math.max(0, Number(p.get("level")) || 0)
    const costLevel = Math.max(0, Number(p.get("cost_level")) || 0)
    const financialList = [0, 1, 2].includes(Number(p.get("financial_list"))) ? Number(p.get("financial_list")) : 0
    const status = ["all", "posted"].includes(p.get("status") || "") ? p.get("status") : "all"
    const showDetails = p.get("show_details") === "1"

    const isStatement = kind === "statement-with-cc" || kind === "statement-by-cc"
    const needsCenters = kind !== "statement-with-cc" && kind !== "transactions-with-cc"
    if (needsCenters && !costTypeId && !selectedCenters.length) return NextResponse.json({ error: "اختر نوع مركز التكلفة" }, { status: 400 })
    if ((kind === "income-statement-by-cc" || kind === "balance-sheet-by-cc" || kind === "statement-by-cc") && !selectedCenters.length)
      return NextResponse.json({ error: "يجب اختيار مركز تكلفة واحد على الأقل" }, { status: 400 })
    if (isStatement && !accountIds.length) return NextResponse.json({ error: "اختر حساباً واحداً على الأقل" }, { status: 400 })

    const baseId = Number(currencies[0]?.id)
    const targetId = Number(p.get("report_currency_id") || baseId)
    const targetCurrency = currencies.find((currency: any) => Number(currency.id) === targetId)
    if (!targetCurrency) return NextResponse.json({ error: "العملة المحددة غير موجودة" }, { status: 400 })
    const amountSql = reportAmountSql(targetId, baseId)

    // ── مراكز التكلفة: شجرة + نطاق النوع/المراكز المختارة ──
    const centerById = new Map((costCenters as any[]).map((row) => [Number(row.id), row]))
    const typeOf = (id: number) => Number(centerById.get(id)?.cost_type_id || 0)
    const ancestorsOf = (id: number) => {
      const chain: number[] = []
      const seen = new Set<number>()
      let current: number | null = id
      while (current && !seen.has(current) && centerById.has(current)) {
        chain.push(current)
        seen.add(current)
        current = Number(centerById.get(current)?.parent_id) || null
      }
      return chain
    }
    const effectiveType = costTypeId || (selectedCenters.length ? typeOf(selectedCenters[0]) : 0)
    // العمود/الصف الذي يُنسب إليه مركز السطر: أول سلف ضمن المختارة، أو (بلا اختيار) المركز نفسه أو سلفه بالمستوى المطلوب
    const columnOf = (centerId: number): number | null => {
      if (effectiveType && typeOf(centerId) !== effectiveType) return null
      const chain = ancestorsOf(centerId)
      if (selectedCenters.length) return chain.find((id) => selectedCenters.includes(id)) ?? null
      if (costLevel > 0) return chain.find((id) => Number(centerById.get(id)?.level || 0) <= costLevel) ?? chain[chain.length - 1] ?? centerId
      return centerId
    }

    // ── الحسابات: شجرة، تصنيف القوائم المالية، والتجميع حسب المستوى ──
    const accountById = new Map((accounts as any[]).map((row) => [Number(row.id), row]))
    const accountAncestors = (id: number) => {
      const chain: any[] = []
      const seen = new Set<number>()
      let current: any = accountById.get(id)
      while (current && !seen.has(Number(current.id))) {
        chain.push(current)
        seen.add(Number(current.id))
        current = current.father_id ? accountById.get(Number(current.father_id)) : null
      }
      return chain
    }
    const accountScope = (accountId: number) => {
      const chain = accountAncestors(accountId)
      if (!chain.length) return null
      if (accountIds.length && !chain.some((row) => accountIds.includes(Number(row.id)))) return null
      const list = kind === "balance-sheet-cc" || kind === "balance-sheet-by-cc" ? 1 : kind === "income-statement-cc" || kind === "income-statement-by-cc" ? 2 : financialList
      if (list && !chain.some((row) => Number(row.finanical_list_id) === list)) return null
      const target = level > 0 ? chain.find((row) => Number(row.level_no) <= level) || chain[chain.length - 1] : chain[0]
      const sideRow = chain.find((row) => row.finanical_list_assests_id || row.finanical_list_liabilities_id)
      return { target, side: sideRow?.finanical_list_assests_id ? "assets" : sideRow?.finanical_list_liabilities_id ? "liabilities" : null }
    }

    // ── أسطر القيود ومراكزها ──
    const statusSql = status === "posted" ? "vh.status = 2" : "vh.status <> 3"
    const branchSql = effectiveBranches.length ? `vh.branch_id = ANY(ARRAY[${effectiveBranches.join(",")}]::int[])` : "TRUE"
    const accountSql = (kind === "statement-with-cc" || kind === "statement-by-cc" || kind === "transactions-with-cc") && accountIds.length
      ? `vjd.account_id IN (WITH RECURSIVE tree AS (SELECT id FROM account_tbl WHERE id = ANY(ARRAY[${accountIds.join(",")}]::int[]) UNION SELECT child.id FROM account_tbl child JOIN tree ON child.father_id = tree.id) SELECT id FROM tree)`
      : "TRUE"
    const typeIds = effectiveType ? [effectiveType] : []
    const taggedSql = needsCenters
      ? `EXISTS (SELECT 1 FROM voucher_costcenter_tbl t JOIN cost_centers tc ON tc.id = t.cost_center_id WHERE t.voucher_journal_id = vjd.id ${typeIds.length ? `AND tc.cost_type_id = ${typeIds[0]}` : ""})`
      : "TRUE"
    // الفترة: كشوف الحساب وموازين المراجعة والميزانية تحتاج ما قبل الفترة (رصيد افتتاحي/تراكمي)
    const needsOpening = isStatement || kind === "trial-balance-cc" || kind === "trial-balance-accounts" || kind === "balance-sheet-cc" || kind === "balance-sheet-by-cc"
    const fromSql = needsOpening ? "TRUE" : `vh.vch_date::date >= '${fromDate}'::date`

    const rawLines = (await sql`
      SELECT vjd.id AS line_id, vjd.account_id, vjd.credit_debit, (${sql.unsafe(amountSql)})::float AS amount,
        vh.vch_date::date::text AS vch_date, vh.id AS voucher_id, vh.vch_code, vh.vch_type, COALESCE(NULLIF(vjd.note, ''), vh.note, '') AS note,
        COALESCE((SELECT array_agg(vc.cost_center_id ORDER BY vc.id) FROM voucher_costcenter_tbl vc WHERE vc.voucher_journal_id = vjd.id), '{}') AS centers
      FROM voucher_journal_detail_tbl vjd
      JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id
      WHERE ${sql.unsafe(statusSql)} AND ${sql.unsafe(branchSql)} AND ${sql.unsafe(accountSql)} AND ${sql.unsafe(taggedSql)}
        AND ${sql.unsafe(fromSql)} AND vh.vch_date::date <= ${toDate}::date
      ORDER BY vh.vch_date, vh.id, vjd.order_no, vjd.id
    `) as any[]
    const lines: Line[] = rawLines.map((row) => ({ ...row, credit_debit: Number(row.credit_debit), amount: Number(row.amount) || 0, centers: (row.centers || []).map(Number) }))
    const signed = (line: Line) => (line.credit_debit === 1 ? line.amount : -line.amount)
    const inPeriod = (line: Line) => line.vch_date >= fromDate
    const centerName = (id: number) => String(centerById.get(id)?.name || `#${id}`)
    const accountLabel = (id: number) => accountById.get(id) || { code: "", name: "" }

    // ═════════ كشوف الحساب وتقرير الحركات ═════════
    if (definition.shape === "lines") {
      const relevantCenters = (line: Line) => line.centers.filter((id) => !effectiveType || typeOf(id) === effectiveType)
      const output: any[] = []
      const accept = (line: Line) => kind !== "statement-by-cc" || line.centers.some((id) => columnOf(id) != null)
      if (kind === "transactions-with-cc") {
        for (const line of lines) {
          if (!inPeriod(line)) continue
          const centers = relevantCenters(line)
          if (selectedCenters.length && !centers.some((id) => columnOf(id) != null)) continue
          const account = accountLabel(line.account_id)
          output.push({
            line_id: line.line_id, voucher_id: line.voucher_id, vch_type: line.vch_type, vch_date: line.vch_date, vch_code: line.vch_code,
            voucher_type_name: voucherNames[line.vch_type] || "سند", account_code: account.code, account_name: account.name,
            debit: line.credit_debit === 1 ? round(line.amount) : 0, credit: line.credit_debit === 2 ? round(line.amount) : 0,
            cost_centers: centers.map(centerName).join("، "), note: line.note,
          })
        }
        return NextResponse.json({ kind, shape: "lines", rows: output, currency: targetCurrency, filters: { from_date: fromDate, to_date: toDate } })
      }
      // كشف الحساب: لكل حساب (أو لكل مركز عند التجميع) رصيد افتتاحي ثم الحركات برصيد تراكمي
      const grouped = kind === "statement-by-cc" && p.get("grouped") === "1"
      const keyOf = (line: Line) => {
        if (!grouped) return `a${line.account_id}`
        const column = line.centers.map(columnOf).find((id) => id != null)
        return `c${column}`
      }
      const groups = new Map<string, { title: string; opening: number; rows: any[] }>()
      for (const line of lines) {
        if (!accept(line)) continue
        const key = keyOf(line)
        const account = accountLabel(line.account_id)
        const group = groups.get(key) || {
          title: grouped ? centerName(Number(key.slice(1))) : `${account.code} - ${account.name}`,
          opening: 0,
          rows: [],
        }
        if (!inPeriod(line)) group.opening += signed(line)
        else group.rows.push({
          line_id: line.line_id, voucher_id: line.voucher_id, vch_type: line.vch_type, vch_date: line.vch_date, vch_code: line.vch_code,
          voucher_type_name: voucherNames[line.vch_type] || "سند", account_code: account.code, account_name: account.name,
          debit: line.credit_debit === 1 ? round(line.amount) : 0, credit: line.credit_debit === 2 ? round(line.amount) : 0,
          cost_centers: relevantCenters(line).map(centerName).join("، "), note: line.note,
        })
        groups.set(key, group)
      }
      const result = [...groups.values()].map((group) => {
        let running = group.opening
        const rows = group.rows.map((row) => { running += row.debit - row.credit; return { ...row, balance: round(running) } })
        return { title: group.title, opening: round(group.opening), rows, debit: round(rows.reduce((s, r) => s + r.debit, 0)), credit: round(rows.reduce((s, r) => s + r.credit, 0)), closing: round(running) }
      }).sort((a, b) => a.title.localeCompare(b.title, "ar", { numeric: true }))
      return NextResponse.json({ kind, shape: "statement", groups: result, currency: targetCurrency, filters: { from_date: fromDate, to_date: toDate } })
    }

    // ═════════ موازين المراجعة ═════════
    if (definition.shape === "trial") {
      type Totals = { opening: number; debit: number; credit: number }
      const blank = (): Totals => ({ opening: 0, debit: 0, credit: 0 })
      const add = (totals: Totals, line: Line) => {
        if (!inPeriod(line)) totals.opening += signed(line)
        else if (line.credit_debit === 1) totals.debit += line.amount
        else totals.credit += line.amount
      }
      const primary = new Map<number, { totals: Totals; details: Map<number, Totals> }>()
      for (const line of lines) {
        const scope = accountScope(line.account_id)
        if (!scope) continue
        const columns = Array.from(new Set(line.centers.map(columnOf).filter((id): id is number => id != null)))
        for (const column of columns) {
          const [primaryId, detailId] = kind === "trial-balance-cc" ? [column, Number(scope.target.id)] : [Number(scope.target.id), column]
          const entry = primary.get(primaryId) || { totals: blank(), details: new Map() }
          add(entry.totals, line)
          const detail = entry.details.get(detailId) || blank()
          add(detail, line)
          entry.details.set(detailId, detail)
          primary.set(primaryId, entry)
        }
      }
      const finish = (totals: Totals) => ({ opening: round(totals.opening), debit: round(totals.debit), credit: round(totals.credit), balance: round(totals.opening + totals.debit - totals.credit) })
      const labelFor = (id: number, isCenter: boolean) => (isCenter ? { code: "", name: centerName(id), level: Number(centerById.get(id)?.level || 0) } : { code: accountLabel(id).code, name: accountLabel(id).name, level: Number(accountLabel(id).level_no || 0) })
      const centersArePrimary = kind === "trial-balance-cc"
      const rows = [...primary.entries()].map(([id, entry]) => ({
        id, ...labelFor(id, centersArePrimary), ...finish(entry.totals),
        details: showDetails ? [...entry.details.entries()].map(([detailId, totals]) => ({ id: detailId, ...labelFor(detailId, !centersArePrimary), ...finish(totals) })).sort((a, b) => String(a.code || a.name).localeCompare(String(b.code || b.name), "ar", { numeric: true })) : [],
      })).sort((a, b) => String(a.code || a.name).localeCompare(String(b.code || b.name), "ar", { numeric: true }))
      return NextResponse.json({ kind, shape: "trial", rows, currency: targetCurrency, filters: { from_date: fromDate, to_date: toDate } })
    }

    // ═════════ الحسابات × مراكز التكلفة (حركة الحسابات، قائمة الدخل، الميزانية) ═════════
    const cumulative = kind === "balance-sheet-cc" || kind === "balance-sheet-by-cc"
    const singleColumn = kind === "income-statement-by-cc" || kind === "balance-sheet-by-cc"
    const rowsMap = new Map<number, { id: number; account_code: string; account_name: string; side: string | null; values: Map<number, number> }>()
    const usedColumns = new Set<number>()
    for (const line of lines) {
      if (!cumulative && !inPeriod(line)) continue
      const scope = accountScope(line.account_id)
      if (!scope) continue
      const columns = Array.from(new Set(line.centers.map(columnOf).filter((id): id is number => id != null)))
      for (const column of columns) {
        const key = singleColumn ? 0 : column
        usedColumns.add(key)
        const targetAccountId = Number(scope.target.id)
        const row = rowsMap.get(targetAccountId) || { id: targetAccountId, account_code: scope.target.code, account_name: scope.target.name, side: scope.side, values: new Map() }
        row.values.set(key, (row.values.get(key) || 0) + signed(line))
        rowsMap.set(targetAccountId, row)
      }
    }
    const columns = singleColumn
      ? [{ id: 0, name: selectedCenters.map(centerName).join("، ") }]
      : (selectedCenters.length ? selectedCenters : [...usedColumns])
          .map((id) => ({ id, name: centerName(id) }))
          .sort((a, b) => a.name.localeCompare(b.name, "ar", { numeric: true }))
    const rows = [...rowsMap.values()]
      .map((row) => {
        const values: Record<number, number> = {}
        for (const column of columns) values[column.id] = round(row.values.get(column.id) || 0)
        return { id: row.id, account_code: row.account_code, account_name: row.account_name, side: row.side, values, total: round(Object.values(values).reduce((s, v) => s + v, 0)) }
      })
      .filter((row) => Math.abs(row.total) >= 0.005 || Object.values(row.values).some((v) => Math.abs(v) >= 0.005))
      .sort((a, b) => String(a.account_code).localeCompare(String(b.account_code), "en", { numeric: true }))
    return NextResponse.json({ kind, shape: "pivot", columns, rows, currency: targetCurrency, filters: { from_date: fromDate, to_date: toDate } })
  } catch (error) {
    if ((error as { code?: string })?.code === "22012") {
      return NextResponse.json({ error: "لا يوجد سعر صرف صالح لعملة التقرير بتاريخ إحدى الحركات. يرجى تعريف سعر الصرف وإعادة عرض التقرير." }, { status: 400 })
    }
    console.error("Cost center report error:", error)
    return NextResponse.json({ error: "تعذر تحميل تقرير مراكز التكلفة" }, { status: 500 })
  }
}
