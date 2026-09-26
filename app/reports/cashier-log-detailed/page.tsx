"use client"

import NextDynamic from "next/dynamic"

export const dynamic = "force-dynamic"

const CashierDetailedReport = NextDynamic(
  () => import("@/components/reports/cashier-detailed-report"),
  { ssr: false }
)

export default function CashierLogDetailedPage() {
  return <CashierDetailedReport />
}