// Amounts are converted per transaction, before aggregation or running balances.
// IDs are validated before interpolation into the SQL fragment.
export function reportAmountSql(targetId: number, baseId: number, source: "vjd" | "vh" = "vjd") {
  if (![targetId, baseId].every(id => Number.isSafeInteger(id) && id > 0)) throw new Error("Invalid report currency")
  const denominator = targetId === baseId ? "1" : `(SELECT er.exchange_rate FROM exchange_rates er WHERE er.currency_id=${targetId} AND er.rate_date::date<=vh.vch_date::date ORDER BY er.rate_date DESC,er.id DESC LIMIT 1)`
  // Missing/invalid historical rates must fail instead of silently dropping amounts from SUM.
  return `ABS(${source}.amount * COALESCE(${source}.rate,1)) / (CASE WHEN (${denominator})>0 THEN (${denominator}) ELSE 0 END)`
}
