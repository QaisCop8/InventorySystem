"use client"

import NextDynamic from "next/dynamic"

export const dynamic = "force-dynamic"

const CashierTotalReport = NextDynamic(
  () => import("@/components/reports/cashier-total-report"),
  { ssr: false }
)

export default function CashierLogTotalPage() {
  return <CashierTotalReport />
}