import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import {
  ensureTables,
  saveSalesVoucherItems,
  fetchSalesVoucherItems,
  applySalesVoucherStockEffect,
  reverseSalesVoucherStockMovement,
  generateSalesVoucherCode,
  getSalesVoucherNumberSettings,
  resolveVoucherBookName,
  SALES_VOUCHER_TYPES,
  ITEM_ACCOUNT_VCH_TYPES,
  validateItemAccounts,
  buildSalesVoucherJournalRows,
  saveJournalRows,
  validateJournalAccountCurrencies,
} from "./_lib"
import { validateItemReferences } from "@/app/api/stock-vouchers/_lib"

const MAX_CODE_RETRY_ATTEMPTS = 5

export async function GET(request: NextRequest) {
  try {
    await ensureTables()

    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || SALES_VOUCHER_TYPES[1])

    const rows = await sql`
      SELECT * FROM voucher_header_tbl
      WHERE vch_type = ${vchType} AND status != 3
      ORDER BY id DESC
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching sales vouchers:", error)
    return NextResponse.json({ error: "Failed to fetch sales vouchers" }, { status: 500 })
  }
}

// يعيد توليد رقم بديل عند تعارض (سباق تزامن بين مستخدمَين على نفس الدفتر)، بنفس منطق
// stock-vouchers/route.ts تماماً.
const regenerateOnConflict = async (requestUrl: string, vchType: number, vchBookId: number | null, vchCode: string) => {
  let code = vchCode
  let existing = await sql`SELECT id FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${code}`
  let attempts = 0
  while (existing.length > 0 && attempts < MAX_CODE_RETRY_ATTEMPTS) {
    const regenerated = await generateSalesVoucherCode(requestUrl, vchType, vchBookId)
    if (!regenerated || regenerated === code) break
    code = regenerated
    existing = await sql`SELECT id FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${code}`
    attempts++
  }
  return { code, conflict: existing.length > 0 }
}

const validateCodeFormat = async (requestUrl: string, vchType: number, vchBookId: number | null, vchCode: string): Promise<string | null> => {
  const code = String(vchCode || "").trim().toUpperCase()
  if (!code) return "رقم السند مطلوب"
  const bookName = await resolveVoucherBookName(vchBookId)
  if (!bookName) return null
  const { prefix } = await getSalesVoucherNumberSettings(requestUrl, vchType)
  if (!code.startsWith(prefix)) return `رقم السند يجب أن يبدأ بـ ${prefix}`
  if (code.length < prefix.length + bookName.length) return "رقم السند غير مكتمل"
  return null
}

const validatePayload = (data: any, items: any[]): string | null => {
  if (!SALES_VOUCHER_TYPES.includes(Number(data.vch_type) as any) || !data.vch_code || !data.vch_date) {
    return "بيانات السند غير مكتملة"
  }
  if (!(Number(data.rate) > 0)) return "سعر الصرف يجب أن يكون أكبر من صفر"
  if (!data.account_id) return "يجب اختيار العميل"
  if (items.length === 0) return "يجب إدخال صنف واحد على الأقل"
  if (items.some((i: any) => !i.warehouse_id)) return "يجب اختيار المستودع لكل صنف"
  if (items.some((i: any) => !(Number(i.quantity || 0) > 0))) return "يجب إدخال الكمية لكل صنف"
  const itemAccountsError = validateItemAccounts(Number(data.vch_type), items)
  if (itemAccountsError) return itemAccountsError
  return null
}

// نفس معادلة totals في unified-sales-delivery.tsx بالضبط (بمعزل عن الواجهة) — خصم/ضريبة بمستوى
// السند كاملاً، لا لكل سطر: المجموع الفرعي (كمية × سعر لكل الأصناف)، ثم خصم (نسبة أو مبلغ ثابت)،
// ثم ضريبة على الصافي بعد الخصم.
const computeTotalAmount = (items: any[], data: any): number => {
  const subtotal = items.reduce((sum: number, i: any) => sum + Number(i.quantity || 0) * Number(i.unit_price || 0), 0)
  const discountValue = Number(data.discount_value || 0)
  const discount = data.discount_type === "amount" ? discountValue : (subtotal * discountValue) / 100
  const taxPercent = Number(data.vat_percent || 0)
  const tax = ((subtotal - discount) * taxPercent) / 100
  return Math.round((subtotal - discount + tax) * 100) / 100
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()
    const vchType = Number(data.vch_type)
    const items = Array.isArray(data.items) ? data.items.filter((i: any) => i?.product_id) : []

    const payloadError = validatePayload(data, items)
    if (payloadError) return NextResponse.json({ error: payloadError }, { status: 400 })

    // المستودع/الوحدة موجودان ونشطان فعلياً، وكذلك حساب الصنف لفاتورة مبيعات/مشتريات ومردود
    // مبيعات/مشتريات تحديداً — بمعزل عمّا رآه العميل عند اختيارهم (قد يكونوا حُذفوا أو أُوقِفوا).
    const referencesError = await validateItemReferences(items, (ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType) ? ["account_id"] : [])
    if (referencesError) return NextResponse.json({ error: referencesError }, { status: 400 })

    const codeFormatError = await validateCodeFormat(request.url, vchType, data.vch_book_id ?? null, data.vch_code)
    if (codeFormatError) return NextResponse.json({ error: codeFormatError }, { status: 400 })

    const { code: vchCode, conflict } = await regenerateOnConflict(request.url, vchType, data.vch_book_id ?? null, String(data.vch_code))
    if (conflict) return NextResponse.json({ error: "رقم السند مستخدم مسبقاً" }, { status: 400 })

    let journalRows: any[] = []
    if ((ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType)) {
      journalRows = buildSalesVoucherJournalRows(vchType, items, data.account_id ?? null, data.currency_id || null, Number(data.rate || 1))
      const currencyError = await validateJournalAccountCurrencies(journalRows, data.currency_id ? Number(data.currency_id) : null)
      if (currencyError) return NextResponse.json({ error: currencyError }, { status: 400 })
    }

    const amount = computeTotalAmount(items, data)
    const status = Number(data.status || 1)
    const discountType = data.discount_type === "amount" ? "amount" : "percentage"

    const result = await sql`
      INSERT INTO voucher_header_tbl (
        vch_type, vch_code, vch_date, vch_book_id, currency_id, rate,
        account_id, customer_name, to_store_id,
        amount, manual_voucher, manual_date, note, status, vch_status, is_printed,
        insert_user, shipping_address, salesman_id, linked_order_id,
        discount_type, discount_value, vat_percent
      ) VALUES (
        ${vchType}, ${vchCode}, ${data.vch_date}, ${data.vch_book_id || null}, ${data.currency_id || null}, ${Number(data.rate || 1)},
        ${data.account_id}, ${data.customer_name || ""}, ${data.to_store_id || null},
        ${amount}, ${data.manual_voucher || ""}, ${data.manual_date || null}, ${data.note || ""}, ${status}, ${status === 2 ? 2 : 1}, ${Number(data.is_printed || 0)},
        ${data.insert_user || null}, ${data.shipping_address || ""}, ${data.salesman_id || null}, ${data.linked_order_id || null},
        ${discountType}, ${Number(data.discount_value || 0)}, ${Number(data.vat_percent || 0)}
      )
      RETURNING *
    `

    const voucher = result[0]
    const savedItems = await saveSalesVoucherItems(voucher.id, items)
    if ((ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType)) {
      await saveJournalRows(voucher.id, journalRows)
    }
    if (status === 2) {
      await applySalesVoucherStockEffect(vchType, voucher.id, savedItems)
    }

    const savedItemsWithNames = await fetchSalesVoucherItems(voucher.id)
    return NextResponse.json({ ...voucher, items: savedItemsWithNames }, { status: 201 })
  } catch (error) {
    console.error("Error creating sales voucher:", error)
    return NextResponse.json({ error: "Failed to create sales voucher" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()
    if (!data.id) return NextResponse.json({ error: "معرف السند مطلوب" }, { status: 400 })

    const vchType = Number(data.vch_type)
    const status = Number(data.status ?? 1)

    const currentRows = await sql`SELECT status FROM voucher_header_tbl WHERE id = ${data.id}`
    if (currentRows.length === 0) return NextResponse.json({ error: "السند غير موجود" }, { status: 404 })
    const previousStatus = Number(currentRows[0].status)
    if (previousStatus === 2 && status !== 3) {
      return NextResponse.json({ error: "السند مرحل ولا يمكن تعديله" }, { status: 400 })
    }

    let items: any[] = []
    let journalRows: any[] = []
    if (status !== 3) {
      items = Array.isArray(data.items) ? data.items.filter((i: any) => i?.product_id) : []
      const payloadError = validatePayload(data, items)
      if (payloadError) return NextResponse.json({ error: payloadError }, { status: 400 })

      const referencesError = await validateItemReferences(items, (ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType) ? ["account_id"] : [])
      if (referencesError) return NextResponse.json({ error: referencesError }, { status: 400 })

      const codeFormatError = await validateCodeFormat(request.url, vchType, data.vch_book_id ?? null, data.vch_code)
      if (codeFormatError) return NextResponse.json({ error: codeFormatError }, { status: 400 })

      const duplicate = await sql`
        SELECT id FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${data.vch_code} AND id != ${data.id}
      `
      if (duplicate.length > 0) return NextResponse.json({ error: "رقم السند مستخدم مسبقاً" }, { status: 400 })

      if ((ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType)) {
        journalRows = buildSalesVoucherJournalRows(vchType, items, data.account_id ?? null, data.currency_id || null, Number(data.rate || 1))
        const currencyError = await validateJournalAccountCurrencies(journalRows, data.currency_id ? Number(data.currency_id) : null)
        if (currencyError) return NextResponse.json({ error: currencyError }, { status: 400 })
      }
    }

    const amount = computeTotalAmount(items, data)
    const discountType = data.discount_type === "amount" ? "amount" : "percentage"

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
        amount = ${amount},
        manual_voucher = ${data.manual_voucher || ""},
        manual_date = ${data.manual_date || null},
        note = ${data.note || ""},
        status = ${status},
        vch_status = ${status === 2 ? 2 : 1},
        is_printed = ${Number(data.is_printed || 0)},
        shipping_address = ${data.shipping_address || ""},
        salesman_id = ${data.salesman_id || null},
        linked_order_id = ${data.linked_order_id || null},
        discount_type = ${discountType},
        discount_value = ${Number(data.discount_value || 0)},
        vat_percent = ${Number(data.vat_percent || 0)},
        last_update_date = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING *
    `

    const voucher = result[0]

    if (status === 3) {
      await reverseSalesVoucherStockMovement(voucher.id)
      await sql`DELETE FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucher.id}`
      await sql`DELETE FROM voucher_items_tbl WHERE voucher_id = ${voucher.id}`
      return NextResponse.json({ ...voucher, items: [] })
    }

    const savedItems = await saveSalesVoucherItems(voucher.id, items)
    if ((ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType)) {
      await saveJournalRows(voucher.id, journalRows)
    }
    if (status === 2 && previousStatus !== 2) {
      await applySalesVoucherStockEffect(vchType, voucher.id, savedItems)
    }

    const savedItemsWithNames = await fetchSalesVoucherItems(voucher.id)
    return NextResponse.json({ ...voucher, items: savedItemsWithNames })
  } catch (error) {
    console.error("Error updating sales voucher:", error)
    return NextResponse.json({ error: "Failed to update sales voucher" }, { status: 500 })
  }
}
