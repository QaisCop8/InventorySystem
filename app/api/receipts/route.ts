import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import {
  ensureTables,
  buildJournalRows,
  saveJournalRows,
  saveChequeRows,
  saveCardRows,
  saveNoteRows,
  fetchDetails,
  validateJournalAccountCurrencies,
  validateChequeDuplicates,
  validateManualChequeEntry,
  validateChequeBankAccounts,
  validateChequeBookLeaves,
  consumeChequeBookLeaves,
  releaseChequeBookLeaves,
} from "./_lib"

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
    if (!(Number(data.rate) > 0)) {
      return NextResponse.json({ error: "سعر الصرف يجب أن يكون أكبر من صفر" }, { status: 400 })
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
    const currencyError = await validateJournalAccountCurrencies(journalRows, data.currency_id ? Number(data.currency_id) : null)
    if (currencyError) return NextResponse.json({ error: currencyError }, { status: 400 })
    const chequeDuplicateError = await validateChequeDuplicates(null, data.cheques)
    if (chequeDuplicateError) return NextResponse.json({ error: chequeDuplicateError }, { status: 400 })
    const chequeBankAccountError = await validateChequeBankAccounts(vchType, data.cheques)
    if (chequeBankAccountError) return NextResponse.json({ error: chequeBankAccountError }, { status: 400 })
    const manualChequeError = await validateManualChequeEntry(vchType, data.cheques)
    if (manualChequeError) return NextResponse.json({ error: manualChequeError }, { status: 400 })
    const chequeLeavesError = await validateChequeBookLeaves(null, data.cheques)
    if (chequeLeavesError) return NextResponse.json({ error: chequeLeavesError }, { status: 400 })

    const status = Number(data.status || 1)
    const result = await sql`
      INSERT INTO voucher_header_tbl (
        vch_type, vch_code, vch_date, vch_book_id, currency_id, rate,
        account_id, customer_name, to_account_id,
        cash_amount, cash_account_id, check_amount, check_account_id,
        credit_card_amount, credit_card_account_id,
        amount, payment_classification_id, salesman_id, manual_voucher, manual_date, note, status, vch_status, is_printed,
        insert_user
      ) VALUES (
        ${vchType}, ${data.vch_code}, ${data.vch_date}, ${data.vch_book_id || null}, ${data.currency_id || null}, ${Number(data.rate || 1)},
        ${data.account_id || null}, ${data.customer_name || ""}, ${data.to_account_id || null},
        ${cashAmount}, ${data.cash_account_id || null}, ${checkAmount}, ${data.check_account_id || null},
        ${creditCardAmount}, ${data.credit_card_account_id || null},
        ${amount}, ${data.payment_classification_id || null}, ${data.salesman_id || null}, ${data.manual_voucher || ""}, ${data.manual_date || null}, ${data.note || ""}, ${status}, ${status === 2 ? 2 : 1}, ${Number(data.is_printed || 0)},
        ${data.insert_user || null}
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
    await consumeChequeBookLeaves(voucher.id, data.vch_date, data.cheques)

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
    if (!(Number(data.rate) > 0)) {
      return NextResponse.json({ error: "سعر الصرف يجب أن يكون أكبر من صفر" }, { status: 400 })
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

    // سند مُرحَّل (status=2) مقفل: التعديل العادي عليه ممنوع من الواجهة، ونمنعه هنا أيضاً كخط
    // دفاع ثانٍ — الاستثناء الوحيد هو إلغاؤه منطقياً (status=3) عبر تأكيد الحذف.
    const currentRows = await sql`SELECT status FROM voucher_header_tbl WHERE id = ${data.id}`
    if (currentRows.length > 0 && Number(currentRows[0].status) === 2 && status !== 3) {
      return NextResponse.json({ error: "السند مرحل ولا يمكن تعديله" }, { status: 400 })
    }

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
      const currencyError = await validateJournalAccountCurrencies(journalRows, data.currency_id ? Number(data.currency_id) : null)
      if (currencyError) return NextResponse.json({ error: currencyError }, { status: 400 })
      const chequeDuplicateError = await validateChequeDuplicates(data.id, data.cheques)
      if (chequeDuplicateError) return NextResponse.json({ error: chequeDuplicateError }, { status: 400 })
      const chequeBankAccountError = await validateChequeBankAccounts(vchType, data.cheques)
      if (chequeBankAccountError) return NextResponse.json({ error: chequeBankAccountError }, { status: 400 })
      const manualChequeError = await validateManualChequeEntry(vchType, data.cheques)
      if (manualChequeError) return NextResponse.json({ error: manualChequeError }, { status: 400 })
      const chequeLeavesError = await validateChequeBookLeaves(data.id, data.cheques)
      if (chequeLeavesError) return NextResponse.json({ error: chequeLeavesError }, { status: 400 })
    }

    const result = await sql`
      UPDATE voucher_header_tbl
      SET
        vch_code = ${data.vch_code},
        vch_date = ${data.vch_date},
        vch_book_id = ${data.vch_book_id || null},
        currency_id = ${data.currency_id || null},
        rate = ${Number(data.rate || 1)},
        account_id = ${data.account_id || null},
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
        vch_status = ${status === 2 ? 2 : 1},
        is_printed = ${Number(data.is_printed || 0)},
        last_update_date = CURRENT_TIMESTAMP
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
      await consumeChequeBookLeaves(voucher.id, data.vch_date, data.cheques)
    } else {
      // إلغاء منطقي — تحرير أي أوراق شيكات كانت محجوزة لهذا السند.
      await releaseChequeBookLeaves(voucher.id)
    }

    const details = await fetchDetails(voucher.id)
    return NextResponse.json({ ...voucher, ...details })
  } catch (error) {
    console.error("Error updating voucher:", error)
    return NextResponse.json({ error: "Failed to update voucher" }, { status: 500 })
  }
}
