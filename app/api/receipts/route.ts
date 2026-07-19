import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables, buildJournalRows, saveJournalRows, saveChequeRows, saveCardRows, saveNoteRows, fetchDetails } from "./_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()

    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || 1)

    const rows = await sql`
      SELECT * FROM voucher_header_tbl
      WHERE vch_type = ${vchType} AND status != 3
      ORDER BY id DESC
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching vouchers:", error)
    return NextResponse.json({ error: "Failed to fetch vouchers" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()

    const vchType = Number(data.vch_type)
    if (!vchType || !data.vch_code || !data.vch_date) {
      return NextResponse.json({ error: "بيانات السند غير مكتملة" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${data.vch_code}
    `
    if (existing.length > 0) {
      return NextResponse.json({ error: "رقم السند مستخدم مسبقاً" }, { status: 400 })
    }

    const cashAmount = Number(data.cash_amount || 0)
    const checkAmount = Number(data.check_amount || 0)
    const creditCardAmount = Number(data.credit_card_amount || 0)
    const amount = Number(data.amount || cashAmount + checkAmount + creditCardAmount)

    const journalRows = buildJournalRows({ ...data, amount }, vchType)
    if (journalRows.length < 2) {
      return NextResponse.json({ error: "يجب أن يحتوي السند على قيدين محاسبيين على الأقل (طرف مدين وطرف دائن)" }, { status: 400 })
    }
    const totalDebit = journalRows.filter((r) => r.credit_debit === 1).reduce((s, r) => s + r.amount, 0)
    const totalCredit = journalRows.filter((r) => r.credit_debit === 2).reduce((s, r) => s + r.amount, 0)
    if (Math.round((totalDebit - totalCredit) * 100) / 100 !== 0) {
      return NextResponse.json({ error: "القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO voucher_header_tbl (
        vch_type, vch_code, vch_date, vch_book_id, currency_id, rate,
        customer_account_id, customer_name, to_account_id,
        cash_amount, cash_account_id, check_amount, check_account_id,
        credit_card_amount, credit_card_account_id,
        amount, payment_classification_id, salesman_id, manual_voucher, manual_date, note, status
      ) VALUES (
        ${vchType}, ${data.vch_code}, ${data.vch_date}, ${data.vch_book_id || null}, ${data.currency_id || null}, ${Number(data.rate || 1)},
        ${data.customer_account_id || null}, ${data.customer_name || ""}, ${data.to_account_id || null},
        ${cashAmount}, ${data.cash_account_id || null}, ${checkAmount}, ${data.check_account_id || null},
        ${creditCardAmount}, ${data.credit_card_account_id || null},
        ${amount}, ${data.payment_classification_id || null}, ${data.salesman_id || null}, ${data.manual_voucher || ""}, ${data.manual_date || null}, ${data.note || ""}, ${Number(data.status || 1)}
      )
      RETURNING *
    `

    const voucher = result[0]
    await saveJournalRows(voucher.id, journalRows)
    await saveChequeRows(voucher.id, data.cheques, {
      vchType,
      currencyId: data.currency_id || null,
      rate: Number(data.rate || 1),
      vchDate: data.vch_date,
      checkAccountId: data.check_account_id || null,
    })
    await saveCardRows(voucher.id, data.cards, data.currency_id || null)
    await saveNoteRows(voucher.id, data.notes)

    const details = await fetchDetails(voucher.id)
    return NextResponse.json({ ...voucher, ...details }, { status: 201 })
  } catch (error) {
    console.error("Error creating voucher:", error)
    return NextResponse.json({ error: "Failed to create voucher" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: "معرف السند مطلوب" }, { status: 400 })
    }

    const vchType = Number(data.vch_type)
    if (!vchType || !data.vch_code || !data.vch_date) {
      return NextResponse.json({ error: "بيانات السند غير مكتملة" }, { status: 400 })
    }

    const duplicate = await sql`
      SELECT id FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${data.vch_code} AND id != ${data.id}
    `
    if (duplicate.length > 0) {
      return NextResponse.json({ error: "رقم السند مستخدم مسبقاً" }, { status: 400 })
    }

    const cashAmount = Number(data.cash_amount || 0)
    const checkAmount = Number(data.check_amount || 0)
    const creditCardAmount = Number(data.credit_card_amount || 0)
    const amount = Number(data.amount || cashAmount + checkAmount + creditCardAmount)
    const status = Number(data.status ?? 1)

    // Soft-deletes (status=3) skip the balance requirement — the record is being retired, not posted.
    let journalRows: any[] = []
    if (status !== 3) {
      journalRows = buildJournalRows({ ...data, amount }, vchType)
      if (journalRows.length < 2) {
        return NextResponse.json({ error: "يجب أن يحتوي السند على قيدين محاسبيين على الأقل (طرف مدين وطرف دائن)" }, { status: 400 })
      }
      const totalDebit = journalRows.filter((r) => r.credit_debit === 1).reduce((s, r) => s + r.amount, 0)
      const totalCredit = journalRows.filter((r) => r.credit_debit === 2).reduce((s, r) => s + r.amount, 0)
      if (Math.round((totalDebit - totalCredit) * 100) / 100 !== 0) {
        return NextResponse.json({ error: "القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن" }, { status: 400 })
      }
    }

    const result = await sql`
      UPDATE voucher_header_tbl
      SET
        vch_code = ${data.vch_code},
        vch_date = ${data.vch_date},
        vch_book_id = ${data.vch_book_id || null},
        currency_id = ${data.currency_id || null},
        rate = ${Number(data.rate || 1)},
        customer_account_id = ${data.customer_account_id || null},
        customer_name = ${data.customer_name || ""},
        to_account_id = ${data.to_account_id || null},
        cash_amount = ${cashAmount},
        cash_account_id = ${data.cash_account_id || null},
        check_amount = ${checkAmount},
        check_account_id = ${data.check_account_id || null},
        credit_card_amount = ${creditCardAmount},
        credit_card_account_id = ${data.credit_card_account_id || null},
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

    if (result.length === 0) {
      return NextResponse.json({ error: "السند غير موجود" }, { status: 404 })
    }

    const voucher = result[0]
    if (status !== 3) {
      await saveJournalRows(voucher.id, journalRows)
      await saveChequeRows(voucher.id, data.cheques, {
        vchType,
        currencyId: data.currency_id || null,
        rate: Number(data.rate || 1),
        vchDate: data.vch_date,
        checkAccountId: data.check_account_id || null,
      })
      await saveCardRows(voucher.id, data.cards, data.currency_id || null)
      await saveNoteRows(voucher.id, data.notes)
    }

    const details = await fetchDetails(voucher.id)
    return NextResponse.json({ ...voucher, ...details })
  } catch (error) {
    console.error("Error updating voucher:", error)
    return NextResponse.json({ error: "Failed to update voucher" }, { status: 500 })
  }
}
