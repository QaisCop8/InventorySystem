import { type NextRequest, NextResponse } from "next/server"
import { withTenantTransaction } from "@/lib/database"
import { validateJournalAccountCurrencies } from "@/app/api/receipts/_lib"
import {
  INTERNAL_VOUCHER,
  createAutoJournal,
  dateOnly,
  getBaseCurrencyId,
  linkRelatedVouchers,
  resolveJournalContext,
} from "@/lib/auto-journals"
import { authorizeAutoJournal, autoJournalErrorResponse, ensureAutoJournalSchema } from "../_lib"

// قيد تحويل عملة (ShamelAPI: CurrencyConvertJournals) — تحويل مبلغ من حساب بعملة إلى حساب بعملة أخرى
// عبر حساب وسيط "تحويل العملة"، بقيدين مترابطين كلٌّ بعملة واحدة:
//   القيد الأول (عملة المصدر):  مدين حساب تحويل العملة / دائن الحساب المحوَّل منه   — بالمبلغ المحوَّل
//   القيد الثاني (عملة الهدف):  مدين الحساب المحوَّل إليه / دائن حساب تحويل العملة — بالمبلغ المحوَّل له
// أي فرق بين قيمتي الطرفين بعملة الأساس (فرق سعر الصرف) يبقى في حساب تحويل العملة.

const num = (value: unknown) => Number(value) || 0

export async function POST(request: NextRequest) {
  try {
    await ensureAutoJournalSchema()
    const body = await request.json()
    const date = dateOnly(body.vch_date)
    const fromAccountId = num(body.from_account_id)
    const toAccountId = num(body.to_account_id)
    const convertAccountId = num(body.convert_account_id)
    const fromCurrencyId = num(body.from_currency_id)
    const toCurrencyId = num(body.to_currency_id)
    // عملة الأساس سعرها 1 دائماً — لا يُقبل سعر آخر لها حتى لو أُرسل من الواجهة.
    const baseCurrencyId = await getBaseCurrencyId()
    const fromRate = fromCurrencyId === baseCurrencyId ? 1 : num(body.from_rate)
    const toRate = toCurrencyId === baseCurrencyId ? 1 : num(body.to_rate)
    const fromAmount = Math.abs(num(body.from_amount))
    const toAmount = Math.abs(num(body.to_amount))

    if (!fromAccountId || !toAccountId) return NextResponse.json({ error: "اختر الحساب المحوَّل منه والحساب المحوَّل إليه" }, { status: 400 })
    if (!convertAccountId) return NextResponse.json({ error: "اختر حساب تحويل العملة" }, { status: 400 })
    if (!fromCurrencyId || !toCurrencyId) return NextResponse.json({ error: "اختر العملتين" }, { status: 400 })
    if (fromAccountId === toAccountId && fromCurrencyId === toCurrencyId) {
      return NextResponse.json({ error: "لا يمكن اجراء القيد لنفس الحساب والعملة" }, { status: 400 })
    }
    if (convertAccountId === fromAccountId || convertAccountId === toAccountId) {
      return NextResponse.json({ error: "حساب تحويل العملة يجب أن يختلف عن طرفي التحويل" }, { status: 400 })
    }
    if (!(fromRate > 0) || !(toRate > 0)) return NextResponse.json({ error: "سعر الصرف يجب أن يكون أكبر من صفر" }, { status: 400 })
    if (!(fromAmount > 0) || !(toAmount > 0)) return NextResponse.json({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 })

    // حساب لا يسمح بحركة بغير عملته (allow_trans_with_diff_curr=2) يُرفض — نفس قاعدة سند القيد.
    const fromCurrencyError = await validateJournalAccountCurrencies([{ account_id: fromAccountId }, { account_id: convertAccountId }], fromCurrencyId)
    if (fromCurrencyError) return NextResponse.json({ error: fromCurrencyError }, { status: 400 })
    const toCurrencyError = await validateJournalAccountCurrencies([{ account_id: toAccountId }, { account_id: convertAccountId }], toCurrencyId)
    if (toCurrencyError) return NextResponse.json({ error: toCurrencyError }, { status: 400 })

    const authorization = await authorizeAutoJournal(request, body.branch_id)
    if (!authorization.ok) return authorization.response

    return await withTenantTransaction(async () => {
      const context = await resolveJournalContext(authorization.userId)
      const common = { userId: authorization.userId, branchId: authorization.branchId, date, internalVoucherId: INTERNAL_VOUCHER.CURRENCY_CONVERT }
      const first = await createAutoJournal({
        ...common,
        currencyId: fromCurrencyId,
        rate: fromRate,
        note: String(body.first_note || "").trim() || "قيد تحويل عملة",
        lines: [
          { accountId: convertAccountId, creditDebit: 1, amount: fromAmount, currencyId: fromCurrencyId, rate: fromRate },
          { accountId: fromAccountId, creditDebit: 2, amount: fromAmount, currencyId: fromCurrencyId, rate: fromRate },
        ],
      }, context)
      const second = await createAutoJournal({
        ...common,
        currencyId: toCurrencyId,
        rate: toRate,
        note: String(body.second_note || "").trim() || "قيد تحويل عملة",
        lines: [
          { accountId: toAccountId, creditDebit: 1, amount: toAmount, currencyId: toCurrencyId, rate: toRate },
          { accountId: convertAccountId, creditDebit: 2, amount: toAmount, currencyId: toCurrencyId, rate: toRate },
        ],
      }, context)
      await linkRelatedVouchers(first.id, second.id)
      return NextResponse.json({
        message: `تم إنشاء قيدي تحويل العملة: ${first.code} و ${second.code}`,
        journal_vouchers: [first, second],
      })
    })
  } catch (error) {
    return autoJournalErrorResponse(error, "تعذر إنشاء قيد تحويل العملة")
  }
}
