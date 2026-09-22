export const POS_ACCOUNT_LABELS = {
  cash_account_id: "حساب الصندوق",
  card_account_id: "حساب البطاقات",
  cheque_account_id: "حساب الشيكات",
  gift_account_id: "حساب بطاقات الهدايا",
  tax_account_id: "حساب الضريبة",
  return_account_id: "حساب المردودات",
} as const

const paymentAccounts = {
  cash: "cash_account_id", card: "card_account_id", cheque: "cheque_account_id", gift_card: "gift_account_id",
} as const

const hasAccount = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0

export function missingPosAccountMessage(field: keyof typeof POS_ACCOUNT_LABELS) {
  return `${POS_ACCOUNT_LABELS[field]} غير محدد. يرجى تعبئته في تعريف نقطة البيع أو الحسابات الافتراضية للمستخدم أو النظام بما يتوافق مع عملة نقطة البيع.`
}

/** The point returned by the API already includes user and system defaults. */
export function validatePosAccounts(point: Record<string, any>, payments: Array<{ method?: string; payment_method?: string; amount?: number }>, options: {
  mode: string
  taxAmount?: number
  returnAccountIds?: unknown[]
  customerAccountId?: unknown
}) {
  if (options.mode === "gift") return null
  for (const payment of payments) {
    if (!(Number(payment.amount) > 0)) continue
    const field = paymentAccounts[(payment.method || payment.payment_method) as keyof typeof paymentAccounts]
    if (field && !hasAccount(point[field])) return missingPosAccountMessage(field)
  }
  if (options.mode === "sale" && !hasAccount(options.customerAccountId) && !hasAccount(point.cash_account_id)
    && payments.some(payment => Number(payment.amount) > 0 && ["cheque", "card"].includes(payment.method || payment.payment_method || ""))) {
    return missingPosAccountMessage("cash_account_id")
  }
  if (Number(options.taxAmount) > 0 && !hasAccount(point.tax_account_id)) return missingPosAccountMessage("tax_account_id")
  if (options.mode === "return" && !hasAccount(point.return_account_id) && options.returnAccountIds?.some(id => !hasAccount(id))) {
    return missingPosAccountMessage("return_account_id")
  }
  return null
}
