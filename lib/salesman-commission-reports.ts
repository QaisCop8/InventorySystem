type Row = Record<string, any>
const number = (value: unknown) => Number(value || 0)
const date = (value: unknown) => String(value || "").slice(0, 10)

/** Statements use earned snapshots and dated payment events, never current costs. */
export function buildCommissionStatements(transactions: Row[], payments: Row[], from: string, to: string) {
  const groups = new Map<string, Row>()
  const byId = new Map(transactions.map(row => [Number(row.id), row]))
  const group = (row: Row) => {
    const key = `${row.salesman_id}:${row.currency_id}`
    if (!groups.has(key)) groups.set(key, { key, salesman_id: row.salesman_id, salesman_name: row.salesman_name,
      currency_id: row.currency_id, currency_code: row.currency_code, opening: 0, earned: 0, adjustments: 0, paid: 0,
      balance: 0, payable: 0, entries: [] })
    return groups.get(key)!
  }
  for (const row of transactions) {
    if (row.status === 'cancelled' || date(row.invoice_date) > to) continue
    const result = group(row), amount = number(row.final_commission)
    if (date(row.invoice_date) < from) result.opening += amount
    else {
      if (amount < 0) result.adjustments += amount
      else result.earned += amount
      result.entries.push({ date: date(row.invoice_date), type: row.source_type, source: row.invoice_code,
        customer: row.customer_name, transaction_id: row.id, debit: amount, credit: 0 })
    }
    if (['approved', 'posted', 'paid'].includes(row.status)) result.payable += amount
  }
  for (const payment of payments) {
    const row = byId.get(Number(payment.transaction_id))
    if (!row || row.status === 'cancelled' || date(payment.payment_date) > to) continue
    const result = group(row), amount = number(payment.amount)
    if (date(payment.payment_date) < from) result.opening -= amount
    else {
      result.paid += amount
      result.entries.push({ date: date(payment.payment_date), type: 'payment', source: payment.voucher_code,
        transaction_id: row.id, debit: 0, credit: amount })
    }
    result.payable -= amount
  }
  for (const result of groups.values()) {
    result.entries.sort((a: Row, b: Row) => a.date.localeCompare(b.date) || a.transaction_id - b.transaction_id)
    let running = result.opening
    for (const entry of result.entries) { running += entry.debit - entry.credit; entry.balance = running }
    result.balance = result.opening + result.earned + result.adjustments - result.paid
  }
  return [...groups.values()]
}
