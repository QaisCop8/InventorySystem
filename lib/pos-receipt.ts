export type PosReceiptPayment = {
  payment_method: string
  amount: number
  account_id?: number | null
  currency_id?: number
  currency_amount?: number
  exchange_rate?: number
  customer_id?: number | null
  reference?: string
  cheque_account?: string
  bank_id?: number
  branch_id?: number
  due_date?: string
  card_type_id?: number
  card_expiry?: string
}

export const needsPosReceipt = (payments: PosReceiptPayment[]) =>
  payments.some(row => Number(row.amount) > 0 && ["cheque", "card"].includes(row.payment_method))
  || (payments.some(row => Number(row.amount) > 0 && row.payment_method === "cash")
    && payments.some(row => Number(row.amount) > 0 && row.payment_method === "account"))

export const isPosReceiptPayment = (payment: PosReceiptPayment) =>
  Number(payment.amount) > 0 && ["cash", "cheque", "card"].includes(payment.payment_method)

export function groupPosReceiptPayments(payments: PosReceiptPayment[], invoiceCurrencyId: number, invoiceRate: number) {
  const groups = new Map<number, { currency_id: number; rate: number; payments: PosReceiptPayment[] }>()
  for (const payment of payments.filter(isPosReceiptPayment)) {
    const currencyId = payment.payment_method === "cheque" ? Number(payment.currency_id || invoiceCurrencyId) : invoiceCurrencyId
    const foreignCheque = currencyId !== invoiceCurrencyId
    // exchange_rate is the server-calculated ratio from payment to invoice currency.
    const rate = foreignCheque ? Number(payment.exchange_rate) * invoiceRate : invoiceRate
    const amount = foreignCheque ? Number(payment.currency_amount) : Number(payment.amount)
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(amount) || amount <= 0) throw new Error("سعر صرف أو مبلغ سند القبض غير صالح")
    const group = groups.get(currencyId) || { currency_id: currencyId, rate, payments: [] }
    if (Math.abs(group.rate - rate) > 0.00000001) throw new Error("أسعار صرف الدفعات لنفس العملة غير متطابقة")
    group.payments.push({ ...payment, amount })
    groups.set(currencyId, group)
  }
  // Keep the invoice-currency receipt as the primary link for older screens.
  return [...groups.values()].sort((a, b) => Number(b.currency_id === invoiceCurrencyId) - Number(a.currency_id === invoiceCurrencyId))
}

// POS payment amounts are already evaluated in the invoice currency. Amounts
// left on account and gift-card redemptions are not money received by this voucher.
export function posReceiptAmounts(payments: PosReceiptPayment[]) {
  const sum = (method: string) => Math.round(payments.filter(row => row.payment_method === method).reduce((total, row) => total + Number(row.amount || 0), 0) * 100) / 100
  const cash_amount = sum("cash")
  const check_amount = sum("cheque")
  const credit_card_amount = sum("card")
  return { cash_amount, check_amount, credit_card_amount, amount: Math.round((cash_amount + check_amount + credit_card_amount) * 100) / 100 }
}
