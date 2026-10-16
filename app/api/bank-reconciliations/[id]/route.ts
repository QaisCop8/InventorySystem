import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import {
  RECON_FINALIZED,
  RECON_OPEN,
  bookBalanceAt,
  ensureBankReconciliationTables,
  loadBookLines,
  proposeMatches,
  pruneCancelledMatches,
  reconciliationSummary,
} from "@/lib/bank-reconciliation"
import { AutoJournalError, INTERNAL_VOUCHER, createAutoJournal, getBaseCurrencyId, getRateByDate } from "@/lib/auto-journals"
import { insertStatementLines, parseStatementLines } from "../_lines"

// أسطر القيود المعروضة للمطابقة: فترة الكشف ± هذه الأيام (حركات قبل/بعد الفترة تظهر بالكشف متأخرة/مبكرة)
const BOOK_WINDOW_DAYS = 15
const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

type Ctx = { params: Promise<{ id: string }> | { id: string } }
const reconciliationId = async (ctx: Ctx) => Number((await ctx.params).id)

async function loadHeader(id: number) {
  return (await sql`
    SELECT r.*, r.statement_from::text statement_from, r.statement_to::text statement_to,
      r.opening_balance::float8 opening_balance, r.closing_balance::float8 closing_balance,
      a.code account_code, a.name account_name, a.currency_id account_currency_id, c.currency_code
    FROM bank_reconciliations_tbl r
    JOIN account_tbl a ON a.id = r.account_id
    LEFT JOIN currency c ON c.id = a.currency_id
    WHERE r.id = ${id}
  `)[0] as any
}

async function loadDetail(id: number) {
  const header = await loadHeader(id)
  if (!header) return null
  if (Number(header.status) === RECON_OPEN) await pruneCancelledMatches(id)
  const [lines, matches] = await Promise.all([
    sql`
      SELECT id, line_no, txn_date::text txn_date, COALESCE(description, '') description, COALESCE(reference, '') reference,
        amount::float8 amount, balance::float8 balance, journal_voucher_id
      FROM bank_statement_lines_tbl WHERE reconciliation_id = ${id} ORDER BY txn_date, line_no
    `,
    sql`SELECT statement_line_id, journal_detail_id, match_type, score FROM bank_reconciliation_matches_tbl WHERE reconciliation_id = ${id}`,
  ])
  const bookLines = await loadBookLines(Number(header.account_id), shiftDate(header.statement_from, -BOOK_WINDOW_DAYS), shiftDate(header.statement_to, BOOK_WINDOW_DAYS), null)
  // أسطر قيود طوبقت في هذه التسوية لكن تاريخها خارج النافذة (نادر) — تُضاف حتى تظهر مطابقتها
  const knownIds = new Set(bookLines.map((line) => line.id))
  const missingIds = (matches as any[]).map((match) => Number(match.journal_detail_id)).filter((jid) => !knownIds.has(jid))
  if (missingIds.length) {
    const extra = await loadBookLines(Number(header.account_id), "1900-01-01", "2999-12-31", null)
    for (const line of extra) if (missingIds.includes(line.id)) bookLines.push(line)
  }
  const matchesByLine = new Map<number, any[]>()
  for (const match of matches as any[]) {
    const list = matchesByLine.get(Number(match.statement_line_id)) || []
    list.push(match)
    matchesByLine.set(Number(match.statement_line_id), list)
  }
  const bookById = new Map(bookLines.map((line) => [line.id, line]))
  const statementLines = (lines as any[]).map((line) => {
    const lineMatches = matchesByLine.get(Number(line.id)) || []
    return {
      ...line,
      id: Number(line.id),
      matched: lineMatches.length > 0,
      match_type: lineMatches[0]?.match_type || null,
      score: lineMatches[0]?.score ?? null,
      journal_detail_ids: lineMatches.map((match) => Number(match.journal_detail_id)),
      vouchers: lineMatches.map((match) => {
        const book = bookById.get(Number(match.journal_detail_id))
        return book ? { voucher_id: book.voucher_id, vch_code: book.vch_code, vch_type_name: book.vch_type_name, amount: book.amount } : null
      }).filter(Boolean),
    }
  })
  const inPeriod = (date: string) => date >= header.statement_from && date <= header.statement_to
  const book = bookLines.map((line) => ({
    ...line,
    in_period: inPeriod(line.vch_date),
    matched_here: line.reconciliation_id === id,
    matched_elsewhere: line.reconciliation_id != null && line.reconciliation_id !== id,
  }))
  const bookBalance = await bookBalanceAt(Number(header.account_id), header.statement_to)
  const openingBookBalance = await bookBalanceAt(Number(header.account_id), shiftDate(header.statement_from, -1))
  // الملخص: أسطر الفترة غير المطابقة في أي تسوية (المطابقة في تسوية أخرى تُعدّ مسوّاة)
  const summary = reconciliationSummary({
    closingBalance: Number(header.closing_balance),
    bookBalance,
    statementLines: statementLines.map((line) => ({ amount: Number(line.amount), matched: line.matched })),
    bookLines: book.filter((line) => line.in_period || line.matched_here).map((line) => ({ amount: line.amount, matched: line.reconciliation_id != null })),
  })
  const statementTotal = Math.round(statementLines.reduce((total, line) => total + Number(line.amount), 0) * 1000) / 1000
  return {
    header,
    statementLines,
    bookLines: book,
    summary: {
      ...summary,
      opening_balance: Number(header.opening_balance),
      opening_book_balance: openingBookBalance,
      statement_movement: statementTotal,
      // رصيد الكشف الختامي المتوقع من الافتتاحي + أسطر الكشف — للتحقق من اكتمال الاستيراد
      statement_check_difference: Math.round((Number(header.opening_balance) + statementTotal - Number(header.closing_balance)) * 1000) / 1000,
    },
  }
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const authorization = await authorizeTransaction(request, "bank_reconciliation", "view")
    if (!authorization.ok) return authorization.response
    await ensureBankReconciliationTables()
    const detail = await loadDetail(await reconciliationId(ctx))
    if (!detail) return NextResponse.json({ error: "التسوية غير موجودة" }, { status: 404 })
    return NextResponse.json(detail)
  } catch (error) {
    console.error("[bank-reconciliations] GET detail failed", error)
    return NextResponse.json({ error: "تعذر تحميل التسوية" }, { status: 500 })
  }
}

class ActionError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const id = await reconciliationId(ctx)
    const data = await request.json().catch(() => ({}))
    const action = String(data.action || "")
    const needsPost = action === "finalize" || action === "reopen"
    const authorization = await authorizeTransaction(request, "bank_reconciliation", needsPost ? "post" : "update")
    if (!authorization.ok) return authorization.response
    if (action === "create_journal") {
      const journalAuthorization = await authorizeTransaction(request, "journal", "create")
      if (!journalAuthorization.ok) return journalAuthorization.response
    }
    await ensureBankReconciliationTables()
    const userId = String(authorization.userId)

    const result = await withTenantTransaction(async () => {
      const header = (await sql`SELECT * FROM bank_reconciliations_tbl WHERE id = ${id} FOR UPDATE`)[0] as any
      if (!header) throw new ActionError("التسوية غير موجودة", 404)
      const from = String(header.statement_from instanceof Date ? header.statement_from.toISOString() : header.statement_from).slice(0, 10)
      const to = String(header.statement_to instanceof Date ? header.statement_to.toISOString() : header.statement_to).slice(0, 10)
      if (action === "reopen") {
        if (Number(header.status) !== RECON_FINALIZED) throw new ActionError("التسوية مفتوحة أصلاً")
        await sql`UPDATE bank_reconciliations_tbl SET status = ${RECON_OPEN}, finalized_at = NULL, finalized_by = NULL, updated_at = NOW() WHERE id = ${id}`
        return { message: "أُعيد فتح التسوية" }
      }
      if (Number(header.status) !== RECON_OPEN) throw new ActionError("التسوية مُقفلة — أعد فتحها أولاً")

      switch (action) {
        case "update_header": {
          const opening = Number(data.opening_balance), closing = Number(data.closing_balance)
          if (!Number.isFinite(opening) || !Number.isFinite(closing)) throw new ActionError("الأرصدة غير صالحة")
          await sql`UPDATE bank_reconciliations_tbl SET opening_balance = ${opening}, closing_balance = ${closing}, note = ${String(data.note || "").slice(0, 1000) || null}, updated_at = NOW() WHERE id = ${id}`
          return { message: "تم حفظ بيانات الكشف" }
        }
        case "add_lines": {
          const parsed = parseStatementLines(data.lines, from, to)
          if ("error" in parsed) throw new ActionError(parsed.error)
          // replace: يستبدل أسطر الكشف المستوردة (ومطابقاتها) — أسطر أُنشئ لها قيد من التسوية تبقى
          if (data.replace === true) {
            await sql`DELETE FROM bank_statement_lines_tbl WHERE reconciliation_id = ${id} AND journal_voucher_id IS NULL`
          }
          const last = (await sql`SELECT COALESCE(MAX(line_no), 0)::int last FROM bank_statement_lines_tbl WHERE reconciliation_id = ${id}`)[0]
          await insertStatementLines(id, parsed.lines, Number(last.last))
          if (data.file_name) await sql`UPDATE bank_reconciliations_tbl SET file_name = ${String(data.file_name).slice(0, 255)}, updated_at = NOW() WHERE id = ${id}`
          return { message: `أُضيف ${parsed.lines.length} سطر`, warnings: parsed.warnings }
        }
        case "delete_line": {
          const lineId = Number(data.statement_line_id)
          const line = (await sql`SELECT journal_voucher_id FROM bank_statement_lines_tbl WHERE id = ${lineId} AND reconciliation_id = ${id}`)[0]
          if (!line) throw new ActionError("سطر الكشف غير موجود")
          await sql`DELETE FROM bank_statement_lines_tbl WHERE id = ${lineId}`
          return { message: "حُذف سطر الكشف" }
        }
        case "auto_match": {
          await pruneCancelledMatches(id)
          const statementLines = await sql`
            SELECT l.id, l.txn_date::text txn_date, COALESCE(l.description, '') description, COALESCE(l.reference, '') reference, l.amount::float8 amount
            FROM bank_statement_lines_tbl l
            WHERE l.reconciliation_id = ${id} AND NOT EXISTS (SELECT 1 FROM bank_reconciliation_matches_tbl m WHERE m.statement_line_id = l.id)
          `
          const tolerance = Math.max(0, Math.min(60, Math.round(Number(data.date_tolerance_days ?? 5))))
          const book = (await loadBookLines(Number(header.account_id), shiftDate(from, -BOOK_WINDOW_DAYS - tolerance), shiftDate(to, BOOK_WINDOW_DAYS + tolerance), null))
            .filter((line) => line.reconciliation_id == null)
          const proposals = proposeMatches(statementLines as any[], book, { dateToleranceDays: tolerance, allowGroups: data.allow_groups !== false })
          for (const proposal of proposals) {
            for (const journalDetailId of proposal.journalDetailIds) {
              await sql`
                INSERT INTO bank_reconciliation_matches_tbl (reconciliation_id, statement_line_id, journal_detail_id, match_type, score, created_by)
                VALUES (${id}, ${proposal.statementLineId}, ${journalDetailId}, 'auto', ${proposal.score}, ${userId})
                ON CONFLICT (journal_detail_id) DO NOTHING
              `
            }
          }
          return { message: proposals.length ? `تمت مطابقة ${proposals.length} سطر تلقائياً` : "لم يُعثر على مطابقات جديدة", matched: proposals.length }
        }
        case "match": {
          const lineId = Number(data.statement_line_id)
          const journalIds = [...new Set((Array.isArray(data.journal_detail_ids) ? data.journal_detail_ids : []).map(Number).filter((value: number) => value > 0))] as number[]
          if (!journalIds.length) throw new ActionError("اختر سطر قيد واحداً على الأقل")
          const line = (await sql`SELECT id, amount::float8 amount FROM bank_statement_lines_tbl WHERE id = ${lineId} AND reconciliation_id = ${id}`)[0] as any
          if (!line) throw new ActionError("سطر الكشف غير موجود")
          const already = await sql`SELECT 1 FROM bank_reconciliation_matches_tbl WHERE statement_line_id = ${lineId} LIMIT 1`
          if (already.length) throw new ActionError("سطر الكشف مطابق مسبقاً — فك المطابقة أولاً")
          const book = (await loadBookLines(Number(header.account_id), "1900-01-01", "2999-12-31", null)).filter((entry) => journalIds.includes(entry.id))
          if (book.length !== journalIds.length) throw new ActionError("أحد أسطر القيد غير موجود أو ليس على حساب البنك")
          const taken = book.find((entry) => entry.reconciliation_id != null)
          if (taken) throw new ActionError(`سطر القيد في السند ${taken.vch_code} مطابق مسبقاً`)
          const total = Math.round(book.reduce((sum, entry) => sum + entry.amount, 0) * 1000) / 1000
          const difference = Math.round((total - Number(line.amount)) * 1000) / 1000
          if (Math.abs(difference) > 0.005 && data.force !== true) throw new ActionError(`مجموع أسطر القيد (${total}) لا يساوي مبلغ سطر الكشف (${line.amount}) — الفرق ${difference}`)
          for (const entry of book) {
            await sql`INSERT INTO bank_reconciliation_matches_tbl (reconciliation_id, statement_line_id, journal_detail_id, match_type, created_by) VALUES (${id}, ${lineId}, ${entry.id}, 'manual', ${userId})`
          }
          return { message: "تمت المطابقة" }
        }
        case "unmatch": {
          const lineId = Number(data.statement_line_id)
          await sql`DELETE FROM bank_reconciliation_matches_tbl WHERE reconciliation_id = ${id} AND statement_line_id = ${lineId}`
          return { message: "تم فك المطابقة" }
        }
        case "unmatch_auto": {
          const removed = await sql`DELETE FROM bank_reconciliation_matches_tbl WHERE reconciliation_id = ${id} AND match_type = 'auto' RETURNING id`
          return { message: `أُلغيت ${removed.length} مطابقة تلقائية` }
        }
        case "create_journal": {
          // سطر بالكشف غير مسجّل بالدفاتر (عمولة بنك/فائدة/رسوم): قيد على حساب البنك مقابل حساب يختاره المستخدم، ثم يُطابَق
          const lineId = Number(data.statement_line_id)
          const counterAccountId = Number(data.counter_account_id)
          const line = (await sql`SELECT id, txn_date::text txn_date, amount::float8 amount, COALESCE(description, '') description, COALESCE(reference, '') reference FROM bank_statement_lines_tbl WHERE id = ${lineId} AND reconciliation_id = ${id}`)[0] as any
          if (!line) throw new ActionError("سطر الكشف غير موجود")
          if ((await sql`SELECT 1 FROM bank_reconciliation_matches_tbl WHERE statement_line_id = ${lineId} LIMIT 1`).length) throw new ActionError("سطر الكشف مطابق مسبقاً")
          if (!counterAccountId) throw new ActionError("اختر الحساب المقابل")
          if (counterAccountId === Number(header.account_id)) throw new ActionError("الحساب المقابل لا يمكن أن يكون حساب البنك نفسه")
          const account = (await sql`SELECT currency_id FROM account_tbl WHERE id = ${header.account_id}`)[0] as any
          const baseCurrencyId = await getBaseCurrencyId()
          const currencyId = Number(account?.currency_id || baseCurrencyId || 0)
          if (!currencyId) throw new ActionError("تعذر تحديد عملة القيد")
          const rate = currencyId === Number(baseCurrencyId) ? 1 : (await getRateByDate(currencyId, line.txn_date, baseCurrencyId)) ?? 1
          const amount = Math.abs(Number(line.amount))
          const deposit = Number(line.amount) > 0
          const note = String(data.note || line.description || "تسوية بنكية").slice(0, 70)
          const journal = await createAutoJournal({
            userId,
            branchId: Number(header.branch_id) || authorization.branchId,
            date: line.txn_date,
            currencyId,
            rate,
            note: `تسوية بنكية — ${note}`,
            manualVoucher: String(line.reference || "").slice(0, 50),
            internalVoucherId: INTERNAL_VOUCHER.BANK_RECONCILIATION,
            lines: [
              { accountId: Number(header.account_id), creditDebit: deposit ? 1 : 2, amount, currencyId, rate, note },
              { accountId: counterAccountId, creditDebit: deposit ? 2 : 1, amount, currencyId, rate, note },
            ],
          })
          const bankLine = (await sql`
            SELECT id FROM voucher_journal_detail_tbl WHERE voucher_id = ${journal.id} AND account_id = ${header.account_id} ORDER BY order_no LIMIT 1
          `)[0] as any
          await sql`UPDATE bank_statement_lines_tbl SET journal_voucher_id = ${journal.id} WHERE id = ${lineId}`
          if (bankLine) await sql`INSERT INTO bank_reconciliation_matches_tbl (reconciliation_id, statement_line_id, journal_detail_id, match_type, created_by) VALUES (${id}, ${lineId}, ${Number(bankLine.id)}, 'journal', ${userId})`
          return { message: `أُنشئ سند القيد ${journal.code} وطوبق مع سطر الكشف`, voucher_code: journal.code }
        }
        case "finalize": {
          const detail = await loadDetail(id)
          if (!detail) throw new ActionError("التسوية غير موجودة", 404)
          if (Math.abs(detail.summary.difference) > 0.005 && data.force !== true) {
            throw new ActionError(`لا يمكن إقفال التسوية: يوجد فرق ${detail.summary.difference} بين رصيد البنك المعدّل ورصيد الدفاتر المعدّل`)
          }
          await sql`UPDATE bank_reconciliations_tbl SET status = ${RECON_FINALIZED}, finalized_at = NOW(), finalized_by = ${userId}, updated_at = NOW() WHERE id = ${id}`
          return { message: "أُقفلت التسوية" }
        }
        default:
          throw new ActionError("إجراء غير معروف")
      }
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ActionError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof AutoJournalError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("[bank-reconciliations] PATCH failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تنفيذ العملية" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const authorization = await authorizeTransaction(request, "bank_reconciliation", "delete")
    if (!authorization.ok) return authorization.response
    await ensureBankReconciliationTables()
    const id = await reconciliationId(ctx)
    const header = (await sql`SELECT status FROM bank_reconciliations_tbl WHERE id = ${id}`)[0] as any
    if (!header) return NextResponse.json({ error: "التسوية غير موجودة" }, { status: 404 })
    if (Number(header.status) === RECON_FINALIZED) return NextResponse.json({ error: "لا يمكن حذف تسوية مُقفلة — أعد فتحها أولاً" }, { status: 400 })
    // قيود "تسجيل قيد" المنشأة من التسوية تبقى (سندات قيد عادية يمكن إلغاؤها من شاشة سند القيد)
    await sql`DELETE FROM bank_reconciliations_tbl WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[bank-reconciliations] DELETE failed", error)
    return NextResponse.json({ error: "تعذر حذف التسوية" }, { status: 500 })
  }
}
