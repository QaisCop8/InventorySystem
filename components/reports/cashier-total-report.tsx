"use client"

import { CashierLogReport } from "./cashier-log-report"

export default function CashierTotalReport() {
  const totalReportProps = {
    reportType: "total" as const,
    enableInvoiceLinks: true,
    showTotals: true,
  }

  return <CashierLogReport {...totalReportProps} />
}
