// Amounts are converted per transaction, before aggregation or running balances.
// IDs are validated before interpolation into the SQL fragment.
export function reportAmountSql(targetId: number, baseId: number, source: "vjd" | "vh" = "vjd") {
  if (![targetId, baseId].every(id => Number.isSafeInteger(id) && id > 0)) throw new Error("Invalid report currency")
  // Rate of the report currency for this voucher, in order:
  //  1. the voucher's own rate when the voucher is in that currency (a USD journal at 3.3919 whose ILS line
  //     must convert back at the same rate)
  //  2. the latest defined rate on/before the voucher date
  //  3. the first rate after it (vouchers older than the first defined rate - e.g. migrated opening balances)
  //  4. 1
  const denominator = targetId === baseId ? "1" : `COALESCE(
    CASE WHEN vh.currency_id=${targetId} AND COALESCE(vh.rate,0)>0 THEN vh.rate END,
    (SELECT er.exchange_rate FROM exchange_rates er WHERE er.currency_id=${targetId} AND er.rate_date::date<=vh.vch_date::date AND er.exchange_rate>0 ORDER BY er.rate_date DESC,er.id DESC LIMIT 1),
    (SELECT er.exchange_rate FROM exchange_rates er WHERE er.currency_id=${targetId} AND er.rate_date::date>vh.vch_date::date AND er.exchange_rate>0 ORDER BY er.rate_date ASC,er.id ASC LIMIT 1),
    1)`
  // A transaction already denominated in the requested currency needs no lookup.
  // For other currencies, convert its booked base amount at the report currency's rate above.
  return `CASE WHEN ${source}.currency_id=${targetId} THEN ABS(${source}.amount) ELSE ABS(${source}.amount * COALESCE(${source}.rate,1)) / (${denominator}) END`
}
