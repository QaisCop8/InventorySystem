"use client"

// سند قيد مقروء من مرفق في المساعد الذكي ⇐ يُحفظ مباشرة كسند قيد محفوظ (غير مرحّل) بدفتر المستخدم الافتراضي،
// ليراجعه المستخدم ثم يرحّله. نفس مسار شاشة سند القيد (/api/journal-vouchers) — كل التحققات من هناك
// (التوازن، الحسابات الرئيسية، إيقاف الحركات، عملة الحساب، إقفال الفترات).

export type AIJournalLine = { account_id: number; debit: number; credit: number; note?: string | null }
export type AIJournalSaveResult =
  | { ok: true; id: number; code: string; amount: number }
  | { ok: false; error: string }

const positiveId = (value: unknown) => {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}
const getJson = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" })
  return response.ok ? response.json() : null
}
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")

export async function saveAIJournalDraft(
  draft: { vch_date: string | null; currency: string | null; manual_voucher?: string | null; note?: string | null; lines: AIJournalLine[] },
  context: { userId?: string | number | null; branchId?: number | string | null },
): Promise<AIJournalSaveResult> {
  const userId = context.userId != null ? String(context.userId) : ""
  const branchId = positiveId(context.branchId)
  if (!userId) return { ok: false, error: "تعذر تحديد المستخدم الحالي" }
  if (!branchId) return { ok: false, error: "اختر الفرع النشط أولاً" }
  const lines = draft.lines.filter((line) => positiveId(line.account_id) && (Number(line.debit) > 0 || Number(line.credit) > 0))
  if (lines.length < 2) return { ok: false, error: "سند القيد يحتاج سطرين على الأقل (مدين ودائن)" }
  const debit = Math.round(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0) * 100) / 100
  const credit = Math.round(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0) * 100) / 100
  if (debit !== credit) return { ok: false, error: `القيد غير متوازن: المدين ${debit} والدائن ${credit}` }

  try {
    const [books, currencies] = await Promise.all([
      getJson(`/api/journal-vouchers/voucher-books?user_id=${encodeURIComponent(userId)}`),
      getJson("/api/exchange-rates"),
    ])
    const bookList: any[] = Array.isArray(books?.books) ? books.books : []
    const bookId = positiveId(books?.default_book_id) ?? (bookList.length === 1 ? positiveId(bookList[0].id) : null)
    if (!bookId) return { ok: false, error: "لا يوجد دفتر سندات قيد افتراضي لهذا المستخدم (صلاحيات دفاتر السندات)" }

    const rates: any[] = Array.isArray(currencies?.rates) ? currencies.rates : []
    const ids = rates.map((row) => Number(row.currency_id ?? row.id)).filter((id) => Number.isFinite(id) && id > 0)
    const baseCurrencyId = ids.length ? Math.min(...ids) : null
    const wanted = normalize(draft.currency)
    const matched = wanted
      ? rates.find((row) => [row.currency_code, row.code, row.currency_name, row.name].some((value) => normalize(value) && (normalize(value) === wanted || normalize(value).includes(wanted) || wanted.includes(normalize(value)))))
      : null
    const currencyId = positiveId(matched?.currency_id ?? matched?.id) ?? baseCurrencyId
    if (!currencyId) return { ok: false, error: "لا توجد عملة معرفة في النظام" }
    const date = draft.vch_date && /^\d{4}-\d{2}-\d{2}$/.test(draft.vch_date) ? draft.vch_date : new Date().toISOString().slice(0, 10)

    const [lookup, codeData] = await Promise.all([
      currencyId !== baseCurrencyId ? getJson(`/api/exchange-rates/lookup?${new URLSearchParams({ currency_id: String(currencyId), date })}`) : Promise.resolve(null),
      getJson(`/api/journal-vouchers/generate-number?vch_book_id=${bookId}&branch_id=${branchId}`),
    ])
    const rate = currencyId === baseCurrencyId ? 1 : Number(lookup?.rate) > 0 ? Number(lookup.rate) : 0
    if (!rate) return { ok: false, error: "لا يوجد سعر صرف معرف لعملة السند بتاريخه" }
    const code = String(codeData?.code || "")
    if (!code) return { ok: false, error: "تعذر توليد رقم سند القيد" }

    const response = await fetch("/api/journal-vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-branch-id": String(branchId) },
      body: JSON.stringify({
        vch_code: code,
        vch_date: date,
        manual_date: date,
        vch_book_id: bookId,
        branch_id: branchId,
        currency_id: currencyId,
        rate,
        manual_voucher: String(draft.manual_voucher || "").slice(0, 50),
        note: String(draft.note || "سند قيد من مرفق — المساعد الذكي").slice(0, 1000),
        status: 1,
        journal: lines.map((line) => ({ account_id: line.account_id, debit: Number(line.debit) || 0, credit: Number(line.credit) || 0, note: String(line.note || "").slice(0, 70), cost_centers: [] })),
      }),
    })
    const saved = await response.json().catch(() => ({}))
    if (!response.ok) return { ok: false, error: saved?.error || "تعذر حفظ سند القيد" }
    return { ok: true, id: Number(saved.id || saved.voucher?.id || 0), code: String(saved.vch_code || saved.voucher?.vch_code || code), amount: debit }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "تعذر حفظ سند القيد" }
  }
}
