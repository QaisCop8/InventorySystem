"use client"

import NextDynamic from "next/dynamic"

export const dynamic = "force-dynamic"

const CashierLogTotalReport = NextDynamic(
  () => import("@/components/reports/cashier-log-report").then(mod => mod.CashierLogReport),
  { ssr: false }
)

export default function CashierLogTotalPage() {
  return <CashierLogTotalReport reportType="total" />
}