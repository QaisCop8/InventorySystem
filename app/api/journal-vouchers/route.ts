import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables, JOURNAL_VCH_TYPE, buildJournalRows, saveJournalRows, saveNoteRows, fetchDetails, type JournalRow } from "./_lib"

export async function GET() {
  try {
    await ensureTables()

    const rows = await sql`
      SELECT * FROM voucher_header_tbl
      WHERE vch_type = ${JOURNAL_VCH_TYPE} AND status != 3
      ORDER BY id DESC
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

    if (!data.vch_code || !data.vch_date) {
      return NextResponse.json({ error: "بيانات السند غير مكتملة" }, { status: 400 })
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
    const amount = journalRows.filter((r) => r.credit_debit === 1).reduce((s, r) => s + r.amount, 0)

    const result = await sql`
      INSERT INTO voucher_header_tbl (
        vch_type, vch_code, vch_date, vch_book_id, currency_id, rate,
        amount, payment_classification_id, salesman_id, manual_voucher, manual_date, note, status
      ) VALUES (
        ${JOURNAL_VCH_TYPE}, ${data.vch_code}, ${data.vch_date}, ${data.vch_book_id || null}, ${data.currency_id || null}, ${Number(data.rate || 1)},
        ${amount}, ${data.payment_classification_id || null}, ${data.salesman_id || null}, ${data.manual_voucher || ""}, ${data.manual_date || null}, ${data.note || ""}, ${Number(data.status || 1)}
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

    if (!data.id) return NextResponse.json({ error: "معرف السند مطلوب" }, { status: 400 })
    if (!data.vch_code || !data.vch_date) {
      return NextResponse.json({ error: "بيانات السند غير مكتملة" }, { status: 400 })
    }

    const duplicate = await sql`
      SELECT id FROM voucher_header_tbl WHERE vch_type = ${JOURNAL_VCH_TYPE} AND vch_code = ${data.vch_code} AND id != ${data.id}
    `
    if (duplicate.length > 0) {
      return NextResponse.json({ error: "رقم السند مستخدم مسبقاً" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)

    // الحذف الناعم (status=3) يتخطى شرط توازن القيد — السند يُلغى وليس يُرحَّل.
    let journalRows: JournalRow[] = []
    let amount = Number(data.amount || 0)
    if (status !== 3) {
      journalRows = buildJournalRows(data)
      const balanceError = validateBalance(journalRows)
      if (balanceError) return NextResponse.json({ error: balanceError }, { status: 400 })
      amount = journalRows.filter((r) => r.credit_debit === 1).reduce((s, r) => s + r.amount, 0)
    }

    const result = await sql`
      UPDATE voucher_header_tbl
      SET
        vch_code = ${data.vch_code},
        vch_date = ${data.vch_date},
        vch_book_id = ${data.vch_book_id || null},
        currency_id = ${data.currency_id || null},
        rate = ${Number(data.rate || 1)},
        amount = ${amount},
        payment_classification_id = ${data.payment_classification_id || null},
        salesman_id = ${data.salesman_id || null},
        manual_voucher = ${data.manual_voucher || ""},
        manual_date = ${data.manual_date || null},
        note = ${data.note || ""},
        status = ${status},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING *
    `

    if (result.length === 0) return NextResponse.json({ error: "السند غير موجود" }, { status: 404 })

    const voucher = result[0]
    if (status !== 3) {
      await saveJournalRows(voucher.id, journalRows)
      await saveNoteRows(voucher.id, data.notes)
    }

    const details = await fetchDetails(voucher.id)
    return NextResponse.json({ ...voucher, ...details })
  } catch (error) {
    console.error("Error updating journal voucher:", error)
    return NextResponse.json({ error: "Failed to update journal voucher" }, { status: 500 })
  }
}
