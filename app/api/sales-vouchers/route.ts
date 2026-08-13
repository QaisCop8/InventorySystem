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
  SALES_INVOICE_VCH_TYPE,
  PURCHASE_INVOICE_VCH_TYPE,
  DELIVERY_SELL_VCH_TYPE,
  DELIVERY_CONSIGNMENT_SALE_VCH_TYPE,
  DELIVERY_PAY_VCH_TYPE,
  validateItemAccounts,
  buildSalesVoucherJournalRows,
  saveJournalRows,
  linkSalesVoucherItemsToJournals,
  validateJournalAccountCurrencies,
  fetchSalesVoucherJournalAccounts,
  resolveSalesVoucherJournalTypes,
} from "./_lib"
import { validateItemReferences } from "@/app/api/stock-vouchers/_lib"

const MAX_CODE_RETRY_ATTEMPTS = 5

export async function GET(request: NextRequest) {
  try {
    await ensureTables()

    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || SALES_VOUCHER_TYPES[1])

    const rows = await sql`
      SELECT vh.*, EXISTS(
        SELECT 1
        FROM voucher_items_tbl inv_item
        JOIN voucher_header_tbl inv ON inv.id = inv_item.voucher_id
        WHERE inv.vch_type IN (${SALES_INVOICE_VCH_TYPE}, ${PURCHASE_INVOICE_VCH_TYPE})
          AND inv_item.delivery_item_id IN (
            SELECT id FROM voucher_items_tbl WHERE voucher_id = vh.id
          )
      ) AS has_linked_invoice
      FROM voucher_header_tbl vh
      WHERE vh.vch_type = ${vchType} AND vh.status != 3
      ORDER BY vh.id DESC
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

const DELIVERY_VOUCHER_TYPES = [DELIVERY_SELL_VCH_TYPE, DELIVERY_CONSIGNMENT_SALE_VCH_TYPE, DELIVERY_PAY_VCH_TYPE] as const
const ORDER_SOURCE_VOUCHER_TYPE = 3

const validatePayload = (data: any, items: any[]): string | null => {
  if (!SALES_VOUCHER_TYPES.includes(Number(data.vch_type) as any) || !data.vch_code || !data.vch_date) {
    return "بيانات السند غير مكتملة"
  }
  if (!(Number(data.rate) > 0)) return "سعر الصرف يجب أن يكون أكبر من صفر"
  // العميل نفسه اختياري (بيع نقدي بلا عميل مسجَّل) — لكن عندها يجب تحديد حساب الصندوق واسم الدافع
  // معاً كحد أدنى للتوثيق المحاسبي بدلاً من حساب العميل.
  if (!data.account_id) {
    if (!data.cash_account_id) return "يجب اختيار حساب الصندوق عند عدم اختيار العميل"
    if (!String(data.customer_name || "").trim()) return "يجب إدخال اسم الدافع عند عدم اختيار العميل"
  }
  if (
    Number(data.vat_percent || 0) > 0 &&
    !data.tax_account_id &&
    !(DELIVERY_VOUCHER_TYPES as readonly number[]).includes(Number(data.vch_type))
  ) {
    return "يجب اختيار حساب الضريبة لوجود نسبة ضريبة على السند"
  }
  if (items.length === 0) return "يجب إدخال صنف واحد على الأقل"
  if (items.some((i: any) => !(Number(i.store_id ?? i.warehouse_id) > 0))) return "يجب اختيار المستودع لكل صنف"
  if (items.some((i: any) => !(Number(i.quantity || 0) > 0))) return "يجب إدخال الكمية لكل صنف"
  if (items.some((i: any) => Number(i.discount_percent || 0) < 0 || Number(i.discount_percent || 0) > 100)) {
    return "نسبة الخصم يجب ألا تتجاوز 100% لكل صنف"
  }
  const itemAccountsError = validateItemAccounts(Number(data.vch_type), items)
  if (itemAccountsError) return itemAccountsError
  return null
}

// نفس معادلة totals في unified-sales-delivery.tsx بالضبط (بمعزل عن الواجهة) — خصم بمستوى السطر
// (الخصم %) أولاً، ثم خصم/ضريبة بمستوى السند كاملاً: المجموع الفرعي (كمية × سعر × (1-خصم السطر)
// لكل الأصناف)، ثم خصم السند (نسبة أو مبلغ ثابت)، ثم ضريبة على الصافي بعد الخصم.
// مُشتركة بين computeTotalAmount (أدناه) وbuildSalesVoucherJournalRows (تحتاج مبلغ الضريبة وحده
// لسطر قيد حساب الضريبة) — نفس معادلة totals في unified-sales-delivery.tsx بالضبط.
const computeAmountBreakdown = (items: any[], data: any) => {
  // الخصم بمستوى السطر (نسبة مئوية لكل صنف، عمود "الخصم %") يُطبَّق أولاً قبل خصم/ضريبة السند
  // كاملاً — نفس معادلة recalcLineAmounts في unified-sales-delivery.tsx بالضبط.
  const subtotal = items.reduce((sum: number, i: any) => {
    const lineDiscountPercent = Number(i.discount_percent || 0)
    return sum + Number(i.quantity || 0) * Number(i.unit_price || 0) * (1 - lineDiscountPercent / 100)
  }, 0)
  const discountValue = Number(data.discount_value || 0)
  const discount = data.discount_type === "amount" ? discountValue : (subtotal * discountValue) / 100
  const taxPercent = Number(data.vat_percent || 0)
  const tax = ((subtotal - discount) * taxPercent) / 100
  return { subtotal, discount, tax, total: subtotal - discount + tax }
}

const computeTotalAmount = (items: any[], data: any): number => Math.round(computeAmountBreakdown(items, data).total * 100) / 100

const validateSourceInvoice = async (itemsOrData: any, maybeData?: any, excludeVoucherId = 0): Promise<string | null> => {
  // Support two call patterns during transition:
  // - validateSourceInvoice(items, data, excludeId)
  // - validateSourceInvoice(data, excludeId)
  let items: any[] = []
  let data: any = {}
  if (Array.isArray(itemsOrData)) {
    items = itemsOrData
    data = maybeData || {}
  } else {
    data = itemsOrData || {}
  }

  const vchType = Number(data.vch_type || 0)
  const invoiceSourceType = Number(data.invoice_source_type || 1)
  if (![2, 3].includes(invoiceSourceType)) return null
  const sourceVoucherId = Number(data.source_voucher_id || 0)
  const sourceVoucherType = Number(data.source_voucher_type || 0)
  if (!sourceVoucherId || !sourceVoucherType) {
    return invoiceSourceType === 2
      ? "يجب اختيار الإرسالية المصدرية للفاتورة"
      : "يجب اختيار الطلبية المصدرية للفاتورة"
  }

  // Ensure at least one item links to a delivery/order at item level
  const hasItemLink = items.some((it: any) =>
    invoiceSourceType === 2 ? Number(it.delivery_item_id || 0) > 0 : Number(it.order_item_id || 0) > 0,
  )
  if (!hasItemLink) {
    return invoiceSourceType === 2
      ? "يجب اختيار الإرسالية المصدرية للفاتورة"
      : "يجب اختيار الطلبية المصدرية للفاتورة"
  }

  // Check for existing invoices referencing the same source at item level (no header columns)
  const existing =
    invoiceSourceType === 2
      ? await sql`
          SELECT vh.id
          FROM voucher_header_tbl vh
          WHERE vh.id != ${excludeVoucherId}
            AND vh.vch_type IN (${SALES_INVOICE_VCH_TYPE}, ${PURCHASE_INVOICE_VCH_TYPE})
            AND EXISTS (
              SELECT 1
              FROM voucher_items_tbl vi
              WHERE vi.voucher_id = vh.id
                AND vi.delivery_item_id IN (
                  SELECT id FROM voucher_items_tbl WHERE voucher_id = ${sourceVoucherId}
                )
            )
          LIMIT 1
        `
      : await sql`
          SELECT vh.id
          FROM voucher_header_tbl vh
          WHERE vh.id != ${excludeVoucherId}
            AND vh.vch_type IN (${SALES_INVOICE_VCH_TYPE}, ${PURCHASE_INVOICE_VCH_TYPE})
            AND EXISTS (
              SELECT 1
              FROM voucher_items_tbl vi
              WHERE vi.voucher_id = vh.id
                AND (
                  vi.order_item_id IN (SELECT id FROM order_items WHERE order_id = ${sourceVoucherId})
                  OR vi.order_item_id IN (SELECT id FROM purchase_order_items WHERE purchase_order_id = ${sourceVoucherId})
                )
            )
          LIMIT 1
        `
  if (invoiceSourceType === 2) {
    const existing = await sql`
      SELECT vh.id
      FROM voucher_header_tbl vh
      WHERE vh.id != ${excludeVoucherId}
        AND vh.vch_type IN (${SALES_INVOICE_VCH_TYPE}, ${PURCHASE_INVOICE_VCH_TYPE})
        AND EXISTS (
          SELECT 1
          FROM voucher_items_tbl vi
          WHERE vi.voucher_id = vh.id
            AND vi.delivery_item_id IN (
              SELECT id FROM voucher_items_tbl WHERE voucher_id = ${sourceVoucherId}
            )
        )
      LIMIT 1
    `
    if (existing.length > 0) {
      return "تم إصدار فاتورة لهذه الإرسالية سابقاً"
    }
    return null
  }

  const orderItemIds = items
    .map((item: any) => Number(item.order_item_id || 0))
    .filter((id) => id > 0)
  if (orderItemIds.length === 0) {
    return "يجب اختيار الطلبية المصدرية للفاتورة"
  }

  const invoices = await sql`
    SELECT vi.order_item_id,
           COALESCE(SUM(vi.qnty), 0) AS invoiced_quantity,
           COALESCE(SUM(vi.bonus), 0) AS invoiced_bonus
    FROM voucher_items_tbl vi
    JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
    WHERE vh.vch_type = ${vchType}
      AND vh.status = 2
      AND vh.id != ${excludeVoucherId}
      AND vi.order_item_id = ANY(${orderItemIds}::int[])
    GROUP BY vi.order_item_id
  `

  const invoiceTotals = new Map<number, { invoiced_quantity: number; invoiced_bonus: number }>()
  for (const row of invoices) {
    invoiceTotals.set(Number(row.order_item_id), {
      invoiced_quantity: Number(row.invoiced_quantity || 0),
      invoiced_bonus: Number(row.invoiced_bonus || 0),
    })
  }

  const orderItems = vchType === SALES_INVOICE_VCH_TYPE
    ? await sql`
        SELECT oi.id, oi.quantity, COALESCE(oi.bonus, oi.bonus_quantity, 0) AS bonus, oi.order_id
        FROM order_items oi
        WHERE oi.id = ANY(${orderItemIds}::int[])
      `
    : await sql`
        SELECT poi.id, poi.quantity, COALESCE(poi.bonus, poi.bonus_quantity, 0) AS bonus, poi.purchase_order_id AS order_id
        FROM purchase_order_items poi
        WHERE poi.id = ANY(${orderItemIds}::int[])
      `

  const orderItemById = new Map<number, any>()
  for (const row of orderItems) {
    orderItemById.set(Number(row.id), row)
  }

  const currentTotals = new Map<number, { quantity: number; bonus: number }>()
  for (const item of items) {
    const id = Number(item.order_item_id || 0)
    if (id <= 0) continue
    const existing = currentTotals.get(id) ?? { quantity: 0, bonus: 0 }
    currentTotals.set(id, {
      quantity: existing.quantity + Number(item.quantity || 0),
      bonus: existing.bonus + Number((item.bonus ?? item.bonus_quantity) || 0),
    })
  }

  for (const [orderItemId, totals] of currentTotals.entries()) {
    const orderItem = orderItemById.get(orderItemId)
    if (!orderItem || Number(orderItem.order_id) !== sourceVoucherId) {
      return "أحد عناصر الطلبية غير صالح لهذه الطلبية المصدرية"
    }

    const existing = invoiceTotals.get(orderItemId) ?? { invoiced_quantity: 0, invoiced_bonus: 0 }
    const remainingQuantity = Math.max(0, Number(orderItem.quantity || 0) - existing.invoiced_quantity)
    const remainingBonus = Math.max(0, Number(orderItem.bonus || 0) - existing.invoiced_bonus)

    if (totals.quantity > remainingQuantity || totals.bonus > remainingBonus) {
      return "الكمية أو البونص المحدد يتجاوز المتبقي في الطلبية"
    }

    if (remainingQuantity === 0 && remainingBonus === 0) {
      return "تمت فاتورة هذا العنصر بالكامل سابقاً"
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()
    const vchType = Number(data.vch_type)
    const items = Array.isArray(data.items) ? data.items.filter((i: any) => i?.product_id) : []

    const payloadError = validatePayload(data, items)
    if (payloadError) return NextResponse.json({ error: payloadError }, { status: 400 })
    const sourceError = await validateSourceInvoice(items, data)
    if (sourceError) return NextResponse.json({ error: sourceError }, { status: 400 })

    // المستودع/الوحدة موجودان ونشطان فعلياً، وكذلك حساب الصنف لفاتورة مبيعات/مشتريات ومردود
    // مبيعات/مشتريات تحديداً — بمعزل عمّا رآه العميل عند اختيارهم (قد يكونوا حُذفوا أو أُوقِفوا).
    const referencesError = await validateItemReferences(items, (ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType) ? ["account_id"] : [])
    if (referencesError) return NextResponse.json({ error: referencesError }, { status: 400 })

    const codeFormatError = await validateCodeFormat(request.url, vchType, data.vch_book_id ?? null, data.vch_code)
    if (codeFormatError) return NextResponse.json({ error: codeFormatError }, { status: 400 })

    const { code: vchCode, conflict } = await regenerateOnConflict(request.url, vchType, data.vch_book_id ?? null, String(data.vch_code))
    if (conflict) return NextResponse.json({ error: "رقم السند مستخدم مسبقاً" }, { status: 400 })

    const breakdown = computeAmountBreakdown(items, data)
    let journalRows: any[] = []
    let journalTypes = null
    if ((ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType)) {
      journalTypes = await resolveSalesVoucherJournalTypes(vchType)
      if (!journalTypes) throw new Error("تعذّر تحديد أنواع قيود الفاتورة")
      journalRows = buildSalesVoucherJournalRows(
        vchType,
        items,
        data.account_id ?? data.cash_account_id ?? null,
        data.currency_id || null,
        Number(data.rate || 1),
        journalTypes,
        data.tax_account_id ?? null,
        breakdown.tax,
      )
      const currencyError = await validateJournalAccountCurrencies(journalRows, data.currency_id ? Number(data.currency_id) : null)
      if (currencyError) return NextResponse.json({ error: currencyError }, { status: 400 })
    }

    const amount = Math.round(breakdown.total * 100) / 100
    const status = Number(data.status || 1)
    const discountType = data.discount_type === "amount" ? "amount" : "percentage"
    const invoiceSourceType = Number(data.invoice_source_type || 1)
    const sourceVoucherId = [2, 3].includes(invoiceSourceType) ? Number(data.source_voucher_id || null) : null
    const sourceVoucherType = [2, 3].includes(invoiceSourceType) ? Number(data.source_voucher_type || null) : null
    const itemsToSave = [2, 3].includes(invoiceSourceType)
      ? items
      : items.map((item: any) => ({
          ...item,
          source_voucher_id: null,
          source_voucher_type: null,
          delivery_item_id: null,
          order_item_id: null,
        }))

    const result = await sql`
      INSERT INTO voucher_header_tbl (
        vch_type, vch_code, vch_date, vch_book_id, currency_id, rate,
        account_id, customer_name, to_store_id,
        amount, manual_voucher, manual_date, note, status, vch_status, is_printed,
        insert_user, shipping_address, salesman_id, linked_order_id,
        discount_type, discount_value, vat_percent,
        cash_account_id, vat_classification_id, invoice_type, vat_included, is_maqasa, maqasa_type,
        phone, due_date, is_exported_sales, location_id
      ) VALUES (
        ${vchType}, ${vchCode}, ${data.vch_date}, ${data.vch_book_id || null}, ${data.currency_id || null}, ${Number(data.rate || 1)},
        ${data.account_id}, ${data.customer_name || ""}, ${data.to_store_id || null},
        ${amount}, ${data.manual_voucher || ""}, ${data.manual_date || null}, ${data.note || ""}, ${status}, ${status === 2 ? 2 : 1}, ${Number(data.is_printed || 0)},
        ${data.insert_user || null}, ${data.shipping_address || ""}, ${data.salesman_id || null}, ${data.linked_order_id || null},
        ${discountType}, ${Number(data.discount_value || 0)}, ${Number(data.vat_percent || 0)},
        ${data.cash_account_id || null}, ${Number(data.vat_classification_id) || 1}, ${Number(data.invoice_type) || 1},
        ${Boolean(data.vat_included)}, ${Boolean(data.is_maqasa)}, ${data.is_maqasa ? Number(data.maqasa_type) || 1 : null},
        ${data.phone || ""}, ${data.due_date || null}, ${Boolean(data.is_exported_sales)}, ${data.city_id || null}
      )
      RETURNING *
    `

    const voucher = result[0]
    const savedItems = await saveSalesVoucherItems(voucher.id, itemsToSave)
    if ((ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType)) {
      const journalIds = await saveJournalRows(voucher.id, journalRows)
      await linkSalesVoucherItemsToJournals(savedItems, journalRows, journalIds)
    }
    if (status === 2) {
      await applySalesVoucherStockEffect(vchType, voucher.id, savedItems)
    }

    const savedItemsWithNames = await fetchSalesVoucherItems(voucher.id, journalTypes?.itemJournalType)
    const journalAccounts = (ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType)
      ? await fetchSalesVoucherJournalAccounts(voucher.id, vchType, Boolean(voucher.account_id))
      : { taxAccount: null, cashAccount: null }
    return NextResponse.json(
      {
        ...voucher,
        city_id: voucher.location_id,
        cash_account_id: journalAccounts.cashAccount?.id ?? null,
        cash_account_code: journalAccounts.cashAccount?.code ?? "",
        cash_account_name: journalAccounts.cashAccount?.name ?? "",
        tax_account_id: journalAccounts.taxAccount?.id ?? null,
        tax_account_code: journalAccounts.taxAccount?.code ?? "",
        tax_account_name: journalAccounts.taxAccount?.name ?? "",
        items: savedItemsWithNames,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("Error creating sales voucher:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message || "Failed to create sales voucher" }, { status: 500 })
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
    let journalTypes = null
    if (status !== 3) {
      items = Array.isArray(data.items) ? data.items.filter((i: any) => i?.product_id) : []
      const payloadError = validatePayload(data, items)
      if (payloadError) return NextResponse.json({ error: payloadError }, { status: 400 })
      const sourceError = await validateSourceInvoice(items, data, Number(data.id || 0))
      if (sourceError) return NextResponse.json({ error: sourceError }, { status: 400 })

      const referencesError = await validateItemReferences(items, (ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType) ? ["account_id"] : [])
      if (referencesError) return NextResponse.json({ error: referencesError }, { status: 400 })

      const codeFormatError = await validateCodeFormat(request.url, vchType, data.vch_book_id ?? null, data.vch_code)
      if (codeFormatError) return NextResponse.json({ error: codeFormatError }, { status: 400 })

      const duplicate = await sql`
        SELECT id FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${data.vch_code} AND id != ${data.id}
      `
      if (duplicate.length > 0) return NextResponse.json({ error: "رقم السند مستخدم مسبقاً" }, { status: 400 })

      if ((ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType)) {
        journalTypes = await resolveSalesVoucherJournalTypes(vchType)
        if (!journalTypes) throw new Error("تعذّر تحديد أنواع قيود الفاتورة")
        const breakdown = computeAmountBreakdown(items, data)
        journalRows = buildSalesVoucherJournalRows(
          vchType,
          items,
          data.account_id ?? data.cash_account_id ?? null,
          data.currency_id || null,
          Number(data.rate || 1),
          journalTypes,
          data.tax_account_id ?? null,
          breakdown.tax,
        )
        const currencyError = await validateJournalAccountCurrencies(journalRows, data.currency_id ? Number(data.currency_id) : null)
        if (currencyError) return NextResponse.json({ error: currencyError }, { status: 400 })
      }
    }

    const invoiceSourceType = Number(data.invoice_source_type || 1)
    const sourceVoucherId = [2, 3].includes(invoiceSourceType) ? Number(data.source_voucher_id || null) : null
    const sourceVoucherType = [2, 3].includes(invoiceSourceType) ? Number(data.source_voucher_type || null) : null
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
        cash_account_id = ${data.cash_account_id || null},
        vat_classification_id = ${Number(data.vat_classification_id) || 1},
        invoice_type = ${Number(data.invoice_type) || 1},
        vat_included = ${Boolean(data.vat_included)},
        is_maqasa = ${Boolean(data.is_maqasa)},
        maqasa_type = ${data.is_maqasa ? Number(data.maqasa_type) || 1 : null},
        phone = ${data.phone || ""},
        due_date = ${data.due_date || null},
        is_exported_sales = ${Boolean(data.is_exported_sales)},
        location_id = ${data.city_id || null},
        last_update_date = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING *
    `

    const voucher = result[0]
    const itemsToSave = [2, 3].includes(invoiceSourceType)
      ? items
      : items.map((item) => ({
          ...item,
          source_voucher_id: null,
          source_voucher_type: null,
          delivery_item_id: null,
          order_item_id: null,
        }))

    if (status === 3) {
      await reverseSalesVoucherStockMovement(voucher.id)
      await sql`DELETE FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucher.id}`
      await sql`DELETE FROM voucher_items_tbl WHERE voucher_id = ${voucher.id}`
      return NextResponse.json({ ...voucher, city_id: voucher.location_id, items: [] })
    }

    const savedItems = await saveSalesVoucherItems(voucher.id, itemsToSave)
    if ((ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType)) {
      const journalIds = await saveJournalRows(voucher.id, journalRows)
      await linkSalesVoucherItemsToJournals(savedItems, journalRows, journalIds)
    }
    if (status === 2 && previousStatus !== 2) {
      await applySalesVoucherStockEffect(vchType, voucher.id, savedItems)
    }

    const savedItemsWithNames = await fetchSalesVoucherItems(voucher.id, journalTypes?.itemJournalType)
    const journalAccounts = (ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType)
      ? await fetchSalesVoucherJournalAccounts(voucher.id, vchType, Boolean(voucher.account_id))
      : { taxAccount: null, cashAccount: null }
    return NextResponse.json({
      ...voucher,
      city_id: voucher.location_id,
      cash_account_id: journalAccounts.cashAccount?.id ?? null,
      cash_account_code: journalAccounts.cashAccount?.code ?? "",
      cash_account_name: journalAccounts.cashAccount?.name ?? "",
      tax_account_id: journalAccounts.taxAccount?.id ?? null,
      tax_account_code: journalAccounts.taxAccount?.code ?? "",
      tax_account_name: journalAccounts.taxAccount?.name ?? "",
      items: savedItemsWithNames,
    })
  } catch (error) {
    console.error("Error updating sales voucher:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message || "Failed to update sales voucher" }, { status: 500 })
  }
}
