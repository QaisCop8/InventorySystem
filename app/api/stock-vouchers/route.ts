import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import {
  ensureTables,
  saveVoucherItems,
  fetchVoucherItems,
  applyVoucherStockEffect,
  reverseStockMovement,
  buildUseVoucherJournalRows,
  validateVoucherCodeFormat,
  regenerateVoucherCode,
  USE_VOUCHER_VCH_TYPE,
  INTERNAL_DELIVERY_VCH_TYPE,
  STOCK_VOUCHER_TYPES,
} from "./_lib"

// حد أقصى لمحاولات توليد رقم بديل عند تعارض (رقم مستخدم مسبقاً من سند أُدخِل بنفس اللحظة من
// مستخدم آخر) — وقاية من حلقة لا نهائية في الحالة النادرة لفشل توليد رقم صالح باستمرار.
const MAX_CODE_RETRY_ATTEMPTS = 5
import { saveJournalRows, validateJournalAccountCurrencies } from "../receipts/_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()

    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || STOCK_VOUCHER_TYPES[0])

    const rows = await sql`
      SELECT * FROM voucher_header_tbl
      WHERE vch_type = ${vchType} AND status != 3
      ORDER BY id DESC
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching stock vouchers:", error)
    return NextResponse.json({ error: "Failed to fetch stock vouchers" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()

    const vchType = Number(data.vch_type)
    if (!STOCK_VOUCHER_TYPES.includes(vchType as any) || !data.vch_code || !data.vch_date) {
      return NextResponse.json({ error: "بيانات السند غير مكتملة" }, { status: 400 })
    }
    if (!(Number(data.rate) > 0)) {
      return NextResponse.json({ error: "سعر الصرف يجب أن يكون أكبر من صفر" }, { status: 400 })
    }

    const codeFormatError = await validateVoucherCodeFormat(request.url, vchType, data.vch_book_id ?? null, data.vch_code)
    if (codeFormatError) {
      return NextResponse.json({ error: codeFormatError }, { status: 400 })
    }

    // تعارض الرقم (مستخدم مسبقاً) هنا غالباً ليس خطأ مستخدم بل أثر تزامن — سندان أُنشئا بنفس اللحظة
    // من مستخدمين مختلفين على نفس الدفتر حصلا على نفس الرقم التالي عبر /generate-number (قراءة
    // MAX+1 عادية بلا قفل). بدل رفض الحفظ، يُعاد توليد رقم بديل والمحاولة من جديد بضع مرات.
    let vchCode = String(data.vch_code)
    let existing = await sql`
      SELECT id FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${vchCode}
    `
    let regenerateAttempts = 0
    while (existing.length > 0 && regenerateAttempts < MAX_CODE_RETRY_ATTEMPTS) {
      const regenerated = await regenerateVoucherCode(request.url, vchType, data.vch_book_id ?? null)
      if (!regenerated || regenerated === vchCode) break
      vchCode = regenerated
      existing = await sql`SELECT id FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${vchCode}`
      regenerateAttempts++
    }
    if (existing.length > 0) {
      return NextResponse.json({ error: "رقم السند مستخدم مسبقاً" }, { status: 400 })
    }

    const items = Array.isArray(data.items) ? data.items.filter((i: any) => i?.product_id) : []
    if (items.length === 0) {
      return NextResponse.json({ error: "يجب إدخال صنف واحد على الأقل" }, { status: 400 })
    }
    if (items.some((i: any) => !i.warehouse_id)) {
      return NextResponse.json({ error: "يجب اختيار المستودع لكل صنف" }, { status: 400 })
    }
    if (items.some((i: any) => !(Number(i.quantity || 0) > 0))) {
      return NextResponse.json({ error: "يجب إدخال الكمية لكل صنف" }, { status: 400 })
    }
    if (vchType === INTERNAL_DELIVERY_VCH_TYPE && (!data.from_store_id || !data.to_store_id)) {
      return NextResponse.json({ error: "يجب اختيار المستودع المرسل والمستودع المستلم" }, { status: 400 })
    }
    if (vchType === INTERNAL_DELIVERY_VCH_TYPE && Number(data.from_store_id) === Number(data.to_store_id)) {
      return NextResponse.json({ error: "لا يمكن أن يكون المستودع المرسل والمستلم نفس المستودع" }, { status: 400 })
    }

    const amount = items.reduce((sum: number, i: any) => sum + Number(i.total_price || 0), 0)

    let journalRows: any[] = []
    if (vchType === USE_VOUCHER_VCH_TYPE) {
      journalRows = buildUseVoucherJournalRows(items, data.currency_id || null, Number(data.rate || 1))
      const totalDebit = journalRows.filter((r) => r.credit_debit === 1).reduce((s, r) => s + r.amount, 0)
      const totalCredit = journalRows.filter((r) => r.credit_debit === 2).reduce((s, r) => s + r.amount, 0)
      if (Math.round((totalDebit - totalCredit) * 100) / 100 !== 0) {
        return NextResponse.json({ error: "القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن" }, { status: 400 })
      }
      const currencyError = await validateJournalAccountCurrencies(journalRows, data.currency_id ? Number(data.currency_id) : null)
      if (currencyError) return NextResponse.json({ error: currencyError }, { status: 400 })
    }

    const status = Number(data.status || 1)
    const result = await sql`
      INSERT INTO voucher_header_tbl (
        vch_type, vch_code, vch_date, vch_book_id, currency_id, rate,
        account_id, customer_name, to_store_id, from_store_id,
        amount, manual_voucher, manual_date, note, status, vch_status, is_printed,
        insert_user
      ) VALUES (
        ${vchType}, ${vchCode}, ${data.vch_date}, ${data.vch_book_id || null}, ${data.currency_id || null}, ${Number(data.rate || 1)},
        ${data.account_id || null}, ${data.customer_name || ""}, ${data.to_store_id || null}, ${data.from_store_id || null},
        ${amount}, ${data.manual_voucher || ""}, ${data.manual_date || null}, ${data.note || ""}, ${status}, ${status === 2 ? 2 : 1}, ${Number(data.is_printed || 0)},
        ${data.insert_user || null}
      )
      RETURNING *
    `

    const voucher = result[0]
    const savedItems = await saveVoucherItems(voucher.id, items)
    if (vchType === USE_VOUCHER_VCH_TYPE) {
      await saveJournalRows(voucher.id, journalRows)
    }
    if (status === 2) {
      await applyVoucherStockEffect(vchType, voucher.id, savedItems, data.from_store_id || null, data.to_store_id || null)
    }

    const savedItemsWithNames = await fetchVoucherItems(voucher.id)
    return NextResponse.json({ ...voucher, items: savedItemsWithNames }, { status: 201 })
  } catch (error) {
    console.error("Error creating stock voucher:", error)
    return NextResponse.json({ error: "Failed to create stock voucher" }, { status: 500 })
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
    if (!STOCK_VOUCHER_TYPES.includes(vchType as any) || !data.vch_code || !data.vch_date) {
      return NextResponse.json({ error: "بيانات السند غير مكتملة" }, { status: 400 })
    }
    if (!(Number(data.rate) > 0)) {
      return NextResponse.json({ error: "سعر الصرف يجب أن يكون أكبر من صفر" }, { status: 400 })
    }

    const codeFormatError = await validateVoucherCodeFormat(request.url, vchType, data.vch_book_id ?? null, data.vch_code)
    if (codeFormatError) {
      return NextResponse.json({ error: codeFormatError }, { status: 400 })
    }

    const duplicate = await sql`
      SELECT id FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${data.vch_code} AND id != ${data.id}
    `
    if (duplicate.length > 0) {
      return NextResponse.json({ error: "رقم السند مستخدم مسبقاً" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)

    // سند مُرحَّل (status=2) مقفل: التعديل العادي عليه ممنوع، والاستثناء الوحيد هو إلغاؤه
    // منطقياً (status=3) — مطابق تماماً لقفل receipts/route.ts.
    const currentRows = await sql`SELECT status FROM voucher_header_tbl WHERE id = ${data.id}`
    if (currentRows.length === 0) {
      return NextResponse.json({ error: "السند غير موجود" }, { status: 404 })
    }
    const previousStatus = Number(currentRows[0].status)
    if (previousStatus === 2 && status !== 3) {
      return NextResponse.json({ error: "السند مرحل ولا يمكن تعديله" }, { status: 400 })
    }

    let items: any[] = []
    let journalRows: any[] = []
    if (status !== 3) {
      items = Array.isArray(data.items) ? data.items.filter((i: any) => i?.product_id) : []
      if (items.length === 0) {
        return NextResponse.json({ error: "يجب إدخال صنف واحد على الأقل" }, { status: 400 })
      }
      if (items.some((i: any) => !i.warehouse_id)) {
        return NextResponse.json({ error: "يجب اختيار المستودع لكل صنف" }, { status: 400 })
      }
      if (items.some((i: any) => !(Number(i.quantity || 0) > 0))) {
        return NextResponse.json({ error: "يجب إدخال الكمية لكل صنف" }, { status: 400 })
      }
      if (vchType === INTERNAL_DELIVERY_VCH_TYPE && (!data.from_store_id || !data.to_store_id)) {
        return NextResponse.json({ error: "يجب اختيار المستودع المرسل والمستودع المستلم" }, { status: 400 })
      }
      if (vchType === INTERNAL_DELIVERY_VCH_TYPE && Number(data.from_store_id) === Number(data.to_store_id)) {
        return NextResponse.json({ error: "لا يمكن أن يكون المستودع المرسل والمستلم نفس المستودع" }, { status: 400 })
      }
      if (vchType === USE_VOUCHER_VCH_TYPE) {
        journalRows = buildUseVoucherJournalRows(items, data.currency_id || null, Number(data.rate || 1))
        const totalDebit = journalRows.filter((r) => r.credit_debit === 1).reduce((s, r) => s + r.amount, 0)
        const totalCredit = journalRows.filter((r) => r.credit_debit === 2).reduce((s, r) => s + r.amount, 0)
        if (Math.round((totalDebit - totalCredit) * 100) / 100 !== 0) {
          return NextResponse.json({ error: "القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن" }, { status: 400 })
        }
        const currencyError = await validateJournalAccountCurrencies(journalRows, data.currency_id ? Number(data.currency_id) : null)
        if (currencyError) return NextResponse.json({ error: currencyError }, { status: 400 })
      }
    }

    const amount = items.reduce((sum: number, i: any) => sum + Number(i.total_price || 0), 0)

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
        to_store_id = ${data.to_store_id || null},
        from_store_id = ${data.from_store_id || null},
        amount = ${amount},
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

    const voucher = result[0]

    // إلغاء منطقي (status=3): تُعكَس حركة المخزون (إن وُجدت) وتُحذف أسطر الأصناف/القيد، دون حذف
    // رأسية السند نفسها (تبقى مؤرشفة بحالة "محذوف" ضمن voucher_header_tbl، مطابقةً لسند القيد).
    if (status === 3) {
      await reverseStockMovement(voucher.id)
      await sql`DELETE FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucher.id}`
      await sql`DELETE FROM voucher_items_tbl WHERE voucher_id = ${voucher.id}`
      return NextResponse.json({ ...voucher, items: [] })
    }

    const savedItems = await saveVoucherItems(voucher.id, items)
    if (vchType === USE_VOUCHER_VCH_TYPE) {
      await saveJournalRows(voucher.id, journalRows)
    }
    // تُطبَّق حركة المخزون فقط عند الانتقال الفعلي إلى status=2 (لم تكن مُرحَّلة سابقاً) — تعديل
    // سند فعال يبقى فعالاً (draft → draft) لا يحرّك المخزون إطلاقاً.
    if (status === 2 && previousStatus !== 2) {
      await applyVoucherStockEffect(vchType, voucher.id, savedItems, data.from_store_id || null, data.to_store_id || null)
    }

    const savedItemsWithNames = await fetchVoucherItems(voucher.id)
    return NextResponse.json({ ...voucher, items: savedItemsWithNames })
  } catch (error) {
    console.error("Error updating stock voucher:", error)
    return NextResponse.json({ error: "Failed to update stock voucher" }, { status: 500 })
  }
}
