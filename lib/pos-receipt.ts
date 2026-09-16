export type PosReceiptPayment = {
  payment_method: string
  amount: number
  account_id?: number | null
  currency_id?: number
  currency_amount?: number
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

export const isPosReceiptPayment = (payment: PosReceiptPayment) =>
  Number(payment.amount) > 0 && ["cash", "cheque", "card"].includes(payment.payment_method)

// POS payment amounts are already evaluated in the invoice currency. Amounts
// left on account and gift-card redemptions are not money received by this voucher.
export function posReceiptAmounts(payments: PosReceiptPayment[]) {
  const sum = (method: string) => Math.round(payments.filter(row => row.payment_method === method).reduce((total, row) => total + Number(row.amount || 0), 0) * 100) / 100
  const cash_amount = sum("cash")
  const check_amount = sum("cheque")
  const credit_card_amount = sum("card")
  return { cash_amount, check_amount, credit_card_amount, amount: Math.round((cash_amount + check_amount + credit_card_amount) * 100) / 100 }
}
