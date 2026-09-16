// Amounts are converted per transaction, before aggregation or running balances.
// IDs are validated before interpolation into the SQL fragment.
export function reportAmountSql(targetId: number, baseId: number, source: "vjd" | "vh" = "vjd") {
  if (![targetId, baseId].every(id => Number.isSafeInteger(id) && id > 0)) throw new Error("Invalid report currency")
  const denominator = targetId === baseId ? "1" : `COALESCE((SELECT er.exchange_rate FROM exchange_rates er WHERE er.currency_id=${targetId} AND er.rate_date::date<=vh.vch_date::date AND er.exchange_rate>0 ORDER BY er.rate_date DESC,er.id DESC LIMIT 1),1)`
  // A transaction already denominated in the requested currency needs no lookup.
  // For other currencies, convert its booked base amount at the report currency's
  // historical rate. When no valid rate exists on or before the voucher date, use 1.
  return `CASE WHEN ${source}.currency_id=${targetId} THEN ABS(${source}.amount) ELSE ABS(${source}.amount * COALESCE(${source}.rate,1)) / (${denominator}) END`
}
