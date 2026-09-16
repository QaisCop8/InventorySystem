import sql from "@/lib/database"

// Called inside the invoice transaction from every cancellation entry point.
// Removing the POS allocations after reversal makes retries a no-op; invoice
// lines and receipt details remain available on the cancelled vouchers.
export async function reversePosSessionPayments(voucher: { id: number; vch_type: number; vch_code: string; pos_session_id?: number; pos_point_id?: number }) {
  const payments = await sql`SELECT * FROM pos_sale_payments_tbl WHERE voucher_id=${Number(voucher.id)} FOR UPDATE`
  if (!payments.length) return
  const sign = Number(voucher.vch_type) === 16 ? 1 : -1
  const sessions = new Set<number>()
  for (const payment of payments) {
    const sessionId = Number(payment.session_id || voucher.pos_session_id)
    if (payment.payment_method === "cash" && sessionId) {
      let currencyId = Number(payment.currency_id)
      if (!currencyId) {
        const points = await sql`SELECT currency_id FROM pos_points_tbl WHERE id=${Number(payment.pos_point_id || voucher.pos_point_id)}`
        currencyId = Number(points[0]?.currency_id)
      }
      if (!currencyId) throw new Error("تعذر تحديد عملة الدفعة النقدية لعكس رصيد العهدة")
      await sql`UPDATE pos_sessions_tbl SET expected_cash=expected_cash+${sign * Number(payment.amount)},updated_at=NOW() WHERE id=${sessionId}`
      await sql`UPDATE pos_session_currencies_tbl SET expected_amount=expected_amount+${sign * Number(payment.currency_amount ?? payment.amount)} WHERE session_id=${sessionId} AND currency_id=${currencyId}`
      sessions.add(sessionId)
    }
    if (payment.payment_method === "gift_card") {
      await sql`UPDATE pos_gift_cards_tbl SET balance=balance+${Number(payment.amount)},updated_at=NOW() WHERE code=${String(payment.reference || "")}`
    }
  }
  for (const sessionId of sessions) {
    await sql`DELETE FROM pos_cash_movements_tbl WHERE session_id=${sessionId} AND reference=${voucher.vch_code} AND movement_type IN ('sale','refund')`
  }
  await sql`DELETE FROM pos_sale_payments_tbl WHERE voucher_id=${Number(voucher.id)}`
}

// Repair invoices cancelled through the sales screen before all entry points
// shared the reversal. Only still-present allocations are reversed, once.
export async function reconcileCancelledPosPayments(sessionId: number) {
  const vouchers = await sql`
    SELECT v.* FROM voucher_header_tbl v WHERE v.status=3
      AND EXISTS (SELECT 1 FROM pos_sale_payments_tbl p WHERE p.voucher_id=v.id AND p.session_id=${sessionId})
    ORDER BY v.id FOR UPDATE OF v
  `
  for (const voucher of vouchers) await reversePosSessionPayments(voucher as any)
  return vouchers.length > 0
}
