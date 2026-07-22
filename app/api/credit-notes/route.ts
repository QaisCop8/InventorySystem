import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import {
  ensureTables,
  buildCreditNoteJournalRows,
  saveJournalRows,
  fetchCreditNoteDetails,
  validateJournalAccountCurrencies,
} from "./_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()

    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || 10)

    const rows = await sql`
      SELECT * FROM voucher_header_tbl
      WHERE vch_type = ${vchType} AND status != 3
      ORDER BY id DESC
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching credit/debit notes:", error)
    return NextResponse.json({ error: "Failed to fetch credit/debit notes" }, { status: 500 })
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

    if (!data.account_id) return NextResponse.json({ error: "يجب اختيار العميل" }, { status: 400 })
    if (!data.debit_account_id) return NextResponse.json({ error: "يجب اختيار الحساب المدين" }, { status: 400 })
    if (!data.vat_account_id) return NextResponse.json({ error: "يجب اختيار حساب الضريبة" }, { status: 400 })

    const amount = Number(data.amount || 0)
    if (amount <= 0) return NextResponse.json({ error: "يجب إدخال المبلغ" }, { status: 400 })

    const journalRows = buildCreditNoteJournalRows(data, vchType)
    const totalDebit = journalRows.filter((r) => r.credit_debit === 1).reduce((s, r) => s + r.amount, 0)
    const totalCredit = journalRows.filter((r) => r.credit_debit === 2).reduce((s, r) => s + r.amount, 0)
    if (Math.round((totalDebit - totalCredit) * 100) / 100 !== 0) {
      return NextResponse.json({ error: "القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن" }, { status: 400 })
    }
    const currencyError = await validateJournalAccountCurrencies(journalRows, data.currency_id ? Number(data.currency_id) : null)
    if (currencyError) return NextResponse.json({ error: currencyError }, { status: 400 })

    const status = Number(data.status || 1)
    const result = await sql`
      INSERT INTO voucher_header_tbl (
        vch_type, vch_code, vch_date, vch_book_id, currency_id, rate,
        account_id, customer_name, debit_account_id, vat_account_id,
        amount, amount_journal_type_8, vat, vat_percent,
        payment_classification_id, salesman_id, manual_voucher, manual_date, note, status, vch_status, is_printed,
        insert_user
      ) VALUES (
        ${vchType}, ${data.vch_code}, ${data.vch_date}, ${data.vch_book_id || null}, ${data.currency_id || null}, ${Number(data.rate || 1)},
        ${data.account_id}, ${data.customer_name || ""}, ${data.debit_account_id}, ${data.vat_account_id},
        ${amount}, ${Number(data.amount_journal_type_8 || 0)}, ${Number(data.vat || 0)}, ${Number(data.vat_percent || 0)},
        ${data.payment_classification_id || null}, ${data.salesman_id || null}, ${data.manual_voucher || ""}, ${data.manual_date || null}, ${data.note || ""}, ${status}, ${status === 2 ? 2 : 1}, ${Number(data.is_printed || 0)},
        ${data.insert_user || null}
      )
      RETURNING *
    `

    const voucher = result[0]
    await saveJournalRows(voucher.id, journalRows)

    const details = await fetchCreditNoteDetails(voucher.id)
    return NextResponse.json({ ...voucher, ...details }, { status: 201 })
  } catch (error) {
    console.error("Error creating credit/debit note:", error)
    return NextResponse.json({ error: "Failed to create credit/debit note" }, { status: 500 })
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

    const status = Number(data.status ?? 1)

    // سند مُرحَّل (status=2) مقفل: التعديل العادي عليه ممنوع من الواجهة، ونمنعه هنا أيضاً كخط
    // دفاع ثانٍ — الاستثناء الوحيد هو إلغاؤه منطقياً (status=3) عبر تأكيد الحذف.
    const currentRows = await sql`SELECT status FROM voucher_header_tbl WHERE id = ${data.id}`
    if (currentRows.length > 0 && Number(currentRows[0].status) === 2 && status !== 3) {
      return NextResponse.json({ error: "السند مرحل ولا يمكن تعديله" }, { status: 400 })
    }

    const amount = Number(data.amount || 0)
    let journalRows: any[] = []
    if (status !== 3) {
      if (!data.account_id) return NextResponse.json({ error: "يجب اختيار العميل" }, { status: 400 })
      if (!data.debit_account_id) return NextResponse.json({ error: "يجب اختيار الحساب المدين" }, { status: 400 })
      if (!data.vat_account_id) return NextResponse.json({ error: "يجب اختيار حساب الضريبة" }, { status: 400 })
      if (amount <= 0) return NextResponse.json({ error: "يجب إدخال المبلغ" }, { status: 400 })

      journalRows = buildCreditNoteJournalRows(data, vchType)
      const totalDebit = journalRows.filter((r) => r.credit_debit === 1).reduce((s, r) => s + r.amount, 0)
      const totalCredit = journalRows.filter((r) => r.credit_debit === 2).reduce((s, r) => s + r.amount, 0)
      if (Math.round((totalDebit - totalCredit) * 100) / 100 !== 0) {
        return NextResponse.json({ error: "القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن" }, { status: 400 })
      }
      const currencyError = await validateJournalAccountCurrencies(journalRows, data.currency_id ? Number(data.currency_id) : null)
      if (currencyError) return NextResponse.json({ error: currencyError }, { status: 400 })
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
        debit_account_id = ${data.debit_account_id || null},
        vat_account_id = ${data.vat_account_id || null},
        amount = ${amount},
        amount_journal_type_8 = ${Number(data.amount_journal_type_8 || 0)},
        vat = ${Number(data.vat || 0)},
        vat_percent = ${Number(data.vat_percent || 0)},
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
    }

    const details = await fetchCreditNoteDetails(voucher.id)
    return NextResponse.json({ ...voucher, ...details })
  } catch (error) {
    console.error("Error updating credit/debit note:", error)
    return NextResponse.json({ error: "Failed to update credit/debit note" }, { status: 500 })
  }
}
