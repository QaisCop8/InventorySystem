"use client"

import { CashierLogReport } from "./cashier-log-report"

export default function CashierDetailedReport() {
  return <CashierLogReport reportType="detail" enableInvoiceLinks showTotals />
}
