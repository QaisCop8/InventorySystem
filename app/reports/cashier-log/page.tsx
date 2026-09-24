"use client"

import NextDynamic from "next/dynamic"

export const dynamic = "force-dynamic"

const CashierLogReport = NextDynamic(
  () => import("@/components/reports/cashier-log-report").then(mod => mod.CashierLogReport),
  { ssr: false }
)

export default function CashierLogPage() {
  return <CashierLogReport />
}
