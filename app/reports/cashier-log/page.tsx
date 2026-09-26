"use client"

import NextDynamic from "next/dynamic"

export const dynamic = "force-dynamic"

const CashierFollowupReport = NextDynamic(
  () => import("@/components/reports/cashier-followup-report"),
  { ssr: false }
)

export default function CashierLogPage() {
  return <CashierFollowupReport />
}
