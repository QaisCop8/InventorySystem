"use client"

import NextDynamic from "next/dynamic"

export const dynamic = "force-dynamic"

const BatchLogReportClient = NextDynamic(
  () => import("@/components/reports/batch-log-report").then((mod) => mod.BatchLogReport),
  { ssr: false }
)

export default function ReportsBatchLogPage() {
  return <BatchLogReportClient />
}
