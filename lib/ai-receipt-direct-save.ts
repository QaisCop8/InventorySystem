"use client"

// حفظ سند قبض/صرف من المساعد الذكي مباشرة دون فتح شاشة السند: نفس الحمولة التي ترسلها شاشة السندات
// (components/accounting/receipts.tsx saveVoucher) إلى POST /api/receipts — الدفتر الافتراضي للمستخدم،
// رقم السند من الدفتر، سعر الصرف بتاريخ السند، والحسابات الافتراضية للمستخدم لهذه العملة في الفرع النشط.

export type AIReceiptDraftPayload = {
  voucher_type: 4 | 5
  amount: number
  account_id: number
  account_code: string
  account_name: string
  customer_name: string
  vch_date: string
  note: string
  payment_method?: string
  cash_amount?: number
  check_amount?: number
  credit_card_amount?: number
  cheques?: Array<Record<string, any>>
  cards?: Array<Record<string, any>>
  currency_id?: number | null
}

export type AIReceiptSaveResult =
  | { ok: true; id: number; code: string; voucherType: 4 | 5; amount: number; accountName: string }
  | { ok: false; error: string; voucherType: 4 | 5 }

const positiveId = (value: unknown) => {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

const getJson = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" })
  return response.ok ? response.json() : null
}

export async function saveAIReceiptDraft(
  draft: AIReceiptDraftPayload,
  context: { userId?: string | number | null; branchId?: number | string | null },
): Promise<AIReceiptSaveResult> {
  const voucherType = draft.voucher_type === 5 ? 5 : 4
  const label = voucherType === 5 ? "سند الصرف" : "سند القبض"
  const fail = (error: string): AIReceiptSaveResult => ({ ok: false, error, voucherType })
  const userId = context.userId != null ? String(context.userId) : ""
  const branchId = positiveId(context.branchId)
  if (!userId) return fail("تعذر تحديد المستخدم الحالي")
  if (!branchId) return fail("اختر الفرع النشط أولاً")

  try {
    const [books, currencies, accountDefaults] = await Promise.all([
      getJson(`/api/receipts/voucher-books?vch_type=${voucherType}&user_id=${encodeURIComponent(userId)}`),
      getJson("/api/exchange-rates"),
      getJson(`/api/settings/users-currencies-default?user_id=${encodeURIComponent(userId)}&branch_id=${branchId}`),
    ])

    const bookList: any[] = Array.isArray(books?.books) ? books.books : []
    const bookId = positiveId(books?.default_book_id) ?? (bookList.length === 1 ? positiveId(bookList[0].id) : null)
    if (!bookId) return fail(`لا يوجد دفتر سندات افتراضي لـ${label} لهذا المستخدم (صلاحيات دفاتر السندات)`)

    const rates: any[] = Array.isArray(currencies?.rates) ? currencies.rates : []
    const currencyIds = rates.map((row) => Number(row.currency_id ?? row.id)).filter((id) => Number.isFinite(id))
    const baseCurrencyId = currencyIds.length ? Math.min(...currencyIds) : null
    const currencyId = positiveId(draft.currency_id) ?? baseCurrencyId
    if (!currencyId) return fail("لا توجد عملة معرفة في النظام")

    let rate = 1
    if (currencyId !== baseCurrencyId) {
      const lookup = await getJson(`/api/exchange-rates/lookup?${new URLSearchParams({ currency_id: String(currencyId), date: draft.vch_date || "" })}`)
      rate = Number(lookup?.rate) > 0 ? Number(lookup.rate) : 0
      if (!rate) return fail("لا يوجد سعر صرف معرف لعملة السند بتاريخه")
    }

    const codeData = await getJson(`/api/receipts/generate-number?vch_type=${voucherType}&vch_book_id=${bookId}`)
    const code = String(codeData?.code || "")
    if (!code) return fail("تعذر توليد رقم السند")

    const defaultsRow = Array.isArray(accountDefaults?.rows)
      ? accountDefaults.rows.find((row: any) => Number(row.currency_id) === currencyId)
      : null
    const cheques: Array<Record<string, any>> = (draft.cheques || []).map((row) => ({ cheque_book_cheque_id: null, ...row }))
    const cards = draft.cards || []
    const cashAmount = Number(draft.cash_amount || 0)
    const checkAmount = Number(draft.check_amount || 0)
    const cardAmount = Number(draft.credit_card_amount || 0)
    const amount = Number(draft.amount || 0)

    const cashAccountId = positiveId(defaultsRow?.cash_account_id)
    // سند الصرف: حساب الشيكات = الحساب الجاري للحساب البنكي المختار (كما في شاشة السند)
    const checkAccountId = voucherType === 5 ? positiveId(cheques[0]?.jary_account_id) : positiveId(defaultsRow?.incoming_checks_account_id)
    const cardAccountId = positiveId(defaultsRow?.card_account_id) ?? positiveId(cards[0]?.account_id)

    if (cashAmount > 0 && !cashAccountId) return fail("لا يوجد حساب صندوق افتراضي لهذه العملة في الفرع الحالي (الحسابات الافتراضية للمستخدم)")
    if (checkAmount > 0 && !checkAccountId) return fail("لا يوجد حساب صندوق شيكات افتراضي لهذه العملة في الفرع الحالي (الحسابات الافتراضية للمستخدم)")
    if (cardAmount > 0 && !cardAccountId) return fail("لا يوجد حساب بطاقات افتراضي لهذه العملة في الفرع الحالي")
    if (!(amount > 0)) return fail("يجب إدخال مبلغ السند")
    if (Math.round((cashAmount + checkAmount + cardAmount - amount) * 100) !== 0) return fail("مجموع النقدي والشيكات والبطاقة لا يساوي مبلغ السند")

    const payload = {
      id: 0,
      vch_type: voucherType,
      vch_code: code,
      vch_date: draft.vch_date,
      manual_date: draft.vch_date,
      vch_book_id: bookId,
      branch_id: branchId,
      currency_id: currencyId,
      rate,
      account_id: draft.account_id,
      customer_name: draft.customer_name,
      to_account_id: draft.account_id,
      cash_amount: cashAmount,
      cash_account_id: cashAccountId,
      cash_account_cost_centers: [],
      check_amount: checkAmount,
      check_account_id: checkAccountId,
      check_account_cost_centers: [],
      credit_card_amount: cardAmount,
      credit_card_account_id: cardAccountId,
      credit_card_account_cost_centers: [],
      amount,
      payment_classification_id: null,
      salesman_id: null,
      manual_voucher: "",
      note: draft.note || "",
      status: 1,
      is_printed: 0,
      journal: [{ account_id: draft.account_id, account_code: draft.account_code, account_name: draft.account_name, amount, note: "", cost_centers: [] }],
      cheques,
      cards: [{ card_type_id: null, card_type_name: "", card_no: "", expire_date: "", account_id: null, account_code: "", account_name: "", bank_amount: null, currency_id: currencyId, ...(cards[0] || {}), amount: cardAmount }],
      notes: [],
      insert_user: userId,
    }

    const response = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-branch-id": String(branchId) },
      body: JSON.stringify(payload),
    })
    const saved = await response.json().catch(() => null)
    if (!response.ok) return fail(saved?.error || `تعذر حفظ ${label}`)
    return { ok: true, id: Number(saved.id), code: String(saved.vch_code || code), voucherType, amount, accountName: draft.account_name }
  } catch (error) {
    return fail(error instanceof Error ? error.message : `تعذر حفظ ${label}`)
  }
}
