import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import {
  ensureTables,
  JOURNAL_VCH_TYPE,
  JOURNAL_TYPE_COUNTER_ACCOUNT,
  buildJournalRows,
  saveJournalRows,
  saveNoteRows,
  fetchDetails,
  validateJournalAccountCurrencies,
  type JournalRow,
} from "./_lib"
import { authorizeTransaction } from "@/lib/transaction-permissions"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const searchParams = new URL(request.url).searchParams
    const authorization = await authorizeTransaction(request, "journal", "view", searchParams.get("branch_id"))
    if (!authorization.ok) return authorization.response

    const rows = await sql`
      SELECT vh.*,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id',vjd.id,'account_id',vjd.account_id,'account_code',acc.code,'account_name',acc.name,
            'credit_debit',vjd.credit_debit,'amount',vjd.amount,'note',vjd.note,
            'cost_centers',COALESCE((
              SELECT json_agg(json_build_object(
                'cost_center_id',vc.cost_center_id,'cost_center_type_id',cc.cost_type_id,'cost_center_name',cc.name
              ) ORDER BY vc.id)
              FROM voucher_costcenter_tbl vc
              LEFT JOIN cost_centers cc ON cc.id=vc.cost_center_id
              WHERE vc.voucher_journal_id=vjd.id
            ),'[]'::json)
          ) ORDER BY vjd.order_no,vjd.id)
          FROM voucher_journal_detail_tbl vjd
          LEFT JOIN account_tbl acc ON acc.id=vjd.account_id
          WHERE vjd.voucher_id=vh.id AND vjd.journal_type_id=${JOURNAL_TYPE_COUNTER_ACCOUNT}
        ),'[]'::json) journal
      FROM voucher_header_tbl vh
      WHERE vh.vch_type = ${JOURNAL_VCH_TYPE} AND vh.status != 3 AND vh.branch_id = ANY(${authorization.branchIds}::int[])
      ORDER BY vh.id DESC
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching journal vouchers:", error)
    return NextResponse.json({ error: "Failed to fetch journal vouchers" }, { status: 500 })
  }
}

const validateBalance = (journalRows: JournalRow[]): string | null => {
  if (journalRows.length < 2) return "يجب أن يحتوي السند على قيدين محاسبيين على الأقل (طرف مدين وطرف دائن)"
  const totalDebit = journalRows.filter((r) => r.credit_debit === 1).reduce((s, r) => s + r.amount, 0)
  const totalCredit = journalRows.filter((r) => r.credit_debit === 2).reduce((s, r) => s + r.amount, 0)
  if (Math.round((totalDebit - totalCredit) * 100) / 100 !== 0) {
    return "القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن"
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()
    const authorization = await authorizeTransaction(request, "journal", "create", data.branch_id)
    if (!authorization.ok) return authorization.response
    if (Number(data.status || 1) === 2) {
      const posting = await authorizeTransaction(request, "journal", "post", authorization.branchId)
      if (!posting.ok) return posting.response
    }

    if (!data.vch_code || !data.vch_date) {
      return NextResponse.json({ error: "بيانات السند غير مكتملة" }, { status: 400 })
    }
    if (!(Number(data.rate) > 0)) {
      return NextResponse.json({ error: "سعر الصرف يجب أن يكون أكبر من صفر" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM voucher_header_tbl WHERE vch_type = ${JOURNAL_VCH_TYPE} AND vch_code = ${data.vch_code}
    `
    if (existing.length > 0) {
      return NextResponse.json({ error: "رقم السند مستخدم مسبقاً" }, { status: 400 })
    }

    const journalRows = buildJournalRows(data)
    const balanceError = validateBalance(journalRows)
    if (balanceError) return NextResponse.json({ error: balanceError }, { status: 400 })
    const currencyError = await validateJournalAccountCurrencies(journalRows, data.currency_id ? Number(data.currency_id) : null)
    if (currencyError) return NextResponse.json({ error: currencyError }, { status: 400 })
    const amount = journalRows.filter((r) => r.credit_debit === 1).reduce((s, r) => s + r.amount, 0)

    const insertStatus = Number(data.status || 1)
    const result = await sql`
      INSERT INTO voucher_header_tbl (
        vch_type, vch_code, vch_date, vch_book_id, branch_id, currency_id, rate,
        amount, payment_classification_id, salesman_id, manual_voucher, manual_date, note, status, vch_status, is_printed,
        insert_user
      ) VALUES (
        ${JOURNAL_VCH_TYPE}, ${data.vch_code}, ${data.vch_date}, ${data.vch_book_id || null}, ${authorization.branchId}, ${data.currency_id || null}, ${Number(data.rate || 1)},
        ${amount}, ${data.payment_classification_id || null}, ${data.salesman_id || null}, ${data.manual_voucher || ""}, ${data.manual_date || null}, ${data.note || ""}, ${insertStatus}, ${insertStatus === 2 ? 2 : 1}, ${Number(data.is_printed || 0)},
        ${data.insert_user || null}
      )
      RETURNING *
    `

    const voucher = result[0]
    await saveJournalRows(voucher.id, journalRows)
    await saveNoteRows(voucher.id, data.notes)

    const details = await fetchDetails(voucher.id)
    return NextResponse.json({ ...voucher, ...details }, { status: 201 })
  } catch (error) {
    console.error("Error creating journal voucher:", error)
    return NextResponse.json({ error: "Failed to create journal voucher" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()
    const action = Number(data.status) === 3 ? "delete" : "update"
    const authorization = await authorizeTransaction(request, "journal", action, data.branch_id)
    if (!authorization.ok) return authorization.response
    if (Number(data.status) === 2) {
      const posting = await authorizeTransaction(request, "journal", "post", authorization.branchId)
      if (!posting.ok) return posting.response
    }

    if (!data.id) return NextResponse.json({ error: "معرف السند مطلوب" }, { status: 400 })
    if (!data.vch_code || !data.vch_date) {
      return NextResponse.json({ error: "بيانات السند غير مكتملة" }, { status: 400 })
    }
    if (!(Number(data.rate) > 0)) {
      return NextResponse.json({ error: "سعر الصرف يجب أن يكون أكبر من صفر" }, { status: 400 })
    }

    const duplicate = await sql`
      SELECT id FROM voucher_header_tbl WHERE vch_type = ${JOURNAL_VCH_TYPE} AND vch_code = ${data.vch_code} AND id != ${data.id}
    `
    if (duplicate.length > 0) {
      return NextResponse.json({ error: "رقم السند مستخدم مسبقاً" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)

    // سند مُرحَّل (status=2) مقفل: التعديل العادي عليه ممنوع من الواجهة، ونمنعه هنا أيضاً كخط
    // دفاع ثانٍ — الاستثناء الوحيد هو إلغاؤه منطقياً (status=3) عبر تأكيد الحذف.
    const currentRows = await sql`SELECT status FROM voucher_header_tbl WHERE id = ${data.id}`
    if (currentRows.length > 0 && Number(currentRows[0].status) === 2 && status !== 3) {
      return NextResponse.json({ error: "السند مرحل ولا يمكن تعديله" }, { status: 400 })
    }

    // الحذف الناعم (status=3) يتخطى شرط توازن القيد — السند يُلغى وليس يُرحَّل.
    let journalRows: JournalRow[] = []
    let amount = Number(data.amount || 0)
    if (status !== 3) {
      journalRows = buildJournalRows(data)
      const balanceError = validateBalance(journalRows)
      if (balanceError) return NextResponse.json({ error: balanceError }, { status: 400 })
      const currencyError = await validateJournalAccountCurrencies(journalRows, data.currency_id ? Number(data.currency_id) : null)
      if (currencyError) return NextResponse.json({ error: currencyError }, { status: 400 })
      amount = journalRows.filter((r) => r.credit_debit === 1).reduce((s, r) => s + r.amount, 0)
    }

    const result = await sql`
      UPDATE voucher_header_tbl
      SET
        vch_code = ${data.vch_code},
        vch_date = ${data.vch_date},
        vch_book_id = ${data.vch_book_id || null},
        branch_id = ${authorization.branchId},
        currency_id = ${data.currency_id || null},
        rate = ${Number(data.rate || 1)},
        amount = ${amount},
        payment_classification_id = ${data.payment_classification_id || null},
        salesman_id = ${data.salesman_id || null},
        manual_voucher = ${data.manual_voucher || ""},
        manual_date = ${data.manual_date || null},
        note = ${data.note || ""},
        status = ${status},
        vch_status = ${status === 2 ? 2 : 1},
        is_printed = ${Number(data.is_printed || 0)},
        last_update_date = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING *
    `

    if (result.length === 0) return NextResponse.json({ error: "السند غير موجود" }, { status: 404 })

    const voucher = result[0]
    if (status !== 3) {
      await saveJournalRows(voucher.id, journalRows)
      await saveNoteRows(voucher.id, data.notes)
    } else {
      await sql`UPDATE payroll_tbl SET journal_id=NULL WHERE journal_id=${voucher.id}`
    }

    const details = await fetchDetails(voucher.id)
    return NextResponse.json({ ...voucher, ...details })
  } catch (error) {
    console.error("Error updating journal voucher:", error)
    return NextResponse.json({ error: "Failed to update journal voucher" }, { status: 500 })
  }
}
