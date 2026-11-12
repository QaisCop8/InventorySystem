import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { reportAccessDenied } from "@/lib/report-permissions"

// تقارير الشيكات (منقولة من ShamelAPI TotalCheckTotalsReport / DetailedCheckGroupsReport):
//   view=total    — مجاميع الشيكات حسب تاريخ الاستحقاق يومياً أو شهرياً (وارد/صادر/صافي/تراكمي)
//   view=detailed — كل شيك بسطر مع الرصيد التراكمي
// الرصيد الافتتاحي = رصيد الحسابات الجارية للبنوك (دفتر اليومية)، ثم "تراكمي" للشيكات المستحقة قبل الفترة (ما لم يُطلب
// "شيكات الفترة فقط")، ثم حركة الشيكات القائمة: بالصندوق/غير مستحق/مستحق (1-3) وبرسم التحصيل (8)، والراجعة (5) اختيارياً.

const VIEWS = { total: "cheques-total-report", detailed: "cheques-detailed-report" } as const
type View = keyof typeof VIEWS

const isoDate = (value: string | null, fallback: string) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : fallback)
const positive = (value: string | null) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
const MONTH_NAMES = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"]

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const view = (params.get("view") || "total") as View
    if (!(view in VIEWS)) return NextResponse.json({ error: "نوع تقرير غير معروف" }, { status: 400 })
    const denied = await reportAccessDenied(request, [VIEWS[view]])
    if (denied) return denied

    if (params.get("meta") === "1") {
      const [currencies, bankAccounts, branches] = await Promise.all([
        sql`SELECT id, currency_code AS code, currency_name AS name FROM currency WHERE COALESCE(is_active, true) ORDER BY id`,
        sql`SELECT ba.id, ba.code, ba.name, ba.currency_id FROM bank_accounts ba WHERE COALESCE(ba.status, 1) <> 3 ORDER BY ba.code`,
        sql`SELECT id, branch_code AS code, branch_name AS name FROM branches WHERE NOT COALESCE((to_jsonb(branches)->>'is_bank_branch')::boolean, false) ORDER BY branch_name`,
      ])
      return NextResponse.json({ currencies, bankAccounts, branches })
    }

    const today = new Date().toISOString().slice(0, 10)
    const from = isoDate(params.get("from_date"), today)
    const to = isoDate(params.get("to_date"), `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`)
    const currencyId = positive(params.get("currency_id"))
    const bankAccountId = positive(params.get("bank_account_id"))
    const branchId = positive(params.get("branch_id"))
    const chequeType = [1, 2].includes(Number(params.get("cheque_type"))) ? Number(params.get("cheque_type")) : null
    const showReturned = params.get("show_returned") === "1"
    const periodOnly = params.get("period_only") === "1"
    const grouping = params.get("grouping") === "monthly" ? "monthly" : "daily"

    const values: unknown[] = []
    const bind = (value: unknown) => { values.push(value); return `$${values.length}` }
    // بعملة محددة: شيكاتها فقط بمبلغها الأصلي؛ بلا عملة: كل الشيكات بما يعادلها بالعملة الأساسية
    const amount = currencyId ? "chq.amount" : "chq.amount * COALESCE(NULLIF(chq.rate, 0), 1)"
    const statuses = showReturned ? [1, 2, 3, 5, 8] : [1, 2, 3, 8]
    const where = [
      "COALESCE(vh.status, 1) <> 3",
      `chq.status_id = ANY(${bind(statuses)}::int[])`,
    ]
    if (currencyId) where.push(`chq.currency_id = ${bind(currencyId)}`)
    if (bankAccountId) where.push(`chq.bank_account_id = ${bind(bankAccountId)}`)
    if (branchId) where.push(`vh.branch_id = ${bind(branchId)}`)
    if (chequeType) where.push(`chq.cheq_type = ${bind(chequeType)}`)
    const base = `FROM cheques_tbl chq JOIN voucher_header_tbl vh ON vh.id = chq.voucher_id WHERE ${where.join(" AND ")}`
    const fromParam = bind(from), toParam = bind(to)

    // رصيد الحسابات الجارية للبنوك المعرّفة (حتى نهاية الفترة) — نقطة البداية في الكشف
    const journalValues: unknown[] = []
    const jbind = (value: unknown) => { journalValues.push(value); return `$${journalValues.length}` }
    const journalWhere = ["COALESCE(vh.status, 1) <> 3", `vh.vch_date::date <= ${jbind(to)}::date`, "COALESCE(ba.status, 1) <> 3"]
    if (bankAccountId) journalWhere.push(`ba.id = ${jbind(bankAccountId)}`)
    if (currencyId) journalWhere.push(`ba.currency_id = ${jbind(currencyId)}`)
    const journalAmount = currencyId ? "vjd.amount" : "COALESCE(vjd.base_curr_amount, vjd.amount * COALESCE(NULLIF(vjd.rate, 0), 1))"
    const [openingRows, previousRows] = await Promise.all([
      sql.unsafe(`
        SELECT COALESCE(SUM(CASE WHEN vjd.credit_debit = 1 THEN 1 ELSE -1 END * ${journalAmount}), 0) AS balance
        FROM voucher_journal_detail_tbl vjd
        JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id
        JOIN bank_accounts ba ON ba.jary_account_id = vjd.account_id
        WHERE ${journalWhere.join(" AND ")}`, journalValues),
      periodOnly ? Promise.resolve([] as any[]) : sql.unsafe(`
        SELECT COALESCE(SUM(CASE WHEN chq.cheq_type = 1 THEN ${amount} ELSE 0 END), 0) AS cheque_in,
               COALESCE(SUM(CASE WHEN chq.cheq_type = 2 THEN ${amount} ELSE 0 END), 0) AS cheque_out,
               COUNT(*) FILTER (WHERE chq.cheq_type = 1)::int AS count_in, COUNT(*) FILTER (WHERE chq.cheq_type = 2)::int AS count_out
        ${base} AND chq.due_date::date < ${fromParam}::date`, values),
    ])
    const openingJournal = Number(openingRows[0]?.balance) || 0
    const prev = previousRows[0] || null
    const prevIn = Number(prev?.cheque_in) || 0, prevOut = Number(prev?.cheque_out) || 0
    const hasPrev = Boolean(prev && (Number(prev.count_in) || Number(prev.count_out)))
    let running = openingJournal + (hasPrev ? prevIn - prevOut : 0)

    const head: any[] = [{ kind: "opening", label: "رصيد البنوك", net_balance: openingJournal, cumulative_balance: openingJournal }]
    if (hasPrev) head.push({ kind: "previous", label: "تراكمي (مستحقة قبل الفترة)", cheque_in: prevIn, cheque_out: prevOut, count_in: Number(prev.count_in), count_out: Number(prev.count_out), net_balance: prevIn - prevOut, cumulative_balance: running })

    if (view === "total") {
      const bucket = grouping === "monthly" ? "date_trunc('month', chq.due_date)::date" : "chq.due_date::date"
      const groups = await sql.unsafe(`
        SELECT ${bucket}::text AS period,
               COALESCE(SUM(CASE WHEN chq.cheq_type = 1 THEN ${amount} ELSE 0 END), 0) AS cheque_in,
               COALESCE(SUM(CASE WHEN chq.cheq_type = 2 THEN ${amount} ELSE 0 END), 0) AS cheque_out,
               COUNT(*) FILTER (WHERE chq.cheq_type = 1)::int AS count_in, COUNT(*) FILTER (WHERE chq.cheq_type = 2)::int AS count_out
        ${base} AND chq.due_date::date BETWEEN ${fromParam}::date AND ${toParam}::date
        GROUP BY 1 ORDER BY 1`, values)
      const rows = groups.map((group: any) => {
        const date = new Date(`${group.period}T00:00:00Z`)
        const net = Number(group.cheque_in) - Number(group.cheque_out)
        running += net
        return {
          kind: "period",
          period: group.period,
          label: grouping === "monthly" ? `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}` : DAY_NAMES[date.getUTCDay()],
          cheque_in: Number(group.cheque_in), cheque_out: Number(group.cheque_out),
          count_in: Number(group.count_in), count_out: Number(group.count_out),
          net_balance: net, cumulative_balance: running,
        }
      })
      return NextResponse.json({ rows: [...head, ...rows], closing: running, from, to })
    }

    const cheques = await sql.unsafe(`
      SELECT chq.id, chq.cheq_num, chq.cheq_type, chq.due_date::date::text AS due_date, ${amount} AS amount,
             COALESCE(cur.currency_code, '') AS currency_code, chq.amount AS original_amount,
             COALESCE(acc.code, '') AS account_code, COALESCE(NULLIF(acc.name, ''), chq.cheq_owner_name, '') AS account_name,
             COALESCE(ba.code, '') AS bank_account_code, COALESCE(ba.name, '') AS bank_account_name,
             CASE WHEN chq.status_id = 1 AND chq.due_date::date > CURRENT_DATE THEN 'غير مستحق' ELSE COALESCE(st.name, '') END AS status_name,
             vh.vch_code, COALESCE(br.branch_name, '') AS branch_name
      FROM cheques_tbl chq
      JOIN voucher_header_tbl vh ON vh.id = chq.voucher_id
      LEFT JOIN account_tbl acc ON acc.id = chq.customer_id
      LEFT JOIN bank_accounts ba ON ba.id = chq.bank_account_id
      LEFT JOIN cheque_status_tbl st ON st.id = chq.status_id
      LEFT JOIN currency cur ON cur.id = chq.currency_id
      LEFT JOIN branches br ON br.id = vh.branch_id
      WHERE ${where.join(" AND ")} AND chq.due_date::date BETWEEN ${fromParam}::date AND ${toParam}::date
      ORDER BY chq.due_date, chq.id
      LIMIT 5000`, values)
    const rows = cheques.map((cheque: any) => {
      const value = Number(cheque.amount) || 0
      const incoming = Number(cheque.cheq_type) === 1
      running += incoming ? value : -value
      const date = new Date(`${cheque.due_date}T00:00:00Z`)
      return {
        kind: "cheque",
        ...cheque,
        label: DAY_NAMES[date.getUTCDay()],
        cheque_in: incoming ? value : 0,
        cheque_out: incoming ? 0 : value,
        cumulative_balance: running,
      }
    })
    return NextResponse.json({ rows: [...head, ...rows], closing: running, from, to })
  } catch (error) {
    console.error("[reports/cheques] error:", error)
    return NextResponse.json({ error: "تعذر تحميل تقرير الشيكات" }, { status: 500 })
  }
}
